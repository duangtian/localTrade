import Link from "next/link";
import { CountUp } from "@/components/CountUp";
import { DateTime } from "luxon";
import { cancelOrderAction } from "@/app/actions";
import { ExchangeForm } from "@/components/ExchangeForm";
import { PortfolioChart, type ChartRow } from "@/components/PortfolioChart";
import { Term } from "@/components/Term";
import { Change, Disclaimer, EmptyState, More, PageTitle, Stat } from "@/components/ui";
import { CONCENTRATION_WARN } from "@/config/app";
import { BENCHMARKS, findSeed, sectorOf } from "@/config/seeds";
import { getDb } from "@/lib/db/client";
import { fmtDate, fmtMoney, fmtPct, fmtQty, fmtUpdated } from "@/lib/format";
import { getSnapshots, orderHistory, pendingOrders, reservedFor, type GameCtx } from "@/lib/game/core";
import { returns } from "@/lib/game/flow";
import { loadGame } from "@/lib/server";

async function benchmarkRows(ctx: GameCtx, pid: number, bid: number, startCash: number): Promise<ChartRow[]> {
  const db = ctx.db;
  const you = getSnapshots(db, pid);
  const bot = new Map(getSnapshots(db, bid).map((s) => [s.date, s.valueThb]));
  const from = DateTime.fromISO(ctx.game.startDate).minus({ days: 10 }).toISODate()!;
  const series = async (sym: string) => {
    try {
      // provider ถูกจำกัดเวลาแล้วในโหมดย้อนอดีต
      return await ctx.provider.getHistory(sym, from, ctx.today, "1d");
    } catch {
      return [];
    }
  };
  const [setH, spH] = await Promise.all([series(BENCHMARKS.SET), series(BENCHMARKS.SP500)]);
  const pctAt = (bars: { date: string; close: number }[], date: string) => {
    const base = [...bars].reverse().find((b) => b.date <= ctx.game.startDate) ?? bars[0];
    const cur = [...bars].reverse().find((b) => b.date <= date);
    return base && cur ? +((cur.close / base.close - 1) * 100).toFixed(2) : undefined;
  };
  return you.map((s) => ({
    date: s.date.slice(5),
    you: +((s.valueThb / startCash - 1) * 100).toFixed(2),
    bot: bot.has(s.date) ? +((bot.get(s.date)! / startCash - 1) * 100).toFixed(2) : undefined,
    set: pctAt(setH, s.date),
    sp: pctAt(spH, s.date),
  }));
}

export default async function PortfolioPage() {
  const l = await loadGame();
  if (!l.game) {
    return (
      <EmptyState title="ยังไม่ได้เริ่มเกม">
        <Link href="/" className="btn-primary mt-2">
          เลือกเงินเริ่มต้น
        </Link>
      </EmptyState>
    );
  }
  const db = getDb();
  const r = await returns(l.ctx);
  const v = r.player.valuation;
  const history = orderHistory(db, l.pid, 200);
  const pending = pendingOrders(db, l.pid);
  const realized = history.reduce((s, o) => s + (o.status === "filled" ? (o.realizedPnlThb ?? 0) : 0), 0);
  const unrealized = v.holdings.reduce((s, h) => s + h.unrealizedThb, 0);
  const rows = await benchmarkRows(l.ctx, l.pid, l.bid, l.game.startingCash);
  const reserved = reservedFor(db, l.pid, l.ctx.fees);

  const sectors = new Map<string, number>();
  for (const h of v.holdings) sectors.set(sectorOf(h.symbol), (sectors.get(sectorOf(h.symbol)) ?? 0) + h.marketValueThb);
  const cash = v.cashThb + v.cashUsdThb;
  const concentrated = v.holdings.filter((h) => h.weight > CONCENTRATION_WARN);

  return (
    <>
      <PageTitle sub={fmtUpdated(r.player.updatedAt ?? (l.ctx.mode === "backtest" ? l.ctx.today : null))}>พอร์ต</PageTitle>
      <Link href="/plan" className="row-link mb-4">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">AI จัดพอร์ต</span>
          <span className="muted block text-[0.85rem]">ให้ AI เสนอแผนกระจายเงินสด และตรวจหุ้นที่ถืออยู่ คุณกดยืนยันเอง</span>
        </span>
        <span aria-hidden className="text-white/45">›</span>
      </Link>


      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="min-w-0">
          <section className="card">
            <div className="muted">มูลค่าพอร์ตรวม</div>
            <p className="big-num">
          <CountUp value={v.totalThb} />
        </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Stat label="กำไรที่ยังไม่เกิด" term="unrealized">
                <Change value={unrealized} />
              </Stat>
              <Stat label="กำไรที่เกิดขึ้นแล้ว" term="realized">
                <Change value={realized} />
              </Stat>
            </div>
          </section>

          {concentrated.map((h) => (
            <p key={h.symbol} role="alert" className="note-warn mt-3 text-[0.9rem] font-semibold">
              {h.symbol.replace(".BK", "")} เป็น {(h.weight * 100).toFixed(0)}% ของพอร์ต (เกิน 40%) ความเสี่ยงกระจุกตัว <Term k="diversification" />
            </p>
          ))}

          <h2 className="mb-2 mt-5 text-lg font-bold">หุ้นที่ถือ</h2>
          {v.holdings.length === 0 ? (
            <EmptyState title="ยังไม่มีหุ้น">
              <p>ลองค้นหาหุ้นตัวแรกที่หน้า ตลาด</p>
              <Link href="/market" className="btn-primary mt-3">
                ไปหน้าตลาด
              </Link>
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {v.holdings.map((h) => {
                const cur = h.market === "TH" ? "THB" : "USD";
                const lastBuy = history.find((o) => o.symbol === h.symbol && o.side === "buy" && o.status === "filled");
                const hitStop = lastBuy?.stopLoss && h.price <= lastBuy.stopLoss;
                const hitTarget = lastBuy?.targetPrice && h.price >= lastBuy.targetPrice;
                return (
                  <li key={h.symbol} className="card">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/stock/${encodeURIComponent(h.symbol)}`} className="min-h-[44px]">
                        <div className="text-lg font-bold underline-offset-2 hover:underline">{h.symbol.replace(".BK", "")}</div>
                        <div className="muted text-[0.85rem]">{findSeed(h.symbol)?.name ?? ""}</div>
                      </Link>
                      <div className="text-right">
                        <div className="font-bold">{fmtMoney(h.marketValueThb)}</div>
                        <Change value={h.unrealizedThb} pct={h.unrealizedPct} />
                      </div>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-[0.9rem]">
                      <Stat label="จำนวน">{fmtQty(h.qty)}</Stat>
                      <Stat label="ต้นทุนเฉลี่ย" term="avgCost">
                        {fmtMoney(h.avgCost, cur)}
                      </Stat>
                      <Stat label="ราคาล่าสุด">{fmtMoney(h.price, cur)}</Stat>
                    </dl>
                    {h.market === "US" && (
                      <div className="mt-2 rounded-lg bg-subtle p-2 text-[0.9rem]">
                        <div className="flex justify-between">
                          <span>
                            จากราคาหุ้น <Term k="priceEffect" />
                          </span>
                          <Change value={h.priceEffectThb} />
                        </div>
                        <div className="flex justify-between">
                          <span>
                            จากค่าเงิน USD/THB <Term k="fxEffect" />
                          </span>
                          <Change value={h.fxEffectThb} />
                        </div>
                      </div>
                    )}
                    {hitStop && <p className="down mt-2 font-semibold">ราคาต่ำกว่า stop-loss ที่ตั้งไว้ ({lastBuy!.stopLoss}) ทบทวนแผนของคุณ</p>}
                    {hitTarget && <p className="up mt-2 font-semibold">ราคาถึงเป้าหมายที่ตั้งไว้ ({lastBuy!.targetPrice}) แล้ว</p>}
                  </li>
                );
              })}
            </ul>
          )}

          {pending.length > 0 && (
            <>
              <h2 className="mb-2 mt-5 text-lg font-bold">
                คำสั่งที่ค้างอยู่ <Term k="pending" />
              </h2>
              <ul className="space-y-2">
                {pending.map((o) => (
                  <li key={o.id} className="card flex items-center justify-between gap-2">
                    <div>
                      <span className={o.side === "buy" ? "up font-bold" : "down font-bold"}>{o.side === "buy" ? "ซื้อ" : "ขาย"}</span>{" "}
                      {o.symbol.replace(".BK", "")} {o.amountUsd ? fmtMoney(o.amountUsd, "USD") : `${fmtQty(o.qty ?? 0)} หุ้น`} @ {o.limitPrice}
                      <div className="muted text-[0.85rem]">ตั้งเมื่อ {fmtDate(o.createdAt)}</div>
                    </div>
                    <form action={cancelOrderAction.bind(null, o.id)}>
                      <button className="btn-secondary" type="submit">
                        ยกเลิก
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="min-w-0">
          <section className="card mt-5 lg:mt-0">
            <h2 className="text-lg font-bold">
              ผลตอบแทนเทียบดัชนี (%) <Term k="benchmark" />
            </h2>
            <p className="muted mb-2 text-[0.85rem]">
              คุณ {fmtPct(r.playerReturn)} · Bot {fmtPct(r.botReturn)}
            </p>
            <PortfolioChart rows={rows} />
          </section>

          <section className="card mt-3">
            <h2 className="text-lg font-bold">
              สัดส่วนตามกลุ่มอุตสาหกรรม <Term k="sector" />
            </h2>
            <ul className="mt-2 space-y-2">
              {[...sectors.entries(), ["เงินสด", cash] as [string, number]]
                .sort((a, b) => b[1] - a[1])
                .map(([name, val]) => {
                  const w = v.totalThb > 0 ? val / v.totalThb : 0;
                  return (
                    <li key={name}>
                      <div className="flex justify-between text-[0.9rem]">
                        <span>{name}</span>
                        <span className="font-semibold">{(w * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-3 rounded-full bg-subtle" aria-hidden>
                        <div
                          className={`h-3 rounded-full ${name === "เงินสด" ? "bg-white/30" : "bg-accent"}`}
                          style={{ width: `${Math.max(1, w * 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>

          <section className="card mt-3">
            <h2 className="text-lg font-bold">กระเป๋าเงิน</h2>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <Stat label="บาท">{fmtMoney(v.cashThb)}</Stat>
              <Stat label="USD">
                {fmtMoney(v.cashUsd, "USD")} <span className="muted text-[0.85rem]">≈ {fmtMoney(v.cashUsdThb)}</span>
              </Stat>
            </div>
            {(reserved.thb > 0 || reserved.usd > 0) && (
              <p className="muted text-[0.85rem]">
                จองไว้ในคำสั่งค้าง: {fmtMoney(reserved.thb)} / {fmtMoney(reserved.usd, "USD")}
              </p>
            )}
            <More summary="แลกเงิน">
              <ExchangeForm
                fx={r.player.fx || (await l.ctx.provider.getFxRate().catch(() => ({ rate: 0 }))).rate}
                spread={l.ctx.fees.fx.spreadRate}
                cashThb={v.cashThb - reserved.thb}
                cashUsd={v.cashUsd - reserved.usd}
              />
            </More>
          </section>

          <h2 className="mb-2 mt-5 text-lg font-bold">
            ประวัติการซื้อขาย <Term k="journal" />
          </h2>
          {history.length === 0 ? (
            <EmptyState title="ยังไม่มีประวัติ">เมื่อซื้อขายแล้ว เหตุผลที่เขียนไว้จะอยู่ตรงนี้ให้ทบทวน</EmptyState>
          ) : (
            <ul className="space-y-2">
              {history.map((o) => (
                <li key={o.id} className="card text-[0.95rem]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span className={o.side === "buy" ? "up font-bold" : "down font-bold"}>{o.side === "buy" ? "ซื้อ" : "ขาย"}</span>{" "}
                      <b>{o.symbol.replace(".BK", "")}</b>{" "}
                      {o.fillQty
                        ? `${fmtQty(o.fillQty)} หุ้น @ ${o.fillPrice?.toFixed(2)}`
                        : o.amountUsd
                          ? fmtMoney(o.amountUsd, "USD")
                          : `${fmtQty(o.qty ?? 0)} หุ้น`}
                    </span>
                    <span className="muted text-[0.85rem]">
                      {fmtDate(o.filledAt ?? o.createdAt)} · {{ filled: "สำเร็จ", pending: "ค้างอยู่", cancelled: "ยกเลิก", rejected: "ไม่สำเร็จ" }[o.status]}
                    </span>
                  </div>
                  {o.realizedPnlThb !== null && o.side === "sell" && (
                    <p>
                      กำไรที่เกิดขึ้นแล้ว: <Change value={o.realizedPnlThb} />
                    </p>
                  )}
                  <p className="mt-1">“{o.reason}”</p>
                  {(o.stopLoss || o.targetPrice) && (
                    <p className="muted text-[0.85rem]">
                      {o.stopLoss ? `stop-loss ${o.stopLoss}` : ""} {o.targetPrice ? `· เป้าหมาย ${o.targetPrice}` : ""}
                    </p>
                  )}
                  {o.coachQuestion && (
                    <p className="muted text-[0.85rem]">
                      อาจารย์ถาม: {o.coachQuestion}
                      {o.coachAnswer ? ` → “${o.coachAnswer}”` : ""}
                    </p>
                  )}
                  {o.status === "rejected" && o.explanation && <p className="down text-[0.85rem]">{o.explanation}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <Disclaimer />
    </>
  );
}
