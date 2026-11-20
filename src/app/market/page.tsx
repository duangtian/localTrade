import Link from "next/link";
import { MarketList } from "@/components/MarketList";
import { Disclaimer, EmptyState, PageTitle } from "@/components/ui";
import { INDEXES, type IndexId } from "@/config/indices";
import { getDb } from "@/lib/db/client";
import { fmtUpdated } from "@/lib/format";
import { getIndexStocks } from "@/lib/indices";
import { loadGame } from "@/lib/server";

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ tab?: string; idx?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "us" ? "us" : "th";
  const market = tab === "us" ? "US" : "TH";
  const choices = INDEXES.filter((i) => i.market === market);
  const idx = (choices.find((i) => i.id === sp.idx) ?? choices[0]).id as IndexId;

  const l = await loadGame({ sync: false });
  const info = getIndexStocks(getDb(), idx);
  const list = info.stocks;

  let quotes: Record<string, { price: number; prevClose: number | null; name?: string }> = {};
  let updated: string | null = null;
  if (l.ctx && l.ctx.mode === "live" && list.length > 0) {
    try {
      const q = await l.ctx.provider.getQuotes(list.map((s) => s.symbol));
      quotes = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, { price: v.price, prevClose: v.prevClose, name: v.name }]));
      updated =
        Object.values(q)
          .map((x) => x.fetchedAt)
          .sort()[0] ?? null;
    } catch {
      /* แสดงรายการโดยไม่มีราคา */
    }
  }

  const tabs = [
    { id: "th", label: "หุ้นไทย" },
    { id: "us", label: "หุ้นสหรัฐฯ" },
  ];
  const sub = l.game?.mode === "backtest" ? "โหมดย้อนอดีต: ดูราคาในหน้าหุ้นแต่ละตัว" : list.length > 0 ? fmtUpdated(updated) : undefined;

  return (
    <>
      <PageTitle sub={sub}>ตลาด</PageTitle>
      <nav aria-label="เลือกตลาด" className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-slate-200 p-1 dark:bg-slate-800 lg:max-w-md">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/market?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={`btn rounded-xl ${tab === t.id ? "bg-white text-blue-800 shadow dark:bg-slate-950 dark:text-blue-300" : "text-slate-700 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-900"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <nav aria-label="เลือกดัชนี" className="mb-2 flex flex-wrap gap-2">
        {choices.map((c) => (
          <Link
            key={c.id}
            href={`/market?tab=${tab}&idx=${c.id}`}
            aria-current={idx === c.id ? "page" : undefined}
            className={`inline-flex min-h-[44px] items-center rounded-xl px-4 font-bold ring-2 transition ${
              idx === c.id
                ? "bg-blue-700 text-white ring-blue-700 dark:bg-blue-400 dark:text-slate-950 dark:ring-blue-400"
                : "bg-white text-slate-800 ring-slate-200 hover:ring-blue-400 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700"
            }`}
          >
            {c.label}
          </Link>
        ))}
      </nav>
      <p className="muted mb-3 text-[0.8rem]">
        รายชื่อ {info.def.label}: {info.source}
        {info.asOf ? ` · ข้อมูล ณ ${info.asOf}` : ""}
        {info.def.editable && (
          <>
            {" · "}
            <Link href="/settings#indexes" className="text-blue-700 underline dark:text-blue-300">
              อัปเดตรายชื่อ
            </Link>
          </>
        )}
      </p>

      {list.length === 0 ? (
        <EmptyState title={`ยังไม่มีรายชื่อหุ้น ${info.def.label}`}>
          <p>เว็บ SET ไม่เปิดให้แอปดึงรายชื่ออัตโนมัติ คัดลอกชื่อย่อจากหน้า {info.def.label} บนเว็บ SET แล้ววางในหน้าตั้งค่าครั้งเดียว</p>
          <Link href="/settings#indexes" className="btn-primary mt-3">
            ไปวางรายชื่อ
          </Link>
        </EmptyState>
      ) : (
        <MarketList key={idx} items={list} quotes={quotes} market={market} />
      )}
      <Disclaimer />
    </>
  );
}
