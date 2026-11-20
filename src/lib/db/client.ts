import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

/** สร้างตารางถ้ายังไม่มี (แทน migration เพื่อให้ npm run dev ใช้ได้ทันที) */
const DDL = `
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mode TEXT NOT NULL, start_date TEXT NOT NULL, sim_date TEXT,
  starting_cash REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1, last_summary_key TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS portfolios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, owner TEXT NOT NULL,
  cash_thb REAL NOT NULL, cash_usd REAL NOT NULL DEFAULT 0, last_dca_month TEXT);
CREATE TABLE IF NOT EXISTS positions (
  portfolio_id INTEGER NOT NULL, symbol TEXT NOT NULL, market TEXT NOT NULL, qty REAL NOT NULL,
  avg_cost REAL NOT NULL, avg_fx REAL NOT NULL, opened_at TEXT NOT NULL, PRIMARY KEY (portfolio_id, symbol));
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER NOT NULL, symbol TEXT NOT NULL, market TEXT NOT NULL,
  side TEXT NOT NULL, type TEXT NOT NULL, qty REAL, amount_usd REAL, limit_price REAL, status TEXT NOT NULL,
  reason TEXT NOT NULL, stop_loss REAL, target_price REAL, coach_question TEXT, coach_answer TEXT,
  created_at TEXT NOT NULL, filled_at TEXT, fill_price REAL, fill_qty REAL, commission REAL, total REAL,
  fx_rate REAL, realized_pnl_thb REAL, explanation TEXT);
CREATE INDEX IF NOT EXISTS orders_portfolio ON orders(portfolio_id, status);
CREATE TABLE IF NOT EXISTS fx_txns (
  id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER NOT NULL, direction TEXT NOT NULL,
  thb REAL NOT NULL, usd REAL NOT NULL, rate REAL NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshots (
  portfolio_id INTEGER NOT NULL, date TEXT NOT NULL, value_thb REAL NOT NULL, PRIMARY KEY (portfolio_id, date));
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, kind TEXT NOT NULL, date TEXT NOT NULL,
  text TEXT NOT NULL, dismissed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quotes (symbol TEXT PRIMARY KEY, json TEXT NOT NULL, fetched_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bars (
  symbol TEXT NOT NULL, date TEXT NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL,
  close REAL NOT NULL, volume REAL NOT NULL, PRIMARY KEY (symbol, date));
CREATE TABLE IF NOT EXISTS coverage (symbol TEXT PRIMARY KEY, from_date TEXT NOT NULL, to_date TEXT NOT NULL, fetched_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
`;

export type DB = BetterSQLite3Database<typeof schema>;

export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}

const g = globalThis as unknown as { __db?: DB };

export function getDb(): DB {
  if (!g.__db) g.__db = openDb(process.env.DATABASE_PATH || path.join(process.cwd(), "data", "game.db"));
  return g.__db;
}
