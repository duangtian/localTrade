"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ScanRow } from "@/lib/analysis/screen";
import { fmtPrice } from "@/lib/format";
import { IconChevronRight } from "./icons";
import { ScoreBadge, ToneDot } from "./ScoreBadge";
import { ChangePill, StockBadge } from "./StockBadge";

type Sort = "score" | "r6m" | "rsi" | "vol";
const SORTS: { id: Sort; label: string }[] = [
  { id: "score", label: "คะแนนรวม" },
  { id: "r6m", label: "ขึ้นแรง 6 เดือน" },
  { id: "rsi", label: "ถูกขายมาก (RSI ต่ำ)" },
  { id: "vol", label: "ผันผวนต่ำ" },
];

export function ScanList({ rows }: { rows: ScanRow[] }) {
  const [sort, setSort] = useState<Sort>("score");
  const [onlyUp, setOnlyUp] = useState(false);
  const [limit, setLimit] = useState(20);
  const list = useMemo(() => {
    let l = onlyUp ? rows.filter((r) => r.a.trend === "up") : rows;
    const v = (x: number | null, d: number) => (x === null ? d : x);
    l = [...l].sort((x, y) => {
      if (sort === "r6m") return v(y.a.r6m, -9) - v(x.a.r6m, -9);
      if (sort === "rsi") return v(x.a.rsi14, 999) - v(y.a.rsi14, 999);
      if (sort === "vol") return v(x.a.vol, 9) - v(y.a.vol, 9);
      return y.a.score - x.a.score;
    });
    return l;
  }, [rows, sort, onlyUp]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-[0.9rem]">
          <span className="muted">เรียงตาม</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="select"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[0.9rem]">
          <input type="checkbox" className="h-5 w-5" checked={onlyUp} onChange={(e) => setOnlyUp(e.target.checked)} />
          เฉพาะขาขึ้น
        </label>
      </div>
      <ol className="card overflow-hidden p-0">
        {list.slice(0, limit).map((r, i) => (
          <li key={r.symbol} className="border-b border-line last:border-b-0">
            <Link
              href={`/stock/${encodeURIComponent(r.symbol)}`}
              className="block px-3 py-3 transition-colors hover:bg-white/[0.06]"
            >
              <div className="flex items-center gap-3">
                <span className="muted w-6 shrink-0 text-center font-bold">{i + 1}</span>
                <StockBadge symbol={r.symbol} sector={r.sector} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold leading-tight">{r.symbol.replace(".BK", "")}</div>
                  <div className="muted truncate text-[0.8rem]">
                    {r.name} · {r.sector}
                  </div>
                </div>
                <ScoreBadge score={r.a.score} />
                <span className="text-white/45">
                  <IconChevronRight />
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.85rem]">
                <span className="font-semibold">{r.a.label}</span>
                <span className="muted">ราคา {fmtPrice(r.a.price)}</span>
                <span className="muted">
                  6 เดือน <ChangePill pct={r.a.r6m} />
                </span>
                {r.a.rsi14 !== null && <span className="muted">RSI {r.a.rsi14.toFixed(0)}</span>}
              </div>
              <ul className="mt-1 space-y-0.5 text-[0.85rem]">
                {r.a.signals.slice(0, 2).map((s) => (
                  <li key={s.text} className="flex gap-1.5">
                    <ToneDot tone={s.tone} />
                    <span>{s.text}</span>
                  </li>
                ))}
              </ul>
            </Link>
          </li>
        ))}
      </ol>
      {list.length === 0 && <p className="card muted">ไม่มีหุ้นที่ตรงเงื่อนไข</p>}
      {list.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + 40)} className="btn-secondary mt-3 w-full">
          แสดงเพิ่ม (เหลืออีก {list.length - limit} ตัว)
        </button>
      )}
    </div>
  );
}
