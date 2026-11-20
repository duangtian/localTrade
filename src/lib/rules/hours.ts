import { DateTime } from "luxon";
import {
  SET_HOLIDAYS,
  SET_SESSIONS,
  SET_TIMEZONE,
  US_HOLIDAYS,
  US_SESSIONS,
  US_TIMEZONE,
} from "@/config/market";
import type { Market } from "./fees";

function cfg(market: Market) {
  return market === "TH"
    ? { tz: SET_TIMEZONE, sessions: SET_SESSIONS, holidays: SET_HOLIDAYS }
    : { tz: US_TIMEZONE, sessions: US_SESSIONS, holidays: US_HOLIDAYS };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export interface MarketStatus {
  open: boolean;
  /** ข้อความสถานะภาษาไทย */
  label: string;
  /** เวลาท้องถิ่นของตลาด */
  localTime: string;
}

export function marketStatus(market: Market, now: Date = new Date()): MarketStatus {
  const { tz, sessions, holidays } = cfg(market);
  const local = DateTime.fromJSDate(now).setZone(tz);
  const localTime = local.toFormat("HH:mm");
  const name = market === "TH" ? "ตลาดหุ้นไทย" : "ตลาดหุ้นสหรัฐฯ";
  if (local.weekday > 5) return { open: false, label: `${name}ปิด (วันหยุดสุดสัปดาห์)`, localTime };
  if (holidays.includes(local.toISODate()!)) return { open: false, label: `${name}ปิด (วันหยุดตลาด)`, localTime };
  const mins = local.hour * 60 + local.minute;
  for (const s of sessions) {
    if (mins >= toMinutes(s.open) && mins < toMinutes(s.close)) {
      return { open: true, label: `${name}เปิดอยู่ (ปิด ${s.close} เวลาท้องถิ่น)`, localTime };
    }
  }
  const sess = sessions.map((s) => `${s.open}–${s.close}`).join(", ");
  return { open: false, label: `${name}ปิด (เวลาทำการ ${sess} เวลาท้องถิ่น)`, localTime };
}

export function isMarketOpen(market: Market, now: Date = new Date()): boolean {
  return marketStatus(market, now).open;
}

/** วันที่ปัจจุบันตามเวลาไทย (YYYY-MM-DD) */
export function bangkokDate(now: Date = new Date()): string {
  return DateTime.fromJSDate(now).setZone(SET_TIMEZONE).toISODate()!;
}

export function bangkokTime(d: Date | string | number): string {
  const dt = typeof d === "string" ? DateTime.fromISO(d) : DateTime.fromJSDate(new Date(d));
  return dt.setZone(SET_TIMEZONE).toFormat("HH:mm");
}

/** วันที่ของแท่งราคาตาม timezone ของตลาด */
export function exchangeDate(market: Market | "FX", d: Date): string {
  const tz = market === "US" ? US_TIMEZONE : SET_TIMEZONE;
  return DateTime.fromJSDate(d).setZone(tz).toISODate()!;
}

export function marketOf(symbol: string): Market {
  return symbol.endsWith(".BK") ? "TH" : "US";
}
