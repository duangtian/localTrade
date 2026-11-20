/**
 * ข่าวล่าสุดของหุ้น (ใช้เฉพาะโหมดเวลาจริง: ข่าวปัจจุบันคือข้อมูลอนาคตของโหมดย้อนอดีต)
 * - หุ้นสหรัฐฯ: Yahoo Finance search
 * - หุ้นไทย: Google News RSS (Yahoo ไม่มีข่าวหุ้นไทย)
 * cache ใน kv 60 นาที
 */
import YahooFinance from "yahoo-finance2";
import type { DB } from "@/lib/db/client";
import { marketOf } from "@/lib/rules/hours";
import { kvGet, kvSet } from "@/lib/settings";
import type { Tone } from "./indicators";

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  /** ISO */
  time: string;
  tone: Tone;
}

const TTL_MS = 60 * 60 * 1000;
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const POS = [
  "แนะนำซื้อ", "แนะนำ “ซื้อ”", 'แนะนำ "ซื้อ"', "เป้าหมาย", "กำไรโต", "กำไรเพิ่ม", "กำไรพุ่ง", "โตแรง", "แข็งแกร่ง", "ปันผลเด่น", "ทำนิวไฮ", "พุ่ง", "บวก", "ฟื้น", "อัปเกรด",
  "upgrade", "beats", "beat estimates", "record", "surge", "soar", "jump", "rally", "raises guidance", "outperform", "buy rating", "strong",
];
const NEG = [
  "ขาดทุน", "กำไรลด", "กำไรแผ่ว", "ร่วง", "ดิ่ง", "ทรุด", "ทุบ", "เทขาย", "ขายสุทธิ", "ลบ", "ต่ำสุด", "ลดเป้า", "ดาวน์เกรด", "ฟ้อง", "สอบสวน", "ผิดนัด",
  "downgrade", "miss", "misses", "plunge", "slump", "tumble", "drop", "falls", "lawsuit", "probe", "investigation", "cuts guidance", "warning", "sell rating", "weak",
];

/** จัดโทนพาดหัวข่าวแบบคำสำคัญ (คร่าว ๆ เพื่อการเรียนรู้ ไม่ใช่การวิเคราะห์จริง) */
export function headlineTone(title: string): Tone {
  const t = title.toLowerCase();
  const p = POS.filter((w) => t.includes(w.toLowerCase())).length;
  const n = NEG.filter((w) => t.includes(w.toLowerCase())).length;
  return p > n ? "pos" : n > p ? "neg" : "neu";
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

export function parseGoogleNewsRss(xml: string): Omit<NewsItem, "tone">[] {
  const out: Omit<NewsItem, "tone">[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const title = decode(it.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const link = decode(it.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
    const date = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    const publisher = decode(it.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "");
    if (!title || !/^https?:\/\//.test(link) || !date) continue;
    // Google ต่อท้ายชื่อสำนักข่าวในพาดหัว "... - สำนักข่าว"
    const clean = publisher && title.endsWith(` - ${publisher}`) ? title.slice(0, -publisher.length - 3) : title;
    out.push({ title: clean, publisher, link, time: new Date(date).toISOString() });
  }
  return out;
}

async function fetchThai(symbol: string): Promise<Omit<NewsItem, "tone">[]> {
  const q = encodeURIComponent(`"${symbol.replace(".BK", "")}" หุ้น when:30d`);
  const res = await fetch(`https://news.google.com/rss/search?q=${q}&hl=th&gl=TH&ceid=TH:th`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; TradingGame/1.0)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`news ${res.status}`);
  return parseGoogleNewsRss(await res.text());
}

async function fetchUs(symbol: string): Promise<Omit<NewsItem, "tone">[]> {
  const r = await yf.search(symbol, { newsCount: 10, quotesCount: 0 });
  return r.news
    .filter((n) => /^https?:\/\//.test(n.link))
    .map((n) => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      time: (n.providerPublishTime instanceof Date ? n.providerPublishTime : new Date()).toISOString(),
    }));
}

export async function getNews(db: DB, symbol: string, limit = 6): Promise<NewsItem[]> {
  const key = `news:${symbol}`;
  const c = kvGet<{ at: number; items: NewsItem[] } | null>(db, key, null);
  if (c && Date.now() - c.at < TTL_MS) return c.items.slice(0, limit);
  try {
    const raw = marketOf(symbol) === "TH" ? await fetchThai(symbol) : await fetchUs(symbol);
    const seen = new Set<string>();
    const items = raw
      .sort((a, b) => b.time.localeCompare(a.time))
      .filter((n) => (seen.has(n.title) ? false : (seen.add(n.title), true)))
      .slice(0, 10)
      .map((n) => ({ ...n, tone: headlineTone(n.title) }));
    kvSet(db, key, { at: Date.now(), items });
    return items.slice(0, limit);
  } catch (e) {
    console.warn("[news] ดึงข่าวไม่สำเร็จ", symbol, (e as Error).message);
    return c?.items.slice(0, limit) ?? [];
  }
}

export function newsBalance(items: NewsItem[]): { pos: number; neg: number; neu: number } {
  return {
    pos: items.filter((n) => n.tone === "pos").length,
    neg: items.filter((n) => n.tone === "neg").length,
    neu: items.filter((n) => n.tone === "neu").length,
  };
}
