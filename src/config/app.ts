export const STARTING_CASH_OPTIONS = [1_000, 10_000, 100_000] as const;

export const BACKTEST_PRESETS = [
  { date: "2008-09-01", label: "วิกฤตการเงินโลก 2008" },
  { date: "2020-01-15", label: "ก่อนโควิด 2020" },
];

/** จำนวนข้อความ Claude สูงสุดต่อวัน */
export const AI_DAILY_LIMIT = 30;
export const AI_MODEL = "claude-haiku-5-5";

/** หุ้นตัวเดียวเกินสัดส่วนนี้ของพอร์ต = เตือน */
export const CONCENTRATION_WARN = 0.4;

/** Bot ถือยาว: DCA ทั้งหมดกี่เดือน */
export const BOT_DCA_MONTHS = 12;
