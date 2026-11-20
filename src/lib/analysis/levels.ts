/**
 * Bot แนะนำ Stop-loss / เป้าหมายราคา จากความผันผวนจริงของหุ้น (ATR)
 * - Stop-loss = ราคา − 2 × ATR(14) แต่ไม่ใกล้กว่า 3% และไม่ไกลกว่า 15%
 *   ถ้ามีจุดต่ำสุด 20 วัน (แนวรับ) อยู่ใต้ราคาไม่เกินระยะนั้น ใช้ต่ำกว่าแนวรับเล็กน้อยแทน
 * - เป้าหมาย = ราคา + 2 × ระยะ stop (กำไร:ขาดทุน = 2:1)
 * pure function: ผู้เรียกต้องส่งแท่งราคาถึงวันของเกมเท่านั้น
 */
import { ceilToTick, floorToTick, round2 } from "@/lib/rules/tick";
import type { Bar } from "@/lib/prices/types";

export interface Levels {
  entry: number;
  stop: number;
  target: number;
  atr: number;
  stopWhy: string;
  targetWhy: string;
}

/** Average True Range แบบ Wilder */
export function atr(bars: Bar[], n = 14): number | null {
  if (bars.length < n + 1) return null;
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const pc = bars[i - 1].close;
    tr.push(Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)));
  }
  let a = tr.slice(0, n).reduce((s, x) => s + x, 0) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}

export function suggestLevels(bars: Bar[], entry: number, market: "TH" | "US"): Levels | null {
  if (!(entry > 0)) return null;
  const a = atr(bars.slice(-120));
  if (a === null || a <= 0) return null;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  let dist = Math.min(Math.max(2 * a, entry * 0.03), entry * 0.15);
  let stopWhy = `ต่ำกว่าราคาซื้อ 2 เท่าของการแกว่งเฉลี่ยต่อวัน (ATR ≈ ${round2(a)}) เพื่อไม่ให้โดนขายเพราะราคาแกว่งปกติ`;
  const support = Math.min(...bars.slice(-20).map((b) => b.low));
  if (support < entry && entry - support * 0.99 <= dist && entry - support * 0.99 >= entry * 0.03) {
    dist = entry - support * 0.99;
    stopWhy = `ต่ำกว่าจุดต่ำสุดในรอบ 20 วัน (${round2(support)}) เล็กน้อย ถ้าหลุดแนวนี้แปลว่าแนวโน้มเปลี่ยน`;
  }
  if (dist === entry * 0.15) stopWhy = "หุ้นแกว่งแรงมาก จึงจำกัดการขาดทุนไว้ที่ 15%";
  if (dist === entry * 0.03 && !stopWhy.startsWith("ต่ำกว่าจุดต่ำสุด")) stopWhy = "หุ้นแกว่งน้อย จึงตั้งห่างอย่างน้อย 3% กันโดนขายเร็วเกินไป";

  let stop = entry - dist;
  let target = entry + 2 * dist;
  if (market === "TH") {
    stop = floorToTick(stop);
    target = ceilToTick(target);
  } else {
    stop = Math.floor(stop * 100) / 100;
    target = Math.ceil(target * 100) / 100;
  }
  return {
    entry,
    stop,
    target,
    atr: a,
    stopWhy: `${stopWhy} (−${pct(1 - stop / entry)})`,
    targetWhy: `กำไรเป็น 2 เท่าของความเสี่ยงที่ยอมรับ (กำไร:ขาดทุน = 2:1) (+${pct(target / entry - 1)})`,
  };
}
