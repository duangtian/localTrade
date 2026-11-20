"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BACKTEST_PRESETS, STARTING_CASH_OPTIONS } from "@/config/app";
import type { FeeConfig } from "@/config/fees";
import { indexDef, parseThaiSymbols, type IndexId } from "@/config/indices";
import { findSeed } from "@/config/seeds";
import { aiPicksSummary, aiStockAnalysis } from "@/lib/analysis/advice";
import { getNews, type NewsItem } from "@/lib/analysis/news";
import { analyzeSymbol, getCachedScan, runScan } from "@/lib/analysis/screen";
import { buildPlan, clearPlan, executePlan, executeReview, type ExecResult, type PlanMarket } from "@/lib/analysis/planner";
import type { ReviewAction } from "@/lib/analysis/allocate";
import { normalizeWeights } from "@/lib/bot/dca";
import { DEFAULT_DAYTRADE } from "@/lib/bot/daytrade";
import { getDaytradeConfig, getDcaConfig, runAutoPortfolios, setDaytradeConfig, setDcaConfig } from "@/lib/game/auto";
import { getIndexStocks, setIndexOverride } from "@/lib/indices";
import { askClaude, aiEnabled } from "@/lib/ai";
import { buildAiContext, CANNED_QA, coachQuestion } from "@/lib/coach";
import { getDb } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import {
  cancelOrder,
  createGame,
  deletePortfolio,
  ensurePortfolio,
  findPortfolioId,
  exchange,
  orderHistory,
  placeOrder,
  quoteOrder,
  viewPortfolio,
  type OrderInput,
} from "@/lib/game/core";
import { addMessage, advanceBacktest, maxSimDate, returns, startBacktest, type Step } from "@/lib/game/flow";
import { getBaseProvider } from "@/lib/prices";
import { marketOf } from "@/lib/rules/hours";
import { loadGame } from "@/lib/server";
import { getFees, getSettings, setFees, updateSettings, type Mode } from "@/lib/settings";

function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function setModeAction(mode: Mode) {
  updateSettings(getDb(), { mode });
  revalidateAll();
}

export async function createGameAction(formData: FormData) {
  const db = getDb();
  const mode = (formData.get("mode") as Mode) ?? getSettings(db).mode;
  const cash = Number(formData.get("cash"));
  const startingCash = (STARTING_CASH_OPTIONS as readonly number[]).includes(cash) ? cash : 10_000;
  let start = String(formData.get("startDate") || formData.get("customDate") || BACKTEST_PRESETS[1].date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) start = BACKTEST_PRESETS[1].date;
  if (start > maxSimDate()) start = maxSimDate();
  updateSettings(db, { mode, startingCash });
  const game = createGame(db, mode, startingCash, start);
  if (mode === "backtest") {
    try {
      await startBacktest(db, getBaseProvider(), game, getFees(db));
    } catch (e) {
      console.warn("[backtest] เริ่มเกมไม่สมบูรณ์", (e as Error).message);
    }
  }
  revalidateAll();
  redirect("/");
}

export async function advanceAction(step: Step) {
  const l = await loadGame({ sync: false });
  if (!l.game || l.game.mode !== "backtest") return { ok: false, error: "ไม่ได้อยู่ในโหมดย้อนอดีต" };
  const r = await advanceBacktest(getDb(), getBaseProvider(), l.game.id, step, getFees(getDb()));
  revalidateAll();
  return r.ok ? { ok: true, message: r.filled > 0 ? `จับคู่คำสั่ง Limit ได้ ${r.filled} รายการ` : "เลื่อนวันแล้ว" } : { ok: false, error: r.error };
}

export interface TradeDraft {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  qty?: number;
  amountUsd?: number;
  limitPrice?: number;
}

export async function previewOrderAction(d: TradeDraft) {
  const l = await loadGame({ sync: false });
  if (!l.game) return { ok: false as const, error: "ยังไม่ได้เริ่มเกม" };
  const r = await quoteOrder(l.ctx, l.pid, { ...d, reason: "" });
  if (!r.ok) return r;
  return { ok: true as const, preview: r.preview, price: r.quote.price, fx: r.fx, tradable: r.tradable, quoteTime: r.quote.fetchedAt };
}

/** อาจารย์ถามกลับ 1 คำถามก่อนส่งคำสั่ง */
export async function coachQuestionAction(d: TradeDraft & { reason: string; stopLoss?: number | null }) {
  const l = await loadGame({ sync: false });
  if (!l.game) return { question: "", ai: false };
  const q = await quoteOrder(l.ctx, l.pid, { ...d, reason: d.reason });
  const v = await viewPortfolio(l.ctx, l.pid);
  let weightAfter: number | undefined;
  if (q.ok && d.side === "buy" && v.valuation.totalThb > 0) {
    const holding = v.valuation.holdings.find((h) => h.symbol === d.symbol)?.marketValueThb ?? 0;
    const addThb = q.preview.gross * (marketOf(d.symbol) === "US" ? q.fx : 1);
    weightAfter = (holding + addThb) / v.valuation.totalThb;
  }
  const price = q.ok ? q.preview.price : 0;
  const rule = coachQuestion({
    side: d.side,
    symbol: d.symbol,
    reason: d.reason,
    price,
    currency: marketOf(d.symbol) === "TH" ? "THB" : "USD",
    stopLoss: d.stopLoss,
    weightAfter,
  });
  if (aiEnabled(getDb())) {
    const r = await returns(l.ctx);
    const ai = await askClaude(
      getDb(),
      `ผู้เรียนกำลังจะ${d.side === "buy" ? "ซื้อ" : "ขาย"} ${d.symbol} ที่ราคาประมาณ ${price} ด้วยเหตุผลว่า "${d.reason}"${d.stopLoss ? ` ตั้ง stop-loss ${d.stopLoss}` : " ยังไม่ได้ตั้ง stop-loss"} ให้ถามกลับ 1 คำถามที่ช่วยให้คิดเรื่องความเสี่ยงหรือวินัย ห้ามบอกคำตอบ ห้ามบอกว่าควรซื้อหรือไม่ ตอบเป็นคำถามประโยคเดียว`,
      buildAiContext({ mode: l.ctx.mode, today: l.ctx.today, startingCash: l.game.startingCash, valuation: r.player.valuation, botReturn: r.botReturn, recentOrders: orderHistory(getDb(), l.pid, 10) }),
    );
    if (ai) return { question: ai, ai: true };
  }
  return { question: rule, ai: false };
}

export async function placeOrderAction(input: OrderInput) {
  const l = await loadGame({ sync: false });
  if (!l.game) return { ok: false as const, error: "ยังไม่ได้เริ่มเกม" };
  const r = await placeOrder(l.ctx, l.pid, input, "player");
  revalidateAll();
  if (!r.ok) return r;
  return { ok: true as const, status: r.status, message: r.message, orderId: r.orderId };
}

export async function cancelOrderAction(orderId: number) {
  const l = await loadGame({ sync: false });
  if (!l.game) return;
  cancelOrder(getDb(), l.pid, orderId);
  revalidateAll();
}

export async function exchangeAction(direction: "THB_TO_USD" | "USD_TO_THB", amount: number) {
  const l = await loadGame({ sync: false });
  if (!l.game) return { ok: false as const, error: "ยังไม่ได้เริ่มเกม" };
  const r = await exchange(l.ctx, l.pid, direction, amount);
  revalidateAll();
  return r;
}

export async function dismissMessageAction(id: number) {
  getDb().update(messages).set({ dismissed: true }).where(eq(messages.id, id)).run();
  revalidateAll();
}

export async function askCannedAction(index: number) {
  const l = await loadGame({ sync: false });
  if (!l.game) return;
  const qa = CANNED_QA[index];
  if (!qa) return;
  addMessage(getDb(), l.game.id, "chat_user", l.ctx.today, qa.q);
  addMessage(getDb(), l.game.id, "chat_bot", l.ctx.today, qa.a);
  revalidateAll();
}

export async function chatAction(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim().slice(0, 500);
  const l = await loadGame({ sync: false });
  if (!l.game || !text) return;
  const db = getDb();
  const history = db
    .select()
    .from(messages)
    .where(and(eq(messages.gameId, l.game.id)))
    .orderBy(desc(messages.id))
    .limit(10)
    .all()
    .filter((m) => m.kind === "chat_user" || m.kind === "chat_bot")
    .reverse()
    .map((m) => ({ role: m.kind === "chat_user" ? ("user" as const) : ("assistant" as const), content: m.text }));
  addMessage(db, l.game.id, "chat_user", l.ctx.today, text);
  const r = await returns(l.ctx);
  const ai = await askClaude(
    db,
    `ตอบคำถามของผู้เรียน: "${text}"`,
    buildAiContext({ mode: l.ctx.mode, today: l.ctx.today, startingCash: l.game.startingCash, valuation: r.player.valuation, botReturn: r.botReturn, recentOrders: orderHistory(db, l.pid, 10) }),
    // history ต้องเริ่มด้วย user และสลับกัน
    history[0]?.role === "assistant" ? history.slice(1) : history,
  );
  addMessage(db, l.game.id, "chat_bot", l.ctx.today, ai ?? "ตอนนี้ตอบแชทอิสระไม่ได้ (ปิด Claude, ไม่มี API key หรือใช้ครบโควตาวันนี้แล้ว) ลองกดคำถามสำเร็จรูปด้านบนแทนนะครับ");
  revalidateAll();
}

export async function updateSettingsAction(formData: FormData) {
  const db = getDb();
  const patch: Parameters<typeof updateSettings>[1] = {};
  if (formData.has("theme")) patch.theme = formData.get("theme") === "dark" ? "dark" : "light";
  if (formData.has("claude")) patch.claudeEnabled = formData.get("claude") === "on";
  updateSettings(db, patch);
  revalidateAll();
}

export async function saveFeesAction(formData: FormData) {
  const num = (k: string) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  const pct = (k: string) => num(k) / 100;
  const fees: FeeConfig = {
    asOf: String(formData.get("asOf") || "") || null,
    th: { commissionRate: pct("thRate"), minCommissionThb: num("thMin"), vatRate: pct("thVat") },
    us: { commissionRate: pct("usRate"), minCommissionUsd: num("usMin"), vatRate: pct("usVat") },
    fx: { spreadRate: pct("fxSpread") },
  };
  setFees(getDb(), fees);
  revalidateAll();
}

export async function saveIndexAction(id: "set50" | "set100", formData: FormData) {
  const symbols = parseThaiSymbols(String(formData.get("symbols") ?? ""));
  const asOf = String(formData.get("asOf") || "").slice(0, 40) || new Date().toISOString().slice(0, 10);
  setIndexOverride(getDb(), id, symbols.length ? { symbols, asOf, savedAt: new Date().toISOString() } : null);
  revalidateAll();
}

export async function resetIndexAction(id: "set50" | "set100") {
  setIndexOverride(getDb(), id, null);
  revalidateAll();
}

// ---------- Bot คัดหุ้น / AI วิเคราะห์ ----------

export async function runScanAction(universe: IndexId) {
  const l = await loadGame({ sync: false });
  if (!l.game || !indexDef(universe)) return;
  const db = getDb();
  await runScan(db, l.ctx, universe, getIndexStocks(db, universe).stocks);
  revalidatePath("/picks");
}

export async function aiPicksAction(universe: IndexId) {
  const l = await loadGame({ sync: false });
  if (!l.game) return;
  const db = getDb();
  const scan = getCachedScan(db, l.ctx, universe);
  if (!scan) return;
  const top = scan.rows.slice(0, 5);
  const news: Record<string, NewsItem[] | null> = {};
  for (const r of top) news[r.symbol] = l.ctx.mode === "live" ? await getNews(db, r.symbol, 4) : null;
  await aiPicksSummary(db, l.ctx, scan.key, scan.rows, news);
  revalidatePath("/picks");
}

export async function aiStockAction(symbol: string) {
  const l = await loadGame({ sync: false });
  if (!l.game) return;
  const db = getDb();
  const a = await analyzeSymbol(l.ctx.provider, symbol, l.ctx.today).catch(() => null);
  if (!a) return;
  const news = l.ctx.mode === "live" ? await getNews(db, symbol) : null;
  await aiStockAnalysis(db, l.ctx, symbol, findSeed(symbol)?.name ?? symbol, a, news);
  revalidatePath(`/stock/${encodeURIComponent(symbol)}`);
}

// ---------- AI จัดพอร์ต (เสนอแผน → ผู้เล่นยืนยัน) ----------

export async function buildPlanAction(formData: FormData) {
  const l = await loadGame({ sync: false });
  if (!l.game) return;
  const market = (["TH", "US", "BOTH"].includes(String(formData.get("market"))) ? formData.get("market") : "TH") as PlanMarket;
  const maxPositions = Math.min(8, Math.max(2, Number(formData.get("n")) || 5));
  const usePct = Math.min(0.95, Math.max(0.2, Number(formData.get("use")) || 0.7));
  const style = formData.get("style") === "day" ? "day" : "long";
  await buildPlan(getDb(), l.ctx, l.pid, { style, market, maxPositions, usePct });
  revalidatePath("/plan");
}

export async function cancelPlanAction() {
  const l = await loadGame({ sync: false });
  if (!l.game) return;
  clearPlan(getDb(), l.ctx);
  revalidatePath("/plan");
}

export async function executePlanAction(): Promise<ExecResult[]> {
  const l = await loadGame({ sync: false });
  if (!l.game) return [{ symbol: "-", ok: false, message: "ยังไม่ได้เริ่มเกม" }];
  const r = await executePlan(getDb(), l.ctx, l.pid);
  revalidateAll();
  return r;
}

export async function executeReviewAction(symbol: string, kind: ReviewAction["kind"]): Promise<ExecResult> {
  const l = await loadGame({ sync: false });
  if (!l.game) return { symbol, ok: false, message: "ยังไม่ได้เริ่มเกม" };
  const r = await executeReview(getDb(), l.ctx, l.pid, symbol, kind);
  revalidateAll();
  return r;
}

// ---------- พอร์ต DCA / Bot เดย์เทรด ----------

export async function saveDcaAction(formData: FormData) {
  const l = await loadGame({ sync: false });
  if (!l.game) return;
  const db = getDb();
  const items = normalizeWeights(parseDcaItems(String(formData.get("items") ?? "")));
  const monthly = Math.max(100, Math.round(Number(formData.get("monthly")) || l.game.startingCash / 12));
  if (items.length === 0) return;
  const prev = getDcaConfig(db, l.game.id);
  ensurePortfolio(db, l.game, "dca");
  setDcaConfig(db, l.game.id, {
    items,
    monthly,
    active: true,
    startedAt: prev?.startedAt ?? l.ctx.today,
    // เปลี่ยนแผนกลางเดือน: เดือนนี้ที่ลงไปแล้วไม่ลงซ้ำ
    done: prev?.done ?? {},
    bank: prev?.bank ?? {},
  });
  await runAutoPortfolios(l.ctx);
  revalidateAll();
}

function parseDcaItems(text: string): { symbol: string; weight: number }[] {
  const out: { symbol: string; weight: number }[] = [];
  for (const line of text.split(/[\n,;]+/)) {
    const m = line.trim().toUpperCase().match(/^([A-Z0-9&.\-^]+)\s*[:=\s]\s*(\d+(?:\.\d+)?)\s*%?$/) ?? line.trim().toUpperCase().match(/^([A-Z0-9&.\-^]+)$/);
    if (!m) continue;
    let sym = m[1];
    const weight = m[2] ? Number(m[2]) : 1;
    if (!sym.includes(".") && findSeed(`${sym}.BK`)) sym = `${sym}.BK`;
    if (!out.some((o) => o.symbol === sym)) out.push({ symbol: sym, weight });
  }
  return out.slice(0, 10);
}

export async function toggleDcaAction() {
  const l = await loadGame({ sync: false });
  if (!l.game) return;
  const c = getDcaConfig(getDb(), l.game.id);
  if (c) setDcaConfig(getDb(), l.game.id, { ...c, active: !c.active });
  revalidateAll();
}

export async function resetDcaAction() {
  const l = await loadGame({ sync: false });
  if (!l.game) return;
  const db = getDb();
  const pid = findPortfolioId(db, l.game.id, "dca");
  if (pid !== null) deletePortfolio(db, pid);
  setDcaConfig(db, l.game.id, null);
  revalidateAll();
}

export async function startDaytradeAction(formData: FormData) {
  const l = await loadGame({ sync: false });
  if (!l.game) return;
  const db = getDb();
  const market = (["TH", "US", "BOTH"].includes(String(formData.get("market"))) ? formData.get("market") : "BOTH") as "TH" | "US" | "BOTH";
  const prev = getDaytradeConfig(db, l.game.id);
  ensurePortfolio(db, l.game, "daytrade");
  setDaytradeConfig(db, l.game.id, { ...DEFAULT_DAYTRADE, ...(prev ?? {}), market, active: true, startedAt: prev?.startedAt ?? l.ctx.today });
  await runAutoPortfolios(l.ctx);
  revalidateAll();
}

export async function toggleDaytradeAction() {
  const l = await loadGame({ sync: false });
  if (!l.game) return;
  const c = getDaytradeConfig(getDb(), l.game.id);
  if (c) setDaytradeConfig(getDb(), l.game.id, { ...c, active: !c.active });
  revalidateAll();
}

export async function resetDaytradeAction() {
  const l = await loadGame({ sync: false });
  if (!l.game) return;
  const db = getDb();
  const pid = findPortfolioId(db, l.game.id, "daytrade");
  if (pid !== null) deletePortfolio(db, pid);
  setDaytradeConfig(db, l.game.id, null);
  revalidateAll();
}
