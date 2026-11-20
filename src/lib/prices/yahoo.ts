import YahooFinance from "yahoo-finance2";
import { DateTime } from "luxon";
import { FX_SYMBOL } from "@/config/seeds";
import { exchangeDate, marketOf } from "@/lib/rules/hours";
import type { Bar, Fundamentals, FxRate, Interval, PriceProvider, Quote } from "./types";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function withTimeout<T>(p: Promise<T>, ms = 20_000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("หมดเวลารอข้อมูลราคา")), ms)),
  ]);
}

function barDate(symbol: string, d: Date): string {
  if (symbol === FX_SYMBOL) return exchangeDate("FX", d);
  return exchangeDate(marketOf(symbol), d);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toQuote(q: any): Quote {
  return {
    symbol: q.symbol,
    price: q.regularMarketPrice,
    prevClose: q.regularMarketPreviousClose ?? null,
    currency: q.currency ?? (marketOf(q.symbol) === "TH" ? "THB" : "USD"),
    name: q.longName ?? q.shortName,
    time: (q.regularMarketTime instanceof Date ? q.regularMarketTime : new Date()).toISOString(),
    fetchedAt: new Date().toISOString(),
    pe: q.trailingPE ?? null,
    dividendYield: q.trailingAnnualDividendYield ?? null,
  };
}

export class YahooProvider implements PriceProvider {
  readonly name = "yahoo";

  async getQuote(symbol: string): Promise<Quote> {
    const q = await withTimeout(yf.quote(symbol));
    if (!q || q.regularMarketPrice == null) throw new Error(`ไม่พบราคาของ ${symbol}`);
    return toQuote(q);
  }

  async getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
    if (symbols.length === 0) return {};
    const list = await withTimeout(yf.quote(symbols));
    const out: Record<string, Quote> = {};
    for (const q of Array.isArray(list) ? list : [list]) {
      if (q && q.regularMarketPrice != null) out[q.symbol] = toQuote(q);
    }
    return out;
  }

  async getHistory(symbol: string, from: string, to: string, interval: Interval): Promise<Bar[]> {
    const period1 = DateTime.fromISO(from, { zone: "UTC" }).minus({ days: 1 }).toJSDate();
    const period2 = DateTime.fromISO(to, { zone: "UTC" }).plus({ days: 2 }).toJSDate();
    const res = await withTimeout(yf.chart(symbol, { period1, period2, interval }), 30_000);
    const bars: Bar[] = [];
    for (const q of res.quotes) {
      if (q.close == null || q.open == null || q.high == null || q.low == null) continue;
      const date = interval === "1d" ? barDate(symbol, q.date) : q.date.toISOString();
      const day = interval === "1d" ? date : barDate(symbol, q.date);
      if (day < from || day > to) continue;
      bars.push({ date, open: q.open, high: q.high, low: q.low, close: q.close, volume: q.volume ?? 0 });
    }
    return bars;
  }

  async getFxRate(): Promise<FxRate> {
    const q = await this.getQuote(FX_SYMBOL);
    return { rate: q.price, time: q.time, fetchedAt: q.fetchedAt };
  }

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const s = await withTimeout(yf.quoteSummary(symbol, { modules: ["assetProfile", "summaryDetail", "price", "defaultKeyStatistics"] }));
    const sd = s.summaryDetail;
    const ks = s.defaultKeyStatistics;
    const ap = s.assetProfile;
    return {
      pe: sd?.trailingPE ?? null,
      dividendYield: sd?.dividendYield ?? null,
      sector: ap?.sector ?? null,
      name: s.price?.longName ?? s.price?.shortName ?? null,
      industry: ap?.industry ?? null,
      marketCap: sd?.marketCap ?? s.price?.marketCap ?? null,
      eps: ks?.trailingEps ?? null,
      priceToBook: ks?.priceToBook ?? null,
      beta: sd?.beta ?? ks?.beta ?? null,
      avgVolume: sd?.averageVolume ?? null,
      employees: ap?.fullTimeEmployees ?? null,
      website: ap?.website ?? null,
      summary: ap?.longBusinessSummary ?? null,
    };
  }
}
