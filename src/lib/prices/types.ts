export interface Quote {
  symbol: string;
  price: number;
  prevClose: number | null;
  currency: string;
  name?: string;
  /** เวลาของราคา: ISO datetime (เวลาจริง) หรือ YYYY-MM-DD (ราคาปิดรายวัน) */
  time: string;
  /** เวลาที่ดึงข้อมูลมา (ISO) */
  fetchedAt: string;
  pe?: number | null;
  dividendYield?: number | null;
}

export interface Bar {
  /** YYYY-MM-DD สำหรับรายวัน, ISO datetime สำหรับ intraday */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Interval = "5m" | "1d";

export interface FxRate {
  /** บาทต่อ 1 USD (อัตรากลาง) */
  rate: number;
  time: string;
  fetchedAt: string;
}

export interface PriceProvider {
  readonly name: string;
  getQuote(symbol: string): Promise<Quote>;
  getQuotes(symbols: string[]): Promise<Record<string, Quote>>;
  /** from/to เป็น YYYY-MM-DD (รวมทั้งสองวัน) */
  getHistory(symbol: string, from: string, to: string, interval: Interval): Promise<Bar[]>;
  getFxRate(): Promise<FxRate>;
}

export interface Fundamentals {
  pe: number | null;
  dividendYield: number | null;
  sector: string | null;
  name: string | null;
  industry?: string | null;
  marketCap?: number | null;
  eps?: number | null;
  priceToBook?: number | null;
  beta?: number | null;
  avgVolume?: number | null;
  employees?: number | null;
  website?: string | null;
  /** คำอธิบายธุรกิจ (ภาษาอังกฤษจาก Yahoo) */
  summary?: string | null;
}
