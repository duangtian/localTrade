"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { SeedStock } from "@/config/seeds";
import { fmtPrice } from "@/lib/format";
import { IconChevronRight, IconSearch } from "./icons";
import { ChangePill, StockBadge } from "./StockBadge";

type Sort = "name" | "gain" | "loss";

export function MarketList({
  items,
  quotes,
  market,
}: {
  items: SeedStock[];
  quotes: Record<string, { price: number; prevClose: number | null; name?: string }>;
  market: "TH" | "US";
}) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("name");
  const PAGE = 60;
  const [limit, setLimit] = useState(PAGE);
  const hasQuotes = Object.keys(quotes).length > 0;

  const chgOf = (sym: string) => {
    const qt = quotes[sym];
    return qt?.prevClose ? qt.price / qt.prevClose - 1 : null;
  };

  const sectors = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.sector, (m.get(i.sector) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [items]);

  const breadth = useMemo(() => {
    let up = 0,
      down = 0;
    for (const i of items) {
      const c = chgOf(i.symbol);
      if (c === null) continue;
      if (c > 0.00004) up++;
      else if (c < -0.00004) down++;
    }
    return { up, down, flat: Object.keys(quotes).length - up - down };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, quotes]);

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    let list = items.filter(
      (i) => (!sector || i.sector === sector) && (!s || i.symbol.toUpperCase().includes(s) || i.name.toUpperCase().includes(s) || i.sector.includes(q.trim())),
    );
    if (s && sort === "name") {
      // ชื่อย่อที่ขึ้นต้นด้วยคำค้นมาก่อน
      const rank = (x: SeedStock) => (x.symbol.replace(".BK", "") === s ? 0 : x.symbol.startsWith(s) ? 1 : 2);
      list = [...list].sort((a, b) => rank(a) - rank(b));
    }
    if (sort !== "name") {
      list = [...list].sort((a, b) => {
        const ca = chgOf(a.symbol) ?? (sort === "gain" ? -Infinity : Infinity);
        const cb = chgOf(b.symbol) ?? (sort === "gain" ? -Infinity : Infinity);
        return sort === "gain" ? cb - ca : ca - cb;
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, items, sector, sort, quotes]);

  const raw = q
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-&]/g, "");
  const otherSymbol = raw && !filtered.some((f) => f.symbol.replace(".BK", "") === raw) ? (market === "TH" ? `${raw.replace(/\.BK$/, "")}.BK` : raw) : null;

  const chip = (active: boolean) =>
    `inline-flex min-h-[44px] shrink-0 items-center rounded-full px-4 text-[0.9rem] font-semibold transition ${
      active
        ? "bg-blue-700 text-white dark:bg-blue-400 dark:text-slate-950"
        : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
    }`;

  return (
    <div>
      {hasQuotes && (
        <div className="mb-3 grid grid-cols-3 gap-2 text-center" aria-label="ภาพรวมตลาดวันนี้">
          <div className="rounded-xl bg-green-50 py-2 dark:bg-green-950">
            <div className="up text-xl font-bold">▲ {breadth.up}</div>
            <div className="muted text-[0.8rem]">ตัวที่ขึ้น</div>
          </div>
          <div className="rounded-xl bg-red-50 py-2 dark:bg-red-950">
            <div className="down text-xl font-bold">▼ {breadth.down}</div>
            <div className="muted text-[0.8rem]">ตัวที่ลง</div>
          </div>
          <div className="rounded-xl bg-slate-100 py-2 dark:bg-slate-800">
            <div className="text-xl font-bold">■ {breadth.flat}</div>
            <div className="muted text-[0.8rem]">ไม่เปลี่ยน</div>
          </div>
        </div>
      )}

      <label htmlFor="search" className="sr-only">
        ค้นหาด้วยชื่อย่อหรือชื่อบริษัท
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
          <IconSearch />
        </span>
        <input
          id="search"
          className="input min-h-[52px] rounded-2xl pl-10"
          inputMode="search"
          autoComplete="off"
          placeholder={market === "TH" ? "ค้นหา เช่น PTT, ธนาคาร" : "ค้นหา เช่น AAPL, Apple"}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
        />
      </div>
      {otherSymbol && (
        <Link href={`/stock/${encodeURIComponent(otherSymbol)}`} className="btn-secondary mt-2 w-full">
          เปิดหุ้น {otherSymbol.replace(".BK", "")} (ไม่อยู่ในรายการตั้งต้น)
        </Link>
      )}

      <div
        role="group"
        aria-label="กรองตามกลุ่มอุตสาหกรรม"
        className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
      >
        <button type="button" aria-pressed={!sector} onClick={() => setSector(null)} className={chip(!sector)}>
          ทั้งหมด
        </button>
        {sectors.map((s) => (
          <button key={s} type="button" aria-pressed={sector === s} onClick={() => setSector(sector === s ? null : s)} className={chip(sector === s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="muted text-[0.85rem]">{filtered.length} ตัว · แตะเพื่อดูรายละเอียด</p>
        {hasQuotes && (
          <label className="flex items-center gap-1 text-[0.85rem]">
            <span className="muted">เรียง</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-2 font-semibold dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="name">ชื่อ A–Z</option>
              <option value="gain">ขึ้นมากสุด</option>
              <option value="loss">ลงมากสุด</option>
            </select>
          </label>
        )}
      </div>

      <ul className="mt-2 space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 xl:grid-cols-3">
        {filtered.length === 0 && <li className="card muted md:col-span-full">ไม่พบหุ้นที่ค้นหา ลองพิมพ์ชื่อย่อให้ครบ แล้วกดปุ่ม &quot;เปิดหุ้น&quot; ด้านบน</li>}
        {filtered.slice(0, limit).map((s) => {
          const qt = quotes[s.symbol];
          const chg = chgOf(s.symbol);
          return (
            <li key={s.symbol}>
              <Link
                href={`/stock/${encodeURIComponent(s.symbol)}`}
                className="group flex min-h-[64px] items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-400 active:scale-[0.99] dark:bg-slate-900 dark:ring-slate-700 dark:hover:ring-blue-500"
              >
                <StockBadge symbol={s.symbol} sector={s.sector} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold leading-tight">{s.symbol.replace(".BK", "")}</div>
                  <div className="muted truncate text-[0.8rem]">{s.name === s.symbol.replace(".BK", "") ? (qt?.name ?? "") : s.name}</div>
                </div>
                <div className="shrink-0 text-right">
                  {qt ? (
                    <>
                      <div className="font-semibold leading-tight">{fmtPrice(qt.price)}</div>
                      <ChangePill pct={chg} className="mt-0.5" />
                    </>
                  ) : (
                    <span className="muted text-[0.85rem]">ดูราคา</span>
                  )}
                </div>
                <span className="text-slate-400 transition group-hover:translate-x-0.5 dark:text-slate-500">
                  <IconChevronRight />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {filtered.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + PAGE * 2)} className="btn-secondary mt-3 w-full">
          แสดงเพิ่ม (เหลืออีก {filtered.length - limit} ตัว)
        </button>
      )}
    </div>
  );
}
