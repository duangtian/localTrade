import { describe, expect, it } from "vitest";
import type { FeeConfig } from "@/config/fees";
import { applyExchange, applyTrade, matchLimit, previewTrade, valuePortfolio, type PortfolioState } from "./portfolio";

const FEES: FeeConfig = {
  asOf: "2026-11-20",
  th: { commissionRate: 0.001, minCommissionThb: 0, vatRate: 0 },
  us: { commissionRate: 0, minCommissionUsd: 0, vatRate: 0 },
  fx: { spreadRate: 0 },
};
const start: PortfolioState = { cashThb: 10_000, cashUsd: 0, positions: [] };

function ok<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("หุ้นไทย board lot 100", () => {
  it("ซื้อ 200 หุ้น PTT ที่ 37.5 หักค่าคอมถูกต้อง", () => {
    const { state, fill } = ok(applyTrade(start, { symbol: "PTT.BK", market: "TH", side: "buy", qty: 200 }, 37.5, FEES, 1, "2026-11-20"));
    expect(fill.gross).toBe(7500);
    expect(fill.commission).toBe(7.5);
    expect(fill.total).toBe(7507.5);
    expect(state.cashThb).toBe(2492.5);
    expect(state.positions[0].qty).toBe(200);
    expect(state.positions[0].avgCost).toBeCloseTo(37.5375);
  });

  it("ปฏิเสธจำนวนที่ไม่ใช่ทวีคูณ 100", () => {
    expect(previewTrade(start, { symbol: "PTT.BK", market: "TH", side: "buy", qty: 150 }, 37.5, FEES).ok).toBe(false);
  });

  it("ห้ามซื้อเกินเงินที่มี", () => {
    expect(previewTrade(start, { symbol: "PTT.BK", market: "TH", side: "buy", qty: 300 }, 37.5, FEES).ok).toBe(false);
  });

  it("ห้าม short", () => {
    expect(previewTrade(start, { symbol: "PTT.BK", market: "TH", side: "sell", qty: 100 }, 37.5, FEES).ok).toBe(false);
  });

  it("ขายแล้วคำนวณกำไรที่เกิดขึ้นแล้ว", () => {
    const a = ok(applyTrade(start, { symbol: "PTT.BK", market: "TH", side: "buy", qty: 200 }, 37.5, FEES, 1, "d1"));
    const b = ok(applyTrade(a.state, { symbol: "PTT.BK", market: "TH", side: "sell", qty: 100 }, 40, FEES, 1, "d2"));
    // ได้ 4000 − 4 = 3996, ต้นทุน 100 × 37.5375 = 3753.75
    expect(b.fill.realizedPnlThb).toBe(242.25);
    expect(b.state.cashThb).toBe(2492.5 + 3996);
    expect(b.state.positions[0].qty).toBe(100);
  });

  it("คำสั่งที่ค้างจองเงินไว้แล้ว", () => {
    const r = previewTrade(start, { symbol: "PTT.BK", market: "TH", side: "buy", qty: 100 }, 37.5, FEES, { thb: 7000, usd: 0, sellQty: {} });
    expect(r.ok).toBe(false);
  });
});

describe("หุ้นสหรัฐฯ เศษหุ้นผ่านกระเป๋า USD", () => {
  it("ต้องแลกเงินก่อนซื้อ", () => {
    expect(previewTrade(start, { symbol: "AAPL", market: "US", side: "buy", amountUsd: 50 }, 200, FEES).ok).toBe(false);
  });

  it("แลก THB→USD แล้วซื้อเป็นจำนวนเงิน", () => {
    const ex = ok(applyExchange(start, "THB_TO_USD", 3400, 34));
    expect(ex.state.cashUsd).toBe(100);
    expect(ex.state.cashThb).toBe(6600);
    const { state, fill } = ok(applyTrade(ex.state, { symbol: "AAPL", market: "US", side: "buy", amountUsd: 50 }, 200, FEES, 34, "d1"));
    expect(fill.qty).toBe(0.25);
    expect(state.cashUsd).toBe(50);
    expect(state.positions[0].avgFx).toBe(34);
  });

  it("แยกกำไรจากราคาหุ้นและค่าเงิน", () => {
    const ex = ok(applyExchange(start, "THB_TO_USD", 3400, 34));
    const { state } = ok(applyTrade(ex.state, { symbol: "AAPL", market: "US", side: "buy", qty: 0.5 }, 200, FEES, 34, "d1"));
    // ราคาขึ้นเป็น 220, ค่าเงินเป็น 35
    const v = valuePortfolio(state, { AAPL: { price: 220, prevClose: 210 } }, 35);
    const h = v.holdings[0];
    expect(h.marketValueThb).toBe(3850); // 0.5 × 220 × 35
    expect(h.costThb).toBe(3400);
    expect(h.priceEffectThb).toBe(340); // (220−200) × 0.5 × 34
    expect(h.fxEffectThb).toBe(110); // 110 USD × (35−34)
    expect(h.priceEffectThb + h.fxEffectThb).toBeCloseTo(h.unrealizedThb);
    expect(v.totalThb).toBe(6600 + 0 + 3850);
    expect(h.dayChangeThb).toBe(175); // (220−210) × 0.5 × 35
  });
});

describe("มูลค่าพอร์ตรวม", () => {
  it("รวมเงินสด 2 กระเป๋า + หุ้น", () => {
    const state: PortfolioState = {
      cashThb: 1000,
      cashUsd: 10,
      positions: [
        { symbol: "PTT.BK", market: "TH", qty: 100, avgCost: 30, avgFx: 1, openedAt: "d" },
        { symbol: "KO", market: "US", qty: 1, avgCost: 60, avgFx: 33, openedAt: "d" },
      ],
    };
    const v = valuePortfolio(state, { "PTT.BK": { price: 35, prevClose: 34 }, KO: { price: 70, prevClose: 70 } }, 34);
    expect(v.totalThb).toBe(1000 + 340 + 3500 + 2380);
    expect(v.holdings[0].unrealizedThb).toBe(500);
    expect(v.holdings[0].weight).toBeCloseTo(3500 / 7220);
  });
});

describe("Limit order", () => {
  it("เวลาจริง: ใช้ราคาล่าสุด", () => {
    expect(matchLimit("buy", 37, { price: 36.75 })).toBe(36.75);
    expect(matchLimit("buy", 37, { price: 37.25 })).toBeNull();
    expect(matchLimit("sell", 40, { price: 40.5 })).toBe(40.5);
  });
  it("ย้อนอดีต: ใช้ high/low ของวัน", () => {
    expect(matchLimit("buy", 37, { open: 38, high: 38.5, low: 36.5 })).toBe(37);
    expect(matchLimit("buy", 37, { open: 36, high: 38.5, low: 35 })).toBe(36); // gap ลงเปิดต่ำกว่า limit
    expect(matchLimit("buy", 37, { open: 38, high: 39, low: 37.5 })).toBeNull();
    expect(matchLimit("sell", 40, { open: 39, high: 41, low: 38 })).toBe(40);
  });
});
