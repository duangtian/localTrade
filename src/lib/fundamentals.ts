import type { DB } from "@/lib/db/client";
import { getYahoo } from "@/lib/prices";
import type { Fundamentals } from "@/lib/prices/types";
import { kvGet, kvSet } from "@/lib/settings";

/** ข้อมูลพื้นฐานปัจจุบัน (ใช้เฉพาะโหมดเวลาจริง) cache 1 วัน */
export async function getFundamentals(db: DB, symbol: string): Promise<Fundamentals | null> {
  const key = `fund2:${symbol}`;
  const c = kvGet<{ at: number; data: Fundamentals } | null>(db, key, null);
  if (c && Date.now() - c.at < 86_400_000) return c.data;
  try {
    const data = await getYahoo().getFundamentals(symbol);
    kvSet(db, key, { at: Date.now(), data });
    return data;
  } catch {
    return c?.data ?? null;
  }
}
