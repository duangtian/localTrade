/**
 * Bot เดย์เทรด: ซื้อและขายจบในวันเดียว ไม่ถือข้ามคืน
 * กฎเข้า: หุ้นอยู่ในแนวโน้มขาขึ้น (ราคาปิดเมื่อวาน > เส้นเฉลี่ย 20 วัน) และวันนี้ราคาเปิด "กระโดดขึ้น" (gap up) 0.5–5%
 * กฎออก: ขาดทุน −2% (stop) · กำไร +3% (เป้า) · ไม่ถึงทั้งคู่ขายตอนปิดตลาด
 *
 * โหมดย้อนอดีตมีแค่แท่งรายวัน จึงจำลอง: ซื้อที่ราคาเปิด → ถ้าราคาต่ำสุดของวันแตะ stop ถือว่าโดน stop ก่อน (สมมติแบบระมัดระวัง)
 * → ไม่งั้นถ้าราคาสูงสุดแตะเป้า ขายที่เป้า → ไม่งั้นขายที่ราคาปิด
 * โหมดเวลาจริงใช้แท่ง 5 นาที: เข้าเมื่อราคาทะลุจุดสูงสุด 30 นาทีแรก (opening range breakout) ภายใน 90 นาทีแรก
 */
import type { Bar } from "@/lib/prices/types";
import { ceilToTick, floorToTick, round2 } from "@/lib/rules/tick";

export const DT_UNIVERSE = ["PTT.BK", "KBANK.BK", "AOT.BK", "CPALL.BK", "DELTA.BK", "ADVANC.BK", "SCB.BK", "AAPL", "MSFT", "NVDA", "TSLA", "AMD", "AMZN"];

export interface DaytradeConfig {
  active: boolean;
  startedAt: string;
  market: "TH" | "US" | "BOTH";
  /** เงินต่อไม้ เทียบมูลค่าพอร์ต */
  positionPct: number;
  maxPositions: number;
  stopPct: number;
  targetPct: number;
  /** gap ขั้นต่ำ */
  gapPct: number;
  /** โหมดเวลาจริง: ตัวที่เทรดไปแล้ววันนี้ (เข้าได้วันละครั้งต่อตัว) */
  traded: { date: string; symbols: string[] };
}

export const DEFAULT_DAYTRADE: Omit<DaytradeConfig, "startedAt"> = {
  active: true,
  market: "BOTH",
  positionPct: 0.2,
  maxPositions: 3,
  stopPct: 0.02,
  targetPct: 0.03,
  gapPct: 0.005,
  traded: { date: "", symbols: [] },
};

const sma = (xs: number[], n: number) => (xs.length >= n ? xs.slice(-n).reduce((a, b) => a + b, 0) / n : null);
const pct = (r: number) => `${r >= 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(2)}%`;

export interface EntrySignal {
  symbol: string;
  gap: number;
  prevClose: number;
  why: string;
}

/** ตัดสินใจตอนตลาดเปิด: ใช้แท่งถึงเมื่อวาน + ราคาเปิดวันนี้เท่านั้น */
export function entrySignal(symbol: string, past: Bar[], todayOpen: number, cfg: Pick<DaytradeConfig, "gapPct">): EntrySignal | null {
  if (past.length < 21 || !(todayOpen > 0)) return null;
  const closes = past.map((b) => b.close);
  const prevClose = closes[closes.length - 1];
  const ma20 = sma(closes, 20)!;
  const gap = todayOpen / prevClose - 1;
  if (prevClose <= ma20) return null;
  if (gap < cfg.gapPct || gap > 0.05) return null;
  return {
    symbol,
    gap,
    prevClose,
    why: [
      `เปิดตลาดวันนี้สูงกว่าราคาปิดเมื่อวาน ${pct(gap)} แสดงว่ามีแรงซื้อตั้งแต่เปิดตลาด`,
      `ราคาอยู่เหนือเส้นเฉลี่ย 20 วัน (${round2(ma20)}) แปลว่าช่วงนี้แนวโน้มเป็นขาขึ้น`,
    ].join(" · "),
  };
}

export interface DayOutcome {
  entry: number;
  exit: number;
  kind: "stop" | "target" | "close";
  why: string;
}

/** จำลองผลในวันเดียวจากแท่งรายวัน (ซื้อที่ราคาเปิด) */
export function simulateDay(symbol: string, today: Bar, cfg: Pick<DaytradeConfig, "stopPct" | "targetPct">): DayOutcome {
  const th = symbol.endsWith(".BK");
  const entry = today.open;
  const stop = th ? floorToTick(entry * (1 - cfg.stopPct)) : round2(entry * (1 - cfg.stopPct));
  const target = th ? ceilToTick(entry * (1 + cfg.targetPct)) : round2(entry * (1 + cfg.targetPct));
  if (today.low <= stop) return { entry, exit: stop, kind: "stop", why: `ราคาลงแตะ stop-loss ${stop} (${pct(stop / entry - 1)}) ขายตัดขาดทุนตามแผน` };
  if (today.high >= target) return { entry, exit: target, kind: "target", why: `ราคาขึ้นถึงเป้า ${target} (${pct(target / entry - 1)}) ขายทำกำไร` };
  return { entry, exit: today.close, kind: "close", why: `ไม่ถึงทั้ง stop และเป้า ขายตอนปิดตลาดที่ ${today.close} (${pct(today.close / entry - 1)}) เพราะเดย์เทรดไม่ถือข้ามคืน` };
}

export type LiveDecision = { action: "buy" | "sell"; why: string } | null;

/**
 * โหมดเวลาจริง (แท่ง 5 นาทีของวันนี้)
 * @param minutesSinceOpen นาทีนับจากตลาดเปิดรอบแรกของวัน
 * @param minutesToClose นาทีก่อนตลาดปิดรอบสุดท้ายของวัน
 */
export function liveDecide(p: {
  bars: Bar[];
  price: number;
  prevClose: number | null;
  ma20: number | null;
  holding: { entry: number; openedToday: boolean } | null;
  tradedToday: boolean;
  minutesSinceOpen: number;
  minutesToClose: number;
  cfg: Pick<DaytradeConfig, "stopPct" | "targetPct" | "gapPct">;
}): LiveDecision {
  const { price, cfg } = p;
  if (p.holding) {
    if (!p.holding.openedToday) return { action: "sell", why: "ปิดสถานะที่ค้างข้ามคืน (เดย์เทรดไม่ควรถือข้ามคืน)" };
    if (price <= p.holding.entry * (1 - cfg.stopPct)) return { action: "sell", why: `ราคาลงถึง stop-loss (${pct(price / p.holding.entry - 1)}) ขายตัดขาดทุน` };
    if (price >= p.holding.entry * (1 + cfg.targetPct)) return { action: "sell", why: `ราคาถึงเป้า (${pct(price / p.holding.entry - 1)}) ขายทำกำไร` };
    if (p.minutesToClose <= 15) return { action: "sell", why: "ใกล้ปิดตลาด ขายปิดสถานะ ไม่ถือข้ามคืน" };
    return null;
  }
  if (p.tradedToday || p.minutesSinceOpen < 30 || p.minutesSinceOpen > 90 || !p.prevClose || !p.ma20) return null;
  if (p.prevClose <= p.ma20 || price < p.prevClose * (1 + cfg.gapPct)) return null;
  const firstHalfHour = p.bars.slice(0, 6);
  if (firstHalfHour.length < 6) return null;
  const orHigh = Math.max(...firstHalfHour.map((b) => b.high));
  if (price <= orHigh) return null;
  return {
    action: "buy",
    why: [
      `ราคาขึ้นทะลุจุดสูงสุดของช่วง 30 นาทีแรก (${round2(orHigh)}) แสดงว่าแรงซื้อยังมา`,
      `สูงกว่าราคาปิดเมื่อวาน ${pct(price / p.prevClose - 1)}`,
      `ราคาอยู่เหนือเส้นเฉลี่ย 20 วัน แปลว่าช่วงนี้แนวโน้มเป็นขาขึ้น`,
    ].join(" · "),
  };
}
