import Link from "next/link";
import { EmptyState, PageTitle } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { viewPortfolio } from "@/lib/game/core";
import { loadGame } from "@/lib/server";
import { missionsFor } from "@/lib/views";

export default async function MissionsPage() {
  const l = await loadGame();
  if (!l.game) {
    return (
      <EmptyState title="ยังไม่ได้เริ่มเกม">
        <Link href="/" className="btn-primary mt-2">
          เลือกเงินเริ่มต้น
        </Link>
      </EmptyState>
    );
  }
  const v = await viewPortfolio(l.ctx, l.pid);
  const missions = missionsFor(getDb(), l.game.id, l.pid, l.ctx.today, v.valuation);
  const score = missions.filter((m) => m.done).reduce((s, m) => s + m.points, 0);
  const max = missions.reduce((s, m) => s + m.points, 0);
  const next = missions.find((m) => !m.done);

  return (
    <>
      <PageTitle sub="คะแนนมาจากวินัย ไม่ใช่กำไร">ภารกิจ</PageTitle>
      <section className="card">
        <div className="muted">คะแนนวินัย</div>
        <p className="big-num">
          {score} <span className="muted text-xl">/ {max}</span>
        </p>
        <div
          className="mt-2 h-3 rounded-full bg-slate-200 dark:bg-slate-700"
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label="คะแนนวินัย"
        >
          <div className="h-3 rounded-full bg-blue-700 dark:bg-blue-400" style={{ width: `${(score / max) * 100}%` }} />
        </div>
        {next && (
          <Link href="/market" className="btn-primary mt-3 w-full">
            ทำภารกิจถัดไป: {next.title}
          </Link>
        )}
      </section>
      <ul className="mt-4 space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
        {missions.map((m) => (
          <li key={m.id} className={`card flex items-start gap-3 ${m.done ? "opacity-90" : ""}`}>
            <span className="text-2xl" aria-hidden>
              {m.done ? "✅" : "⬜"}
            </span>
            <div className="flex-1">
              <p className="font-semibold">
                {m.title} <span className="sr-only">{m.done ? "(สำเร็จแล้ว)" : "(ยังไม่สำเร็จ)"}</span>
              </p>
              <p className="muted text-[0.9rem]">{m.hint}</p>
              {m.progress && !m.done && <p className="text-[0.85rem] font-semibold">ความคืบหน้า: {m.progress}</p>}
            </div>
            <span className="chip shrink-0 bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100">+{m.points}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
