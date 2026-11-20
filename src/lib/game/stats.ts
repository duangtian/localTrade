import type { DB } from "@/lib/db/client";
import { orderHistory, viewPortfolio, type GameCtx } from "./core";

/** สถิติของพอร์ตหนึ่ง (ใช้กับพอร์ต DCA / Bot เดย์เทรด / หน้าเทียบ) */
export async function portfolioStats(db: DB, ctx: GameCtx, pid: number) {
  const view = await viewPortfolio(ctx, pid);
  const fills = orderHistory(db, pid, 5000).filter((o) => o.status === "filled");
  const sells = fills.filter((o) => o.side === "sell");
  const toThb = (o: (typeof fills)[number], v: number) => (o.market === "US" ? v * (o.fxRate ?? 0) : v);
  const pnl = sells.map((o) => o.realizedPnlThb ?? 0);
  const wins = pnl.filter((x) => x > 0);
  const losses = pnl.filter((x) => x <= 0);
  const invested = fills.filter((o) => o.side === "buy").reduce((s, o) => s + toThb(o, o.total ?? 0), 0);
  const commissionThb = fills.reduce((s, o) => s + toThb(o, o.commission ?? 0), 0);
  const sc = ctx.game.startingCash;
  return {
    view,
    fills,
    sells,
    totalThb: view.valuation.totalThb,
    returnPct: view.valuation.totalThb / sc - 1,
    invested,
    commissionThb,
    realizedThb: pnl.reduce((a, b) => a + b, 0),
    trades: sells.length,
    winRate: sells.length ? wins.length / sells.length : null,
    avgWin: wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null,
    avgLoss: losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : null,
  };
}
