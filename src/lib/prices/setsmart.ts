import type { Bar, FxRate, Interval, PriceProvider, Quote } from "./types";

/**
 * ช่องสำหรับ SETSMART API (ราคา 250 บาท/เดือน แบบใช้ส่วนตัว) — ยังไม่ implement ใน v1
 * TODO(v2): ใส่ SETSMART_API_KEY ใน .env แล้วเขียนการเรียก API ตามเอกสาร SETSMART
 * แนะนำ: ใช้ SETSMART สำหรับหุ้นไทย และยังใช้ Yahoo สำหรับหุ้นสหรัฐฯ / ค่าเงิน (fallback)
 */
export class SetSmartProvider implements PriceProvider {
  readonly name = "setsmart";
  constructor(private readonly fallback: PriceProvider) {}

  private notReady(): never {
    throw new Error("SetSmartProvider ยังไม่ได้ implement (ดู src/lib/prices/setsmart.ts)");
  }

  async getQuote(symbol: string): Promise<Quote> {
    if (!symbol.endsWith(".BK")) return this.fallback.getQuote(symbol);
    return this.notReady();
  }
  async getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
    if (symbols.some((s) => s.endsWith(".BK"))) this.notReady();
    return this.fallback.getQuotes(symbols);
  }
  async getHistory(symbol: string, from: string, to: string, interval: Interval): Promise<Bar[]> {
    if (!symbol.endsWith(".BK")) return this.fallback.getHistory(symbol, from, to, interval);
    return this.notReady();
  }
  async getFxRate(): Promise<FxRate> {
    return this.fallback.getFxRate();
  }
}
