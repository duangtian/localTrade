import { DateTime } from "luxon";
import { FX_SYMBOL } from "@/config/seeds";
import type { Bar, FxRate, Interval, PriceProvider, Quote } from "./types";

/**
 * ตัวกันข้อมูลอนาคตสำหรับโหมดย้อนอดีต
 * ทุกข้อมูลที่ผ่านตัวนี้จะไม่มีวันที่เกิน `asOf` (วันจำลอง) — ทั้งหน้าจอและ Bot ต้องใช้ตัวนี้เท่านั้น
 */
export class TimeBoundedProvider implements PriceProvider {
  readonly name: string;
  constructor(
    private readonly inner: PriceProvider,
    readonly asOf: string,
  ) {
    this.name = `${inner.name}@${asOf}`;
  }

  async getHistory(symbol: string, from: string, to: string, interval: Interval): Promise<Bar[]> {
    if (interval !== "1d") {
      throw new Error("โหมดย้อนอดีตใช้ได้เฉพาะราคาปิดรายวัน");
    }
    const end = to < this.asOf ? to : this.asOf;
    if (from > end) return [];
    const bars = await this.inner.getHistory(symbol, from, end, "1d");
    // กรองซ้ำอีกชั้น เผื่อ provider ข้างในคืนข้อมูลเกินช่วงมา
    return bars.filter((b) => b.date.slice(0, 10) <= this.asOf && b.date.slice(0, 10) >= from);
  }

  /** ราคาปิดล่าสุดที่ไม่เกินวันจำลอง */
  async getQuote(symbol: string): Promise<Quote> {
    const from = DateTime.fromISO(this.asOf).minus({ days: 20 }).toISODate()!;
    const bars = await this.getHistory(symbol, from, this.asOf, "1d");
    if (bars.length === 0) throw new Error(`ไม่มีราคาของ ${symbol} ณ วันที่ ${this.asOf}`);
    const last = bars[bars.length - 1];
    const prev = bars.length > 1 ? bars[bars.length - 2] : null;
    return {
      symbol,
      price: last.close,
      prevClose: prev?.close ?? null,
      currency: symbol.endsWith(".BK") ? "THB" : "USD",
      time: last.date,
      fetchedAt: last.date,
      // ข้อมูลพื้นฐาน (P/E, ปันผล) ที่มีเป็นของปัจจุบัน = ข้อมูลอนาคต จึงไม่ส่งออกไป
      pe: null,
      dividendYield: null,
    };
  }

  async getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
    const out: Record<string, Quote> = {};
    for (const s of symbols) {
      try {
        out[s] = await this.getQuote(s);
      } catch {
        /* ไม่มีข้อมูล ณ วันนั้น */
      }
    }
    return out;
  }

  async getFxRate(): Promise<FxRate> {
    const q = await this.getQuote(FX_SYMBOL);
    return { rate: q.price, time: q.time, fetchedAt: q.fetchedAt };
  }

  /** แท่งราคาของวันจำลองพอดี (ถ้าวันนั้นตลาดปิดจะได้ null) */
  async barOn(symbol: string, date: string): Promise<Bar | null> {
    if (date > this.asOf) return null;
    const bars = await this.getHistory(symbol, date, date, "1d");
    return bars.find((b) => b.date === date) ?? null;
  }
}
