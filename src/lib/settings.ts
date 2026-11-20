import { eq } from "drizzle-orm";
import { DEFAULT_FEES, type FeeConfig } from "@/config/fees";
import type { DB } from "@/lib/db/client";
import { kv } from "@/lib/db/schema";

export function kvGet<T>(db: DB, key: string, fallback: T): T {
  const row = db.select().from(kv).where(eq(kv.key, key)).get();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function kvSet(db: DB, key: string, value: unknown): void {
  const v = JSON.stringify(value);
  const updatedAt = new Date().toISOString();
  db.insert(kv).values({ key, value: v, updatedAt }).onConflictDoUpdate({ target: kv.key, set: { value: v, updatedAt } }).run();
}

export type Mode = "live" | "backtest";
export type Theme = "light" | "dark";

export interface Settings {
  mode: Mode;
  theme: Theme;
  claudeEnabled: boolean;
  startingCash: number;
}

const DEFAULT_SETTINGS: Settings = { mode: "live", theme: "light", claudeEnabled: false, startingCash: 10_000 };

export function getSettings(db: DB): Settings {
  return { ...DEFAULT_SETTINGS, ...kvGet<Partial<Settings>>(db, "settings", {}) };
}

export function updateSettings(db: DB, patch: Partial<Settings>): Settings {
  const next = { ...getSettings(db), ...patch };
  kvSet(db, "settings", next);
  return next;
}

/** อัตราค่าธรรมเนียม: ค่าที่แก้ในหน้าตั้งค่าทับค่าใน config/fees.ts */
export function getFees(db: DB): FeeConfig {
  const o = kvGet<Partial<FeeConfig> | null>(db, "fees", null);
  if (!o) return DEFAULT_FEES;
  return {
    asOf: o.asOf ?? DEFAULT_FEES.asOf,
    th: { ...DEFAULT_FEES.th, ...o.th },
    us: { ...DEFAULT_FEES.us, ...o.us },
    fx: { ...DEFAULT_FEES.fx, ...o.fx },
  };
}

export function setFees(db: DB, fees: FeeConfig): void {
  kvSet(db, "fees", fees);
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
