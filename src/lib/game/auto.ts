/**
 * พอร์ตอัตโนมัติ: พอร์ต DCA และ Bot เดย์เทรด (เปิดใช้จากหน้าของแต่ละพอร์ต)
 * ทำงานทุกครั้งที่ Bot ถือยาวทำงาน: เริ่ม/เลื่อนวันในโหมดย้อนอดีต และ sync ในโหมดเวลาจริง
 * ข้อมูลทั้งหมดผ่าน ctx.provider (โหมดย้อนอดีตถูกจำกัดเวลา)
 */
import { DateTime } from "luxon";
import { decideDca, type DcaConfig } from "@/lib/bot/dca";
import { DEFAULT_DAYTRADE, DT_UNIVERSE, entrySignal, liveDecide, simulateDay, type DaytradeConfig } from "@/lib/bot/daytrade";
import type { DB } from "@/lib/db/client";
import { buyUsdRate } from "@/lib/rules/fees";
import { exchangeDate } from "@/lib/rules/hours";
import { kvGet, kvSet } from "@/lib/settings";
import {
  exchange,
  findPortfolioId,
  fxMid,
  loadState,
  placeOrder,
  processPending,
  recordFill,
  snapshot,
  tradable,
  viewPortfolio,
  type Game,
  type GameCtx,
} from "./core";

// ---------- config ----------

export const dcaKey = (gameId: number) => `dca:${gameId}`;
export const dtKey = (gameId: number) => `daytrade:${gameId}`;

export function getDcaConfig(db: DB, gameId: number): DcaConfig | null {
  return kvGet<DcaConfig | null>(db, dcaKey(gameId), null);
}
export function setDcaConfig(db: DB, gameId: number, c: DcaConfig | null) {
  kvSet(db, dcaKey(gameId), c);
}
export function getDaytradeConfig(db: DB, gameId: number): DaytradeConfig | null {
  const c = kvGet<DaytradeConfig | null>(db, dtKey(gameId), null);
  return c ? { ...DEFAULT_DAYTRADE, ...c } : null;
}
export function setDaytradeConfig(db: DB, gameId: number, c: DaytradeConfig | null) {
  kvSet(db, dtKey(gameId), c);
}

/** หุ้นที่พอร์ตอัตโนมัติใช้ (สำหรับดึงราคาล่วงหน้าในโหมดย้อนอดีต) */
export function autoSymbols(db: DB, game: Game): string[] {
  const out = new Set<string>();
  const dca = getDcaConfig(db, game.id);
  if (dca?.active) dca.items.forEach((i) => out.add(i.symbol));
  const dt = getDaytradeConfig(db, game.id);
  if (dt?.active) dtUniverse(dt).forEach((s) => out.add(s));
  return [...out];
}

function dtUniverse(c: DaytradeConfig) {
  return DT_UNIVERSE.filter((s) => (c.market === "BOTH" ? true : c.market === "TH" ? s.endsWith(".BK") : !s.endsWith(".BK")));
}

/** id ของพอร์ตอัตโนมัติที่มีอยู่ (ใช้ตรวจคำสั่งค้าง/บันทึกมูลค่า) */
export function autoPortfolioIds(db: DB, gameId: number): number[] {
  return (["dca", "daytrade"] as const).map((o) => findPortfolioId(db, gameId, o)).filter((x): x is number => x !== null);
}

// ---------- DCA ----------

export async function runDca(ctx: GameCtx): Promise<number> {
  const cfg = getDcaConfig(ctx.db, ctx.game.id);
  const pid = findPortfolioId(ctx.db, ctx.game.id, "dca");
  if (!cfg?.active || pid === null || ctx.today < cfg.startedAt) return 0;
  const state = loadState(ctx.db, pid);
  const prices: Record<string, number | undefined> = {};
  const canTrade: Record<string, boolean> = {};
  for (const it of cfg.items) {
    canTrade[it.symbol] = (await tradable(ctx, it.symbol)).ok;
    if (canTrade[it.symbol]) prices[it.symbol] = await ctx.provider.getQuote(it.symbol).then((q) => q.price).catch(() => undefined);
  }
  const mid = await fxMid(ctx).catch(() => 0);
  const d = decideDca({ config: cfg, today: ctx.today, cashThb: state.cashThb, cashUsd: state.cashUsd, prices, canTrade, fxMid: mid, fees: ctx.fees });
  let n = 0;
  for (const a of d.actions) {
    if (a.kind === "exchange") {
      await exchange(ctx, pid, "THB_TO_USD", a.thb);
      continue;
    }
    const r = await placeOrder(ctx, pid, { symbol: a.symbol, side: "buy", type: "market", qty: a.qty, amountUsd: a.amountUsd, reason: `แผน DCA: ${a.note}` }, "bot");
    if (r.ok) n++;
  }
  setDcaConfig(ctx.db, ctx.game.id, d.config);
  return n;
}

// ---------- เดย์เทรด ----------

async function sizeFor(ctx: GameCtx, pid: number, symbol: string, price: number, cfg: DaytradeConfig) {
  const v = await viewPortfolio(ctx, pid);
  const budget = v.valuation.totalThb * cfg.positionPct;
  if (symbol.endsWith(".BK")) {
    const lots = Math.floor(Math.min(budget, v.state.cashThb) / (price * 100 * 1.01));
    return lots > 0 ? { qty: lots * 100 } : null;
  }
  const mid = await fxMid(ctx).catch(() => 0);
  if (!(mid > 0)) return null;
  const fxBuy = buyUsdRate(ctx.fees, mid);
  const usd = Math.floor((budget / fxBuy) * 0.98 * 100) / 100;
  if (usd < 1) return null;
  if (v.state.cashUsd < usd * 1.01) {
    const thb = Math.min(v.state.cashThb, Math.ceil((usd * 1.01 - v.state.cashUsd) * fxBuy * 100) / 100);
    if (thb > 0) await exchange(ctx, pid, "THB_TO_USD", thb);
  }
  const cashUsd = loadState(ctx.db, pid).cashUsd;
  const amount = Math.min(usd, Math.floor((cashUsd / 1.01) * 100) / 100);
  return amount >= 1 ? { amountUsd: amount } : null;
}

/** โหมดย้อนอดีต: เข้าตอนเปิด ออกภายในวันเดียวกัน (จำลองจากแท่งรายวันของวันจำลอง) */
async function daytradeBacktest(ctx: GameCtx, pid: number, cfg: DaytradeConfig): Promise<number> {
  const from = DateTime.fromISO(ctx.today).minus({ days: 60 }).toISODate()!;
  const yesterday = DateTime.fromISO(ctx.today).minus({ days: 1 }).toISODate()!;
  const signals = [];
  for (const s of dtUniverse(cfg)) {
    const today = await ctx.bounded!.barOn(s, ctx.today).catch(() => null);
    if (!today) continue; // ตลาดปิดวันนั้น
    const past = await ctx.provider.getHistory(s, from, yesterday, "1d").catch(() => []);
    const sig = entrySignal(s, past, today.open, cfg);
    if (sig) signals.push({ sig, today });
  }
  signals.sort((a, b) => b.sig.gap - a.sig.gap);
  let n = 0;
  for (const { sig, today } of signals.slice(0, cfg.maxPositions)) {
    const size = await sizeFor(ctx, pid, sig.symbol, today.open, cfg);
    if (!size) continue;
    const buy = await recordFill(ctx, pid, { symbol: sig.symbol, side: "buy", ...size, price: today.open, reason: `เดย์เทรด: เข้าซื้อตอนเปิด · ${sig.why}` });
    if (!buy.ok) continue;
    const out = simulateDay(sig.symbol, today, cfg);
    const qty = loadState(ctx.db, pid).positions.find((p) => p.symbol === sig.symbol)?.qty ?? 0;
    await recordFill(ctx, pid, { symbol: sig.symbol, side: "sell", qty, price: out.exit, reason: `เดย์เทรด: ${out.why}` });
    n += 2;
  }
  return n;
}

/**
 * นาทีนับจากเปิด "รอบปัจจุบัน" และนาทีก่อนปิดตลาดของวัน
 * ตลาดไทยมี 2 รอบ (10:00 และ 14:30) → รอบบ่ายนับ opening range ใหม่
 */
export function minutesInfo(symbol: string, now: Date) {
  const th = symbol.endsWith(".BK");
  const t = DateTime.fromJSDate(now).setZone(th ? "Asia/Bangkok" : "America/New_York");
  const m = t.hour * 60 + t.minute;
  const open = th ? (m >= 14 * 60 + 30 ? 14 * 60 + 30 : 10 * 60) : 9 * 60 + 30;
  const close = th ? 16 * 60 + 30 : 16 * 60;
  return { sinceOpen: m - open, toClose: close - m, sessionOpenMin: open };
}

/** เฉพาะแท่ง 5 นาทีของรอบปัจจุบัน (เวลาท้องถิ่นของตลาด) */
export function sessionBars<T extends { date: string }>(symbol: string, bars: T[], sessionOpenMin: number): T[] {
  const zone = symbol.endsWith(".BK") ? "Asia/Bangkok" : "America/New_York";
  return bars.filter((b) => {
    const t = DateTime.fromISO(b.date).setZone(zone);
    return t.hour * 60 + t.minute >= sessionOpenMin;
  });
}

/** โหมดเวลาจริง: ใช้แท่ง 5 นาทีของวันนี้ (ทำงานเมื่อมีการเปิดหน้าเว็บ ≥ 1 นาที/ครั้ง) */
async function daytradeLive(ctx: GameCtx, pid: number, cfg: DaytradeConfig): Promise<number> {
  if (cfg.traded.date !== ctx.today) cfg.traded = { date: ctx.today, symbols: [] };
  const state = loadState(ctx.db, pid);
  let n = 0;
  const symbols = new Set([...dtUniverse(cfg), ...state.positions.map((p) => p.symbol)]);
  for (const s of symbols) {
    if (!(await tradable(ctx, s)).ok) continue;
    const holding = state.positions.find((p) => p.symbol === s) ?? null;
    if (!holding && state.positions.length >= cfg.maxPositions) continue;
    try {
      const quote = await ctx.provider.getQuote(s);
      const market = s.endsWith(".BK") ? "TH" : "US";
      const intraday = await ctx.provider.getHistory(s, DateTime.fromISO(ctx.today).minus({ days: 5 }).toISODate()!, ctx.today, "5m");
      const day = exchangeDate(market, ctx.now);
      const mi0 = minutesInfo(s, ctx.now);
      const bars = sessionBars(s, intraday.filter((b) => exchangeDate(market, new Date(b.date)) === day), mi0.sessionOpenMin);
      const daily = holding ? [] : await ctx.provider.getHistory(s, DateTime.fromISO(ctx.today).minus({ days: 45 }).toISODate()!, ctx.today, "1d");
      const closes = daily.filter((b) => b.date < day).map((b) => b.close);
      const ma20 = closes.length >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
      const mi = minutesInfo(s, ctx.now);
      const d = liveDecide({
        bars,
        price: quote.price,
        prevClose: quote.prevClose,
        ma20,
        holding: holding ? { entry: holding.avgCost, openedToday: holding.openedAt === ctx.today } : null,
        tradedToday: cfg.traded.symbols.includes(s),
        minutesSinceOpen: mi.sinceOpen,
        minutesToClose: mi.toClose,
        cfg,
      });
      if (!d) continue;
      if (d.action === "buy") {
        const size = await sizeFor(ctx, pid, s, quote.price, cfg);
        if (!size) continue;
        const r = await placeOrder(ctx, pid, { symbol: s, side: "buy", type: "market", ...size, reason: `เดย์เทรด: ${d.why}` }, "bot");
        if (r.ok) {
          cfg.traded.symbols.push(s);
          n++;
        }
      } else {
        const r = await placeOrder(ctx, pid, { symbol: s, side: "sell", type: "market", qty: holding!.qty, reason: `เดย์เทรด: ${d.why}` }, "bot");
        if (r.ok) n++;
      }
    } catch (e) {
      console.warn("[daytrade]", s, (e as Error).message);
    }
  }
  return n;
}

export async function runDaytrade(ctx: GameCtx): Promise<number> {
  const cfg = getDaytradeConfig(ctx.db, ctx.game.id);
  const pid = findPortfolioId(ctx.db, ctx.game.id, "daytrade");
  if (!cfg?.active || pid === null || ctx.today < cfg.startedAt) return 0;
  const n = ctx.mode === "backtest" ? await daytradeBacktest(ctx, pid, cfg) : await daytradeLive(ctx, pid, cfg);
  setDaytradeConfig(ctx.db, ctx.game.id, cfg);
  return n;
}

/** เรียกจาก flow ทุกครั้งที่ Bot ทำงาน */
export async function runAutoPortfolios(ctx: GameCtx) {
  for (const pid of autoPortfolioIds(ctx.db, ctx.game.id)) await processPending(ctx, pid);
  await runDca(ctx).catch((e) => console.warn("[dca]", (e as Error).message));
  await runDaytrade(ctx).catch((e) => console.warn("[daytrade]", (e as Error).message));
  for (const pid of autoPortfolioIds(ctx.db, ctx.game.id)) await snapshot(ctx, pid);
}
