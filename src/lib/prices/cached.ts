import { and, asc, between, eq, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { QUOTE_CACHE_MINUTES } from "@/config/market";
import { FX_SYMBOL } from "@/config/seeds";
import type { DB } from "@/lib/db/client";
import { bars, coverage, kv, quotes } from "@/lib/db/schema";
import type { Bar, FxRate, Interval, PriceProvider, Quote } from "./types";

/**
 * ครอบ provider จริงด้วย cache ใน SQLite
 * - quote ล่าสุด: เก็บ QUOTE_CACHE_MINUTES นาที
 * - ราคาย้อนหลังรายวัน: เก็บถาวร (ดึงเฉพาะช่วงที่ขาด)
 * - intraday: เก็บ QUOTE_CACHE_MINUTES นาที
 */
export class CachedProvider implements PriceProvider {
  readonly name: string;
  constructor(
    private readonly inner: PriceProvider,
    private readonly db: DB,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.name = `cached:${inner.name}`;
  }

  private fresh(fetchedAt: string): boolean {
    return this.now().getTime() - new Date(fetchedAt).getTime() < QUOTE_CACHE_MINUTES * 60_000;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const r = await this.getQuotes([symbol]);
    if (!r[symbol]) throw new Error(`ไม่พบราคาของ ${symbol}`);
    return r[symbol];
  }

  async getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
    const uniq = [...new Set(symbols)];
    if (uniq.length === 0) return {};
    const rows = this.db.select().from(quotes).where(inArray(quotes.symbol, uniq)).all();
    const out: Record<string, Quote> = {};
    const stale: string[] = [];
    const cached = new Map(rows.map((r) => [r.symbol, r]));
    for (const s of uniq) {
      const row = cached.get(s);
      if (row && this.fresh(row.fetchedAt)) out[s] = JSON.parse(row.json);
      else stale.push(s);
    }
    if (stale.length) {
      try {
        const fetched = await this.inner.getQuotes(stale);
        for (const [s, q] of Object.entries(fetched)) {
          out[s] = q;
          this.db
            .insert(quotes)
            .values({ symbol: s, json: JSON.stringify(q), fetchedAt: q.fetchedAt })
            .onConflictDoUpdate({ target: quotes.symbol, set: { json: JSON.stringify(q), fetchedAt: q.fetchedAt } })
            .run();
        }
      } catch (e) {
        console.warn("[prices] ดึง quote ไม่สำเร็จ ใช้ค่าเก่าใน cache", (e as Error).message);
      }
      // ถ้าดึงไม่ได้ ใช้ค่าเก่า (เวลาอัปเดตจะแสดงตามจริง)
      for (const s of stale) {
        if (!out[s] && cached.get(s)) out[s] = JSON.parse(cached.get(s)!.json);
      }
    }
    return out;
  }

  async getHistory(symbol: string, from: string, to: string, interval: Interval): Promise<Bar[]> {
    if (interval !== "1d") return this.getIntraday(symbol, from, to, interval);
    await this.ensureDaily(symbol, from, to);
    return this.db
      .select()
      .from(bars)
      .where(and(eq(bars.symbol, symbol), between(bars.date, from, to)))
      .orderBy(asc(bars.date))
      .all()
      .map(({ date, open, high, low, close, volume }) => ({ date, open, high, low, close, volume }));
  }

  /** ดึงราคารายวันเฉพาะช่วงที่ยังไม่มีใน cache */
  async ensureDaily(symbol: string, from: string, to: string): Promise<void> {
    const today = DateTime.fromJSDate(this.now()).toISODate()!;
    const end = to > today ? today : to;
    const cov = this.db.select().from(coverage).where(eq(coverage.symbol, symbol)).get();
    const ranges: [string, string][] = [];
    if (!cov) ranges.push([from, end]);
    else {
      if (from < cov.fromDate) ranges.push([from, cov.fromDate]);
      if (end > cov.toDate) ranges.push([cov.toDate, end]);
      else if (end >= this.recentCutoff() && !this.fresh(cov.fetchedAt)) {
        // ข้อมูล 5 วันล่าสุดอาจยังไม่สมบูรณ์ (วันนี้ยังไม่ปิดตลาด) จึงดึงใหม่เมื่อ cache หมดอายุ
        ranges.push([this.recentCutoff(), end]);
      }
    }
    if (ranges.length === 0) return;

    for (const [a, b] of ranges) {
      let fetched: Bar[];
      try {
        fetched = await this.inner.getHistory(symbol, a, b, "1d");
      } catch (e) {
        console.warn(`[prices] ดึงราคาย้อนหลัง ${symbol} ไม่สำเร็จ`, (e as Error).message);
        return;
      }
      this.db.transaction((tx) => {
        for (const bar of fetched) {
          tx.insert(bars)
            .values({ symbol, ...bar })
            .onConflictDoUpdate({ target: [bars.symbol, bars.date], set: { ...bar } })
            .run();
        }
      });
    }
    const newFrom = cov && cov.fromDate < from ? cov.fromDate : from;
    const newTo = cov && cov.toDate > end ? cov.toDate : end;
    const fetchedAt = this.now().toISOString();
    this.db
      .insert(coverage)
      .values({ symbol, fromDate: newFrom, toDate: newTo, fetchedAt })
      .onConflictDoUpdate({ target: coverage.symbol, set: { fromDate: newFrom, toDate: newTo, fetchedAt } })
      .run();
  }

  private recentCutoff(): string {
    return DateTime.fromJSDate(this.now()).minus({ days: 5 }).toISODate()!;
  }

  private async getIntraday(symbol: string, from: string, to: string, interval: Interval): Promise<Bar[]> {
    const key = `intraday:${symbol}:${interval}:${from}:${to}`;
    const row = this.db.select().from(kv).where(eq(kv.key, key)).get();
    if (row && this.fresh(row.updatedAt)) return JSON.parse(row.value);
    try {
      const data = await this.inner.getHistory(symbol, from, to, interval);
      const updatedAt = this.now().toISOString();
      this.db
        .insert(kv)
        .values({ key, value: JSON.stringify(data), updatedAt })
        .onConflictDoUpdate({ target: kv.key, set: { value: JSON.stringify(data), updatedAt } })
        .run();
      return data;
    } catch (e) {
      if (row) return JSON.parse(row.value);
      throw e;
    }
  }

  async getFxRate(): Promise<FxRate> {
    const q = await this.getQuote(FX_SYMBOL);
    return { rate: q.price, time: q.time, fetchedAt: q.fetchedAt };
  }
}
