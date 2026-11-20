// อัปเดตรายชื่อหุ้นในดัชนีสหรัฐฯ: node scripts/update-us-indices.mjs
// - S&P 500 จาก Wikipedia (List of S&P 500 companies)
// - Nasdaq-100 จาก api.nasdaq.com
// เขียนผลลงใน src/config/data/*.json
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "src", "config", "data");
const UA = "Mozilla/5.0 (compatible; TradingGameIndexUpdater/1.0)";

const GICS_TH = {
  "Communication Services": "สื่อสาร",
  "Consumer Discretionary": "สินค้าฟุ่มเฟือย",
  "Consumer Staples": "สินค้าอุปโภคบริโภค",
  Energy: "พลังงาน",
  Financials: "การเงิน",
  "Health Care": "การแพทย์",
  Industrials: "อุตสาหกรรม",
  "Information Technology": "เทคโนโลยี",
  Materials: "วัสดุ",
  "Real Estate": "อสังหาริมทรัพย์",
  Utilities: "สาธารณูปโภค",
};

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, " ")
    .trim();

async function sp500() {
  const html = await (await fetch("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", { headers: { "user-agent": UA } })).text();
  const start = html.indexOf('id="constituents"');
  if (start < 0) throw new Error("ไม่พบตาราง constituents ใน Wikipedia");
  const table = html.slice(start, html.indexOf("</table>", start));
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => decode(c[1])));
  const head = rows[0].map((h) => h.toLowerCase());
  const si = head.findIndex((h) => h.includes("symbol"));
  const ni = head.findIndex((h) => h === "security");
  const gi = head.findIndex((h) => h.includes("gics sector"));
  const list = rows
    .slice(1)
    .filter((r) => r[si])
    .map((r) => ({ symbol: r[si].replace(/\./g, "-"), name: r[ni], sector: GICS_TH[r[gi]] ?? "อื่น ๆ" }));
  if (list.length < 490) throw new Error(`S&P 500 ได้แค่ ${list.length} ตัว`);
  return list;
}

// Nasdaq-100 ที่ไม่อยู่ใน S&P 500: กำหนดกลุ่มเอง (จัดกลุ่มแบบกว้างตาม GICS)
const EXTRA_SECTORS = {
  ASML: "เทคโนโลยี", ARM: "เทคโนโลยี", SHOP: "เทคโนโลยี", MSTR: "เทคโนโลยี", NBIS: "เทคโนโลยี", ALAB: "เทคโนโลยี", CRWV: "เทคโนโลยี",
  ALNY: "การแพทย์", MELI: "สินค้าฟุ่มเฟือย", PDD: "สินค้าฟุ่มเฟือย", CCEP: "สินค้าอุปโภคบริโภค",
  RKLB: "อุตสาหกรรม", TRI: "อุตสาหกรรม", FER: "อุตสาหกรรม", SPCX: "อุตสาหกรรม",
};

async function ndx(sectorBySymbol) {
  const j = await (await fetch("https://api.nasdaq.com/api/quote/list-type/nasdaq100", { headers: { "user-agent": UA, accept: "application/json" } })).json();
  const rows = j?.data?.data?.rows ?? [];
  if (rows.length < 95) throw new Error(`Nasdaq-100 ได้แค่ ${rows.length} ตัว`);
  const clean = (n) =>
    n
      .replace(/\s+(Class [A-C] )?(Subordinate Voting Shares|New York Registry Shares|Common Stock|Common Shares|Ordinary Shares|Capital Stock|American Depositary Shares).*$/i, "")
      .replace(/\s+-\s+.*$/, "")
      .trim();
  return {
    date: j.data.date,
    list: rows.map((r) => ({ symbol: r.symbol.replace(/\./g, "-"), name: clean(r.companyName), sector: sectorBySymbol.get(r.symbol.replace(/\./g, "-")) ?? EXTRA_SECTORS[r.symbol] ?? "อื่น ๆ" })),
  };
}

const today = new Date().toISOString().slice(0, 10);
const s = await sp500();
const n = await ndx(new Map(s.map((x) => [x.symbol, x.sector])));
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "sp500.json"), JSON.stringify({ asOf: today, source: "Wikipedia: List of S&P 500 companies", stocks: s }, null, 1) + "\n");
fs.writeFileSync(path.join(OUT, "ndx.json"), JSON.stringify({ asOf: today, source: `Nasdaq.com (ข้อมูลวันที่ ${n.date})`, stocks: n.list }, null, 1) + "\n");
console.log(`S&P 500: ${s.length} ตัว, Nasdaq-100: ${n.list.length} ตัว (ไม่ทราบกลุ่ม ${n.list.filter((x) => x.sector === "อื่น ๆ").length} ตัว)`);
