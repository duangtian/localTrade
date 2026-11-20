import ndx from "./data/ndx.json";
import sp500 from "./data/sp500.json";
import { SET50, US_POPULAR, type SeedStock } from "./seeds";

export type IndexId = "set50" | "set100" | "sp500" | "ndx" | "us_popular";

export interface IndexDef {
  id: IndexId;
  label: string;
  market: "TH" | "US";
  /** รายชื่อตั้งต้น (SET100 ว่างจนกว่าผู้เล่นจะวางรายชื่อ) */
  stocks: SeedStock[];
  asOf: string | null;
  source: string;
  /** วางรายชื่อเองได้ในหน้าตั้งค่า */
  editable: boolean;
}

export const INDEXES: IndexDef[] = [
  {
    id: "set50",
    label: "SET50",
    market: "TH",
    stocks: SET50,
    asOf: "2025",
    source: "Wikipedia (as of 2025) — ยังไม่ได้ตรวจกับรอบปัจจุบันของ SET",
    editable: true,
  },
  {
    id: "set100",
    label: "SET100",
    market: "TH",
    stocks: [],
    asOf: null,
    source: "ยังไม่มีรายชื่อ — วางจากเว็บ SET ในหน้าตั้งค่า",
    editable: true,
  },
  { id: "sp500", label: "S&P 500", market: "US", stocks: sp500.stocks, asOf: sp500.asOf, source: sp500.source, editable: false },
  { id: "ndx", label: "Nasdaq-100", market: "US", stocks: ndx.stocks, asOf: ndx.asOf, source: ndx.source, editable: false },
  { id: "us_popular", label: "ยอดนิยม", market: "US", stocks: US_POPULAR, asOf: null, source: "รายการหุ้นที่คนไทยนิยม (เลือกเอง)", editable: false },
];

export function indexDef(id: string): IndexDef | undefined {
  return INDEXES.find((i) => i.id === id);
}

/** แปลงข้อความที่วางมา (คั่นด้วยเว้นวรรค จุลภาค หรือขึ้นบรรทัด) เป็นชื่อย่อแบบ Yahoo (.BK) */
export function parseThaiSymbols(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toUpperCase().split(/[\s,;|\t]+/)) {
    const t = raw.replace(/\.BK$/, "").trim();
    if (!/^[A-Z][A-Z0-9&\-]{0,11}$/.test(t)) continue;
    const sym = `${t}.BK`;
    if (!out.includes(sym)) out.push(sym);
  }
  return out;
}
