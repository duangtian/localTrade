import { describe, expect, it } from "vitest";
import { DEFAULT_FEES, type FeeConfig } from "@/config/fees";
import { buyUsdRate, commission, sellUsdRate, thbToUsd } from "./fees";
import { isMarketOpen, marketStatus } from "./hours";
import { isOnTick, priceBand, tickSizeFor, validateThaiLimit } from "./tick";

const FEES: FeeConfig = {
  asOf: "2026-11-20",
  th: { commissionRate: 0.0015, minCommissionThb: 0, vatRate: 0.07 },
  us: { commissionRate: 0.0015, minCommissionUsd: 0, vatRate: 0.07 },
  fx: { spreadRate: 0.002 },
};

describe("tick size (ตาราง SET)", () => {
  it.each([
    [1.99, 0.01],
    [2, 0.02],
    [9.98, 0.02],
    [10, 0.05],
    [24.95, 0.05],
    [25, 0.1],
    [49.9, 0.1],
    [50, 0.25],
    [99.75, 0.25],
    [100, 0.5],
    [200, 1],
    [400, 2],
    [1000, 2],
  ])("ราคา %s → tick %s", (price, tick) => {
    expect(tickSizeFor(price)).toBe(tick);
  });

  it("ตรวจราคาตรง tick", () => {
    expect(isOnTick(37.5)).toBe(true);
    expect(isOnTick(37.55)).toBe(false);
    expect(isOnTick(55.25)).toBe(true);
    expect(isOnTick(55.3)).toBe(false);
    expect(isOnTick(3.04)).toBe(true);
    expect(isOnTick(3.05)).toBe(false);
  });

  it("ceiling/floor ±30% ปัดเข้าหา tick", () => {
    const b = priceBand(37.5); // 48.75 / 26.25
    expect(b.ceiling).toBe(48.7);
    expect(b.floor).toBe(26.3);
  });

  it("validateThaiLimit", () => {
    expect(validateThaiLimit(37.5, 37.4).ok).toBe(true);
    expect(validateThaiLimit(37.55, 37.4).ok).toBe(false);
    expect(validateThaiLimit(60, 37.4).ok).toBe(false);
    expect(validateThaiLimit(20, 37.4).ok).toBe(false);
  });
});

describe("ค่าธรรมเนียม", () => {
  it("ค่าคอม + VAT", () => {
    expect(commission(FEES, "TH", 10_000)).toBe(16.05);
  });
  it("ค่าคอมขั้นต่ำ", () => {
    const f = { ...FEES, th: { ...FEES.th, minCommissionThb: 50 } };
    expect(commission(f, "TH", 1000)).toBe(53.5);
  });
  it("ค่าเริ่มต้น (ยังไม่กรอก) = 0", () => {
    expect(commission(DEFAULT_FEES, "US", 1000)).toBe(0);
  });
  it("spread ค่าแลกเงิน", () => {
    expect(buyUsdRate(FEES, 34)).toBeCloseTo(34.068);
    expect(sellUsdRate(FEES, 34)).toBeCloseTo(33.932);
    expect(thbToUsd(FEES, 34, 3406.8)).toBe(100);
  });
});

describe("เวลาตลาด", () => {
  it("SET ช่วงเช้า/พักเที่ยง/บ่าย (เวลาไทย)", () => {
    expect(isMarketOpen("TH", new Date("2026-11-19T03:30:00Z"))).toBe(true); // 10:30
    expect(isMarketOpen("TH", new Date("2026-11-19T06:00:00Z"))).toBe(false); // 13:00
    expect(isMarketOpen("TH", new Date("2026-11-19T08:00:00Z"))).toBe(true); // 15:00
    expect(isMarketOpen("TH", new Date("2026-11-21T03:30:00Z"))).toBe(false); // เสาร์
  });
  it("SET วันหยุดใน config", () => {
    expect(marketStatus("TH", new Date("2026-12-10T03:30:00Z")).open).toBe(false);
  });
  it("US รองรับ daylight saving", () => {
    // ฤดูร้อน (EDT, UTC-4): 09:30 NY = 13:30 UTC
    expect(isMarketOpen("US", new Date("2026-07-15T13:35:00Z"))).toBe(true);
    // ฤดูหนาว (EST, UTC-5): 13:35 UTC = 08:35 NY ยังไม่เปิด
    expect(isMarketOpen("US", new Date("2026-11-19T13:35:00Z"))).toBe(false);
    expect(isMarketOpen("US", new Date("2026-11-19T14:35:00Z"))).toBe(true);
  });
});
