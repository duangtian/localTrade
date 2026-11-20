import type { FeeConfig } from "@/config/fees";
import { round2 } from "./tick";

export type Market = "TH" | "US";

/** ค่าคอม + VAT ในสกุลเงินของตลาด (TH = บาท, US = USD) */
export function commission(fees: FeeConfig, market: Market, tradeValue: number): number {
  if (tradeValue <= 0) return 0;
  const f = market === "TH" ? fees.th : fees.us;
  const min = market === "TH" ? fees.th.minCommissionThb : fees.us.minCommissionUsd;
  const base = Math.max(tradeValue * f.commissionRate, min);
  return round2(base * (1 + f.vatRate));
}

/** อัตราแลก THB→USD (บาทต่อ 1 USD ที่ต้องจ่าย) = อัตรากลาง + spread */
export function buyUsdRate(fees: FeeConfig, mid: number): number {
  return mid * (1 + fees.fx.spreadRate);
}

/** อัตราแลก USD→THB (บาทที่ได้ต่อ 1 USD) = อัตรากลาง − spread */
export function sellUsdRate(fees: FeeConfig, mid: number): number {
  return mid * (1 - fees.fx.spreadRate);
}

export function thbToUsd(fees: FeeConfig, mid: number, thb: number): number {
  return round2(thb / buyUsdRate(fees, mid));
}

export function usdToThb(fees: FeeConfig, mid: number, usd: number): number {
  return round2(usd * sellUsdRate(fees, mid));
}
