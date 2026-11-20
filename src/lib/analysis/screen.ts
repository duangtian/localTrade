/**
 * Bot คัดหุ้นจากสถิติ: ดึงราคาย้อนหลัง ~1.5 ปีผ่าน ctx.provider
 * (โหมดย้อนอดีต = TimeBoundedProvider จึงไม่เห็นราคาหลังวันจำลอง) แล้วให้คะแนนด้วย analyze()
 */
import { DateTime } from "luxon";
import type { SeedStock } from "@/config/seeds";
import type { DB } from "@/lib/db/client";
import type { GameCtx } from "@/lib/game/core";
import type { PriceProvider } from "@/lib/prices/types";
import { kvGet, kvSet } from "@/lib/settings";
import { analyze, type Analysis } from "./indicators";

export interface ScanRow {
  symbol: string;
  name: string;
  sector: string;
  a: Analysis;
}

export interface ScanResult {
  key: string;
  universe: string;
  today: string;
  at: string;
  rows: ScanRow[];
  failed: string[];
}

const LIVE_TTL_MS = 30 * 60 * 1000;

export function scanKey(ctx: Pick<GameCtx, "mode" | "today">, universe: string): string {
  return `scan:${ctx.mode}:${universe}:${ctx.today}`;
}

/** ผลสแกนที่เก็บไว้ (โหมดเวลาจริงหมดอายุ 30 นาที, โหมดย้อนอดีตผูกกับวันจำลอง) */
export function getCachedScan(db: DB, ctx: Pick<GameCtx, "mode" | "today">, universe: string): ScanResult | null {
  const r = kvGet<ScanResult | null>(db, scanKey(ctx, universe), null);
  if (!r) return null;
  if (ctx.mode === "live" && Date.now() - Date.parse(r.at) > LIVE_TTL_MS) return null;
  return r;
}

/** คำนวณสัญญาณของหุ้น 1 ตัว ณ วันของเกม */
export async function analyzeSymbol(provider: PriceProvider, symbol: string, today: string): Promise<Analysis | null> {
  const from = DateTime.fromISO(today).minus({ days: 400 }).toISODate()!;
  const bars = await provider.getHistory(symbol, from, today, "1d");
  // กันซ้ำอีกชั้น: ไม่ใช้แท่งหลังวันของเกม
  return analyze(bars.filter((b) => b.date.slice(0, 10) <= today));
}

export async function runScan(db: DB, ctx: GameCtx, universe: string, stocks: SeedStock[], concurrency = 6): Promise<ScanResult> {
  const rows: ScanRow[] = [];
  const failed: string[] = [];
  let i = 0;
  async function worker() {
    while (i < stocks.length) {
      const s = stocks[i++];
      try {
        const a = await analyzeSymbol(ctx.provider, s.symbol, ctx.today);
        if (a) rows.push({ symbol: s.symbol, name: s.name, sector: s.sector, a });
        else failed.push(s.symbol);
      } catch {
        failed.push(s.symbol);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, stocks.length) }, worker));
  rows.sort((x, y) => y.a.score - x.a.score || (y.a.r6m ?? 0) - (x.a.r6m ?? 0));
  const result: ScanResult = { key: scanKey(ctx, universe), universe, today: ctx.today, at: new Date().toISOString(), rows, failed };
  kvSet(db, result.key, result);
  return result;
}

/** ข้อความสรุปสถิติสำหรับส่งให้ Claude (เฉพาะข้อมูลถึงวันของเกม) */
export function analysisContext(symbol: string, name: string, a: Analysis): string {
  const p = (r: number | null) => (r === null ? "ไม่มีข้อมูล" : `${(r * 100).toFixed(1)}%`);
  const n = (x: number | null) => (x === null ? "ไม่มีข้อมูล" : x.toFixed(2));
  return [
    `${symbol.replace(".BK", "")} (${name}) ข้อมูลถึงวันที่ ${a.asOf}`,
    `ราคา ${n(a.price)} | SMA20 ${n(a.sma20)} | SMA50 ${n(a.sma50)} | SMA200 ${n(a.sma200)} | RSI14 ${n(a.rsi14)}`,
    `ผลตอบแทน 1ด ${p(a.r1m)} 3ด ${p(a.r3m)} 6ด ${p(a.r6m)} 12ด ${p(a.r12m)}`,
    `ผันผวน/ปี ${p(a.vol)} | ลดลงมากสุดรอบปี ${p(a.maxDrawdown)} | ห่างจุดสูงสุด 52 สัปดาห์ ${p(a.fromHigh)}`,
    `คะแนน Bot ${a.score}/100 (${a.label})`,
  ].join("\n");
}
