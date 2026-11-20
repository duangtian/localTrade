"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { executePlanAction, executeReviewAction } from "@/app/actions";
import type { ReviewAction } from "@/lib/analysis/allocate";
import { fmtQty } from "@/lib/format";

type Exec = { symbol: string; ok: boolean; message: string };

function Results({ items }: { items: Exec[] }) {
  return (
    <ul className="mt-3 space-y-1 text-[0.9rem]" aria-live="polite">
      {items.map((r, i) => (
        <li key={i} className="flex gap-2">
          <span className={r.ok ? "up" : "down"} aria-hidden>
            {r.ok ? "✓" : "✕"}
          </span>
          <span>
            <b>{r.symbol.replace(".BK", "")}</b> {r.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** ปุ่มยืนยันแผน (ต้องกดเอง ไม่มีการซื้ออัตโนมัติ) */
export function ConfirmPlan({ count, total }: { count: number; total: string }) {
  const [pending, start] = useTransition();
  const [checked, setChecked] = useState(false);
  const [res, setRes] = useState<Exec[] | null>(null);
  if (res) {
    return (
      <div>
        <p className="font-semibold">ส่งคำสั่งตามแผนแล้ว</p>
        <Results items={res} />
        <Link href="/portfolio" className="btn-primary mt-3 w-full">
          ดูพอร์ต
        </Link>
      </div>
    );
  }
  return (
    <div>
      <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-[0.9rem]">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[#3B82F6]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>ฉันอ่านเหตุผลและ stop-loss ของแต่ละตัวแล้ว เข้าใจว่าเป็นการจำลอง และราคาอาจลงได้</span>
      </label>
      <button
        type="button"
        className="btn-primary mt-2 w-full"
        disabled={!checked || pending}
        onClick={() => start(async () => setRes(await executePlanAction()))}
      >
        {pending ? "กำลังส่งคำสั่ง…" : `ยืนยันซื้อ ${count} ตัว (≈ ${total})`}
      </button>
    </div>
  );
}

export function ReviewItem({ a, held }: { a: ReviewAction; held: number }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Exec | null>(null);
  return (
    <li className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {a.symbol.replace(".BK", "")} <span className="muted font-normal">· {a.name}</span>
          </p>
          <p className="mt-0.5 font-medium">{a.title}</p>
          <p className="muted text-[0.9rem]">{a.why}</p>
          <p className="faint mt-1 text-[0.85rem]">
            ขาย {fmtQty(a.qty)} จาก {fmtQty(held)} หุ้น
          </p>
        </div>
      </div>
      {res ? (
        <Results items={[res]} />
      ) : (
        <button type="button" className="btn-sell-outline mt-3 w-full" disabled={pending} onClick={() => start(async () => setRes(await executeReviewAction(a.symbol, a.kind)))}>
          {pending ? "กำลังส่งคำสั่ง…" : "ยืนยันทำตามคำแนะนำนี้"}
        </button>
      )}
    </li>
  );
}
