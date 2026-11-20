/**
 * สแกนหุ้นเบื้องหลัง (ใน process ของ server)
 * - คิวทำทีละดัชนี ไม่ซ้อนกัน (ยิง Yahoo พร้อมกันไม่เกิน 6 ตัวตาม runScan)
 * - ตัวตั้งเวลาเช็กทุก 2 นาที: โหมดเวลาจริงสแกนดัชนีที่ผลเก่ากว่า 30 นาทีระหว่างตลาดที่เกี่ยวข้องเปิด
 *   (ตลาดปิดแล้วสแกนแค่ครั้งเดียวต่อวัน) · โหมดย้อนอดีตสแกนเมื่อวันจำลองเปลี่ยน
 * - ปิดได้ด้วย BACKGROUND_SCAN=off ใน .env
 */
import { INDEXES, type IndexId } from "@/config/indices";
import { getDb } from "@/lib/db/client";
import { getActiveGame, makeCtx, type GameCtx } from "@/lib/game/core";
import { getIndexStocks } from "@/lib/indices";
import { getBaseProvider } from "@/lib/prices";
import { isMarketOpen } from "@/lib/rules/hours";
import { getFees, getSettings } from "@/lib/settings";
import { getLatestScan, isStale, runScan } from "./screen";

export interface ScanJobStatus {
  running: { universe: IndexId; done: number; total: number; startedAt: string } | null;
  queue: IndexId[];
  last: { universe: IndexId; at: string; ok: boolean; error?: string } | null;
}

type State = ScanJobStatus & { timer?: ReturnType<typeof setInterval>; busy: boolean };
const g = globalThis as unknown as { __scanJobs?: State };
const state: State = (g.__scanJobs ??= { running: null, queue: [], last: null, busy: false });

export function scanStatus(): ScanJobStatus {
  return { running: state.running, queue: [...state.queue], last: state.last };
}

function currentCtx(): GameCtx | null {
  const db = getDb();
  const game = getActiveGame(db, getSettings(db).mode);
  return game ? makeCtx(db, game, getBaseProvider(), getFees(db)) : null;
}

/** เพิ่มดัชนีเข้าคิว (ถ้ายังไม่อยู่ในคิว) แล้วเริ่มทำงานถ้าว่าง */
export function enqueueScan(universe: IndexId, front = false) {
  if (state.running?.universe === universe || state.queue.includes(universe)) return;
  if (front) state.queue.unshift(universe);
  else state.queue.push(universe);
  void drain();
}

async function drain() {
  if (state.busy) return;
  state.busy = true;
  try {
    while (state.queue.length) {
      const universe = state.queue.shift()!;
      const ctx = currentCtx();
      if (!ctx) break;
      const stocks = getIndexStocks(ctx.db, universe).stocks;
      if (stocks.length === 0) continue;
      state.running = { universe, done: 0, total: stocks.length, startedAt: new Date().toISOString() };
      try {
        await runScan(ctx.db, ctx, universe, stocks, 6, (done, total) => {
          if (state.running) state.running = { ...state.running, done, total };
        });
        state.last = { universe, at: new Date().toISOString(), ok: true };
      } catch (e) {
        state.last = { universe, at: new Date().toISOString(), ok: false, error: (e as Error).message };
        console.warn("[scan] สแกนเบื้องหลังไม่สำเร็จ", universe, (e as Error).message);
      } finally {
        state.running = null;
      }
    }
  } finally {
    state.busy = false;
  }
}

/** ดัชนีที่ควรสแกนตอนนี้ */
export function dueUniverses(ctx: GameCtx, now = new Date()): IndexId[] {
  const out: IndexId[] = [];
  // โหมดย้อนอดีตไม่สแกน S&P 500 อัตโนมัติ (503 ตัว) ให้กดเองถ้าต้องการ
  const ids = INDEXES.map((d) => d.id).filter((id) => ctx.mode === "live" || id !== "sp500");
  for (const id of ids) {
    if (getIndexStocks(ctx.db, id).stocks.length === 0) continue;
    const latest = getLatestScan(ctx.db, ctx, id);
    if (!latest) {
      out.push(id);
      continue;
    }
    if (ctx.mode === "live" && isStale(ctx, latest)) {
      const market = INDEXES.find((d) => d.id === id)!.market;
      // ตลาดเปิดอยู่ = ราคาเปลี่ยน ควรสแกนใหม่; ตลาดปิด = ผลวันนี้ไม่เปลี่ยนแล้ว
      if (isMarketOpen(market, now)) out.push(id);
    }
  }
  return out;
}

export function tick() {
  try {
    const ctx = currentCtx();
    if (!ctx) return;
    for (const id of dueUniverses(ctx)) enqueueScan(id);
  } catch (e) {
    console.warn("[scan] ตัวตั้งเวลาผิดพลาด", (e as Error).message);
  }
}

export function startScheduler() {
  if (process.env.BACKGROUND_SCAN === "off" || state.timer) return;
  setTimeout(tick, 15_000); // รอ server พร้อมก่อน
  state.timer = setInterval(tick, 2 * 60_000);
  console.log("[scan] เริ่มสแกนหุ้นเบื้องหลัง (เช็กทุก 2 นาที)");
}
