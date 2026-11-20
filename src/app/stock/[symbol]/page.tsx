import Link from "next/link";
import { DateTime } from "luxon";
import { IconChevronLeft } from "@/components/icons";
import { PriceChart } from "@/components/PriceChart";
import { ChangePill, StockBadge } from "@/components/StockBadge";
import { Term } from "@/components/Term";
import { Change, Disclaimer, EmptyState, More } from "@/components/ui";
import { findSeed, sectorOf } from "@/config/seeds";
import { getDb } from "@/lib/db/client";
import { fmtDate, fmtMoney, fmtPct, fmtPrice, fmtQty, fmtSignedMoney, fmtUpdated } from "@/lib/format";
import { getFundamentals } from "@/lib/fundamentals";
import { loadState, orderHistory, tradable } from "@/lib/game/core";
import type { GlossaryKey } from "@/lib/glossary";
import { getBaseProvider } from "@/lib/prices";
import type { Bar } from "@/lib/prices/types";
import { marketOf } from "@/lib/rules/hours";
import { priceBand } from "@/lib/rules/tick";
import { loadGame } from "@/lib/server";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

function closeOnOrBefore(bars: Bar[], date: string): number | null {
  for (let i = bars.length - 1; i >= 0; i--) if (bars[i].date.slice(0, 10) <= date) return bars[i].close;
  return null;
}

function Row({ label, term, children }: { label: string; term?: GlossaryKey; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="muted text-[0.9rem]">
        {label} {term && <Term k={term} />}
      </dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}

/** แถบช่วงราคา ต่ำสุด–สูงสุด พร้อมจุดราคาปัจจุบัน */
function RangeBar({ label, term, low, high, value, cur }: { label: string; term: GlossaryKey; low: number; high: number; value: number; cur: "THB" | "USD" }) {
  const pos = high > low ? Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)) : 50;
  const where = pos >= 80 ? "ใกล้จุดสูงสุด" : pos <= 20 ? "ใกล้จุดต่ำสุด" : "อยู่กลางช่วง";
  return (
    <div className="py-2">
      <div className="flex items-center justify-between">
        <span className="muted text-[0.9rem]">
          {label} <Term k={term} />
        </span>
        <span className="text-[0.85rem] font-semibold">{where}</span>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-red-300 via-slate-300 to-green-300 dark:from-red-800 dark:via-slate-600 dark:to-green-800" role="img" aria-label={`${label} ${fmtPrice(low)} ถึง ${fmtPrice(high)} ราคาปัจจุบัน ${fmtPrice(value)}`}>
        <span className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-blue-700 shadow dark:border-slate-900 dark:bg-blue-400" style={{ left: `${pos}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[0.85rem]">
        <span>
          <span className="muted">ต่ำ </span>
          {fmtMoney(low, cur)}
        </span>
        <span>
          <span className="muted">สูง </span>
          {fmtMoney(high, cur)}
        </span>
      </div>
    </div>
  );
}

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
  const today = l.ctx.today;
  if (l.ctx.mode === "backtest") {
    // เก็บราคาย้อนหลังลง cache (ข้อมูลที่แสดงยังถูกกรองถึงวันจำลอง)
    await getBaseProvider().ensureDaily(symbol, DateTime.fromISO(today).minus({ days: 400 }).toISODate()!, DateTime.now().toISODate()!);
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

  // ประวัติราคา 1 ปี (โหมดย้อนอดีตถูกตัดถึงวันจำลองโดย provider)
  const yearAgo = DateTime.fromISO(today).minus({ years: 1 });
  const [bars, fund, fx, t] = await Promise.all([
    l.ctx.provider.getHistory(symbol, yearAgo.minus({ days: 7 }).toISODate()!, today, "1d").catch(() => [] as Bar[]),
    l.ctx.mode === "live" ? getFundamentals(getDb(), symbol) : Promise.resolve(null),
    market === "US" ? l.ctx.provider.getFxRate().then((r) => r.rate).catch(() => null) : Promise.resolve(null),
    tradable(l.ctx, symbol),
  ]);

  const pos = loadState(getDb(), l.pid).positions.find((p) => p.symbol === symbol);
  const myOrders = orderHistory(getDb(), l.pid, 300).filter((o) => o.symbol === symbol);
  const chg = quote.prevClose ? quote.price - quote.prevClose : 0;
  const chgPct = quote.prevClose ? chg / quote.prevClose : null;
  const band = market === "TH" && quote.prevClose ? priceBand(quote.prevClose) : null;
  const name = seed?.name ?? fund?.name ?? quote.name ?? symbol;
  const sector = seed?.sector ?? fund?.sector ?? sectorOf(symbol);

  const lastBar = bars.at(-1);
  const yearBars = bars.filter((b) => b.date.slice(0, 10) >= yearAgo.toISODate()!);
  const lo52 = yearBars.length ? Math.min(quote.price, ...yearBars.map((b) => b.low)) : null;
  const hi52 = yearBars.length ? Math.max(quote.price, ...yearBars.map((b) => b.high)) : null;
  const recent = bars.slice(-60);
  const avgVol = recent.length ? recent.reduce((s, b) => s + b.volume, 0) / recent.length : null;
  const returns = (
    [
      ["1 สัปดาห์", { weeks: 1 }],
      ["1 เดือน", { months: 1 }],
      ["3 เดือน", { months: 3 }],
      ["6 เดือน", { months: 6 }],
      ["1 ปี", { years: 1 }],
    ] as const
  ).map(([label, d]) => {
    const base = closeOnOrBefore(bars, DateTime.fromISO(today).minus(d).toISODate()!);
    return { label, r: base ? quote.price / base - 1 : null };
  });

  const posValue = pos ? pos.qty * quote.price : 0;
  const posPnl = pos ? posValue - pos.qty * pos.avgCost : 0;

  return (
    <>
      <Link href="/market" className="muted -ml-2 mb-1 inline-flex min-h-[44px] items-center gap-1 px-2">
        <IconChevronLeft /> ตลาด
      </Link>

      {/* หัวข้อ + ราคา */}
      <section className="card">
        <div className="flex items-center gap-3">
          <StockBadge symbol={symbol} sector={sector} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{symbol.replace(".BK", "")}</h1>
            <p className="muted truncate">{name}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="chip bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">{sector}</span>
          <span className="chip bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">{market === "TH" ? "SET ไทย" : "ตลาดสหรัฐฯ"}</span>
          {pos && <span className="chip bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200">คุณถืออยู่</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
          <p className="big-num">{fmtMoney(quote.price, cur)}</p>
          <ChangePill pct={chgPct} className="mb-1.5" />
        </div>
        <p className="text-[0.9rem]">
          <Change value={chg} currency={cur} /> <span className="muted">จากราคาปิดวันก่อน</span>
        </p>
        {fx && <p className="muted text-[0.9rem]">≈ {fmtMoney(quote.price * fx)} ต่อหุ้น (1 USD = ฿{fx.toFixed(2)})</p>}
        <p className="muted text-[0.8rem]">{fmtUpdated(quote.fetchedAt)}</p>
        <div className="mt-3">
          <PriceChart symbol={symbol} defaultRange={l.ctx.mode === "backtest" ? "3M" : "1D"} backtest={l.ctx.mode === "backtest"} />
        </div>
      </section>

      {/* สถานะของฉัน */}
      {pos && (
        <section className="card mt-3 ring-2 ring-blue-200 dark:ring-blue-900">
          <h2 className="font-bold">หุ้นนี้ในพอร์ตของคุณ</h2>
          <dl className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
            <Row label="จำนวน">{fmtQty(pos.qty)} หุ้น</Row>
            <Row label="ต้นทุนเฉลี่ย" term="avgCost">
              {fmtMoney(pos.avgCost, cur)}
            </Row>
            <Row label="มูลค่าตอนนี้" term="marketValue">
              {fmtMoney(posValue, cur)}
            </Row>
            <Row label="กำไร/ขาดทุน" term="unrealized">
              <Change value={posPnl} pct={pos.avgCost ? quote.price / pos.avgCost - 1 : 0} currency={cur} />
            </Row>
            <Row label="ถือตั้งแต่">{fmtDate(pos.openedAt)}</Row>
          </dl>
        </section>
      )}

      {/* ช่วงราคา */}
      {lastBar && (
        <section className="card mt-3">
          <h2 className="font-bold">ช่วงราคา</h2>
          <RangeBar label="วันล่าสุด" term="dayRange" low={Math.min(lastBar.low, quote.price)} high={Math.max(lastBar.high, quote.price)} value={quote.price} cur={cur} />
          {lo52 !== null && hi52 !== null && <RangeBar label="รอบ 1 ปี" term="range52w" low={lo52} high={hi52} value={quote.price} cur={cur} />}
        </section>
      )}

      {/* ผลตอบแทนย้อนหลัง */}
      {bars.length > 5 && (
        <section className="card mt-3">
          <h2 className="font-bold">
            ผลตอบแทนย้อนหลัง <Term k="pastReturn" />
          </h2>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {returns.map((x) => (
              <div key={x.label} className="rounded-xl bg-slate-50 p-2 text-center dark:bg-slate-800">
                <div className="muted text-[0.8rem]">{x.label}</div>
                {x.r === null ? <div className="muted font-semibold">–</div> : <Change pct={x.r} className="text-[0.95rem]" />}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ตัวเลขสำคัญ */}
      <section className="card mt-3">
        <h2 className="font-bold">ตัวเลขสำคัญ</h2>
        <dl className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
          <Row label="ราคาปิดวันก่อน">{quote.prevClose ? fmtMoney(quote.prevClose, cur) : "–"}</Row>
          {lastBar && <Row label={`ราคาเปิด (${fmtDate(lastBar.date)})`}>{fmtMoney(lastBar.open, cur)}</Row>}
          {lastBar && lastBar.volume > 0 && (
            <Row label="ปริมาณซื้อขาย" term="volume">
              {compact.format(lastBar.volume)} หุ้น
            </Row>
          )}
          {avgVol ? <Row label="เฉลี่ย 3 เดือน">{compact.format(avgVol)} หุ้น/วัน</Row> : null}
          {l.ctx.mode === "live" && (
            <>
              <Row label="P/E" term="pe">
                {(fund?.pe ?? quote.pe) ? fmtPrice((fund?.pe ?? quote.pe)!) : "ไม่มีข้อมูล"}
              </Row>
              <Row label="อัตราปันผล" term="dividendYield">
                {(fund?.dividendYield ?? quote.dividendYield) ? fmtPct((fund?.dividendYield ?? quote.dividendYield)!).replace("+", "") : "ไม่มีข้อมูล"}
              </Row>
              {fund?.marketCap ? (
                <Row label="มูลค่าบริษัท" term="marketCap">
                  {cur === "THB" ? "฿" : "$"}
                  {compact.format(fund.marketCap)}
                </Row>
              ) : null}
              {fund?.eps ? (
                <Row label="EPS" term="eps">
                  {fmtMoney(fund.eps, cur)}
                </Row>
              ) : null}
              {fund?.priceToBook ? (
                <Row label="P/BV" term="pbv">
                  {fund.priceToBook.toFixed(2)} เท่า
                </Row>
              ) : null}
              {fund?.beta ? (
                <Row label="Beta" term="beta">
                  {fund.beta.toFixed(2)}
                </Row>
              ) : null}
            </>
          )}
        </dl>
        {l.ctx.mode === "backtest" && (
          <p className="muted mt-2 text-[0.85rem]">โหมดย้อนอดีตไม่แสดง P/E ปันผล และมูลค่าบริษัท เพราะข้อมูลที่มีเป็นของปัจจุบัน (คือข้อมูลอนาคตของวันจำลอง)</p>
        )}
        <More summary="กติกาการซื้อขายหุ้นนี้">
          <dl className="divide-y divide-slate-100 dark:divide-slate-800">
            <Row label={market === "TH" ? "หน่วยซื้อขาย" : "ซื้อแบบ"} term={market === "TH" ? "boardLot" : "fractional"}>
              {market === "TH" ? "ทีละ 100 หุ้น" : "เศษหุ้นได้"}
            </Row>
            {band && (
              <>
                <Row label="Ceiling" term="ceilingFloor">
                  {fmtMoney(band.ceiling)}
                </Row>
                <Row label="Floor">{fmtMoney(band.floor)}</Row>
              </>
            )}
            {market === "TH" && (
              <Row label="เงินขั้นต่ำ 1 lot">
                ≈ {fmtMoney(quote.price * 100)}
              </Row>
            )}
          </dl>
        </More>
      </section>

      {/* เกี่ยวกับบริษัท */}
      {l.ctx.mode === "live" && fund && (fund.summary || fund.industry || fund.employees || fund.website) && (
        <section className="card mt-3">
          <h2 className="font-bold">เกี่ยวกับบริษัท</h2>
          <dl className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
            {fund.industry && <Row label="อุตสาหกรรม">{fund.industry}</Row>}
            {fund.employees ? <Row label="พนักงาน">{fmtQty(fund.employees)} คน</Row> : null}
            {fund.website && (
              <Row label="เว็บไซต์">
                <a href={fund.website} target="_blank" rel="noopener noreferrer" className="break-all text-blue-700 underline dark:text-blue-300">
                  {fund.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
              </Row>
            )}
          </dl>
          {fund.summary && (
            <More summary="อ่านคำอธิบายธุรกิจ (ภาษาอังกฤษ)">
              <p lang="en" className="text-[0.9rem] leading-relaxed">
                {fund.summary}
              </p>
            </More>
          )}
        </section>
      )}

      {/* ประวัติคำสั่งของหุ้นนี้ */}
      {myOrders.length > 0 && (
        <section className="card mt-3">
          <h2 className="font-bold">คำสั่งของคุณในหุ้นนี้</h2>
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {myOrders.slice(0, 5).map((o) => (
              <li key={o.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={`chip ${o.side === "buy" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200"}`}>
                    {o.side === "buy" ? "ซื้อ" : "ขาย"}
                  </span>
                  <span className="muted text-[0.85rem]">
                    {fmtDate(o.createdAt)} ·{" "}
                    {{ pending: "รอราคา", filled: "สำเร็จ", cancelled: "ยกเลิก", rejected: "ไม่สำเร็จ" }[o.status]}
                  </span>
                </div>
                <p className="mt-1 text-[0.9rem]">
                  {o.fillQty ? `${fmtQty(o.fillQty)} หุ้น @ ${fmtMoney(o.fillPrice ?? 0, cur)}` : o.qty ? `${fmtQty(o.qty)} หุ้น` : `$${o.amountUsd}`}
                  {o.realizedPnlThb ? <span className="ml-2">{fmtSignedMoney(o.realizedPnlThb)}</span> : null}
                </p>
                <p className="muted line-clamp-2 text-[0.85rem]">“{o.reason}”</p>
              </li>
            ))}
          </ul>
          {myOrders.length > 5 && (
            <Link href="/portfolio" className="btn-secondary mt-2 w-full">
              ดูทั้งหมดในหน้าพอร์ต
            </Link>
          )}
        </section>
      )}

      <Disclaimer />

      {/* ปุ่มซื้อขาย ติดล่างจอเหนือเมนู */}
      <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 -mx-4 mt-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <p className={`mb-2 text-[0.85rem] ${t.ok ? "up font-semibold" : "muted"}`}>
          <span aria-hidden>{t.ok ? "● " : "⏸ "}</span>
          {t.reason}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/trade/${encodeURIComponent(symbol)}?side=buy`} className="btn-buy">
            ซื้อ
          </Link>
          {pos ? (
            <Link href={`/trade/${encodeURIComponent(symbol)}?side=sell`} className="btn-sell-outline">
              ขาย
            </Link>
          ) : (
            <span className="btn bg-slate-100 text-[0.85rem] text-slate-600 dark:bg-slate-800 dark:text-slate-300">ยังไม่มีหุ้นให้ขาย</span>
          )}
        </div>
      </div>
    </>
  );
}
