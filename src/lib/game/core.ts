/**
 * แกนของเกม: บริบทเวลาเกม, การโหลด/บันทึกพอร์ต, ส่งคำสั่ง, จับคู่ Limit, มูลค่าพอร์ต
 * ทุกฟังก์ชันรับ GameCtx ที่มี provider ที่ถูกจำกัดเวลาแล้ว (โหมดย้อนอดีต) เพื่อไม่ให้รั่วข้อมูลอนาคต
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import type { FeeConfig } from "@/config/fees";
import { FX_SYMBOL } from "@/config/seeds";
import type { DB } from "@/lib/db/client";
import { fxTxns, games, orders, portfolios, positions, snapshots } from "@/lib/db/schema";
import {
  applyExchange,
  applyTrade,
  matchLimit,
  previewTrade,
  valuePortfolio,
  type PortfolioState,
  type Reserved,
  type Side,
  type TradePreview,
  type Valuation,
} from "@/lib/engine/portfolio";
import { TimeBoundedProvider } from "@/lib/prices/bounded";
import type { PriceProvider, Quote } from "@/lib/prices/types";
import { buyUsdRate, commission, sellUsdRate, type Market } from "@/lib/rules/fees";
import { bangkokDate, marketOf, marketStatus } from "@/lib/rules/hours";
import { round2, validateThaiLimit } from "@/lib/rules/tick";
import type { Mode } from "@/lib/settings";

export type Game = typeof games.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;

export interface GameCtx {
  db: DB;
  game: Game;
  mode: Mode;
  /** วันที่เกม YYYY-MM-DD */
  today: string;
  /** ค่าที่ใช้บันทึกเวลา (ISO สำหรับเวลาจริง, YYYY-MM-DD สำหรับย้อนอดีต) */
  stamp: string;
  provider: PriceProvider;
  bounded: TimeBoundedProvider | null;
  fees: FeeConfig;
  now: Date;
}

export function makeCtx(db: DB, game: Game, base: PriceProvider, fees: FeeConfig, now = new Date(), asOf?: string): GameCtx {
  if (game.mode === "backtest") {
    const day = asOf ?? game.simDate ?? game.startDate;
    const bounded = new TimeBoundedProvider(base, day);
    return { db, game, mode: "backtest", today: day, stamp: day, provider: bounded, bounded, fees, now };
  }
  return { db, game, mode: "live", today: bangkokDate(now), stamp: now.toISOString(), provider: base, bounded: null, fees, now };
}

// ---------- games ----------

export function getActiveGame(db: DB, mode: Mode): Game | undefined {
  return db.select().from(games).where(and(eq(games.mode, mode), eq(games.active, true))).orderBy(desc(games.id)).get();
}

export function nextWeekday(date: string): string {
  let d = DateTime.fromISO(date);
  while (d.weekday > 5) d = d.plus({ days: 1 });
  return d.toISODate()!;
}

export function createGame(db: DB, mode: Mode, startingCash: number, startDate?: string, now = new Date()): Game {
  db.update(games).set({ active: false }).where(eq(games.mode, mode)).run();
  const start = mode === "backtest" ? nextWeekday(startDate ?? "2020-01-15") : bangkokDate(now);
  const game = db
    .insert(games)
    .values({
      mode,
      startDate: start,
      simDate: mode === "backtest" ? start : null,
      startingCash,
      active: true,
      createdAt: now.toISOString(),
    })
    .returning()
    .get();
  for (const owner of ["player", "bot"] as const) {
    db.insert(portfolios).values({ gameId: game.id, owner, cashThb: startingCash, cashUsd: 0 }).run();
  }
  return game;
}

export type Owner = "player" | "bot" | "dca" | "daytrade";

/** พอร์ตอัตโนมัติ (DCA / เดย์เทรด) สร้างเมื่อผู้เล่นเปิดใช้ ด้วยเงินเท่ากับเงินเริ่มต้นของเกม */
export function findPortfolioId(db: DB, gameId: number, owner: Owner): number | null {
  return db.select().from(portfolios).where(and(eq(portfolios.gameId, gameId), eq(portfolios.owner, owner))).get()?.id ?? null;
}

export function ensurePortfolio(db: DB, game: Game, owner: Owner): number {
  return findPortfolioId(db, game.id, owner) ?? db.insert(portfolios).values({ gameId: game.id, owner, cashThb: game.startingCash, cashUsd: 0 }).returning().get().id;
}

/** ลบพอร์ตอัตโนมัติและประวัติทั้งหมด (ใช้ตอน "เริ่มใหม่") */
export function deletePortfolio(db: DB, id: number) {
  db.delete(positions).where(eq(positions.portfolioId, id)).run();
  db.delete(orders).where(eq(orders.portfolioId, id)).run();
  db.delete(snapshots).where(eq(snapshots.portfolioId, id)).run();
  db.delete(fxTxns).where(eq(fxTxns.portfolioId, id)).run();
  db.delete(portfolios).where(eq(portfolios.id, id)).run();
}

/**
 * บันทึกการซื้อขายที่ราคาที่กำหนด (ใช้กับ Bot เดย์เทรดในโหมดย้อนอดีต: ซื้อที่ราคาเปิด ขายที่ stop/เป้า/ราคาปิด)
 * ใช้กติกาเดียวกับผู้เล่น (ค่าคอม, lot, เงินพอ) ผ่าน applyTrade
 */
export async function recordFill(
  ctx: GameCtx,
  portfolioId: number,
  input: { symbol: string; side: Side; qty?: number; amountUsd?: number; price: number; reason: string; explanation?: string },
): Promise<{ ok: true; qty: number; total: number; realizedPnlThb: number | null } | { ok: false; error: string }> {
  const market = marketOf(input.symbol);
  const fx = market === "US" ? await fxMid(ctx) : 1;
  const state = loadState(ctx.db, portfolioId);
  const r = applyTrade(state, { symbol: input.symbol, market, side: input.side, qty: input.qty, amountUsd: input.amountUsd }, input.price, ctx.fees, fx, ctx.today, reservedFor(ctx.db, portfolioId, ctx.fees));
  if (!r.ok) return r;
  saveState(ctx.db, portfolioId, r.value.state);
  const f = r.value.fill;
  ctx.db
    .insert(orders)
    .values({
      portfolioId,
      symbol: input.symbol,
      market,
      side: input.side,
      type: "market",
      qty: f.qty,
      amountUsd: market === "US" ? (input.amountUsd ?? null) : null,
      limitPrice: null,
      status: "filled",
      reason: input.reason,
      explanation: input.explanation ?? null,
      createdAt: ctx.stamp,
      filledAt: ctx.stamp,
      fillPrice: f.price,
      fillQty: f.qty,
      commission: f.commission,
      total: f.total,
      fxRate: f.fxRate,
      realizedPnlThb: f.realizedPnlThb,
    })
    .run();
  return { ok: true, qty: f.qty, total: f.total, realizedPnlThb: f.realizedPnlThb };
}

export function getPortfolioId(db: DB, gameId: number, owner: Owner): number {
  const p = db.select().from(portfolios).where(and(eq(portfolios.gameId, gameId), eq(portfolios.owner, owner))).get();
  if (!p) throw new Error("ไม่พบพอร์ต");
  return p.id;
}

export function getPortfolioRow(db: DB, id: number) {
  return db.select().from(portfolios).where(eq(portfolios.id, id)).get()!;
}

// ---------- state ----------

export function loadState(db: DB, portfolioId: number): PortfolioState {
  const p = getPortfolioRow(db, portfolioId);
  const pos = db.select().from(positions).where(eq(positions.portfolioId, portfolioId)).all();
  return {
    cashThb: p.cashThb,
    cashUsd: p.cashUsd,
    positions: pos.map(({ symbol, market, qty, avgCost, avgFx, openedAt }) => ({ symbol, market, qty, avgCost, avgFx, openedAt })),
  };
}

export function saveState(db: DB, portfolioId: number, state: PortfolioState): void {
  db.transaction((tx) => {
    tx.update(portfolios).set({ cashThb: state.cashThb, cashUsd: state.cashUsd }).where(eq(portfolios.id, portfolioId)).run();
    tx.delete(positions).where(eq(positions.portfolioId, portfolioId)).run();
    for (const p of state.positions) tx.insert(positions).values({ portfolioId, ...p }).run();
  });
}

export function pendingOrders(db: DB, portfolioId: number): OrderRow[] {
  return db
    .select()
    .from(orders)
    .where(and(eq(orders.portfolioId, portfolioId), eq(orders.status, "pending")))
    .orderBy(asc(orders.id))
    .all();
}

/** เงิน/หุ้นที่ถูกจองไว้โดยคำสั่ง Limit ที่ค้างอยู่ */
export function reservedFor(db: DB, portfolioId: number, fees: FeeConfig, excludeId?: number): Reserved {
  const r: Reserved = { thb: 0, usd: 0, sellQty: {} };
  for (const o of pendingOrders(db, portfolioId)) {
    if (o.id === excludeId) continue;
    if (o.side === "sell") {
      r.sellQty[o.symbol] = (r.sellQty[o.symbol] ?? 0) + (o.qty ?? 0);
      continue;
    }
    const gross = o.amountUsd ?? (o.qty ?? 0) * (o.limitPrice ?? 0);
    const total = gross + commission(fees, o.market, gross);
    if (o.market === "TH") r.thb += total;
    else r.usd += total;
  }
  return r;
}

// ---------- prices ----------

export async function fxMid(ctx: GameCtx): Promise<number> {
  try {
    return (await ctx.provider.getFxRate()).rate;
  } catch {
    return 0;
  }
}

/** ตรวจว่าตอนนี้ซื้อขายหุ้นตัวนี้ได้ไหม */
export async function tradable(ctx: GameCtx, symbol: string): Promise<{ ok: boolean; reason: string }> {
  const market = marketOf(symbol);
  if (ctx.mode === "live") {
    const st = marketStatus(market, ctx.now);
    return { ok: st.open, reason: st.label };
  }
  const bar = await ctx.bounded!.barOn(symbol, ctx.today);
  return bar
    ? { ok: true, reason: "ซื้อขายที่ราคาปิดของวันจำลอง" }
    : { ok: false, reason: "วันนี้ไม่มีการซื้อขายหุ้นตัวนี้ (ตลาดปิดหรือยังไม่เข้าตลาด) ลองเลื่อนวัน" };
}

// ---------- orders ----------

export interface OrderInput {
  symbol: string;
  side: Side;
  type: "market" | "limit";
  qty?: number;
  amountUsd?: number;
  limitPrice?: number;
  reason: string;
  stopLoss?: number | null;
  targetPrice?: number | null;
  coachQuestion?: string | null;
  coachAnswer?: string | null;
  explanation?: string | null;
}

export type OrderResult =
  | { ok: true; orderId: number; status: "filled" | "pending"; message: string; fillPrice?: number; preview: TradePreview }
  | { ok: false; error: string };

export const MIN_REASON = 10;

/** ตรวจคำสั่งและคำนวณยอดก่อนยืนยัน (ไม่บันทึก) */
export async function quoteOrder(
  ctx: GameCtx,
  portfolioId: number,
  input: OrderInput,
): Promise<{ ok: true; preview: TradePreview; quote: Quote; fx: number; tradable: { ok: boolean; reason: string } } | { ok: false; error: string }> {
  const market: Market = marketOf(input.symbol);
  let quote: Quote;
  try {
    quote = await ctx.provider.getQuote(input.symbol);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (input.type === "limit") {
    if (!(input.limitPrice && input.limitPrice > 0)) return { ok: false, error: "กรุณาใส่ราคา Limit" };
    if (market === "TH") {
      const t = await tradable(ctx, input.symbol);
      // ระหว่างตลาดเปิด ceiling/floor อิงราคาปิดวันก่อน, นอกเวลา/ย้อนอดีต อิงราคาปิดล่าสุด
      const ref = ctx.mode === "live" && t.ok ? quote.prevClose : quote.price;
      const v = validateThaiLimit(input.limitPrice, ref);
      if (!v.ok) return v;
    }
  }
  const price = input.type === "limit" ? input.limitPrice! : quote.price;
  const fx = market === "US" ? await fxMid(ctx) : 1;
  if (market === "US" && !(fx > 0)) return { ok: false, error: "ไม่มีอัตราแลกเปลี่ยน ลองใหม่อีกครั้ง" };
  const state = loadState(ctx.db, portfolioId);
  const req = { symbol: input.symbol, market, side: input.side, qty: input.qty, amountUsd: market === "US" ? input.amountUsd : undefined };
  const pv = previewTrade(state, req, price, ctx.fees, reservedFor(ctx.db, portfolioId, ctx.fees));
  if (!pv.ok) return pv;
  return { ok: true, preview: pv.value, quote, fx, tradable: await tradable(ctx, input.symbol) };
}

export async function placeOrder(ctx: GameCtx, portfolioId: number, input: OrderInput, owner: "player" | "bot" = "player"): Promise<OrderResult> {
  if (owner === "player" && input.reason.trim().length < MIN_REASON) {
    return { ok: false, error: `กรุณาเขียนเหตุผลอย่างน้อย ${MIN_REASON} ตัวอักษร` };
  }
  const q = await quoteOrder(ctx, portfolioId, input);
  if (!q.ok) return q;
  const market = marketOf(input.symbol);

  const base = {
    portfolioId,
    symbol: input.symbol,
    market,
    side: input.side,
    type: input.type,
    qty: market === "TH" || input.amountUsd === undefined ? q.preview.qty : null,
    amountUsd: market === "US" ? (input.amountUsd ?? null) : null,
    limitPrice: input.type === "limit" ? input.limitPrice! : null,
    reason: input.reason.trim(),
    stopLoss: input.stopLoss ?? null,
    targetPrice: input.targetPrice ?? null,
    coachQuestion: input.coachQuestion ?? null,
    coachAnswer: input.coachAnswer ?? null,
    createdAt: ctx.stamp,
    explanation: input.explanation ?? null,
  };

  if (input.type === "market") {
    if (!q.tradable.ok) return { ok: false, error: `ส่งคำสั่ง Market ไม่ได้: ${q.tradable.reason} (ใช้คำสั่ง Limit เพื่อตั้งรอไว้ได้)` };
    const state = loadState(ctx.db, portfolioId);
    const r = applyTrade(state, { symbol: input.symbol, market, side: input.side, qty: base.qty ?? undefined, amountUsd: base.amountUsd ?? undefined }, q.quote.price, ctx.fees, q.fx, ctx.today, reservedFor(ctx.db, portfolioId, ctx.fees));
    if (!r.ok) return r;
    saveState(ctx.db, portfolioId, r.value.state);
    const f = r.value.fill;
    const row = ctx.db
      .insert(orders)
      .values({ ...base, status: "filled", filledAt: ctx.stamp, fillPrice: f.price, fillQty: f.qty, commission: f.commission, total: f.total, fxRate: f.fxRate, realizedPnlThb: f.realizedPnlThb })
      .returning()
      .get();
    return { ok: true, orderId: row.id, status: "filled", message: "ทำรายการสำเร็จ", fillPrice: f.price, preview: q.preview };
  }

  const row = ctx.db.insert(orders).values({ ...base, status: "pending" }).returning().get();
  // โหมดเวลาจริง: ถ้าตลาดเปิดและราคาถึงแล้ว จับคู่ทันที; โหมดย้อนอดีตรอตรวจกับแท่งราคาวันถัดไป
  if (ctx.mode === "live" && q.tradable.ok) {
    await processPending(ctx, portfolioId);
    const after = ctx.db.select().from(orders).where(eq(orders.id, row.id)).get()!;
    if (after.status === "filled") {
      return { ok: true, orderId: row.id, status: "filled", message: "ราคาถึงแล้ว จับคู่สำเร็จทันที", fillPrice: after.fillPrice ?? undefined, preview: q.preview };
    }
  }
  return { ok: true, orderId: row.id, status: "pending", message: "ตั้งคำสั่ง Limit แล้ว ระบบจะตรวจซ้ำเมื่อมีราคาใหม่", preview: q.preview };
}

export function cancelOrder(db: DB, portfolioId: number, orderId: number): boolean {
  const r = db
    .update(orders)
    .set({ status: "cancelled" })
    .where(and(eq(orders.id, orderId), eq(orders.portfolioId, portfolioId), eq(orders.status, "pending")))
    .run();
  return r.changes > 0;
}

/** ตรวจคำสั่ง Limit ที่ค้างอยู่กับราคาใหม่ */
export async function processPending(ctx: GameCtx, portfolioId: number): Promise<number> {
  let filled = 0;
  for (const o of pendingOrders(ctx.db, portfolioId)) {
    let fillPrice: number | null = null;
    if (ctx.mode === "live") {
      if (!marketStatus(o.market, ctx.now).open) continue;
      try {
        const q = await ctx.provider.getQuote(o.symbol);
        fillPrice = matchLimit(o.side, o.limitPrice!, { price: q.price });
      } catch {
        continue;
      }
    } else {
      // ย้อนอดีต: ตรวจด้วย high/low ของวันจำลอง (ต้องเป็นวันหลังจากวันที่ตั้งคำสั่ง)
      if (o.createdAt >= ctx.today) continue;
      const bar = await ctx.bounded!.barOn(o.symbol, ctx.today);
      if (!bar) continue;
      fillPrice = matchLimit(o.side, o.limitPrice!, bar);
    }
    if (fillPrice === null) continue;

    const fx = o.market === "US" ? await fxMid(ctx) : 1;
    const state = loadState(ctx.db, portfolioId);
    const req = { symbol: o.symbol, market: o.market, side: o.side, qty: o.qty ?? undefined, amountUsd: o.amountUsd ?? undefined };
    const r = applyTrade(state, req, fillPrice, ctx.fees, fx, ctx.today, reservedFor(ctx.db, portfolioId, ctx.fees, o.id));
    if (!r.ok) {
      ctx.db.update(orders).set({ status: "rejected", explanation: `จับคู่ไม่สำเร็จ: ${r.error}` }).where(eq(orders.id, o.id)).run();
      continue;
    }
    saveState(ctx.db, portfolioId, r.value.state);
    const f = r.value.fill;
    ctx.db
      .update(orders)
      .set({ status: "filled", filledAt: ctx.stamp, fillPrice: f.price, fillQty: f.qty, commission: f.commission, total: f.total, fxRate: f.fxRate, realizedPnlThb: f.realizedPnlThb })
      .where(eq(orders.id, o.id))
      .run();
    filled++;
  }
  return filled;
}

// ---------- FX ----------

export async function exchange(ctx: GameCtx, portfolioId: number, direction: "THB_TO_USD" | "USD_TO_THB", amount: number) {
  const mid = await fxMid(ctx);
  if (!(mid > 0)) return { ok: false as const, error: "ไม่มีอัตราแลกเปลี่ยน" };
  const rate = direction === "THB_TO_USD" ? buyUsdRate(ctx.fees, mid) : sellUsdRate(ctx.fees, mid);
  const state = loadState(ctx.db, portfolioId);
  const reserved = reservedFor(ctx.db, portfolioId, ctx.fees);
  const free = direction === "THB_TO_USD" ? state.cashThb - reserved.thb : state.cashUsd - reserved.usd;
  if (amount > free + 1e-9) return { ok: false as const, error: "เงินไม่พอ (บางส่วนถูกจองไว้ในคำสั่งที่ค้างอยู่)" };
  const r = applyExchange(state, direction, round2(amount), rate);
  if (!r.ok) return r;
  saveState(ctx.db, portfolioId, r.value.state);
  ctx.db.insert(fxTxns).values({ portfolioId, direction, thb: r.value.thb, usd: r.value.usd, rate, at: ctx.stamp }).run();
  return { ok: true as const, thb: r.value.thb, usd: r.value.usd, rate };
}

export function previewExchange(fees: FeeConfig, mid: number, direction: "THB_TO_USD" | "USD_TO_THB", amount: number) {
  const rate = direction === "THB_TO_USD" ? buyUsdRate(fees, mid) : sellUsdRate(fees, mid);
  return { rate, result: direction === "THB_TO_USD" ? round2(amount / rate) : round2(amount * rate) };
}

// ---------- valuation ----------

export interface PortfolioView {
  state: PortfolioState;
  valuation: Valuation;
  quotes: Record<string, Quote>;
  fx: number;
  /** เวลาอัปเดตราคาล่าสุด (ISO หรือวันที่) */
  updatedAt: string | null;
}

export async function viewPortfolio(ctx: GameCtx, portfolioId: number): Promise<PortfolioView> {
  const state = loadState(ctx.db, portfolioId);
  const symbols = state.positions.map((p) => p.symbol);
  const needFx = state.cashUsd > 0 || state.positions.some((p) => p.market === "US");
  const quotes = await ctx.provider.getQuotes(needFx ? [...symbols, FX_SYMBOL] : symbols);
  const fx = quotes[FX_SYMBOL]?.price ?? (needFx ? await fxMid(ctx) : 0);
  const prices: Record<string, { price: number; prevClose: number | null }> = {};
  for (const s of symbols) if (quotes[s]) prices[s] = { price: quotes[s].price, prevClose: quotes[s].prevClose };
  const valuation = valuePortfolio(state, prices, fx);
  const times = Object.values(quotes).map((q) => q.fetchedAt).sort();
  return { state, valuation, quotes, fx, updatedAt: times[0] ?? null };
}

export async function snapshot(ctx: GameCtx, portfolioId: number): Promise<number> {
  const v = await viewPortfolio(ctx, portfolioId);
  ctx.db
    .insert(snapshots)
    .values({ portfolioId, date: ctx.today, valueThb: v.valuation.totalThb })
    .onConflictDoUpdate({ target: [snapshots.portfolioId, snapshots.date], set: { valueThb: v.valuation.totalThb } })
    .run();
  return v.valuation.totalThb;
}

export function getSnapshots(db: DB, portfolioId: number) {
  return db.select().from(snapshots).where(eq(snapshots.portfolioId, portfolioId)).orderBy(asc(snapshots.date)).all();
}

export function orderHistory(db: DB, portfolioId: number, limit = 100): OrderRow[] {
  return db.select().from(orders).where(eq(orders.portfolioId, portfolioId)).orderBy(desc(orders.id)).limit(limit).all();
}
