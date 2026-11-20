/**
 * กติกาตลาด (แก้ไขได้)
 *
 * ตาราง tick size ตรวจจากเว็บ SET เมื่อ 2026-11-20:
 * https://www.set.or.th/en/market/information/trading-procedure/price-bands-and-tick-sizes
 * หน้าเว็บระบุว่า "effective since November 16, 2026"
 */

export interface TickBand {
  /** ราคาต่ำกว่าค่านี้ (บาท) ใช้ tick นี้; null = ไม่มีขอบบน */
  below: number | null;
  tick: number;
}

export const SET_TICK_SIZES: TickBand[] = [
  { below: 2, tick: 0.01 },
  { below: 10, tick: 0.02 },
  { below: 25, tick: 0.05 },
  { below: 50, tick: 0.1 },
  { below: 100, tick: 0.25 },
  { below: 200, tick: 0.5 },
  { below: 400, tick: 1 },
  { below: null, tick: 2 },
];
export const SET_TICK_SIZES_SOURCE = {
  url: "https://www.set.or.th/en/market/information/trading-procedure/price-bands-and-tick-sizes",
  checkedAt: "2026-11-20",
  effectiveSince: "2026-11-16",
};

/** ceiling/floor ±30% จากราคาปิดวันก่อน (หุ้นสามัญ) */
export const SET_PRICE_BAND = 0.3;
/** board lot */
export const SET_BOARD_LOT = 100;

/** เวลาตลาด SET (เวลาไทย, จันทร์–ศุกร์) */
export const SET_SESSIONS = [
  { open: "10:00", close: "12:30" },
  { open: "14:30", close: "16:30" },
];
export const SET_TIMEZONE = "Asia/Bangkok";

/** เวลาตลาดสหรัฐฯ (เวลา New York) */
export const US_SESSIONS = [{ open: "09:30", close: "16:00" }];
export const US_TIMEZONE = "America/New_York";

/**
 * วันหยุดตลาด (YYYY-MM-DD) แก้ไขเพิ่ม/ลบได้
 * TODO: ตรวจรายการวันหยุดปี 2026–2027 กับปฏิทิน SET
 *   https://www.set.or.th/en/about/event-calendar/holiday
 * และวันหยุด NYSE https://www.nyse.com/markets/hours-calendars
 */
export const SET_HOLIDAYS: string[] = [
  "2026-01-01", // วันขึ้นปีใหม่ (ยืนยันจาก SET Calendar 2026)
  "2026-01-02", // วันหยุดพิเศษ (ยืนยันจาก SET Calendar 2026)
  // TODO: วันด้านล่างใส่ตามวันหยุดประจำปีปกติ ยังไม่ได้ยืนยันกับปฏิทิน SET 2026
  "2026-12-07", // ชดเชยวันพ่อแห่งชาติ (5 ธ.ค. ตรงกับวันเสาร์)
  "2026-12-10", // วันรัฐธรรมนูญ
  "2026-12-31", // วันสิ้นปี
  // TODO: เติมวันหยุดปี 2027 เมื่อ SET ประกาศ
];

export const US_HOLIDAYS: string[] = [
  // ตามกติกาวันหยุด NYSE TODO: ตรวจกับ https://www.nyse.com/markets/hours-calendars
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
  "2027-01-01", // New Year's Day
  "2027-01-18", // Martin Luther King Jr. Day
  "2027-02-15", // Washington's Birthday
  "2027-03-26", // Good Friday
  "2027-05-31", // Memorial Day
  "2027-06-18", // Juneteenth (ชดเชย)
  "2027-07-05", // Independence Day (ชดเชย)
  "2027-09-06", // Labor Day
  "2027-11-25", // Thanksgiving
  "2027-12-24", // Christmas (ชดเชย)
];

/** quote ล่าสุดเก็บใน cache กี่นาที (1–15) */
export const QUOTE_CACHE_MINUTES = 5;
