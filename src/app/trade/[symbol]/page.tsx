import Link from "next/link";
import { ExchangeForm } from "@/components/ExchangeForm";
import { TradeFlow } from "@/components/TradeFlow";
import { Disclaimer, EmptyState } from "@/components/ui";
import { feesAreUnset } from "@/config/fees";
import { getDb } from "@/lib/db/client";
import { loadState, reservedFor, tradable } from "@/lib/game/core";
import { marketOf } from "@/lib/rules/hours";
import { priceBand, tickSizeFor } from "@/lib/rules/tick";
import { loadGame } from "@/lib/server";

export default async function TradePage({ params, searchParams }: { params: Promise<{ symbol: string }>; searchParams: Promise<{ side?: string }> }) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  const side = (await searchParams).side === "sell" ? "sell" : "buy";
  const l = await loadGame({ sync: false });
  if (!l.game) return <EmptyState title="ยังไม่ได้เริ่มเกม" />;
  const market = marketOf(symbol);
  let quote;
  try {
    quote = await l.ctx.provider.getQuote(symbol);
  } catch {
    return (
      <EmptyState title="ไม่มีราคาของหุ้นตัวนี้">
        <Link href="/market" className="btn-primary mt-2">
          กลับไปหน้าตลาด
        </Link>
      </EmptyState>
    );
  }
  const db = getDb();
  const state = loadState(db, l.pid);
  const reserved = reservedFor(db, l.pid, l.ctx.fees);
  const pos = state.positions.find((p) => p.symbol === symbol);
  const t = await tradable(l.ctx, symbol);
  const bandRef = l.ctx.mode === "live" && t.ok ? quote.prevClose : quote.price;
  const fx = market === "US" ? ((await l.ctx.provider.getFxRate().catch(() => null))?.rate ?? 0) : 1;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/stock/${encodeURIComponent(symbol)}`} className="muted mb-2 inline-flex min-h-[44px] items-center">
        ← {symbol.replace(".BK", "")}
      </Link>
      <TradeFlow
        symbol={symbol}
        side={side}
        market={market}
        price={quote.price}
        priceTime={quote.fetchedAt}
        tradableNow={t.ok}
        tradableReason={t.reason}
        heldQty={(pos?.qty ?? 0) - (reserved.sellQty[symbol] ?? 0)}
        cashThb={state.cashThb - reserved.thb}
        cashUsd={state.cashUsd - reserved.usd}
        fx={fx}
        tick={market === "TH" ? tickSizeFor(quote.price) : 0.01}
        band={market === "TH" && bandRef ? priceBand(bandRef) : null}
        feesUnset={feesAreUnset(l.ctx.fees)}
        mode={l.ctx.mode}
      />
      {market === "US" && side === "buy" && (
        <details className="card mt-3">
          <summary className="min-h-[44px] cursor-pointer font-semibold">💱 แลกเงินบาทเป็น USD</summary>
          <div className="mt-2">
            <ExchangeForm fx={fx} spread={l.ctx.fees.fx.spreadRate} cashThb={state.cashThb - reserved.thb} cashUsd={state.cashUsd - reserved.usd} />
          </div>
        </details>
      )}
      <Disclaimer />
    </div>
  );
}
