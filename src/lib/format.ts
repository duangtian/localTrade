import { DateTime } from "luxon";

const nf = (min: number, max: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });
const n2 = nf(2, 2);

export function fmtMoney(n: number, currency: "THB" | "USD" = "THB"): string {
  const sign = n < 0 ? "−" : "";
  const sym = currency === "THB" ? "฿" : "$";
  return `${sign}${sym}${n2.format(Math.abs(n))}`;
}

/** มีเครื่องหมาย +/− เสมอ */
export function fmtSignedMoney(n: number, currency: "THB" | "USD" = "THB"): string {
  const sym = currency === "THB" ? "฿" : "$";
  if (Math.abs(n) < 0.005) return `${sym}0.00`;
  return `${n > 0 ? "+" : "−"}${sym}${n2.format(Math.abs(n))}`;
}

export function fmtPct(r: number, digits = 2): string {
  if (!Number.isFinite(r)) return "–";
  const v = r * 100;
  if (Math.abs(v) < 0.005) return `0.00%`;
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;
}

export function fmtQty(q: number): string {
  return Number.isInteger(q) ? new Intl.NumberFormat("en-US").format(q) : nf(0, 6).format(q);
}

export function fmtPrice(n: number): string {
  return nf(2, n < 1 ? 4 : 2).format(n);
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** 2008-09-01 → 1 ก.ย. 2008 */
export function fmtDate(d: string): string {
  const dt = DateTime.fromISO(d.slice(0, 10));
  if (!dt.isValid) return d;
  return `${dt.day} ${TH_MONTHS[dt.month - 1]} ${dt.year}`;
}

/** ข้อความ "อัปเดตล่าสุด" */
export function fmtUpdated(at: string | null | undefined): string {
  if (!at) return "ยังไม่มีข้อมูลราคา";
  if (at.length === 10) return `ราคาปิดวันที่ ${fmtDate(at)}`;
  const dt = DateTime.fromISO(at).setZone("Asia/Bangkok");
  return `อัปเดตล่าสุด ${dt.toFormat("HH:mm")} น.`;
}

export function direction(n: number): "up" | "down" | "flat" {
  if (n > 1e-9) return "up";
  if (n < -1e-9) return "down";
  return "flat";
}
