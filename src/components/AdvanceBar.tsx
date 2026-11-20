"use client";
import { useState, useTransition } from "react";
import { advanceAction } from "@/app/actions";

export function AdvanceBar({ simDateLabel, atEnd }: { simDateLabel: string; atEnd: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const go = (step: "day" | "week" | "month") =>
    start(async () => {
      const r = await advanceAction(step);
      setMsg(r.ok ? (r.message ?? null) : (r.error ?? "เลื่อนวันไม่สำเร็จ"));
    });
  return (
    <section aria-label="เวลาในเกม" className="card mb-3">
      <div className="flex items-baseline justify-between">
        <span className="muted">วันจำลอง</span>
        <span className="text-lg font-bold">{simDateLabel}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button className="btn-secondary" disabled={pending || atEnd} onClick={() => go("day")}>
          ถัดไป 1 วัน
        </button>
        <button className="btn-secondary" disabled={pending || atEnd} onClick={() => go("week")}>
          1 สัปดาห์
        </button>
        <button className="btn-secondary" disabled={pending || atEnd} onClick={() => go("month")}>
          1 เดือน
        </button>
      </div>
      <p className="muted mt-2 text-[0.85rem]" aria-live="polite">
        {pending ? "กำลังเลื่อนวัน ตรวจคำสั่งค้าง และให้ Bot เล่น…" : atEnd ? "ถึงวันปัจจุบันแล้ว" : msg}
      </p>
    </section>
  );
}
