import Link from "next/link";
import { MarketList } from "@/components/MarketList";
import { Disclaimer, PageTitle } from "@/components/ui";
import { SET50, US_POPULAR } from "@/config/seeds";
import { fmtUpdated } from "@/lib/format";
import { loadGame } from "@/lib/server";

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "th" } = await searchParams;
  const l = await loadGame({ sync: false });
  const list = tab === "us" ? US_POPULAR : SET50;
  let quotes: Record<string, { price: number; prevClose: number | null }> = {};
  let updated: string | null = null;
  if (l.ctx && l.ctx.mode === "live") {
    try {
      const q = await l.ctx.provider.getQuotes(list.map((s) => s.symbol));
      quotes = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, { price: v.price, prevClose: v.prevClose }]));
      updated =
        Object.values(q)
          .map((x) => x.fetchedAt)
          .sort()[0] ?? null;
    } catch {
      /* แสดงรายการโดยไม่มีราคา */
    }
  }
  const tabs = [
    { id: "th", label: "หุ้นไทย SET50" },
    { id: "us", label: "หุ้นสหรัฐฯ" },
  ];
  return (
    <>
      <PageTitle sub={l.game?.mode === "backtest" ? "โหมดย้อนอดีต: ดูราคาในหน้าหุ้นแต่ละตัว" : fmtUpdated(updated)}>ตลาด</PageTitle>
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
      <MarketList items={list} quotes={quotes} market={tab === "us" ? "US" : "TH"} />
      <Disclaimer />
    </>
  );
}
