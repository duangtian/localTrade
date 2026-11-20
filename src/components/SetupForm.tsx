import { createGameAction } from "@/app/actions";
import { BACKTEST_PRESETS, STARTING_CASH_OPTIONS } from "@/config/app";
import { fmtMoney } from "@/lib/format";
import type { Mode } from "@/lib/settings";
import { SubmitButton } from "./SubmitButton";

export function SetupForm({ mode, defaultCash, maxDate, isReset = false }: { mode: Mode; defaultCash: number; maxDate: string; isReset?: boolean }) {
  return (
    <form action={createGameAction} className="card space-y-4">
      <input type="hidden" name="mode" value={mode} />
      <h2 className="text-xl font-bold">{isReset ? "เริ่มพอร์ตใหม่" : mode === "live" ? "เริ่มเกมโหมดเวลาจริง" : "เริ่มเกมโหมดย้อนอดีต"}</h2>
      <p className="muted">
        {mode === "live"
          ? "ใช้ราคาล่าสุด (หน่วงไม่เกิน 15 นาที) ซื้อขายได้เฉพาะเวลาตลาดเปิด"
          : "เลือกวันในอดีต แล้วเลื่อนวันไปข้างหน้าทีละขั้น คุณจะไม่เห็นราคาหลังวันจำลอง"}
      </p>
      <fieldset>
        <legend className="label">เงินเริ่มต้น (เงินสมมติ)</legend>
        <div className="grid grid-cols-3 gap-2">
          {STARTING_CASH_OPTIONS.map((c) => (
            <label key={c} className="btn-secondary cursor-pointer has-[:checked]:bg-blue-50 has-[:checked]:ring-2 has-[:checked]:ring-blue-700 dark:has-[:checked]:bg-blue-950">
              <input type="radio" name="cash" value={c} defaultChecked={c === defaultCash} className="sr-only" />
              {fmtMoney(c).replace(".00", "")}
            </label>
          ))}
        </div>
      </fieldset>
      {mode === "backtest" && (
        <fieldset className="space-y-2">
          <legend className="label">วันเริ่มต้น</legend>
          {BACKTEST_PRESETS.map((p, i) => (
            <label key={p.date} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 ring-1 ring-slate-300 has-[:checked]:ring-2 has-[:checked]:ring-blue-700 dark:ring-slate-600">
              <input type="radio" name="startDate" value={p.date} defaultChecked={i === 1} className="h-5 w-5" />
              <span>
                {p.label} <span className="muted">({p.date})</span>
              </span>
            </label>
          ))}
          <label className="flex min-h-[44px] items-center gap-3 rounded-xl px-2 ring-1 ring-slate-300 dark:ring-slate-600">
            <input type="radio" name="startDate" value="" className="h-5 w-5" id="custom-radio" />
            <span>วันอื่น:</span>
            <input type="date" name="customDate" max={maxDate} min="2005-01-01" className="input max-w-[11rem]" aria-label="เลือกวันเริ่มต้นเอง" />
          </label>
        </fieldset>
      )}
      <SubmitButton className="btn-primary w-full" pendingText="กำลังเตรียมเกม (อาจใช้เวลาสักครู่)…">
        {isReset ? "รีเซ็ตและเริ่มใหม่" : "เริ่มเกม"}
      </SubmitButton>
    </form>
  );
}
