"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BACKTEST_PRESETS, STARTING_CASH_OPTIONS } from "@/config/app";
import type { FeeConfig } from "@/config/fees";
import { askClaude, aiEnabled } from "@/lib/ai";
import { buildAiContext, CANNED_QA, coachQuestion } from "@/lib/coach";
import { getDb } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import {
  cancelOrder,
  createGame,
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
