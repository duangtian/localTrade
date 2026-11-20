import { describe, expect, it } from "vitest";
import type { FeeConfig } from "@/config/fees";
import type { Bar } from "@/lib/prices/types";
import { decideDca, normalizeWeights, type DcaConfig } from "./dca";
import { entrySignal, liveDecide, simulateDay } from "./daytrade";

const FEES: FeeConfig = { asOf: null, th: { commissionRate: 0.0015, minCommissionThb: 0, vatRate: 0.07 }, us: { commissionRate: 0, minCommissionUsd: 0, vatRate: 0 }, fx: { spreadRate: 0 } };
const cfg = (over: Partial<DcaConfig> = {}): DcaConfig => ({
  items: [
    { symbol: "PTT.BK", weight: 0.5 },
    { symbol: "AAPL", weight: 0.5 },
  ],
  monthly: 3000,
  active: true,
  startedAt: "2020-01-01",
  done: {},
  bank: {},
  ...over,
});
const dcaInput = (c: DcaConfig, today: string, extra = {}) => ({
  config: c,
  today,
  cashThb: 100_000,
  cashUsd: 0,
  prices: { "PTT.BK": 35, AAPL: 100 },
  canTrade: { "PTT.BK": true, AAPL: true },
  fxMid: 30,
  fees: FEES,
  ...extra,
});

describe("DCA", () => {
  it("สัดส่วนถูกปรับให้รวมเป็น 1", () => {
    expect(normalizeWeights([{ symbol: "A", weight: 2 }, { symbol: "B", weight: 6 }, { symbol: "C", weight: 0 }]).map((x) => x.weight)).toEqual([0.25, 0.75]);
  });
  it("หุ้นไทยงบไม่พอ 1 lot: สะสมไว้ แล้วซื้อเมื่อครบ", () => {
    // งบ PTT เดือนละ 1,500 แต่ 1 lot = 3,500
    let c = cfg();
    let d = decideDca(dcaInput(c, "2020-01-06"));
    expect(d.actions.some((a) => a.kind === "buy" && a.symbol === "PTT.BK")).toBe(false);
    expect(d.config.bank["PTT.BK"]).toBe(1500);
    c = d.config;
    d = decideDca(dcaInput(c, "2020-02-03"));
    expect(d.actions.some((a) => a.kind === "buy" && a.symbol === "PTT.BK")).toBe(false);
    c = d.config;
    d = decideDca(dcaInput(c, "2020-03-02"));
    const buy = d.actions.find((a) => a.kind === "buy" && a.symbol === "PTT.BK");
    expect(buy && buy.kind === "buy" && buy.qty).toBe(100);
    expect(d.config.bank["PTT.BK"]).toBeLessThan(1500);
  });
  it("หุ้นสหรัฐฯ ซื้อด้วยงบเต็ม และแลกเงินก่อน", () => {
    const d = decideDca(dcaInput(cfg(), "2020-01-06"));
    expect(d.actions[0]).toMatchObject({ kind: "exchange" });
    const buy = d.actions.find((a) => a.kind === "buy" && a.symbol === "AAPL");
    expect(buy && buy.kind === "buy" && buy.amountUsd).toBeCloseTo(50, 0);
  });
  it("เดือนเดียวกันซื้อครั้งเดียว และรอถ้าตลาดปิด", () => {
    const first = decideDca(dcaInput(cfg(), "2020-01-06", { canTrade: { "PTT.BK": true, AAPL: false } }));
    expect(first.config.done.AAPL).toBeUndefined();
    const again = decideDca(dcaInput(first.config, "2020-01-07"));
    expect(again.actions.filter((a) => a.kind === "buy" && a.symbol === "PTT.BK")).toHaveLength(0);
    expect(again.config.done.AAPL).toBe("2020-01");
  });
  it("หยุดชั่วคราวแล้วไม่ซื้อ", () => {
    expect(decideDca(dcaInput(cfg({ active: false }), "2020-01-06")).actions).toEqual([]);
  });
});

const bars = (closes: number[]): Bar[] => closes.map((c, i) => ({ date: `2020-01-${String(i + 1).padStart(2, "0")}`, open: c, high: c, low: c, close: c, volume: 1 }));

describe("Bot เดย์เทรด", () => {
  const up = bars(Array.from({ length: 25 }, (_, i) => 30 + i * 0.2));
  const prev = up[up.length - 1].close;
  it("เข้าเมื่อแนวโน้มขึ้น + gap up; ไม่เข้าเมื่อ gap น้อยหรือแนวโน้มลง", () => {
    expect(entrySignal("PTT.BK", up, prev * 1.01, { gapPct: 0.005 })).not.toBeNull();
    expect(entrySignal("PTT.BK", up, prev * 1.001, { gapPct: 0.005 })).toBeNull();
    expect(entrySignal("PTT.BK", up, prev * 1.08, { gapPct: 0.005 })).toBeNull();
    const down = bars(Array.from({ length: 25 }, (_, i) => 40 - i * 0.2));
    expect(entrySignal("PTT.BK", down, down.at(-1)!.close * 1.01, { gapPct: 0.005 })).toBeNull();
  });
  it("จำลองวัน: stop มาก่อนเป้าเมื่อแตะทั้งคู่ (สมมติแบบระมัดระวัง)", () => {
    const c = { stopPct: 0.02, targetPct: 0.03 };
    expect(simulateDay("AAPL", { date: "d", open: 100, high: 104, low: 97, close: 101, volume: 1 }, c)).toMatchObject({ kind: "stop", exit: 98 });
    expect(simulateDay("AAPL", { date: "d", open: 100, high: 104, low: 99, close: 101, volume: 1 }, c)).toMatchObject({ kind: "target", exit: 103 });
    expect(simulateDay("AAPL", { date: "d", open: 100, high: 101, low: 99, close: 100.5, volume: 1 }, c)).toMatchObject({ kind: "close", exit: 100.5 });
  });
  it("หุ้นไทย: ราคา stop/เป้าอยู่บนช่วงราคา SET", () => {
    const o = simulateDay("PTT.BK", { date: "d", open: 37.5, high: 37.5, low: 36, close: 37, volume: 1 }, { stopPct: 0.02, targetPct: 0.03 });
    expect(o.exit).toBe(36.7); // 37.5 × 0.98 = 36.75 → ปัดลงตามช่วงราคา 0.10 (ราคา 25–50 บาท)
  });
  it("โหมดเวลาจริง: ปิดสถานะก่อนตลาดปิด และขายตัวที่ค้างข้ามคืน", () => {
    const c = { stopPct: 0.02, targetPct: 0.03, gapPct: 0.005 };
    const base = { bars: [], price: 100, prevClose: 99, ma20: 95, tradedToday: false, minutesSinceOpen: 300, cfg: c };
    expect(liveDecide({ ...base, holding: { entry: 100, openedToday: true }, minutesToClose: 10 })?.action).toBe("sell");
    expect(liveDecide({ ...base, holding: { entry: 100, openedToday: false }, minutesToClose: 200 })?.why).toContain("ข้ามคืน");
    expect(liveDecide({ ...base, holding: { entry: 100, openedToday: true }, minutesToClose: 200 })).toBeNull();
  });
  it("โหมดเวลาจริง: เข้าเมื่อทะลุจุดสูงสุด 30 นาทีแรก ภายใน 90 นาที", () => {
    const c = { stopPct: 0.02, targetPct: 0.03, gapPct: 0.005 };
    const or = Array.from({ length: 6 }, (_, i) => ({ date: `t${i}`, open: 100, high: 101, low: 99.5, close: 100.5, volume: 1 }));
    const base = { bars: or, prevClose: 99, ma20: 95, holding: null, tradedToday: false, minutesToClose: 300, cfg: c };
    expect(liveDecide({ ...base, price: 101.5, minutesSinceOpen: 45 })?.action).toBe("buy");
    expect(liveDecide({ ...base, price: 100.8, minutesSinceOpen: 45 })).toBeNull();
    expect(liveDecide({ ...base, price: 101.5, minutesSinceOpen: 120 })).toBeNull();
    expect(liveDecide({ ...base, price: 101.5, minutesSinceOpen: 45, tradedToday: true })).toBeNull();
  });
});
