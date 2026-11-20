/**
 * ตัวชี้วัดทางสถิติจากราคาปิดรายวัน (pure function, ไม่ดึงข้อมูลเอง)
 * ผู้เรียกต้องส่งแท่งราคาที่ "ถึงวันปัจจุบันของเกม" เท่านั้น (โหมดย้อนอดีตใช้ TimeBoundedProvider)
 */
import type { Bar } from "@/lib/prices/types";

export type Tone = "pos" | "neg" | "neu";
export interface Signal {
  tone: Tone;
  text: string;
}

export interface Analysis {
  asOf: string;
  price: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  r1m: number | null;
  r3m: number | null;
  r6m: number | null;
  r12m: number | null;
  /** ความผันผวนต่อปี (จาก 60 วันล่าสุด) */
  vol: number | null;
  /** ลดลงมากสุดจากจุดสูงในรอบ 1 ปี (ค่าลบ) */
  maxDrawdown: number | null;
  /** ห่างจากจุดสูงสุด 52 สัปดาห์ (ค่าลบ = ต่ำกว่า) */
  fromHigh: number | null;
  trend: "up" | "down" | "side";
  /** 0–100 */
  score: number;
  label: string;
  signals: Signal[];
}

export const MIN_BARS = 60;

export function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  let s = 0;
  for (let i = values.length - n; i < values.length; i++) s += values[i];
  return s / n;
}

/** RSI แบบ Wilder 14 วัน */
export function rsi(closes: number[], n = 14): number | null {
  if (closes.length < n + 1) return null;
  let gain = 0,
    loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  let ag = gain / n,
    al = loss / n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + Math.max(d, 0)) / n;
    al = (al * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (al === 0) return ag === 0 ? 50 : 100;
  return 100 - 100 / (1 + ag / al);
}

/** ผลตอบแทนย้อนหลัง n วันทำการ */
export function pastReturn(closes: number[], n: number): number | null {
  if (closes.length <= n) return null;
  const base = closes[closes.length - 1 - n];
  return base > 0 ? closes[closes.length - 1] / base - 1 : null;
}

/** ความผันผวนต่อปีจาก log return รายวัน */
export function annualVol(closes: number[], n = 60): number | null {
  if (closes.length < n + 1) return null;
  const r: number[] = [];
  for (let i = closes.length - n; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

export function maxDrawdown(closes: number[]): number | null {
  if (closes.length < 2) return null;
  let peak = closes[0],
    mdd = 0;
  for (const c of closes) {
    peak = Math.max(peak, c);
    mdd = Math.min(mdd, c / peak - 1);
  }
  return mdd;
}

const pct = (r: number) => `${r >= 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(1)}%`;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function scoreLabel(score: number): string {
  if (score >= 70) return "แนวโน้มแข็งแรง";
  if (score >= 58) return "น่าติดตาม";
  if (score >= 45) return "ทรงตัว / สัญญาณผสม";
  return "แนวโน้มอ่อนแอ";
}

/**
 * วิเคราะห์จากแท่งราคารายวัน (ต้องเรียงจากเก่าไปใหม่)
 * คะแนนเป็นการให้น้ำหนักแบบง่ายเพื่อการเรียนรู้: แนวโน้ม + โมเมนตัม − ความเสี่ยง
 */
export function analyze(bars: Bar[]): Analysis | null {
  const clean = bars.filter((b) => b.close > 0);
  if (clean.length < MIN_BARS) return null;
  const closes = clean.map((b) => b.close);
  const year = closes.slice(-252);
  const price = closes[closes.length - 1];
  const a = {
    asOf: clean[clean.length - 1].date.slice(0, 10),
    price,
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    rsi14: rsi(closes.slice(-120)),
    r1m: pastReturn(closes, 21),
    r3m: pastReturn(closes, 63),
    r6m: pastReturn(closes, 126),
    r12m: pastReturn(closes, 252),
    vol: annualVol(closes),
    maxDrawdown: maxDrawdown(year),
    fromHigh: price / Math.max(...clean.slice(-252).map((b) => b.high)) - 1,
  };

  const signals: Signal[] = [];
  let score = 50;

  // 1) แนวโน้มจากเส้นค่าเฉลี่ย
  if (a.sma50 !== null) {
    if (price > a.sma50) {
      score += 10;
      signals.push({ tone: "pos", text: `ราคาอยู่เหนือเส้นค่าเฉลี่ย 50 วัน (${a.sma50.toFixed(2)}) แนวโน้มระยะกลางเป็นขาขึ้น` });
    } else {
      score -= 10;
      signals.push({ tone: "neg", text: `ราคาอยู่ใต้เส้นค่าเฉลี่ย 50 วัน (${a.sma50.toFixed(2)}) แนวโน้มระยะกลางยังอ่อน` });
    }
  }
  if (a.sma50 !== null && a.sma200 !== null) {
    if (a.sma50 > a.sma200) {
      score += 10;
      signals.push({ tone: "pos", text: "เส้น 50 วันอยู่เหนือเส้น 200 วัน (แนวโน้มระยะยาวเป็นขาขึ้น)" });
    } else {
      score -= 10;
      signals.push({ tone: "neg", text: "เส้น 50 วันอยู่ใต้เส้น 200 วัน (แนวโน้มระยะยาวเป็นขาลง)" });
    }
  } else {
    signals.push({ tone: "neu", text: "ข้อมูลยังไม่ถึง 200 วัน จึงดูแนวโน้มระยะยาวไม่ได้" });
  }

  // 2) โมเมนตัม
  if (a.r6m !== null) {
    score += clamp(a.r6m * 50, -15, 15);
    signals.push({ tone: a.r6m > 0.05 ? "pos" : a.r6m < -0.05 ? "neg" : "neu", text: `ผลตอบแทน 6 เดือน ${pct(a.r6m)}` });
  }
  if (a.r3m !== null) score += clamp(a.r3m * 40, -10, 10);

  // 3) RSI
  if (a.rsi14 !== null) {
    const r = a.rsi14.toFixed(0);
    if (a.rsi14 >= 70) {
      score -= 8;
      signals.push({ tone: "neg", text: `RSI ${r} สูงเกิน 70: ขึ้นมาเร็ว อาจร้อนแรงเกินไป ระวังการซื้อไล่ราคา` });
    } else if (a.rsi14 <= 30) {
      score += 2;
      signals.push({ tone: "neu", text: `RSI ${r} ต่ำกว่า 30: ถูกขายมาก อาจเด้งได้ แต่ยังไม่ใช่สัญญาณกลับตัว` });
    } else if (a.rsi14 >= 45 && a.rsi14 <= 65) {
      score += 3;
      signals.push({ tone: "pos", text: `RSI ${r} อยู่ในโซนปกติ ไม่ร้อนแรงเกินไป` });
    }
  }

  // 4) ความเสี่ยง
  if (a.vol !== null) {
    const v = (a.vol * 100).toFixed(0);
    if (a.vol > 0.6) {
      score -= 10;
      signals.push({ tone: "neg", text: `ผันผวนสูงมาก (${v}% ต่อปี) ราคาแกว่งแรง ต้องรับความเสี่ยงได้` });
    } else if (a.vol > 0.4) {
      score -= 5;
      signals.push({ tone: "neg", text: `ผันผวนค่อนข้างสูง (${v}% ต่อปี)` });
    } else if (a.vol < 0.25) {
      score += 5;
      signals.push({ tone: "pos", text: `ผันผวนต่ำ (${v}% ต่อปี) ราคาค่อนข้างนิ่ง` });
    }
  }
  if (a.fromHigh !== null) {
    if (a.fromHigh > -0.1 && price > (a.sma50 ?? Infinity)) {
      score += 5;
      signals.push({ tone: "pos", text: `ใกล้จุดสูงสุดรอบ 1 ปี (ห่าง ${pct(a.fromHigh)})` });
    } else if (a.fromHigh < -0.4) {
      score -= 5;
      signals.push({ tone: "neg", text: `ต่ำกว่าจุดสูงสุดรอบ 1 ปีมาก (${pct(a.fromHigh)})` });
    }
  }

  score = Math.round(clamp(score, 0, 100));
  const trend: Analysis["trend"] =
    a.sma50 !== null && price > a.sma50 && (a.sma200 === null || a.sma50 > a.sma200) ? "up" : a.sma50 !== null && price < a.sma50 && (a.sma200 === null || a.sma50 < a.sma200) ? "down" : "side";
  return { ...a, trend, score, label: scoreLabel(score), signals };
}
