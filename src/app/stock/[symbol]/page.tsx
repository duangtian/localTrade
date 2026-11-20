import Link from "next/link";
import { DateTime } from "luxon";
import { PriceChart } from "@/components/PriceChart";
import { Term } from "@/components/Term";
import { Change, Disclaimer, EmptyState, More, Stat } from "@/components/ui";
import { findSeed, sectorOf } from "@/config/seeds";
import { getDb } from "@/lib/db/client";
import { fmtMoney, fmtPct, fmtPrice, fmtQty, fmtUpdated } from "@/lib/format";
import { getFundamentals } from "@/lib/fundamentals";
import { loadState, tradable } from "@/lib/game/core";
import { getBaseProvider } from "@/lib/prices";
import { marketOf } from "@/lib/rules/hours";
import { priceBand } from "@/lib/rules/tick";
import { loadGame } from "@/lib/server";

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  const l = await loadGame({ sync: false });
  if (!l.game) {
    return (
      <EmptyState title="ยังไม่ได้เริ่มเกม">
        <Link href="/" className="btn-primary mt-2">
          ไปเลือกเงินเริ่มต้น
        </Link>
      </EmptyState>
    );
  }
  const market = marketOf(symbol);
  const cur = market === "TH" ? "THB" : "USD";
  const seed = findSeed(symbol);
  if (l.ctx.mode === "backtest") {
    // เก็บราคาย้อนหลังลง cache (ข้อมูลที่แสดงยังถูกกรองถึงวันจำลอง)
    await getBaseProvider().ensureDaily(symbol, DateTime.fromISO(l.ctx.today).minus({ days: 400 }).toISODate()!, DateTime.now().toISODate()!);
  }

  let quote;
  try {
    quote = await l.ctx.provider.getQuote(symbol);
  } catch (e) {
    return (
      <EmptyState title={`ไม่พบราคาของ ${symbol.replace(".BK", "")}`}>
        <p>{l.ctx.mode === "backtest" ? "หุ้นตัวนี้อาจยังไม่เข้าตลาด ณ วันจำลอง" : (e as Error).message}</p>
        <Link href="/market" className="btn-primary mt-3">
          กลับไปหน้าตลาด
        </Link>
      </EmptyState>
    );
  }
  const fund = l.ctx.mode === "live" ? await getFundamentals(getDb(), symbol) : null;
  const pos = loadState(getDb(), l.pid).positions.find((p) => p.symbol === symbol);
  const t = await tradable(l.ctx, symbol);
  const chg = quote.prevClose ? quote.price - quote.prevClose : 0;
  const band = market === "TH" && quote.prevClose ? priceBand(quote.prevClose) : null;
  const fx = market === "US" ? (await l.ctx.provider.getFxRate().catch(() => null))?.rate : null;

  return (
    <>
      <Link href="/market" className="muted mb-2 inline-flex min-h-[44px] items-center">
        ← ตลาด
      </Link>
      <section className="card">
        <h1 className="text-2xl font-bold">{symbol.replace(".BK", "")}</h1>
        <p className="muted">
          {seed?.name ?? quote.name ?? symbol} · {seed?.sector ?? fund?.sector ?? sectorOf(symbol)}
        </p>
        <p className="big-num mt-2">{fmtMoney(quote.price, cur)}</p>
        {fx && <p className="muted">≈ {fmtMoney(quote.price * fx)} ต่อหุ้น</p>}
        <p>
          <Change value={chg} pct={quote.prevClose ? chg / quote.prevClose : 0} currency={cur} /> <span className="muted text-[0.85rem]">จากราคาปิดวันก่อน</span>
        </p>
        <p className="muted text-[0.8rem]">{fmtUpdated(quote.fetchedAt)}</p>
        <div className="mt-3">
          <PriceChart symbol={symbol} defaultRange={l.ctx.mode === "backtest" ? "1M" : "1D"} backtest={l.ctx.mode === "backtest"} />
        </div>
      </section>

      {pos && (
        <section className="card mt-3">
          <h2 className="font-bold">คุณถืออยู่</h2>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <Stat label="จำนวน">{fmtQty(pos.qty)} หุ้น</Stat>
            <Stat label="ต้นทุนเฉลี่ย" term="avgCost">
              {fmtMoney(pos.avgCost, cur)}
            </Stat>
            <Stat label="กำไรที่ยังไม่เกิด" term="unrealized">
              <Change pct={quote.price / pos.avgCost - 1} />
            </Stat>
          </div>
        </section>
      )}

      <section className="card mt-3">
        <p className={t.ok ? "up font-semibold" : "muted"}>
          {t.ok ? "✅ " : "⏸️ "}
          {t.reason}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href={`/trade/${encodeURIComponent(symbol)}?side=buy`} className="btn-buy">
            ซื้อ
          </Link>
          {pos ? (
            <Link href={`/trade/${encodeURIComponent(symbol)}?side=sell`} className="btn-sell-outline">
              ขาย
            </Link>
          ) : (
            <span className="btn muted text-[0.85rem]">ยังไม่มีหุ้นให้ขาย</span>
          )}
        </div>
      </section>

      <section className="card mt-3">
        <h2 className="font-bold">ข้อมูลพื้นฐาน</h2>
        {l.ctx.mode === "backtest" ? (
          <p className="muted">โหมดย้อนอดีตไม่แสดง P/E และปันผล เพราะข้อมูลที่มีเป็นของปัจจุบัน (คือข้อมูลอนาคตของวันจำลอง)</p>
        ) : (
          <div className="mt-1 grid grid-cols-2 gap-3">
            <Stat label="P/E" term="pe">
              {fund?.pe ?? quote.pe ? fmtPrice((fund?.pe ?? quote.pe)!) : "ไม่มีข้อมูล"}
            </Stat>
            <Stat label="อัตราปันผล" term="dividendYield">
              {fund?.dividendYield ?? quote.dividendYield ? fmtPct((fund?.dividendYield ?? quote.dividendYield)!).replace("+", "") : "ไม่มีข้อมูล"}
            </Stat>
          </div>
        )}
        <More>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="ราคาปิดวันก่อน">{quote.prevClose ? fmtMoney(quote.prevClose, cur) : "–"}</Stat>
            <Stat label="ตลาด">{market === "TH" ? "SET (ไทย)" : "สหรัฐฯ"}</Stat>
            {band && (
              <>
                <Stat label="Ceiling" term="ceilingFloor">
                  {fmtMoney(band.ceiling)}
                </Stat>
                <Stat label="Floor">{fmtMoney(band.floor)}</Stat>
              </>
            )}
            <Stat label={market === "TH" ? "หน่วยซื้อขาย" : "ซื้อแบบ"} term={market === "TH" ? "boardLot" : "fractional"}>
              {market === "TH" ? "ทีละ 100 หุ้น" : "เศษหุ้นได้"}
            </Stat>
          </div>
        </More>
      </section>
      <Disclaimer />
    </>
  );
}
