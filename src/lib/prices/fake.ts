import { DateTime } from "luxon";
import type { Bar, FxRate, Interval, PriceProvider, Quote } from "./types";

/** provider ปลอมสำหรับ test: ราคาวันทำการเพิ่มขึ้นวันละ 1% แบบกำหนดได้ */
export class FakeProvider implements PriceProvider {
  readonly name = "fake";
  readonly calls: { symbol: string; from: string; to: string }[] = [];
  private readonly data = new Map<string, Bar[]>();

  constructor(
    private readonly opts: {
      start: string;
      days: number;
      base: Record<string, number>;
      /** ราคาต่อวัน (ถ้ากำหนด) แทนการเพิ่มขึ้น 1% */
      path?: Record<string, number[]>;
      ignoreRange?: boolean;
    },
  ) {
    for (const [sym, base] of Object.entries(opts.base)) {
      const list: Bar[] = [];
      let d = DateTime.fromISO(opts.start);
      let i = 0;
      for (let n = 0; n < opts.days; n++, d = d.plus({ days: 1 })) {
        if (d.weekday > 5) continue;
        const close = opts.path?.[sym]?.[i] ?? +(base * Math.pow(1.01, i)).toFixed(2);
        list.push({ date: d.toISODate()!, open: close, high: close * 1.02, low: close * 0.98, close, volume: 1000 });
        i++;
      }
      this.data.set(sym, list);
    }
  }

  async getHistory(symbol: string, from: string, to: string, _interval: Interval): Promise<Bar[]> {
    this.calls.push({ symbol, from, to });
    const list = this.data.get(symbol) ?? [];
    if (this.opts.ignoreRange) return list;
    return list.filter((b) => b.date >= from && b.date <= to);
  }

  async getQuote(symbol: string): Promise<Quote> {
    const list = this.data.get(symbol) ?? [];
    const last = list[list.length - 1];
    if (!last) throw new Error("no data");
    return { symbol, price: last.close, prevClose: list[list.length - 2]?.close ?? null, currency: "USD", time: last.date, fetchedAt: new Date().toISOString() };
  }

  async getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
    const out: Record<string, Quote> = {};
    for (const s of symbols) if (this.data.has(s)) out[s] = await this.getQuote(s);
    return out;
  }

  async getFxRate(): Promise<FxRate> {
    const q = await this.getQuote("THB=X");
    return { rate: q.price, time: q.time, fetchedAt: q.fetchedAt };
  }

  /** วันที่สุดท้ายที่มีข้อมูล */
  lastDate(symbol: string): string | undefined {
    return this.data.get(symbol)?.at(-1)?.date;
  }
}
