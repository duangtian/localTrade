import "server-only";
import { getDb } from "@/lib/db/client";
import { getActiveGame, getPortfolioId, makeCtx, type GameCtx } from "@/lib/game/core";
import { syncLive } from "@/lib/game/flow";
import { getBaseProvider } from "@/lib/prices";
import { getFees, getSettings } from "@/lib/settings";

export type Loaded =
  | { game: null; ctx: null; settings: ReturnType<typeof getSettings> }
  | { game: NonNullable<ReturnType<typeof getActiveGame>>; ctx: GameCtx; pid: number; bid: number; settings: ReturnType<typeof getSettings> };

/** โหลดเกมของโหมดที่เลือกอยู่ (โหมดเวลาจริงจะ sync คำสั่งค้าง/Bot ก่อน) */
export async function loadGame(opts: { sync?: boolean } = {}): Promise<Loaded> {
  const db = getDb();
  const settings = getSettings(db);
  const fees = getFees(db);
  const base = getBaseProvider();
  let game = getActiveGame(db, settings.mode);
  if (!game) return { game: null, ctx: null, settings };
  if (game.mode === "live" && opts.sync !== false) {
    await syncLive(db, base, game, fees);
    game = getActiveGame(db, settings.mode)!;
  }
  return {
    game,
    ctx: makeCtx(db, game, base, fees),
    pid: getPortfolioId(db, game.id, "player"),
    bid: getPortfolioId(db, game.id, "bot"),
    settings,
  };
}
