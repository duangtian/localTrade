import { setModeAction } from "@/app/actions";
import type { Mode } from "@/lib/settings";

export function ModeSwitch({ mode }: { mode: Mode }) {
  const tabs: { m: Mode; label: string }[] = [
    { m: "live", label: "⏱️ เวลาจริง" },
    { m: "backtest", label: "⏪ ย้อนอดีต" },
  ];
  return (
    <div role="group" aria-label="เลือกโหมดเกม" className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-slate-200 p-1 dark:bg-slate-800">
      {tabs.map((t) => (
        <form key={t.m} action={setModeAction.bind(null, t.m)}>
          <button
            type="submit"
            aria-pressed={mode === t.m}
            className={`btn w-full ${mode === t.m ? "bg-white text-blue-800 shadow dark:bg-slate-950 dark:text-blue-300" : "text-slate-700 dark:text-slate-300"}`}
          >
            {t.label}
          </button>
        </form>
      ))}
    </div>
  );
}
