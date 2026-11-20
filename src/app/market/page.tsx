import Link from "next/link";
import { MarketList } from "@/components/MarketList";
import { IconChevronRight, IconSpark } from "@/components/icons";
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
      <Link href="/picks" className="row-link mb-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-subtle text-accent-text">
          <IconSpark />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">หุ้นน่าสนใจ</span>
          <span className="muted block text-[0.85rem]">Bot คัดจากแนวโน้มกราฟและสถิติ พร้อมข่าวล่าสุด</span>
        </span>
        <IconChevronRight className="h-5 w-5 text-ink-muted" />
      </Link>
      <nav aria-label="เลือกตลาด" className="seg mb-3 grid-cols-2 lg:max-w-md">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/market?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={tab === t.id ? "seg-item-active" : "seg-item"}
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
            className={idx === c.id ? "fchip-active" : "fchip"}
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
            <Link href="/settings#indexes" className="text-accent-text underline">
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
