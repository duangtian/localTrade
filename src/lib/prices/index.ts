import { getDb } from "@/lib/db/client";
import { CachedProvider } from "./cached";
import { SetSmartProvider } from "./setsmart";
import type { PriceProvider } from "./types";
import { YahooProvider } from "./yahoo";

const g = globalThis as unknown as { __provider?: CachedProvider; __yahoo?: YahooProvider };

export function getYahoo(): YahooProvider {
  if (!g.__yahoo) g.__yahoo = new YahooProvider();
  return g.__yahoo;
}

/** เลือก provider ตาม PRICE_PROVIDER ใน .env แล้วครอบด้วย cache */
export function getBaseProvider(): CachedProvider {
  if (!g.__provider) {
    let inner: PriceProvider = getYahoo();
    if (process.env.PRICE_PROVIDER === "setsmart") inner = new SetSmartProvider(getYahoo());
    g.__provider = new CachedProvider(inner, getDb());
  }
  return g.__provider;
}
