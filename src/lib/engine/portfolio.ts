/**
 * Logic การซื้อขายและการคำนวณพอร์ตแบบ pure function (ไม่แตะ DB/เครือข่าย) เพื่อให้ทดสอบได้
 */
import type { FeeConfig } from "@/config/fees";
import { SET_BOARD_LOT } from "@/config/market";
import { commission, type Market } from "@/lib/rules/fees";
import { round2 } from "@/lib/rules/tick";

export interface Position {
  symbol: string;
  market: Market;
  qty: number;
  /** ต้นทุนเฉลี่ยต่อหุ้น (สกุลเงินของตลาด) รวมค่าคอมแล้ว */
  avgCost: number;
  /** หุ้นสหรัฐฯ: อัตรา THB/USD เฉลี่ยตอนซื้อ (ถ่วงตามต้นทุน) ใช้แยกกำไรจากค่าเงิน; หุ้นไทย = 1 */
  avgFx: number;
  /** วันที่เปิดสถานะ (เวลาเกม YYYY-MM-DD) */
  openedAt: string;
}

export interface PortfolioState {
  cashThb: number;
  cashUsd: number;
  positions: Position[];
}

export type Side = "buy" | "sell";

export interface TradeRequest {
  symbol: string;
  market: Market;
  side: Side;
  /** จำนวนหุ้น (ไทยต้องเป็นทวีคูณ 100) */
  qty?: number;
  /** หุ้นสหรัฐฯ: ระบุเป็นจำนวนเงิน USD แทนจำนวนหุ้น */
  amountUsd?: number;
}

export interface Reserved {
  thb: number;
  usd: number;
  /** หุ้นที่ถูกจองไว้ในคำสั่งขายที่ค้างอยู่ */
  sellQty: Record<string, number>;
}

export const NO_RESERVED: Reserved = { thb: 0, usd: 0, sellQty: {} };

export interface TradePreview {
  qty: number;
  price: number;
  gross: number;
  commission: number;
  /** ซื้อ: เงินที่ต้องจ่ายรวมค่าคอม; ขาย: เงินที่ได้รับหลังหักค่าคอม */
  total: number;
  currency: "THB" | "USD";
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function roundQty(q: number): number {
  return Math.floor(q * 1e6 + 1e-6) / 1e6;
}

export function findPosition(state: PortfolioState, symbol: string): Position | undefined {
  return state.positions.find((p) => p.symbol === symbol);
}

/** ตรวจคำสั่งและคำนวณยอดรวม ณ ราคาที่กำหนด */
export function previewTrade(
  state: PortfolioState,
  req: TradeRequest,
  price: number,
  fees: FeeConfig,
  reserved: Reserved = NO_RESERVED,
): Result<TradePreview> {
  if (!(price > 0)) return { ok: false, error: "ไม่มีราคาสำหรับคำนวณ" };
  const currency = req.market === "TH" ? "THB" : "USD";
  let qty: number;

  if (req.market === "TH") {
    qty = req.qty ?? 0;
    if (!Number.isInteger(qty) || qty <= 0 || qty % SET_BOARD_LOT !== 0) {
      return { ok: false, error: `หุ้นไทยต้องซื้อขายทีละ ${SET_BOARD_LOT} หุ้น (เช่น 100, 200, 300)` };
    }
  } else if (req.amountUsd !== undefined) {
    if (!(req.amountUsd > 0)) return { ok: false, error: "จำนวนเงินต้องมากกว่า 0" };
    qty = roundQty(req.amountUsd / price);
    if (qty <= 0) return { ok: false, error: "จำนวนเงินน้อยเกินไป" };
  } else {
    qty = roundQty(req.qty ?? 0);
    if (!(qty > 0)) return { ok: false, error: "จำนวนหุ้นต้องมากกว่า 0" };
  }

  const gross = round2(req.amountUsd !== undefined ? req.amountUsd : qty * price);
  const comm = commission(fees, req.market, gross);

  if (req.side === "buy") {
    const total = round2(gross + comm);
    const available = currency === "THB" ? state.cashThb - reserved.thb : state.cashUsd - reserved.usd;
    if (total > available + 1e-9) {
      return {
        ok: false,
        error:
          currency === "THB"
            ? `เงินบาทไม่พอ (ต้องใช้ ${total.toFixed(2)} มีให้ใช้ ${Math.max(0, available).toFixed(2)})`
            : `เงิน USD ไม่พอ (ต้องใช้ $${total.toFixed(2)} มีให้ใช้ $${Math.max(0, available).toFixed(2)}) ลองแลกเงินก่อน`,
      };
    }
    return { ok: true, value: { qty, price, gross, commission: comm, total, currency } };
  }

  const pos = findPosition(state, req.symbol);
  const held = (pos?.qty ?? 0) - (reserved.sellQty[req.symbol] ?? 0);
  if (qty > held + 1e-9) {
    return { ok: false, error: `ขายได้ไม่เกินที่ถืออยู่ (${Math.max(0, held)} หุ้น) ห้าม short` };
  }
  return { ok: true, value: { qty, price, gross, commission: comm, total: round2(gross - comm), currency } };
}

export interface Fill extends TradePreview {
  /** กำไร/ขาดทุนที่เกิดขึ้นแล้ว (บาท) เฉพาะคำสั่งขาย */
  realizedPnlThb: number | null;
  fxRate: number;
}

/**
 * ทำรายการจริง คืน state ใหม่ (ไม่แก้ state เดิม)
 * @param fxMid อัตรากลาง THB ต่อ 1 USD ณ เวลาที่ match (หุ้นไทยใส่ 1)
 */
export function applyTrade(
  state: PortfolioState,
  req: TradeRequest,
  price: number,
  fees: FeeConfig,
  fxMid: number,
  date: string,
  reserved: Reserved = NO_RESERVED,
): Result<{ state: PortfolioState; fill: Fill }> {
  const pv = previewTrade(state, req, price, fees, reserved);
  if (!pv.ok) return pv;
  const p = pv.value;
  const fx = req.market === "US" ? fxMid : 1;
  const positions = state.positions.map((x) => ({ ...x }));
  let { cashThb, cashUsd } = state;
  let realized: number | null = null;
  const idx = positions.findIndex((x) => x.symbol === req.symbol);

  if (req.side === "buy") {
    if (p.currency === "THB") cashThb = round2(cashThb - p.total);
    else cashUsd = round2(cashUsd - p.total);
    if (idx === -1) {
      positions.push({ symbol: req.symbol, market: req.market, qty: p.qty, avgCost: p.total / p.qty, avgFx: fx, openedAt: date });
    } else {
      const old = positions[idx];
      const oldCost = old.qty * old.avgCost;
      const newQty = roundQty(old.qty + p.qty);
      const newCost = oldCost + p.total;
      old.avgFx = (oldCost * old.avgFx + p.total * fx) / newCost;
      old.avgCost = newCost / newQty;
      old.qty = newQty;
    }
  } else {
    const pos = positions[idx];
    if (p.currency === "THB") cashThb = round2(cashThb + p.total);
    else cashUsd = round2(cashUsd + p.total);
    // กำไรที่เกิดขึ้นแล้วเป็นบาท = เงินที่ได้ (แปลงที่อัตรากลางวันนี้) − ต้นทุน (แปลงที่อัตราตอนซื้อ)
    realized = round2(p.total * fx - p.qty * pos.avgCost * pos.avgFx);
    pos.qty = roundQty(pos.qty - p.qty);
    if (pos.qty <= 1e-9) positions.splice(idx, 1);
  }

  return {
    ok: true,
    value: { state: { cashThb, cashUsd, positions }, fill: { ...p, realizedPnlThb: realized, fxRate: fx } },
  };
}

/** แลกเงิน: THB→USD หรือ USD→THB */
export function applyExchange(
  state: PortfolioState,
  direction: "THB_TO_USD" | "USD_TO_THB",
  amount: number,
  rate: number,
): Result<{ state: PortfolioState; thb: number; usd: number }> {
  if (!(amount > 0)) return { ok: false, error: "จำนวนเงินต้องมากกว่า 0" };
  if (!(rate > 0)) return { ok: false, error: "ไม่มีอัตราแลกเปลี่ยน" };
  if (direction === "THB_TO_USD") {
    if (amount > state.cashThb + 1e-9) return { ok: false, error: "เงินบาทไม่พอ" };
    const usd = round2(amount / rate);
    return { ok: true, value: { state: { ...state, cashThb: round2(state.cashThb - amount), cashUsd: round2(state.cashUsd + usd) }, thb: amount, usd } };
  }
  if (amount > state.cashUsd + 1e-9) return { ok: false, error: "เงิน USD ไม่พอ" };
  const thb = round2(amount * rate);
  return { ok: true, value: { state: { ...state, cashUsd: round2(state.cashUsd - amount), cashThb: round2(state.cashThb + thb) }, thb, usd: amount } };
}

/**
 * ตรวจว่าคำสั่ง Limit match หรือไม่
 * - ใส่ราคาเดียว (โหมดเวลาจริง) หรือแท่งรายวัน open/high/low (โหมดย้อนอดีต)
 * คืนราคาที่ได้ หรือ null ถ้ายังไม่ match
 */
export function matchLimit(
  side: Side,
  limit: number,
  bar: { price: number } | { open: number; high: number; low: number },
): number | null {
  if ("price" in bar) {
    if (side === "buy") return bar.price <= limit ? bar.price : null;
    return bar.price >= limit ? bar.price : null;
  }
  if (side === "buy") return bar.low <= limit ? Math.min(bar.open, limit) : null;
  return bar.high >= limit ? Math.max(bar.open, limit) : null;
}

export interface PriceInfo {
  price: number;
  prevClose: number | null;
}

export interface HoldingValue extends Position {
  price: number;
  marketValueLocal: number;
  marketValueThb: number;
  costThb: number;
  unrealizedThb: number;
  unrealizedPct: number;
  /** หุ้นสหรัฐฯ: ส่วนที่มาจากราคาหุ้น / มาจากค่าเงิน */
  priceEffectThb: number;
  fxEffectThb: number;
  dayChangeThb: number;
  weight: number;
}

export interface Valuation {
  totalThb: number;
  cashThb: number;
  cashUsd: number;
  cashUsdThb: number;
  holdingsThb: number;
  dayChangeThb: number;
  holdings: HoldingValue[];
}

export function valuePortfolio(
  state: PortfolioState,
  prices: Record<string, PriceInfo | undefined>,
  fxMid: number,
): Valuation {
  const holdings: HoldingValue[] = state.positions.map((pos) => {
    const info = prices[pos.symbol];
    const price = info?.price ?? pos.avgCost; // ไม่มีราคา ใช้ต้นทุนแทนไปก่อน
    const fx = pos.market === "US" ? fxMid : 1;
    const mvLocal = pos.qty * price;
    const mvThb = mvLocal * fx;
    const costThb = pos.qty * pos.avgCost * pos.avgFx;
    const priceEffect = (price - pos.avgCost) * pos.qty * pos.avgFx;
    const fxEffect = pos.market === "US" ? mvLocal * (fx - pos.avgFx) : 0;
    const dayChange = info?.prevClose ? (price - info.prevClose) * pos.qty * fx : 0;
    return {
      ...pos,
      price,
      marketValueLocal: round2(mvLocal),
      marketValueThb: round2(mvThb),
      costThb: round2(costThb),
      unrealizedThb: round2(mvThb - costThb),
      unrealizedPct: costThb > 0 ? (mvThb - costThb) / costThb : 0,
      priceEffectThb: round2(priceEffect),
      fxEffectThb: round2(fxEffect),
      dayChangeThb: round2(dayChange),
      weight: 0,
    };
  });
  const holdingsThb = holdings.reduce((s, h) => s + h.marketValueThb, 0);
  const cashUsdThb = state.cashUsd * fxMid;
  const totalThb = round2(state.cashThb + cashUsdThb + holdingsThb);
  for (const h of holdings) h.weight = totalThb > 0 ? h.marketValueThb / totalThb : 0;
  return {
    totalThb,
    cashThb: state.cashThb,
    cashUsd: state.cashUsd,
    cashUsdThb: round2(cashUsdThb),
    holdingsThb: round2(holdingsThb),
    dayChangeThb: round2(holdings.reduce((s, h) => s + h.dayChangeThb, 0)),
    holdings,
  };
}
