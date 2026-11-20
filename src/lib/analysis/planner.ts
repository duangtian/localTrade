/**
 * "AI จัดพอร์ต": เสนอแผน → ผู้เล่นกดยืนยัน → ส่งคำสั่ง (ไม่ซื้อขายเองโดยไม่ถาม)
 * แผนเก็บใน kv (อายุ 30 นาที, ผูกกับวันของเกม) และตอนยืนยันใช้แผนที่เก็บไว้ ไม่รับตัวเลขจาก client
 */
import { and, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import type { IndexId } from "@/config/indices";
import { aiEnabled, askClaude } from "@/lib/ai";
import type { DB } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { exchange, fxMid, placeOrder, reservedFor, tradable, viewPortfolio, type GameCtx } from "@/lib/game/core";
import { getIndexStocks } from "@/lib/indices";
import { buyUsdRate } from "@/lib/rules/fees";
import { kvGet, kvSet } from "@/lib/settings";
import { findSeed, sectorOf } from "@/config/seeds";
import { AI_PLAN_PREFIX, allocatePlan, reviewHoldings, type Candidate, type PlanItem, type ReviewAction } from "./allocate";
import { analyzeSymbol, getCachedScan, runScan } from "./screen";
import { suggestLevels } from "./levels";

export type PlanMarket = "TH" | "US" | "BOTH";
export interface PlanOptions {
  market: PlanMarket;
  maxPositions: number;
  usePct: number;
}

export interface Plan {
  createdAt: string;
  today: string;
  mode: string;
  options: PlanOptions;
  items: (PlanItem & { orderType: "market" | "limit" })[];
  exchangeThb: number;
  usedThb: number;
  budgetThb: number;
  cashThb: number;
  skipped: { symbol: string; why: string }[];
  commentary: string;
  byAi: boolean;
}

const planKey = (ctx: GameCtx) => `plan:${ctx.game.id}`;
const PLAN_TTL_MS = 30 * 60 * 1000;

export function getPlan(db: DB, ctx: GameCtx): Plan | null {
  const p = kvGet<Plan | null>(db, planKey(ctx), null);
  if (!p || p.today !== ctx.today || p.mode !== ctx.mode) return null;
  if (ctx.mode === "live" && Date.now() - Date.parse(p.createdAt) > PLAN_TTL_MS) return null;
  return p;
}

export function clearPlan(db: DB, ctx: GameCtx) {
  kvSet(db, planKey(ctx), null);
}

async function scanFor(db: DB, ctx: GameCtx, id: IndexId) {
  return getCachedScan(db, ctx, id) ?? (await runScan(db, ctx, id, getIndexStocks(db, id).stocks));
}

export async function buildPlan(db: DB, ctx: GameCtx, pid: number, options: PlanOptions): Promise<Plan> {
  const universes: IndexId[] = options.market === "TH" ? ["set50"] : options.market === "US" ? ["us_popular"] : ["set50", "us_popular"];
  const rows = (await Promise.all(universes.map((u) => scanFor(db, ctx, u)))).flatMap((s) => s.rows);

  // คัดเฉพาะตัวที่สถิติสนับสนุน: คะแนน ≥ 58, ไม่ใช่ขาลง, RSI ไม่ร้อนแรงเกิน
  const good = rows
    .filter((r) => r.a.score >= 58 && r.a.trend !== "down" && (r.a.rsi14 === null || r.a.rsi14 < 75))
    .sort((a, b) => b.a.score - a.a.score)
    .slice(0, options.maxPositions * 4);

  const quotes = await ctx.provider.getQuotes(good.map((g) => g.symbol)).catch(() => ({}) as Record<string, { price: number }>);
  const from = DateTime.fromISO(ctx.today).minus({ days: 200 }).toISODate()!;
  const candidates: Candidate[] = [];
  for (const g of good) {
    const price = quotes[g.symbol]?.price ?? g.a.price;
    const market = g.symbol.endsWith(".BK") ? "TH" : "US";
    const bars = await ctx.provider.getHistory(g.symbol, from, ctx.today, "1d").catch(() => []);
    const lv = suggestLevels(bars.filter((b) => b.date.slice(0, 10) <= ctx.today), price, market);
    candidates.push({ symbol: g.symbol, name: g.name, sector: g.sector, market, price, score: g.a.score, r6m: g.a.r6m, trendLabel: g.a.label, stop: lv?.stop ?? null, target: lv?.target ?? null });
  }

  const view = await viewPortfolio(ctx, pid);
  const reserved = reservedFor(db, pid, ctx.fees);
  const mid = await fxMid(ctx).catch(() => 0);
  const fxBuy = mid > 0 ? buyUsdRate(ctx.fees, mid) : 0;
  const usable = options.market === "TH" || fxBuy > 0 ? candidates : candidates.filter((c) => c.market === "TH");
  const cashThb = Math.max(0, view.state.cashThb - reserved.thb);
  const cashUsd = Math.max(0, view.state.cashUsd - reserved.usd);

  const res = allocatePlan({
    candidates: usable,
    cashThb,
    cashUsd,
    fxBuy: fxBuy || 1,
    totalValueThb: view.valuation.totalThb,
    holdings: view.valuation.holdings.map((h) => ({ symbol: h.symbol, sector: sectorOf(h.symbol), valueThb: h.marketValueThb })),
    maxPositions: options.maxPositions,
    usePct: options.usePct,
    maxWeight: 0.25,
    maxPerSector: 2,
    fees: ctx.fees,
  });

  const items: Plan["items"] = [];
  for (const it of res.items) items.push({ ...it, orderType: (await tradable(ctx, it.symbol)).ok ? "market" : "limit" });

  const sectors = new Set(items.map((i) => i.sector));
  let commentary = items.length
    ? `แผนนี้ใช้เงิน ≈ ฿${Math.round(res.usedThb).toLocaleString("en-US")} จากงบ ฿${Math.round(res.budgetThb).toLocaleString("en-US")} ซื้อ ${items.length} ตัวใน ${sectors.size} กลุ่ม เลือกจากหุ้นที่แนวโน้มและโมเมนตัมดี (คะแนน ≥ 58) ไม่ซื้อตัวที่ RSI ร้อนแรงเกินไป จำกัดไม่เกิน 25% ต่อตัว และไม่เกิน 2 ตัวต่อกลุ่ม ทุกตัวมี stop-loss ไว้จำกัดการขาดทุน`
    : "ตอนนี้ยังไม่มีหุ้นที่ผ่านเกณฑ์และซื้อได้ด้วยเงินที่มี ลองเพิ่มสัดส่วนเงินที่ใช้ เลือกตลาดสหรัฐฯ (ซื้อเป็นเศษหุ้นได้) หรือรอให้ตลาดมีแนวโน้มชัดขึ้น";
  if (items.some((i) => i.orderType === "limit")) commentary += " · ตลาดปิดอยู่ บางคำสั่งจะเป็น Limit ที่ราคาปัจจุบัน รอจับคู่ตอนตลาดเปิด";

  let byAi = false;
  if (items.length && aiEnabled(db)) {
    const ctxText = [
      ctx.mode === "backtest" ? `โหมดย้อนอดีต วันจำลอง ${ctx.today} (ห้ามใช้ความรู้หลังวันนี้)` : `โหมดเวลาจริง ${ctx.today}`,
      `เงินสดที่ใช้ได้ ฿${Math.round(cashThb)} + $${cashUsd.toFixed(2)} มูลค่าพอร์ต ฿${Math.round(view.valuation.totalThb)}`,
      `หุ้นที่ถืออยู่: ${view.valuation.holdings.map((h) => `${h.symbol} ${(h.weight * 100).toFixed(0)}%`).join(", ") || "ไม่มี"}`,
      "แผนที่ Bot จัดจากสถิติ:",
      ...items.map((i) => `- ${i.symbol} (${i.sector}) ${i.qty ? `${i.qty} หุ้น` : `$${i.amountUsd}`} ≈ ฿${Math.round(i.costThb)} · ${i.reason}`),
    ].join("\n");
    const t = await askClaude(
      db,
      "อธิบายแผนจัดพอร์ตนี้ให้ผู้เรียน 4–6 ประโยค: ภาพรวมการกระจายความเสี่ยง จุดแข็ง จุดที่ต้องระวัง (เช่น กระจุกกลุ่ม ความผันผวน ค่าเงิน) และสิ่งที่ผู้เรียนควรถามตัวเองก่อนกดยืนยัน ห้ามรับประกันผลตอบแทน",
      ctxText,
    );
    if (t) {
      commentary = t;
      byAi = true;
    }
  }

  const plan: Plan = {
    createdAt: new Date().toISOString(),
    today: ctx.today,
    mode: ctx.mode,
    options,
    items,
    exchangeThb: res.exchangeThb,
    usedThb: res.usedThb,
    budgetThb: res.budgetThb,
    cashThb,
    skipped: res.skipped.slice(0, 8),
    commentary,
    byAi,
  };
  kvSet(db, planKey(ctx), plan);
  return plan;
}

export interface ExecResult {
  symbol: string;
  ok: boolean;
  message: string;
}

export async function executePlan(db: DB, ctx: GameCtx, pid: number): Promise<ExecResult[]> {
  const plan = getPlan(db, ctx);
  if (!plan) return [{ symbol: "-", ok: false, message: "แผนหมดอายุหรือวันของเกมเปลี่ยนแล้ว กรุณาให้ AI เสนอแผนใหม่" }];
  clearPlan(db, ctx);
  const out: ExecResult[] = [];
  if (plan.exchangeThb > 0) {
    const r = await exchange(ctx, pid, "THB_TO_USD", plan.exchangeThb);
    out.push({ symbol: "แลกเงิน", ok: r.ok, message: r.ok ? `แลก ฿${plan.exchangeThb.toLocaleString("en-US")} เป็น USD แล้ว` : r.error });
  }
  for (const it of plan.items) {
    const r = await placeOrder(
      ctx,
      pid,
      {
        symbol: it.symbol,
        side: "buy",
        type: it.orderType,
        qty: it.qty ?? undefined,
        amountUsd: it.amountUsd ?? undefined,
        limitPrice: it.orderType === "limit" ? it.price : undefined,
        reason: `${AI_PLAN_PREFIX} ${it.reason}`.slice(0, 500),
        stopLoss: it.stop,
        targetPrice: it.target,
      },
      "player",
    );
    out.push({ symbol: it.symbol, ok: r.ok, message: r.ok ? r.message : r.error });
  }
  return out;
}

// ---------- บริหารพอร์ต ----------

export async function buildReview(db: DB, ctx: GameCtx, pid: number): Promise<ReviewAction[]> {
  const view = await viewPortfolio(ctx, pid);
  const reserved = reservedFor(db, pid, ctx.fees);
  const hs = [];
  for (const h of view.valuation.holdings) {
    const lastBuy = db
      .select()
      .from(orders)
      .where(and(eq(orders.portfolioId, pid), eq(orders.symbol, h.symbol), eq(orders.side, "buy"), eq(orders.status, "filled")))
      .orderBy(desc(orders.id))
      .get();
    const a = await analyzeSymbol(ctx.provider, h.symbol, ctx.today).catch(() => null);
    hs.push({
      symbol: h.symbol,
      name: findSeed(h.symbol)?.name ?? h.symbol,
      market: h.market,
      qty: h.qty - (reserved.sellQty[h.symbol] ?? 0),
      price: h.price,
      weight: h.weight,
      valueThb: h.marketValueThb,
      totalValueThb: view.valuation.totalThb,
      stopLoss: lastBuy?.stopLoss ?? null,
      target: lastBuy?.targetPrice ?? null,
      score: a?.score ?? null,
      trend: a?.trend ?? null,
    });
  }
  return reviewHoldings(hs);
}

export async function executeReview(db: DB, ctx: GameCtx, pid: number, symbol: string, kind: ReviewAction["kind"]): Promise<ExecResult> {
  const act = (await buildReview(db, ctx, pid)).find((a) => a.symbol === symbol && a.kind === kind);
  if (!act) return { symbol, ok: false, message: "คำแนะนำนี้ไม่ตรงกับสถานะล่าสุดแล้ว (ราคาอาจเปลี่ยน)" };
  const t = await tradable(ctx, symbol);
  const q = await ctx.provider.getQuote(symbol);
  const r = await placeOrder(
    ctx,
    pid,
    {
      symbol,
      side: "sell",
      type: t.ok ? "market" : "limit",
      qty: act.qty,
      limitPrice: t.ok ? undefined : q.price,
      reason: `${AI_PLAN_PREFIX} ${act.title}: ${act.why}`.slice(0, 500),
    },
    "player",
  );
  return { symbol, ok: r.ok, message: r.ok ? r.message : r.error };
}
