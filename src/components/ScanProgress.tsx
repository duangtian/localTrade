"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ScanJobStatus } from "@/lib/analysis/background";

/**
 * แสดงความคืบหน้าสแกนเบื้องหลัง และรีเฟรชหน้าเมื่อมีผลใหม่กว่าที่แสดงอยู่
 * (เช็กทุก 2 วินาทีระหว่างสแกน, ทุก 15 วินาทีตอนว่าง)
 */
export function ScanProgress({ universe, label, initial, shownAt }: { universe: string; label: string; initial: ScanJobStatus; shownAt: string | null }) {
  const router = useRouter();
  const [st, setSt] = useState(initial);
  const active = st.running?.universe === universe || st.queue.includes(universe as never);
  const newer = st.last?.universe === universe && st.last.ok && (!shownAt || st.last.at > shownAt);

  useEffect(() => {
    if (newer && !active) router.refresh();
  }, [newer, active, router]);

  useEffect(() => {
    const t = setInterval(
      async () => {
        try {
          setSt(await (await fetch("/api/scan-status", { cache: "no-store" })).json());
        } catch {
          /* ลองใหม่รอบถัดไป */
        }
      },
      active ? 2000 : 15000,
    );
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;
  const run = st.running?.universe === universe ? st.running : null;
  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0;
  return (
    <div className="card mb-4" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-[0.9rem]">
        <span className="font-medium">{run ? `กำลังสแกน ${label} เบื้องหลัง` : `${label} อยู่ในคิวสแกน`}</span>
        <span className="muted">{run ? `${run.done}/${run.total}` : "รอคิว"}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${run ? Math.max(4, pct) : 4}%` }} />
      </div>
      <p className="faint mt-1.5 text-[0.8rem]">ไปหน้าอื่นได้เลย ผลจะอัปเดตเองเมื่อสแกนเสร็จ</p>
    </div>
  );
}
