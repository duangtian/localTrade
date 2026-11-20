import { SET_PRICE_BAND, SET_TICK_SIZES } from "@/config/market";

const EPS = 1e-9;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function tickSizeFor(price: number): number {
  for (const band of SET_TICK_SIZES) {
    if (band.below === null || price < band.below - EPS) return band.tick;
  }
  return SET_TICK_SIZES[SET_TICK_SIZES.length - 1].tick;
}

export function isOnTick(price: number): boolean {
  const tick = tickSizeFor(price);
  const steps = price / tick;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

/** ปัดลงให้ตรง tick */
export function floorToTick(price: number): number {
  const tick = tickSizeFor(price);
  return round2(Math.floor(price / tick + 1e-6) * tick);
}

/** ปัดขึ้นให้ตรง tick */
export function ceilToTick(price: number): number {
  const tick = tickSizeFor(price);
  return round2(Math.ceil(price / tick - 1e-6) * tick);
}

/** ceiling/floor ±30% จากราคาปิดวันก่อน ปัดเข้าหา tick */
export function priceBand(prevClose: number): { floor: number; ceiling: number } {
  const ceiling = floorToTick(prevClose * (1 + SET_PRICE_BAND));
  const floor = Math.max(0.01, ceilToTick(prevClose * (1 - SET_PRICE_BAND)));
  return { floor, ceiling };
}

export type LimitCheck = { ok: true } | { ok: false; error: string };

export function validateThaiLimit(price: number, prevClose: number | null): LimitCheck {
  if (!(price > 0)) return { ok: false, error: "ราคาต้องมากกว่า 0" };
  if (!isOnTick(price)) {
    const tick = tickSizeFor(price);
    return {
      ok: false,
      error: `ราคาต้องเป็นทวีคูณของ ${tick} บาท (ช่วงราคานี้) เช่น ${floorToTick(price)} หรือ ${ceilToTick(price)}`,
    };
  }
  if (prevClose && prevClose > 0) {
    const { floor, ceiling } = priceBand(prevClose);
    if (price > ceiling + EPS) return { ok: false, error: `ราคาสูงกว่าเพดาน (ceiling) ${ceiling} บาท` };
    if (price < floor - EPS) return { ok: false, error: `ราคาต่ำกว่าพื้น (floor) ${floor} บาท` };
  }
  return { ok: true };
}
