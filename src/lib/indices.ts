import { indexDef, type IndexDef, type IndexId } from "@/config/indices";
import { findSeed, type SeedStock } from "@/config/seeds";
import type { DB } from "@/lib/db/client";
import { kvGet, kvSet } from "@/lib/settings";

export interface IndexOverride {
  symbols: string[];
  asOf: string;
  savedAt: string;
}

const key = (id: IndexId) => `index:${id}`;

export function getIndexOverride(db: DB, id: IndexId): IndexOverride | null {
  return kvGet<IndexOverride | null>(db, key(id), null);
}

export function setIndexOverride(db: DB, id: IndexId, o: IndexOverride | null) {
  kvSet(db, key(id), o);
}

/** รายชื่อหุ้นของดัชนี (ใช้รายชื่อที่ผู้เล่นวางเองก่อน ถ้ามี) */
export function getIndexStocks(db: DB, id: IndexId): { def: IndexDef; stocks: SeedStock[]; asOf: string | null; source: string; custom: boolean } {
  const def = indexDef(id)!;
  const o = def.editable ? getIndexOverride(db, id) : null;
  if (o && o.symbols.length > 0) {
    const stocks = o.symbols.map((s) => findSeed(s) ?? { symbol: s, name: s.replace(".BK", ""), sector: "ไม่ระบุกลุ่ม" });
    return { def, stocks, asOf: o.asOf, source: "รายชื่อที่คุณวางเอง", custom: true };
  }
  return { def, stocks: def.stocks, asOf: def.asOf, source: def.source, custom: false };
}
