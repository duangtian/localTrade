import { describe, expect, it } from "vitest";
import { DEFAULT_FEES } from "@/config/fees";
import { AI_PLAN_PREFIX, allocatePlan, reviewHoldings, type Candidate } from "./allocate";
import { evaluateMissions } from "@/lib/missions";

const fees = { ...DEFAULT_FEES, th: { commissionRate: 0.0015, minCommissionThb: 0, vatRate: 0.07 }, us: { commissionRate: 0, minCommissionUsd: 0, vatRate: 0 }, fx: { spreadRate: 0.01 } };
const c = (symbol: string, sector: string, price: number, score = 80, market: "TH" | "US" = "TH"): Candidate => ({
  symbol,
  name: symbol,
  sector,
  market,
  price,
  score,
  r6m: 0.2,
  trendLabel: "แนวโน้มแข็งแรง",
  stop: price * 0.93,
  target: price * 1.14,
});
const base = { cashThb: 100_000, cashUsd: 0, fxBuy: 34, totalValueThb: 100_000, holdings: [], maxPositions: 4, usePct: 0.8, maxWeight: 0.25, maxPerSector: 2, fees };

describe("allocatePlan: แบ่งเงินซื้อหุ้น", () => {
  it("ไม่ใช้เงินเกินงบ ซื้อหุ้นไทยทีละ 100 หุ้น และไม่เกิน 25% ต่อตัว", () => {
    const r = allocatePlan({ ...base, candidates: [c("A.BK", "ธนาคาร", 30), c("B.BK", "พลังงาน", 12), c("C.BK", "การแพทย์", 45), c("D.BK", "พาณิชย์", 8)] });
    expect(r.items).toHaveLength(4);
    expect(r.usedThb).toBeLessThanOrEqual(r.budgetThb + 1e-6);
    for (const i of r.items) {
      expect(i.qty! % 100).toBe(0);
      expect(i.weightAfter).toBeLessThanOrEqual(0.25 + 1e-9);
      expect(i.reason).toContain("คะแนนสถิติ");
    }
  });
  it("กระจายกลุ่ม: ไม่เกิน 2 ตัวต่อกลุ่ม", () => {
    const r = allocatePlan({ ...base, candidates: [c("A.BK", "ธนาคาร", 10), c("B.BK", "ธนาคาร", 10), c("C.BK", "ธนาคาร", 10), c("D.BK", "พลังงาน", 10)] });
    expect(r.items.filter((i) => i.sector === "ธนาคาร")).toHaveLength(2);
    expect(r.skipped.some((s) => s.symbol === "C.BK")).toBe(true);
  });
  it("งบไม่พอ 1 lot: ข้ามและบอกเหตุผล", () => {
    const r = allocatePlan({ ...base, cashThb: 5_000, totalValueThb: 5_000, candidates: [c("BIG.BK", "การแพทย์", 300)] });
    expect(r.items).toHaveLength(0);
    expect(r.skipped[0].why).toContain("1 lot");
  });
  it("หุ้นสหรัฐฯ: คำนวณเงินที่ต้องแลก และเงินบาทพอจ่าย", () => {
    const r = allocatePlan({ ...base, cashThb: 20_000, totalValueThb: 20_000, candidates: [c("AAPL", "เทคโนโลยี", 200, 80, "US"), c("KO", "สินค้าอุปโภคบริโภค", 60, 75, "US")] });
    expect(r.items).toHaveLength(2);
    expect(r.exchangeThb).toBeGreaterThan(0);
    expect(r.exchangeThb).toBeLessThanOrEqual(20_000);
    for (const i of r.items) expect(i.amountUsd).toBeGreaterThan(0);
  });
  it("ไม่ซื้อเพิ่มตัวที่ถือเกินน้ำหนักสูงสุดแล้ว", () => {
    const r = allocatePlan({ ...base, holdings: [{ symbol: "A.BK", sector: "ธนาคาร", valueThb: 30_000 }], candidates: [c("A.BK", "ธนาคาร", 10)] });
    expect(r.items).toHaveLength(0);
  });
});

describe("reviewHoldings: ดูแลพอร์ต", () => {
  const h = { symbol: "A.BK", name: "A", market: "TH" as const, qty: 400, price: 10, weight: 0.2, valueThb: 4000, totalValueThb: 20000, stopLoss: null, target: null, score: 70, trend: "up" as const };
  it("หลุด stop-loss = ขายทั้งหมด", () => {
    const a = reviewHoldings([{ ...h, stopLoss: 10.5 }]);
    expect(a[0]).toMatchObject({ kind: "stop", qty: 400 });
  });
  it("ถึงเป้า = ขายครึ่ง (ทีละ 100 หุ้น)", () => {
    expect(reviewHoldings([{ ...h, target: 9.5 }])[0]).toMatchObject({ kind: "target", qty: 200 });
    expect(reviewHoldings([{ ...h, qty: 100, target: 9.5 }])[0]).toMatchObject({ kind: "target", qty: 100 });
  });
  it("แนวโน้มเสีย = ขายทั้งหมด", () => {
    expect(reviewHoldings([{ ...h, score: 30, trend: "down" }])[0].kind).toBe("trend");
  });
  it("เกิน 30% = ลดสัดส่วน", () => {
    const a = reviewHoldings([{ ...h, qty: 1000, valueThb: 10_000, weight: 0.5 }])[0];
    expect(a.kind).toBe("trim");
    expect(a.qty % 100).toBe(0);
    expect((10_000 - a.qty * 10) / 20_000).toBeLessThanOrEqual(0.26);
  });
  it("ปกติ = ไม่ต้องทำอะไร", () => {
    expect(reviewHoldings([h])).toEqual([]);
  });
});

describe("ภารกิจไม่นับคำสั่งจากแผน AI", () => {
  it("ซื้อด้วยแผน AI ไม่ทำให้ภารกิจ 'ซื้อตัวแรกพร้อมเหตุผล' สำเร็จ", () => {
    const order = { id: 1, side: "buy", status: "filled", market: "TH", symbol: "A.BK", reason: `${AI_PLAN_PREFIX} คะแนนสถิติ 80`, stopLoss: 9, createdAt: "2026-01-05", filledAt: "2026-01-05", realizedPnlThb: null };
    const ms = evaluateMissions({
      today: "2026-01-05",
      orders: [order as never],
      valuation: { totalThb: 0, cashThb: 0, cashUsd: 0, cashUsdThb: 0, holdingsThb: 0, dayChangeThb: 0, holdings: [] },
      summariesRead: 0,
      positionsOpenedAt: [],
    });
    expect(ms.find((m) => m.id === "first_buy")!.done).toBe(false);
  });
});
