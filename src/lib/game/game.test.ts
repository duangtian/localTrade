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

    const plan = await buildPlan(db, ctx, pid, { style: "long", market: "BOTH", maxPositions: 4, usePct: 0.8 });
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

describe("พอร์ตอัตโนมัติในโหมดย้อนอดีต (DCA + เดย์เทรด)", () => {
  it("DCA ซื้อทุกเดือน, เดย์เทรดไม่ถือข้ามคืน และไม่ใช้ราคาหลังวันจำลอง", async () => {
    const { setDcaConfig, setDaytradeConfig } = await import("./auto");
    const { DEFAULT_DAYTRADE } = await import("@/lib/bot/daytrade");
    const { ensurePortfolio, loadState: ls } = await import("./core");
    const syms = ["PTT.BK", "KBANK.BK", "AOT.BK", "CPALL.BK", "DELTA.BK", "ADVANC.BK", "SCB.BK", "AAPL", "MSFT", "NVDA", "TSLA", "AMD", "AMZN"];
    const days = 420;
    // ราคาขึ้นช้า ๆ + แกว่ง และ gap เปิดสูงทุกวันจันทร์ (ให้มีสัญญาณเข้า)
    const base: Record<string, number> = { [FX_SYMBOL]: 30, [BENCHMARKS.SET]: 1500, [BENCHMARKS.SP500]: 3000 };
    for (const s of BOT_LONGTERM_PICKS) base[s] = 20;
    const path: Record<string, number[]> = { [FX_SYMBOL]: Array(days).fill(30) };
    syms.forEach((s, k) => {
      base[s] = s.endsWith(".BK") ? 20 + k : 80 + k * 10;
      path[s] = Array.from({ length: days }, (_, i) => +(base[s] * Math.pow(1.002, i) * (1 + 0.02 * Math.sin(i / 2 + k))).toFixed(2));
    });
    const fake = new FakeProvider({ start: "2019-01-01", days, base, path });
    const db = openDb(":memory:");
    const cached = new CachedProvider(fake, db, () => NOW);
    const game = createGame(db, "backtest", 100_000, "2019-11-04", NOW);
    const dcaPid = ensurePortfolio(db, game, "dca");
    const dtPid = ensurePortfolio(db, game, "daytrade");
    setDcaConfig(db, game.id, { items: [{ symbol: "PTT.BK", weight: 0.5 }, { symbol: "AAPL", weight: 0.5 }], monthly: 10_000, active: true, startedAt: game.startDate, done: {}, bank: {} });
    setDaytradeConfig(db, game.id, { ...DEFAULT_DAYTRADE, gapPct: 0.001, startedAt: game.startDate });

    await startBacktest(db, cached, game, FEES, NOW);
    await advanceBacktest(db, cached, game.id, "month", FEES, NOW);
    await advanceBacktest(db, cached, game.id, "month", FEES, NOW);

    const dcaBuys = orderHistory(db, dcaPid, 500).filter((o) => o.side === "buy" && o.status === "filled");
    const months = new Set(dcaBuys.filter((o) => o.symbol === "AAPL").map((o) => o.createdAt.slice(0, 7)));
    expect(months.size).toBe(3); // พ.ย. ธ.ค. ม.ค.
    expect(ls(db, dcaPid).positions.length).toBe(2);

    // เดย์เทรด: ทุกไม้ซื้อและขายในวันเดียวกัน ไม่เหลือหุ้นข้ามคืน
    const dt = orderHistory(db, dtPid, 2000).filter((o) => o.status === "filled");
    expect(dt.length).toBeGreaterThan(0);
    const byDay = new Map<string, number>();
    for (const o of dt) byDay.set(`${o.createdAt}|${o.symbol}`, (byDay.get(`${o.createdAt}|${o.symbol}`) ?? 0) + (o.side === "buy" ? o.fillQty! : -o.fillQty!));
    for (const v of byDay.values()) expect(Math.abs(v)).toBeLessThan(1e-6);
    expect(ls(db, dtPid).positions).toEqual([]);
    // ไม่มีคำสั่งหลังวันจำลอง
    const sim = db.select().from((await import("@/lib/db/schema")).games).all().find((g) => g.id === game.id)!.simDate!;
    for (const o of [...dt, ...dcaBuys]) expect(o.createdAt <= sim).toBe(true);
  });
});

describe("AI จัดพอร์ตสไตล์เดย์เทรด (โหมดย้อนอดีต)", () => {
  it("ยืนยันแล้วจำลองทั้งวัน: ซื้อที่ราคาเปิด ขายในวันเดียวกัน ไม่เหลือหุ้น", async () => {
    const { buildPlan, executePlan } = await import("@/lib/analysis/planner");
    const { DT_UNIVERSE } = await import("@/lib/bot/daytrade");
    const days = 420;
    const base: Record<string, number> = { [FX_SYMBOL]: 30 };
    const path: Record<string, number[]> = { [FX_SYMBOL]: Array(days).fill(30) };
    DT_UNIVERSE.forEach((s, k) => {
      base[s] = s.endsWith(".BK") ? 20 + k : 80 + k * 10;
      path[s] = Array.from({ length: days }, (_, i) => +(base[s] * Math.pow(1.008, i)).toFixed(2)); // ขึ้นวันละ 0.8%
    });
    // ราคาเปิด = ราคาปิดเมื่อวาน × ~1.007 (gap up) ระหว่างวันแกว่ง ±1% ไม่แตะ stop/เป้า → ขายที่ราคาปิด
    const fake = new FakeProvider({ start: "2019-01-01", days, base, path });
    const gappy = {
      ...fake,
      name: "gappy",
      getQuote: fake.getQuote.bind(fake),
      getQuotes: fake.getQuotes.bind(fake),
      getFxRate: fake.getFxRate.bind(fake),
      getHistory: async (s: string, f: string, t: string, i: "1d" | "5m") =>
        (await fake.getHistory(s, f, t, i)).map((b) => (s === FX_SYMBOL ? b : { ...b, open: +(b.close * 0.999).toFixed(2), low: +(b.close * 0.99).toFixed(2), high: +(b.close * 1.01).toFixed(2) })),
    };
    const db = openDb(":memory:");
    const cached = new CachedProvider(gappy as never, db, () => NOW);
    const game = createGame(db, "backtest", 100_000, "2019-12-02", NOW);
    const ctx = makeCtx(db, game, cached, FEES, NOW);
    const pid = getPortfolioId(db, game.id, "player");
    const plan = await buildPlan(db, ctx, pid, { style: "day", market: "TH", maxPositions: 3, usePct: 0.6 });
    expect(plan.items.length).toBeGreaterThan(0);
    const res = await executePlan(db, ctx, pid);
    expect(res.every((r) => r.ok)).toBe(true);
    const v = await viewPortfolio(ctx, pid);
    expect(v.state.positions).toEqual([]);
    const fills = orderHistory(db, pid).filter((o) => o.status === "filled");
    expect(fills.filter((o) => o.side === "buy").length).toBe(plan.items.length);
    expect(fills.filter((o) => o.side === "sell").length).toBe(plan.items.length);
  });
});

describe("สแกนเบื้องหลัง: เลือกดัชนีที่ต้องสแกน", () => {
  it("โหมดย้อนอดีต: สแกนดัชนีที่ยังไม่มีผลของวันจำลอง (ยกเว้น S&P 500) แล้วไม่สแกนซ้ำ", async () => {
    const { dueUniverses } = await import("@/lib/analysis/background");
    const { runScan } = await import("@/lib/analysis/screen");
    const { getIndexStocks } = await import("@/lib/indices");
    const { db, cached } = env;
    const game = createGame(db, "backtest", 100_000, "2020-03-02", NOW);
    const ctx = makeCtx(db, game, cached, FEES, NOW);
    const due = dueUniverses(ctx);
    expect(due).toContain("set50");
    expect(due).not.toContain("sp500");
    expect(due).not.toContain("set100"); // ยังไม่มีรายชื่อ
    await runScan(db, ctx, "set50", getIndexStocks(db, "set50").stocks.slice(0, 3));
    expect(dueUniverses(ctx)).not.toContain("set50");
    // เลื่อนวัน = ต้องสแกนใหม่
    const next = makeCtx(db, game, cached, FEES, NOW, "2020-03-03");
    expect(dueUniverses(next)).toContain("set50");
  });
});
