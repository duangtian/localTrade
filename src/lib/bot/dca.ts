/**
 * พอร์ต DCA: ลงเงินเท่า ๆ กันทุกเดือนตามหุ้นและสัดส่วนที่ผู้เล่นเลือก ไม่ขาย
 * - หุ้นไทยซื้อทีละ 100 หุ้น: งบเดือนไหนไม่พอ 1 lot จะ "สะสม" ไว้ซื้อเดือนถัดไป (bank)
 * - หุ้นสหรัฐฯ ซื้อเป็นเศษหุ้นด้วยงบเต็มจำนวน (แลกเงินก่อน)
 * - แต่ละตัวซื้อเดือนละครั้ง (done[symbol] = เดือนล่าสุดที่ลงเงินแล้ว) ตลาดปิดก็รอรอบถัดไปในเดือนเดียวกัน
 */
import type { FeeConfig } from "@/config/fees";
import { buyUsdRate, commission } from "@/lib/rules/fees";

export interface DcaItem {
  symbol: string;
  /** สัดส่วน 0–1 รวมกันได้ 1 */
  weight: number;
}

export interface DcaConfig {
  items: DcaItem[];
  /** เงินต่อเดือน (บาท) */
  monthly: number;
  active: boolean;
  startedAt: string;
  /** เดือนล่าสุดที่ลงเงินแล้วของแต่ละตัว (YYYY-MM) */
  done: Record<string, string>;
  /** งบที่สะสมไว้ของแต่ละตัว (บาท) */
  bank: Record<string, number>;
}

export type DcaAction =
  | { kind: "exchange"; thb: number }
  | { kind: "buy"; symbol: string; qty?: number; amountUsd?: number; budgetThb: number; note: string };

export interface DcaInput {
  config: DcaConfig;
  today: string;
  cashThb: number;
  cashUsd: number;
  prices: Record<string, number | undefined>;
  canTrade: Record<string, boolean>;
  fxMid: number;
  fees: FeeConfig;
}

export function normalizeWeights(items: DcaItem[]): DcaItem[] {
  const valid = items.filter((i) => i.weight > 0);
  const sum = valid.reduce((s, i) => s + i.weight, 0);
  return sum > 0 ? valid.map((i) => ({ ...i, weight: i.weight / sum })) : [];
}

export function decideDca(inp: DcaInput): { actions: DcaAction[]; config: DcaConfig } {
  const month = inp.today.slice(0, 7);
  const cfg: DcaConfig = { ...inp.config, done: { ...inp.config.done }, bank: { ...inp.config.bank } };
  if (!cfg.active) return { actions: [], config: cfg };

  let thbLeft = inp.cashThb;
  let usdLeft = inp.cashUsd;
  const fxBuy = inp.fxMid > 0 ? buyUsdRate(inp.fees, inp.fxMid) : 0;
  const buys: DcaAction[] = [];
  let exchangeThb = 0;

  for (const it of cfg.items) {
    if (cfg.done[it.symbol] === month) continue;
    const price = inp.prices[it.symbol];
    if (!inp.canTrade[it.symbol] || !price) continue; // รอรอบถัดไปในเดือนนี้
    const isTH = it.symbol.endsWith(".BK");
    // งบเดือนนี้เข้าบัญชีสะสมของหุ้นตัวนี้
    cfg.bank[it.symbol] = (cfg.bank[it.symbol] ?? 0) + cfg.monthly * it.weight;
    cfg.done[it.symbol] = month;
    const bank = cfg.bank[it.symbol];

    if (isTH) {
      const lot = price * 100;
      let lots = Math.floor(bank / lot);
      while (lots > 0 && lots * lot + commission(inp.fees, "TH", lots * lot) > Math.min(bank, thbLeft)) lots--;
      if (lots === 0) continue; // สะสมไว้ก่อน
      const cost = lots * lot + commission(inp.fees, "TH", lots * lot);
      thbLeft -= cost;
      cfg.bank[it.symbol] = bank - cost;
      buys.push({ kind: "buy", symbol: it.symbol, qty: lots * 100, budgetThb: cost, note: `DCA ${month}: ${lots * 100} หุ้น (งบสะสม ฿${Math.round(bank).toLocaleString("en-US")})` });
    } else {
      if (!(fxBuy > 0)) continue;
      const spendThb = Math.min(bank, thbLeft + usdLeft * fxBuy);
      let usd = Math.floor((spendThb / fxBuy) * 100) / 100;
      while (usd > 0 && (usd + commission(inp.fees, "US", usd)) * fxBuy > spendThb) usd = Math.floor((usd - 0.01) * 100) / 100;
      if (usd < 1) continue;
      const needUsd = usd + commission(inp.fees, "US", usd);
      const fromUsd = Math.min(usdLeft, needUsd);
      usdLeft -= fromUsd;
      const shortUsd = needUsd - fromUsd;
      if (shortUsd > 0) {
        const thb = Math.ceil(shortUsd * fxBuy * 1.002 * 100) / 100;
        exchangeThb += thb;
        thbLeft -= thb;
      }
      cfg.bank[it.symbol] = Math.max(0, bank - needUsd * fxBuy);
      buys.push({ kind: "buy", symbol: it.symbol, amountUsd: usd, budgetThb: needUsd * fxBuy, note: `DCA ${month}: $${usd.toFixed(2)}` });
    }
  }
  const actions: DcaAction[] = exchangeThb > 0 ? [{ kind: "exchange", thb: exchangeThb }, ...buys] : buys;
  return { actions, config: cfg };
}
