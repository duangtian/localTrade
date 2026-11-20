import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mode: text("mode", { enum: ["live", "backtest"] }).notNull(),
  startDate: text("start_date").notNull(),
  /** โหมดย้อนอดีต: วันจำลองปัจจุบัน; โหมดเวลาจริง: ไม่ใช้ */
  simDate: text("sim_date"),
  startingCash: real("starting_cash").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastSummaryKey: text("last_summary_key"),
  createdAt: text("created_at").notNull(),
});

export const portfolios = sqliteTable("portfolios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id").notNull(),
  owner: text("owner", { enum: ["player", "bot"] }).notNull(),
  cashThb: real("cash_thb").notNull(),
  cashUsd: real("cash_usd").notNull().default(0),
  lastDcaMonth: text("last_dca_month"),
});

export const positions = sqliteTable(
  "positions",
  {
    portfolioId: integer("portfolio_id").notNull(),
    symbol: text("symbol").notNull(),
    market: text("market", { enum: ["TH", "US"] }).notNull(),
    qty: real("qty").notNull(),
    avgCost: real("avg_cost").notNull(),
    avgFx: real("avg_fx").notNull(),
    openedAt: text("opened_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.portfolioId, t.symbol] })],
);

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  portfolioId: integer("portfolio_id").notNull(),
  symbol: text("symbol").notNull(),
  market: text("market", { enum: ["TH", "US"] }).notNull(),
  side: text("side", { enum: ["buy", "sell"] }).notNull(),
  type: text("type", { enum: ["market", "limit"] }).notNull(),
  qty: real("qty"),
  amountUsd: real("amount_usd"),
  limitPrice: real("limit_price"),
  status: text("status", { enum: ["pending", "filled", "cancelled", "rejected"] }).notNull(),
  reason: text("reason").notNull(),
  stopLoss: real("stop_loss"),
  targetPrice: real("target_price"),
  coachQuestion: text("coach_question"),
  coachAnswer: text("coach_answer"),
  /** เวลาเกม: ISO (เวลาจริง) หรือ YYYY-MM-DD (ย้อนอดีต) */
  createdAt: text("created_at").notNull(),
  filledAt: text("filled_at"),
  fillPrice: real("fill_price"),
  fillQty: real("fill_qty"),
  commission: real("commission"),
  total: real("total"),
  fxRate: real("fx_rate"),
  realizedPnlThb: real("realized_pnl_thb"),
  explanation: text("explanation"),
});

export const fxTxns = sqliteTable("fx_txns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  portfolioId: integer("portfolio_id").notNull(),
  direction: text("direction", { enum: ["THB_TO_USD", "USD_TO_THB"] }).notNull(),
  thb: real("thb").notNull(),
  usd: real("usd").notNull(),
  rate: real("rate").notNull(),
  at: text("at").notNull(),
});

export const snapshots = sqliteTable(
  "snapshots",
  {
    portfolioId: integer("portfolio_id").notNull(),
    date: text("date").notNull(),
    valueThb: real("value_thb").notNull(),
  },
  (t) => [primaryKey({ columns: [t.portfolioId, t.date] })],
);

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id").notNull(),
  kind: text("kind", { enum: ["bot_trade", "summary", "chat_user", "chat_bot"] }).notNull(),
  date: text("date").notNull(),
  text: text("text").notNull(),
  dismissed: integer("dismissed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const quotes = sqliteTable("quotes", {
  symbol: text("symbol").primaryKey(),
  json: text("json").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

export const bars = sqliteTable(
  "bars",
  {
    symbol: text("symbol").notNull(),
    date: text("date").notNull(),
    open: real("open").notNull(),
    high: real("high").notNull(),
    low: real("low").notNull(),
    close: real("close").notNull(),
    volume: real("volume").notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.date] })],
);

export const coverage = sqliteTable("coverage", {
  symbol: text("symbol").primaryKey(),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
