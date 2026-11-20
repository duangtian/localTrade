"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { SeedStock } from "@/config/seeds";
import { direction, fmtPct, fmtPrice } from "@/lib/format";

export function MarketList({
  items,
  quotes,
  market,
}: {
  items: SeedStock[];
  quotes: Record<string, { price: number; prevClose: number | null }>;
  market: "TH" | "US";
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    if (!s) return items;
    return items.filter((i) => i.symbol.toUpperCase().includes(s) || i.name.toUpperCase().includes(s) || i.sector.includes(q.trim()));
  }, [q, items]);
  const raw = q.trim().toUpperCase().replace(/[^A-Z0-9.\-&]/g, "");
  const otherSymbol = raw && !filtered.some((f) => f.symbol.replace(".BK", "") === raw) ? (market === "TH" ? `${raw.replace(/\.BK$/, "")}.BK` : raw) : null;

  return (
    <div>
      <label htmlFor="search" className="label">
        ค้นหาด้วยชื่อย่อ
      </label>
      <input
        id="search"
        className="input"
        inputMode="search"
        autoComplete="off"
        placeholder={market === "TH" ? "เช่น PTT, KBANK" : "เช่น AAPL, MSFT"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {otherSymbol && (
        <Link href={`/stock/${encodeURIComponent(otherSymbol)}`} className="btn-secondary mt-2 w-full">
          เปิดหุ้น {otherSymbol.replace(".BK", "")} (ไม่อยู่ในรายการตั้งต้น)
        </Link>
      )}
      <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-700 dark:bg-slate-900 dark:ring-slate-700">
        {filtered.length === 0 && <li className="p-4 muted">ไม่พบหุ้นที่ค้นหา ลองพิมพ์ชื่อย่อให้ครบ แล้วกดปุ่ม &quot;เปิดหุ้น&quot; ด้านบน</li>}
        {filtered.map((s) => {
          const qt = quotes[s.symbol];
          const chg = qt?.prevClose ? qt.price / qt.prevClose - 1 : null;
          const d = chg === null ? "flat" : direction(chg);
          return (
            <li key={s.symbol}>
              <Link href={`/stock/${encodeURIComponent(s.symbol)}`} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                <div className="min-w-0">
                  <div className="font-bold">{s.symbol.replace(".BK", "")}</div>
                  <div className="muted truncate text-[0.85rem]">
                    {s.name} · {s.sector}
                  </div>
                </div>
                {qt && (
                  <div className="shrink-0 text-right">
                    <div className="font-semibold">{fmtPrice(qt.price)}</div>
                    {chg !== null && (
                      <div className={`text-[0.85rem] font-semibold ${d === "up" ? "up" : d === "down" ? "down" : "muted"}`}>
                        <span aria-hidden>{d === "up" ? "▲" : d === "down" ? "▼" : "■"} </span>
                        {fmtPct(chg)}
                      </div>
                    )}
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
