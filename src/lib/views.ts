import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { messages, orders } from "@/lib/db/schema";
import type { Valuation } from "@/lib/engine/portfolio";
import { loadState } from "@/lib/game/core";
import { evaluateMissions } from "@/lib/missions";

export function missionsFor(db: DB, gameId: number, pid: number, today: string, valuation: Valuation) {
  const all = db.select().from(orders).where(eq(orders.portfolioId, pid)).all();
  const summariesRead = db
    .select()
    .from(messages)
    .where(and(eq(messages.gameId, gameId), eq(messages.kind, "summary"), eq(messages.dismissed, true)))
    .all().length;
  return evaluateMissions({
    today,
    orders: all,
    valuation,
    summariesRead,
    positionsOpenedAt: loadState(db, pid).positions.map((p) => ({ symbol: p.symbol, openedAt: p.openedAt })),
  });
}

export function latestCard(db: DB, gameId: number) {
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.gameId, gameId), eq(messages.dismissed, false)))
    .orderBy(desc(messages.id))
    .all()
    .find((m) => m.kind === "summary" || m.kind === "bot_trade");
}
