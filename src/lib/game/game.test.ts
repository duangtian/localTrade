import { beforeEach, describe, expect, it } from "vitest";
import type { FeeConfig } from "@/config/fees";
import { BENCHMARKS, BOT_LONGTERM_PICKS, FX_SYMBOL } from "@/config/seeds";
import type { BotStrategy } from "@/lib/bot/strategy";
import { openDb, type DB } from "@/lib/db/client";
import { CachedProvider } from "@/lib/prices/cached";
import { FakeProvider } from "@/lib/prices/fake";
import {
  createGame,
  exchange,
  getPortfolioId,
  getSnapshots,
  makeCtx,
  orderHistory,
  placeOrder,
  viewPortfolio,
} from "./core";
import { advanceBacktest, runBot, startBacktest } from "./flow";

const FEES: FeeConfig = {
  asOf: "2026-01-01",
  th: { commissionRate: 0.001, minCommissionThb: 0, vatRate: 0 },
  us: { commissionRate: 0, minCommissionUsd: 0, vatRate: 0 },
  fx: { spreadRate: 0 },
};
const NOW = new Date("2020-06-30T05:00:00Z");

function setup() {
  const base: Record<string, number> = { [BENCHMARKS.SET]: 1500, [BENCHMARKS.SP500]: 3200, [FX_SYMBOL]: 30 };
  for (const s of BOT_LONGTERM_PICKS) base[s] = s.endsWith(".BK") ? 20 : 100;
  base["PTT.BK"] = 30;
  base["AAPL"] = 200;
  const fake = new FakeProvider({ start: "2020-01-01", days: 200, base, path: { [FX_SYMBOL]: Array(200).fill(30) } });
  const db = openDb(":memory:");
  const cached = new CachedProvider(fake, db, () => NOW);
  return { fake, db, cached };
}

let env: ReturnType<typeof setup>;
beforeEach(() => {
  env = setup();
});

async function closeOn(fake: FakeProvider, symbol: string, date: string) {
  const bars = await fake.getHistory(symbol, date, date, "1d");
  return bars[0]?.close;
}

describe("โหมดย้อนอดีต: ไม่รั่วข้อมูลอนาคต", () => {
  it("Bot ได้ provider ที่ถูกจำกัดเวลา แม้จะขอข้อมูลถึงปี 2100", async () => {
    const { db, cached } = env;
    const game = createGame(db, "backtest", 100_000, "2020-02-03", NOW);
    let maxSeen = "";
    const spy: BotStrategy = {
      id: "spy",
      name: "spy",
      description: "",
      async decide(ctx) {
        const bars = await ctx.provider.getHistory("MSFT", "2000-01-01", "2100-01-01", "1d");
        maxSeen = bars[bars.length - 1].date;
        const q = await ctx.provider.getQuote("MSFT");
        expect(q.time <= ctx.today).toBe(true);
        return { actions: [] };
      },
    };
    await runBot(makeCtx(db, game, cached, FEES, NOW), spy);
    expect(maxSeen).toBe("2020-02-03");
  });

  it("Bot ถือยาวซื้อที่ราคาปิดของวันจำลอง และทุกรายการไม่เกินวันจำลอง", async () => {
    const { db, cached, fake } = env;
    const game = createGame(db, "backtest", 100_000, "2020-02-03", NOW);
    await startBacktest(db, cached, game, FEES, NOW);
    const bid = getPortfolioId(db, game.id, "bot");
    const bot = orderHistory(db, bid).filter((o) => o.status === "filled" && o.side === "buy");
    expect(bot.length).toBeGreaterThan(0);
    for (const o of bot) {
      expect(o.filledAt).toBe("2020-02-03");
      expect(o.fillPrice).toBe(await closeOn(fake, o.symbol, "2020-02-03"));
      expect(o.explanation && o.explanation.length).toBeGreaterThan(20);
    }

    const r = await advanceBacktest(db, cached, game.id, "month", FEES, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.simDate).toBe("2020-03-03");
    for (const o of orderHistory(db, bid)) expect((o.filledAt ?? o.createdAt) <= r.simDate).toBe(true);
    for (const s of getSnapshots(db, bid)) expect(s.date <= r.simDate).toBe(true);
    // DCA เดือนใหม่ (มีนาคม) เกิดขึ้นแล้ว
    expect(orderHistory(db, bid).some((o) => o.filledAt?.startsWith("2020-03"))).toBe(true);
    // Bot กระจายอย่างน้อย 4 กลุ่มหลัง 2 เดือน
    const st = await viewPortfolio(makeCtx(db, { ...game, simDate: r.simDate }, cached, FEES, NOW), bid);
    expect(st.valuation.holdings.length).toBeGreaterThanOrEqual(4);
  });

  it("มูลค่าพอร์ตในหน้าจอใช้ราคาของวันจำลอง ไม่ใช่ราคาล่าสุด", async () => {
    const { db, cached, fake } = env;
    const game = createGame(db, "backtest", 10_000, "2020-02-03", NOW);
    const ctx = makeCtx(db, game, cached, FEES, NOW);
    const pid = getPortfolioId(db, game.id, "player");
    const r = await placeOrder(ctx, pid, { symbol: "PTT.BK", side: "buy", type: "market", qty: 100, reason: "ทดสอบซื้อหุ้นพลังงาน" });
    expect(r.ok).toBe(true);
    const v = await viewPortfolio(ctx, pid);
    const close = await closeOn(fake, "PTT.BK", "2020-02-03");
    expect(v.valuation.holdings[0].price).toBe(close);
    expect(v.quotes["PTT.BK"].time).toBe("2020-02-03");
    const latest = (await fake.getQuote("PTT.BK")).price;
    expect(latest).not.toBe(close);
  });
});

describe("คำสั่งซื้อขายในเกม", () => {
  it("ต้องเขียนเหตุผลอย่างน้อย 10 ตัวอักษร", async () => {
    const { db, cached } = env;
    const game = createGame(db, "backtest", 10_000, "2020-02-03", NOW);
    const r = await placeOrder(makeCtx(db, game, cached, FEES, NOW), getPortfolioId(db, game.id, "player"), {
      symbol: "PTT.BK",
      side: "buy",
      type: "market",
      qty: 100,
      reason: "สั้นไป",
    });
    expect(r.ok).toBe(false);
  });

  it("Limit ค้างไว้ แล้ว match วันถัดไปด้วย low ของวัน", async () => {
    const { db, cached, fake } = env;
    const game = createGame(db, "backtest", 10_000, "2020-02-03", NOW);
    const pid = getPortfolioId(db, game.id, "player");
    const close = (await closeOn(fake, "PTT.BK", "2020-02-03"))!;
    // ราคาวันถัดไป = close × 1.01, low = × 0.98 → ตั้ง limit ที่ close (ตรง tick 0.05)
    const limit = Math.round(close * 20) / 20;
    const r = await placeOrder(makeCtx(db, game, cached, FEES, NOW), pid, { symbol: "PTT.BK", side: "buy", type: "limit", qty: 100, limitPrice: limit, reason: "รอซื้อเมื่อราคาย่อลงมา" });
    expect(r.ok && r.status).toBe("pending");
    await advanceBacktest(db, cached, game.id, "day", FEES, NOW);
    const o = orderHistory(db, pid)[0];
    expect(o.status).toBe("filled");
    expect(o.filledAt).toBe("2020-02-04");
    expect(o.fillPrice).toBeLessThanOrEqual(limit);
  });

  it("หุ้นไทยต้องเป็น lot 100 และ limit ต้องตรง tick", async () => {
    const { db, cached } = env;
    const game = createGame(db, "backtest", 10_000, "2020-02-03", NOW);
    const ctx = makeCtx(db, game, cached, FEES, NOW);
    const pid = getPortfolioId(db, game.id, "player");
    expect((await placeOrder(ctx, pid, { symbol: "PTT.BK", side: "buy", type: "market", qty: 50, reason: "ทดสอบ lot ไม่ครบ" })).ok).toBe(false);
    expect((await placeOrder(ctx, pid, { symbol: "PTT.BK", side: "buy", type: "limit", qty: 100, limitPrice: 30.33, reason: "ทดสอบ tick ไม่ตรง" })).ok).toBe(false);
  });

  it("หุ้นสหรัฐฯ เศษหุ้นผ่านกระเป๋า USD และมูลค่าพอร์ตถูกต้อง", async () => {
    const { db, cached, fake } = env;
    const game = createGame(db, "backtest", 10_000, "2020-02-03", NOW);
    const ctx = makeCtx(db, game, cached, FEES, NOW);
    const pid = getPortfolioId(db, game.id, "player");
    // ยังไม่มี USD → ซื้อไม่ได้
    expect((await placeOrder(ctx, pid, { symbol: "AAPL", side: "buy", type: "market", amountUsd: 50, reason: "ซื้อ Apple ระยะยาว" })).ok).toBe(false);
    const ex = await exchange(ctx, pid, "THB_TO_USD", 3000);
    expect(ex.ok && ex.usd).toBe(100);
    const r = await placeOrder(ctx, pid, { symbol: "AAPL", side: "buy", type: "market", amountUsd: 50, reason: "ซื้อ Apple ระยะยาว" });
    expect(r.ok).toBe(true);
    const px = (await closeOn(fake, "AAPL", "2020-02-03"))!;
    const v = await viewPortfolio(ctx, pid);
    const h = v.valuation.holdings[0];
    expect(h.qty).toBeCloseTo(50 / px, 5);
    expect(v.valuation.cashUsd).toBe(50);
    expect(v.valuation.cashThb).toBe(7000);
    expect(v.valuation.totalThb).toBeCloseTo(7000 + 50 * 30 + h.qty * px * 30, 1);
  });
});

describe("AI จัดพอร์ต: เสนอแผน → ยืนยัน → ส่งคำสั่งจริง (โหมดย้อนอดีต)", () => {
  it("แผนซื้อได้จริง ไม่ใช้เงินเกิน มี stop-loss และติดป้าย [แผน AI]", async () => {
    const { buildPlan, executePlan, getPlan } = await import("@/lib/analysis/planner");
    const { AI_PLAN_PREFIX } = await import("@/lib/analysis/allocate");
    // ราคาสมจริง: แนวโน้มขึ้นช้า ๆ + แกว่งขึ้นลงรายวัน (ถ้าขึ้นทุกวัน RSI = 100 จะถูกคัดออก)
    const syms = ["PTT.BK", "KBANK.BK", "CPALL.BK", "ADVANC.BK", "BDMS.BK", "AAPL", "MSFT", "KO", "JNJ"];
    const days = 420;
    const wave = (b0: number, k: number) => Array.from({ length: days }, (_, i) => +(b0 * Math.pow(1.002, i) * (1 + 0.03 * Math.sin(i / 2 + k))).toFixed(2));
    const base: Record<string, number> = { [FX_SYMBOL]: 30, [BENCHMARKS.SET]: 1500, [BENCHMARKS.SP500]: 3000 };
    const path: Record<string, number[]> = { [FX_SYMBOL]: Array(days).fill(30) };
    syms.forEach((s, k) => {
      base[s] = s.endsWith(".BK") ? 20 + k : 80 + k * 10;
      path[s] = wave(base[s], k);
    });
    const fake = new FakeProvider({ start: "2019-01-01", days, base, path });
    const db = openDb(":memory:");
    const cached = new CachedProvider(fake, db, () => NOW);
    // ราคาปลอมมีถึงราว ก.พ. 2020 จึงเริ่มเกมในช่วงที่มีข้อมูล
    const game = createGame(db, "backtest", 100_000, "2019-12-02", NOW);
    const ctx = makeCtx(db, game, cached, FEES, NOW);
    const pid = getPortfolioId(db, game.id, "player");

    const plan = await buildPlan(db, ctx, pid, { market: "BOTH", maxPositions: 4, usePct: 0.8 });
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items.every((i) => i.orderType === "market")).toBe(true);
    expect(plan.usedThb).toBeLessThanOrEqual(plan.budgetThb + 1);
    // ข้อมูลที่ใช้ต้องถึงวันจำลองเท่านั้น
    expect(plan.today).toBe(ctx.today);
    for (const it of plan.items) expect(it.stop).toBeLessThan(it.price);

    const res = await executePlan(db, ctx, pid);
    expect(res.every((r) => r.ok)).toBe(true);
    expect(getPlan(db, ctx)).toBeNull(); // ใช้แล้วหมดไป กดซ้ำไม่ได้
    const placed = orderHistory(db, pid).filter((o) => o.side === "buy");
    expect(placed.length).toBe(plan.items.length);
    for (const o of placed) {
      expect(o.reason.startsWith(AI_PLAN_PREFIX)).toBe(true);
      expect(o.stopLoss).not.toBeNull();
    }
    const v = await viewPortfolio(ctx, pid);
    expect(v.state.cashThb).toBeGreaterThanOrEqual(0);
  });
});
