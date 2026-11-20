/**
 * ส่วนคำนวณของ "AI จัดพอร์ต" (pure function, ทดสอบได้)
 * - allocatePlan: แบ่งเงินสดซื้อหุ้นคะแนนดี กระจายกลุ่ม จำกัดน้ำหนักต่อตัว
 * - reviewHoldings: ตรวจหุ้นที่ถือ เสนอขาย/ลดสัดส่วนตามกฎวินัย
 */
import type { FeeConfig } from "@/config/fees";
import { commission } from "@/lib/rules/fees";

export const AI_PLAN_PREFIX = "[แผน AI]";
export const DAY_TAG = "[เดย์เทรด]";

export interface Candidate {
  symbol: string;
  name: string;
  sector: string;
  market: "TH" | "US";
  price: number;
  score: number;
  r6m: number | null;
  trendLabel: string;
  stop: number | null;
  target: number | null;
}

export interface PlanItem extends Candidate {
  /** หุ้นไทย: จำนวนหุ้น (ทีละ 100) */
  qty: number | null;
  /** หุ้นสหรัฐฯ: จำนวนเงิน USD (ไม่รวมค่าคอม) */
  amountUsd: number | null;
  costThb: number;
  weightAfter: number;
  reason: string;
}

export interface AllocateInput {
  candidates: Candidate[];
  cashThb: number;
  cashUsd: number;
  /** บาทต่อ 1 USD เมื่อแลก (รวม spread) */
  fxBuy: number;
  totalValueThb: number;
  holdings: { symbol: string; sector: string; valueThb: number }[];
  maxPositions: number;
  /** ใช้เงินสดกี่ส่วน (0–1) */
  usePct: number;
  /** น้ำหนักสูงสุดต่อหุ้น 1 ตัว (0–1) */
  maxWeight: number;
  maxPerSector: number;
  fees: FeeConfig;
}

export interface AllocateResult {
  items: PlanItem[];
  /** ต้องแลกบาทเป็น USD ก่อน (บาท) */
  exchangeThb: number;
  usedThb: number;
  budgetThb: number;
  skipped: { symbol: string; why: string }[];
}

const pct = (r: number) => `${r >= 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(1)}%`;

function reasonFor(c: Candidate): string {
  const parts = [`คะแนนสถิติ ${c.score}/100 (${c.trendLabel})`];
  if (c.r6m !== null) parts.push(`ผลตอบแทน 6 เดือน ${pct(c.r6m)}`);
  parts.push(`กลุ่ม${c.sector}`);
  if (c.stop) parts.push(`ตัดขาดทุนถ้าต่ำกว่า ${c.stop} (${pct(c.stop / c.price - 1)})`);
  if (c.target) parts.push(`เป้าหมาย ${c.target} (${pct(c.target / c.price - 1)})`);
  return parts.join(" · ");
}

export function allocatePlan(inp: AllocateInput): AllocateResult {
  const budgetThb = Math.max(0, (inp.cashThb + inp.cashUsd * inp.fxBuy) * inp.usePct);
  const per = budgetThb / Math.max(1, inp.maxPositions);
  const held = new Map(inp.holdings.map((h) => [h.symbol, h.valueThb]));
  const sectorCount = new Map<string, number>();
  for (const h of inp.holdings) sectorCount.set(h.sector, (sectorCount.get(h.sector) ?? 0) + 1);
  const total = Math.max(inp.totalValueThb, 1);

  const items: PlanItem[] = [];
  const skipped: AllocateResult["skipped"] = [];
  let left = budgetThb;

  for (const c of inp.candidates) {
    if (items.length >= inp.maxPositions) break;
    const already = held.get(c.symbol) ?? 0;
    const room = inp.maxWeight * total - already;
    if (room <= 0) {
      skipped.push({ symbol: c.symbol, why: `ถืออยู่แล้วเกิน ${(inp.maxWeight * 100).toFixed(0)}% ของพอร์ต` });
      continue;
    }
    if ((sectorCount.get(c.sector) ?? 0) >= inp.maxPerSector) {
      skipped.push({ symbol: c.symbol, why: `กลุ่ม${c.sector}มีครบ ${inp.maxPerSector} ตัวแล้ว (กระจายความเสี่ยง)` });
      continue;
    }
    const alloc = Math.min(per, room, left);
    let qty: number | null = null;
    let amountUsd: number | null = null;
    let costThb = 0;
    if (c.market === "TH") {
      const lotCost = c.price * 100;
      let lots = Math.floor(alloc / lotCost);
      while (lots > 0 && lots * lotCost + commission(inp.fees, "TH", lots * lotCost) > alloc) lots--;
      if (lots === 0) {
        skipped.push({ symbol: c.symbol, why: `งบต่อตัว ≈ ฿${Math.round(alloc).toLocaleString("en-US")} ไม่พอซื้อ 1 lot (100 หุ้น)` });
        continue;
      }
      qty = lots * 100;
      costThb = qty * c.price + commission(inp.fees, "TH", qty * c.price);
    } else {
      let usd = Math.floor((alloc / inp.fxBuy) * 100) / 100;
      while (usd > 0 && (usd + commission(inp.fees, "US", usd)) * inp.fxBuy > alloc) usd = Math.floor((usd - 0.01) * 100) / 100;
      if (usd < 1) {
        skipped.push({ symbol: c.symbol, why: "งบต่อตัวน้อยเกินไป" });
        continue;
      }
      amountUsd = usd;
      costThb = (usd + commission(inp.fees, "US", usd)) * inp.fxBuy;
    }
    left -= costThb;
    sectorCount.set(c.sector, (sectorCount.get(c.sector) ?? 0) + 1);
    items.push({ ...c, qty, amountUsd, costThb, weightAfter: (already + costThb) / total, reason: reasonFor(c) });
  }

  // แลกเงินเท่าที่ขาดสำหรับหุ้นสหรัฐฯ
  const usdNeed = items.filter((i) => i.market === "US").reduce((s, i) => s + i.amountUsd! + commission(inp.fees, "US", i.amountUsd!), 0);
  const shortUsd = Math.max(0, usdNeed - inp.cashUsd);
  let exchangeThb = shortUsd > 0 ? Math.ceil(shortUsd * inp.fxBuy * 1.002 * 100) / 100 : 0;

  // ตรวจว่าเงินบาทพอทั้งค่าหุ้นไทย + ค่าแลกเงิน ถ้าไม่พอ ตัดตัวท้ายออก
  const thbNeed = () => items.filter((i) => i.market === "TH").reduce((s, i) => s + i.costThb, 0) + exchangeThb;
  while (items.length && thbNeed() > inp.cashThb + 1e-6) {
    const dropped = items.pop()!;
    skipped.push({ symbol: dropped.symbol, why: "เงินบาทไม่พอหลังจัดสรรตัวก่อนหน้า" });
    const u = items.filter((i) => i.market === "US").reduce((s, i) => s + i.amountUsd! + commission(inp.fees, "US", i.amountUsd!), 0);
    const sh = Math.max(0, u - inp.cashUsd);
    exchangeThb = sh > 0 ? Math.ceil(sh * inp.fxBuy * 1.002 * 100) / 100 : 0;
  }
  return { items, exchangeThb, usedThb: items.reduce((s, i) => s + i.costThb, 0), budgetThb, skipped };
}

// ---------- บริหารพอร์ต ----------

export interface HoldingForReview {
  symbol: string;
  name: string;
  market: "TH" | "US";
  qty: number;
  price: number;
  weight: number;
  valueThb: number;
  totalValueThb: number;
  stopLoss: number | null;
  target: number | null;
  score: number | null;
  trend: "up" | "down" | "side" | null;
  /** ซื้อจากแผนเดย์เทรด */
  isDay?: boolean;
  openedToday?: boolean;
  minutesToClose?: number;
}

export interface ReviewAction {
  symbol: string;
  name: string;
  kind: "stop" | "target" | "trend" | "trim" | "dayclose";
  qty: number;
  title: string;
  why: string;
}

const lotFloor = (q: number) => Math.floor(q / 100) * 100;

export function reviewHoldings(hs: HoldingForReview[], maxWeight = 0.3, trimTo = 0.25): ReviewAction[] {
  const out: ReviewAction[] = [];
  for (const h of hs) {
    if (h.qty <= 0) continue;
    if (h.isDay && (h.openedToday === false || (h.minutesToClose ?? 999) <= 30)) {
      out.push({
        symbol: h.symbol,
        name: h.name,
        kind: "dayclose",
        qty: h.qty,
        title: "ขายปิดสถานะเดย์เทรด",
        why: h.openedToday === false ? "ไม้เดย์เทรดค้างข้ามคืน ควรปิดตามแผน ไม่เปลี่ยนเป็นถือยาวเพราะไม่อยากขาดทุน" : "ใกล้ตลาดปิดแล้ว เดย์เทรดต้องปิดสถานะภายในวัน",
      });
      continue;
    }
    if (h.stopLoss && h.price <= h.stopLoss) {
      out.push({ symbol: h.symbol, name: h.name, kind: "stop", qty: h.qty, title: "ขายทั้งหมด: หลุด stop-loss", why: `ราคา ${h.price} ต่ำกว่า stop-loss ${h.stopLoss} ที่ตั้งไว้ วินัยคือขายตามแผน ไม่รอลุ้น` });
      continue;
    }
    if (h.score !== null && h.score < 40 && h.trend === "down") {
      out.push({ symbol: h.symbol, name: h.name, kind: "trend", qty: h.qty, title: "ขายทั้งหมด: แนวโน้มเปลี่ยนเป็นขาลง", why: `คะแนนสถิติลดเหลือ ${h.score}/100 และราคาอยู่ใต้เส้นค่าเฉลี่ย เหตุผลที่ซื้อตามแนวโน้มไม่เป็นจริงแล้ว` });
      continue;
    }
    if (h.target && h.price >= h.target) {
      const half = h.market === "TH" ? lotFloor(h.qty / 2) : Math.floor((h.qty / 2) * 1e6) / 1e6;
      const qty = half > 0 ? half : h.qty;
      out.push({ symbol: h.symbol, name: h.name, kind: "target", qty, title: qty === h.qty ? "ขายทั้งหมด: ถึงเป้าหมาย" : "ขายครึ่งหนึ่ง: ถึงเป้าหมาย", why: `ราคา ${h.price} ถึงเป้าหมาย ${h.target} แล้ว ทยอยขายเก็บกำไร ที่เหลือปล่อยให้วิ่งต่อ` });
      continue;
    }
    if (h.weight > maxWeight) {
      const excessThb = h.valueThb - trimTo * h.totalValueThb;
      const perShareThb = h.valueThb / h.qty;
      let qty = excessThb / perShareThb;
      qty = h.market === "TH" ? Math.min(h.qty, Math.ceil(qty / 100) * 100) : Math.min(h.qty, Math.ceil(qty * 1e6) / 1e6);
      if (qty > 0)
        out.push({ symbol: h.symbol, name: h.name, kind: "trim", qty, title: `ลดสัดส่วนเหลือ ~${(trimTo * 100).toFixed(0)}%`, why: `หุ้นตัวนี้เป็น ${(h.weight * 100).toFixed(0)}% ของพอร์ต (เกิน ${(maxWeight * 100).toFixed(0)}%) ถ้าพังตัวเดียวพอร์ตเสียหายมาก` });
    }
  }
  return out;
}
