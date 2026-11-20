/** ลำดับการทำงานของเกม: Bot, เลื่อนวัน (ย้อนอดีต), sync (เวลาจริง), สรุปผล */
import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import type { FeeConfig } from "@/config/fees";
import { BENCHMARKS, BOT_LONGTERM_PICKS, FX_SYMBOL } from "@/config/seeds";
import { askClaude, aiEnabled } from "@/lib/ai";
import { longTermStrategy } from "@/lib/bot/longterm";
import type { BotStrategy } from "@/lib/bot/strategy";
import { buildAiContext, summaryText } from "@/lib/coach";
import type { DB } from "@/lib/db/client";
import { games, messages, orders, portfolios } from "@/lib/db/schema";
import type { CachedProvider } from "@/lib/prices/cached";
import type { PriceProvider } from "@/lib/prices/types";
import { bangkokDate } from "@/lib/rules/hours";
import { kvGet, kvSet } from "@/lib/settings";
import {
  exchange,
  fxMid,
  getPortfolioId,
  getPortfolioRow,
  loadState,
  makeCtx,
  orderHistory,
  pendingOrders,
  placeOrder,
  processPending,
  snapshot,
  tradable,
  viewPortfolio,
  type Game,
  type GameCtx,
} from "./core";

export function addMessage(db: DB, gameId: number, kind: "bot_trade" | "summary" | "chat_user" | "chat_bot", date: string, text: string) {
  db.insert(messages).values({ gameId, kind, date, text, createdAt: new Date().toISOString() }).run();
}

/** ให้ Bot ตัดสินใจและทำรายการ */
export async function runBot(ctx: GameCtx, strategy: BotStrategy = longTermStrategy): Promise<number> {
  const pid = getPortfolioId(ctx.db, ctx.game.id, "bot");
  const row = getPortfolioRow(ctx.db, pid);
  const fx = await fxMid(ctx);
  const decision = await strategy.decide({
    today: ctx.today,
    provider: ctx.provider, // จำกัดเวลาแล้วในโหมดย้อนอดีต
    state: loadState(ctx.db, pid),
    startingCash: ctx.game.startingCash,
    lastDcaMonth: row.lastDcaMonth,
    fees: ctx.fees,
    fxMid: fx,
    canTrade: async (s) => (await tradable(ctx, s)).ok,
  });

  let trades = 0;
  for (const a of decision.actions) {
    if (a.kind === "exchange") {
      await exchange(ctx, pid, "THB_TO_USD", a.thb);
      continue;
    }
    let explanation = a.explanation;
    if (aiEnabled(ctx.db)) {
      const ai = await askClaude(
        ctx.db,
        "เขียนคำอธิบายแบบสอนให้ผู้เรียน 1–3 ประโยค ว่า Bot (บุคลิกถือยาว) ซื้อขายไม้นี้เพราะอะไร จะทำอย่างไรถ้าราคาลง และไม้นี้สอนเรื่องอะไร ใช้ตัวเลขจากข้อเท็จจริงด้านล่างเท่านั้น",
        `วันที่ ${ctx.today}\nข้อเท็จจริง: ${a.explanation}`,
      );
      if (ai) explanation = ai;
    }
    const r = await placeOrder(
      ctx,
      pid,
      {
        symbol: a.symbol,
        side: a.kind,
        type: "market",
        qty: a.qty,
        amountUsd: a.kind === "buy" ? a.amountUsd : undefined,
        reason: "แผน DCA ของ Bot ถือยาว",
        explanation,
      },
      "bot",
    );
    if (r.ok) {
      trades++;
      addMessage(ctx.db, ctx.game.id, "bot_trade", ctx.today, explanation);
    }
  }
  if (decision.dcaMonth) ctx.db.update(portfolios).set({ lastDcaMonth: decision.dcaMonth }).where(eq(portfolios.id, pid)).run();
  return trades;
}

export async function returns(ctx: GameCtx) {
  const pid = getPortfolioId(ctx.db, ctx.game.id, "player");
  const bid = getPortfolioId(ctx.db, ctx.game.id, "bot");
  const player = await viewPortfolio(ctx, pid);
  const bot = await viewPortfolio(ctx, bid);
  const sc = ctx.game.startingCash;
  return { player, bot, playerReturn: player.valuation.totalThb / sc - 1, botReturn: bot.valuation.totalThb / sc - 1 };
}

export async function writeSummary(ctx: GameCtx): Promise<string> {
  const pid = getPortfolioId(ctx.db, ctx.game.id, "player");
  const r = await returns(ctx);
  const recent = orderHistory(ctx.db, pid, 20).filter((o) => o.createdAt.slice(0, 10) <= ctx.today);
  const input = {
    date: ctx.today,
    playerReturn: r.playerReturn,
    botReturn: r.botReturn,
    valuation: r.player.valuation,
    recentOrders: recent,
    cashRatio: r.player.valuation.totalThb > 0 ? (r.player.valuation.cashThb + r.player.valuation.cashUsdThb) / r.player.valuation.totalThb : 1,
    daysSinceStart: DateTime.fromISO(ctx.today).diff(DateTime.fromISO(ctx.game.startDate), "days").days,
  };
  let text = summaryText(input);
  if (aiEnabled(ctx.db)) {
    const ai = await askClaude(
      ctx.db,
      "สรุปผลของผู้เรียนวันนี้: เทียบผลตอบแทนเป็น % กับ Bot และชี้จุดที่ควรปรับ 1 ข้อ (ไม่เกิน 3 ประโยค)",
      buildAiContext({ mode: ctx.mode, today: ctx.today, startingCash: ctx.game.startingCash, valuation: r.player.valuation, botReturn: r.botReturn, recentOrders: recent }),
    );
    if (ai) text = `สรุปวันที่ ${ctx.today}: ${ai}`;
  }
  addMessage(ctx.db, ctx.game.id, "summary", ctx.today, text);
  ctx.db.update(games).set({ lastSummaryKey: ctx.today }).where(eq(games.id, ctx.game.id)).run();
  return text;
}

/** สัญลักษณ์ที่ต้องมีราคาย้อนหลังในเกมนี้ */
function gameSymbols(db: DB, game: Game): string[] {
  const set = new Set<string>([...BOT_LONGTERM_PICKS, BENCHMARKS.SET, BENCHMARKS.SP500, FX_SYMBOL]);
  for (const owner of ["player", "bot"] as const) {
    const pid = getPortfolioId(db, game.id, owner);
    for (const p of loadState(db, pid).positions) set.add(p.symbol);
    for (const o of pendingOrders(db, pid)) set.add(o.symbol);
  }
  return [...set];
}

/** วันสุดท้ายที่เลื่อนไปได้ในโหมดย้อนอดีต (เมื่อวานตามเวลาไทย) */
export function maxSimDate(now = new Date()): string {
  return DateTime.fromISO(bangkokDate(now)).minus({ days: 1 }).toISODate()!;
}

/** ดึงราคาย้อนหลังเก็บ cache ไว้ล่วงหน้า (เก็บใน DB เท่านั้น ข้อมูลที่ผ่านไปถึงหน้าจอ/Bot ยังถูกกรองด้วย TimeBoundedProvider) */
export async function prefetch(base: CachedProvider, symbols: string[], from: string, now = new Date()) {
  const to = bangkokDate(now);
  await Promise.all(symbols.map((s) => base.ensureDaily(s, from, to)));
}

export async function startBacktest(db: DB, base: CachedProvider, game: Game, fees: FeeConfig, now = new Date()) {
  const from = DateTime.fromISO(game.startDate).minus({ days: 400 }).toISODate()!;
  await prefetch(base, gameSymbols(db, game), from, now);
  const ctx = makeCtx(db, game, base, fees, now);
  await runBot(ctx);
  await snapshot(ctx, getPortfolioId(db, game.id, "player"));
  await snapshot(ctx, getPortfolioId(db, game.id, "bot"));
}

export type Step = "day" | "week" | "month";

export async function advanceBacktest(db: DB, base: CachedProvider, gameId: number, step: Step, fees: FeeConfig, now = new Date()) {
  const game = db.select().from(games).where(eq(games.id, gameId)).get();
  if (!game || game.mode !== "backtest") return { ok: false as const, error: "ไม่พบเกมโหมดย้อนอดีต" };
  const cur = DateTime.fromISO(game.simDate!);
  const max = maxSimDate(now);
  if (game.simDate! >= max) return { ok: false as const, error: "ถึงวันปัจจุบันแล้ว เลื่อนต่อไม่ได้" };

  let target: DateTime;
  if (step === "day") {
    target = cur.plus({ days: 1 });
    while (target.weekday > 5) target = target.plus({ days: 1 });
  } else target = step === "week" ? cur.plus({ weeks: 1 }) : cur.plus({ months: 1 });
  let targetIso = target.toISODate()!;
  if (targetIso > max) targetIso = max;

  await prefetch(base, gameSymbols(db, game), cur.minus({ days: 30 }).toISODate()!, now);
  const pid = getPortfolioId(db, game.id, "player");
  const bid = getPortfolioId(db, game.id, "bot");

  let filled = 0;
  for (let d = cur.plus({ days: 1 }); d.toISODate()! <= targetIso; d = d.plus({ days: 1 })) {
    if (d.weekday > 5) continue;
    const day = d.toISODate()!;
    const ctx = makeCtx(db, game, base, fees, now, day);
    filled += await processPending(ctx, pid);
    await processPending(ctx, bid);
    await runBot(ctx);
    await snapshot(ctx, pid);
    await snapshot(ctx, bid);
  }
  db.update(games).set({ simDate: targetIso }).where(eq(games.id, game.id)).run();
  const fresh = db.select().from(games).where(eq(games.id, game.id)).get()!;
  const summary = await writeSummary(makeCtx(db, fresh, base, fees, now));
  return { ok: true as const, simDate: targetIso, filled, summary };
}

/** โหมดเวลาจริง: ตรวจคำสั่งค้าง, ให้ Bot ทำงาน, บันทึกมูลค่า, สรุปหลังตลาดปิด (ทำไม่เกินนาทีละครั้ง) */
export async function syncLive(db: DB, base: PriceProvider, game: Game, fees: FeeConfig, now = new Date()) {
  const key = `live_sync:${game.id}`;
  const last = kvGet<number>(db, key, 0);
  if (now.getTime() - last < 60_000) return;
  kvSet(db, key, now.getTime());
  const ctx = makeCtx(db, game, base, fees, now);
  const pid = getPortfolioId(db, game.id, "player");
  const bid = getPortfolioId(db, game.id, "bot");
  try {
    await processPending(ctx, pid);
    await processPending(ctx, bid);
    await runBot(ctx);
    await snapshot(ctx, pid);
    await snapshot(ctx, bid);
    const bkk = DateTime.fromJSDate(now).setZone("Asia/Bangkok");
    const afterClose = bkk.hour * 60 + bkk.minute >= 16 * 60 + 30 && bkk.weekday <= 5;
    if (afterClose && game.lastSummaryKey !== ctx.today) await writeSummary(ctx);
  } catch (e) {
    console.warn("[sync] ไม่สำเร็จ", (e as Error).message);
  }
}

export function playerFilledCount(db: DB, pid: number): number {
  return db.select().from(orders).where(and(eq(orders.portfolioId, pid), eq(orders.status, "filled"))).all().length;
}
