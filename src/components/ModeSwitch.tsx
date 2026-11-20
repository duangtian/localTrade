import { setModeAction } from "@/app/actions";
import type { Mode } from "@/lib/settings";

export function ModeSwitch({ mode }: { mode: Mode }) {
  const tabs: { m: Mode; label: string }[] = [
    { m: "live", label: "เวลาจริง" },
    { m: "backtest", label: "ย้อนอดีต" },
  ];
  return (
    <div role="group" aria-label="เลือกโหมดเกม" className="seg mb-3 grid-cols-2">
      {tabs.map((t) => (
        <form key={t.m} action={setModeAction.bind(null, t.m)}>
          <button type="submit" aria-pressed={mode === t.m} className={`w-full ${mode === t.m ? "seg-item-active" : "seg-item"}`}>
            {t.label}
          </button>
        </form>
      ))}
    </div>
  );
}
