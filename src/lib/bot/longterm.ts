import { BOT_DCA_MONTHS } from "@/config/app";
import { SET_BOARD_LOT } from "@/config/market";
import { BOT_LONGTERM_PICKS, findSeed, sectorOf } from "@/config/seeds";
import { previewTrade, valuePortfolio } from "@/lib/engine/portfolio";
import { buyUsdRate, commission } from "@/lib/rules/fees";
import { marketOf } from "@/lib/rules/hours";
import { round2 } from "@/lib/rules/tick";
import { fmtMoney, fmtQty } from "@/lib/format";
import type { BotAction, BotContext, BotDecision, BotStrategy } from "./strategy";

const LESSONS = [
  "DCA คือการลงเงินเท่า ๆ กันทุกเดือน ช่วยให้ไม่ต้องเดาจังหวะตลาด",
  "การกระจายหลายกลุ่มอุตสาหกรรมช่วยลดความเสี่ยงเมื่อกิจการใดกิจการหนึ่งมีข่าวร้าย",
  "การถือยาวให้เวลาธุรกิจเติบโต ราคาระยะสั้นมักแกว่งตามอารมณ์ตลาด",
  "ค่าธรรมเนียมกินผลตอบแทน การซื้อขายบ่อยทำให้กำไรสุทธิลดลง",
  "การวางแผนก่อนว่าจะทำอะไรเมื่อราคาลง ช่วยไม่ให้ตัดสินใจด้วยความกลัว",
];
const US_LESSON = "หุ้นสหรัฐฯ มีความเสี่ยงค่าเงิน ถ้าบาทแข็งค่า มูลค่าเป็นบาทจะลดลงแม้ราคาหุ้นไม่เปลี่ยน";

export function monthIndex(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return y * 12 + m;
}

export const longTermStrategy: BotStrategy = {
  id: "longterm",
  name: "ถือยาว",
  description: "เลือกหุ้นพื้นฐานดีจากหลายกลุ่ม ลงเงินเท่า ๆ กันทุกเดือน (DCA) และไม่ขายตอนตลาดตก",

  async decide(ctx: BotContext): Promise<BotDecision> {
    const month = ctx.today.slice(0, 7);
    if (ctx.lastDcaMonth === month) return { actions: [] };

    const quotes = await ctx.provider.getQuotes(BOT_LONGTERM_PICKS);
    const prices: Record<string, { price: number; prevClose: number | null }> = {};
    for (const [s, q] of Object.entries(quotes)) prices[s] = { price: q.price, prevClose: q.prevClose };
    const val = valuePortfolio(ctx.state, prices, ctx.fxMid);

    const budget = Math.min(ctx.state.cashThb + ctx.state.cashUsd * ctx.fxMid, ctx.startingCash / BOT_DCA_MONTHS);
    if (budget < ctx.startingCash * 0.005) return { actions: [], dcaMonth: month };

    // เรียงตามสัดส่วนที่ถืออยู่น้อยที่สุดก่อน → กระจายหลายกลุ่ม
    const weightOf = (s: string) => val.holdings.find((h) => h.symbol === s)?.weight ?? 0;
    const offset = monthIndex(ctx.today) % BOT_LONGTERM_PICKS.length;
    const rotated = [...BOT_LONGTERM_PICKS.slice(offset), ...BOT_LONGTERM_PICKS.slice(0, offset)];
    const candidates: string[] = [];
    for (const s of rotated) {
      if (!quotes[s]) continue;
      if (marketOf(s) === "US" && !(ctx.fxMid > 0)) continue;
      if (await ctx.canTrade(s)) candidates.push(s);
    }
    candidates.sort((a, b) => weightOf(a) - weightOf(b));

    const actions: BotAction[] = [];
    const perPick = budget / 2;
    let thbLeft = ctx.state.cashThb;
    let usdLeft = ctx.state.cashUsd;
    let picks = 0;
    const lesson = LESSONS[monthIndex(ctx.today) % LESSONS.length];

    for (const s of candidates) {
      if (picks >= 2) break;
      const price = quotes[s].price;
      const market = marketOf(s);
      const seed = findSeed(s);
      const name = seed?.name ?? s;
      const sector = sectorOf(s);
      const pos = ctx.state.positions.find((p) => p.symbol === s);
      const dropNote =
        pos && price < pos.avgCost * 0.9
          ? ` ตอนนี้ราคาต่ำกว่าต้นทุนเฉลี่ย ${(((pos.avgCost - price) / pos.avgCost) * 100).toFixed(1)}% แต่ Bot ไม่ขายตอนตลาดตก เพราะพื้นฐานกิจการยังไม่เปลี่ยน`
          : "";
      const weightPct = (weightOf(s) * 100).toFixed(0);

      if (market === "TH") {
        let lots = Math.floor(perPick / (price * SET_BOARD_LOT));
        while (lots > 0) {
          const qty = lots * SET_BOARD_LOT;
          const pv = previewTrade({ ...ctx.state, cashThb: thbLeft }, { symbol: s, market, side: "buy", qty }, price, ctx.fees);
          if (pv.ok) {
            thbLeft -= pv.value.total;
            actions.push({
              kind: "buy",
              symbol: s,
              qty,
              explanation:
                `ซื้อ ${name} ${fmtQty(qty)} หุ้น ที่ ${fmtMoney(price, "THB")} (รวม ${fmtMoney(pv.value.total, "THB")}) เพราะเป็นกิจการกลุ่ม${sector}ที่มั่นคง และพอร์ตยังมีหุ้นตัวนี้แค่ ${weightPct}%` +
                ` ถ้าราคาลง 10% (เหลือ ${fmtMoney(price * 0.9, "THB")}) จะไม่ขาย แต่จะซื้อต่อตามแผนเดือนหน้า${dropNote} บทเรียน: ${lesson}`,
            });
            picks++;
            break;
          }
          lots--;
        }
        continue;
      }

      // หุ้นสหรัฐฯ: แลกเงินแล้วซื้อเป็นจำนวนเงิน (เศษหุ้นได้)
      const rate = buyUsdRate(ctx.fees, ctx.fxMid);
      const thbForPick = Math.min(perPick, thbLeft + usdLeft * rate);
      const usdBudget = round2(thbForPick / rate);
      if (usdBudget < 1) continue;
      // เผื่อค่าคอม
      const comm = commission(ctx.fees, "US", usdBudget);
      const amountUsd = round2(usdBudget - comm);
      if (amountUsd <= 0) continue;
      const needUsd = round2(amountUsd + commission(ctx.fees, "US", amountUsd));
      if (needUsd > usdLeft) {
        const thb = round2((needUsd - usdLeft) * rate + 0.01);
        if (thb > thbLeft) continue;
        actions.push({ kind: "exchange", thb });
        thbLeft -= thb;
        usdLeft += round2(thb / rate);
      }
      usdLeft -= needUsd;
      const qty = amountUsd / price;
      actions.push({
        kind: "buy",
        symbol: s,
        amountUsd,
        explanation:
          `ซื้อ ${name} มูลค่า ${fmtMoney(amountUsd, "USD")} (ประมาณ ${fmtQty(qty)} หุ้น ที่ ${fmtMoney(price, "USD")}) เพราะเป็นกิจการกลุ่ม${sector}ระดับโลก และพอร์ตยังมีตัวนี้แค่ ${weightPct}%` +
          ` ถ้าราคาลง 10% จะถือต่อและซื้อเพิ่มตามแผน${dropNote} บทเรียน: ${picks === 0 ? US_LESSON : lesson}`,
      });
      picks++;
    }

    return { actions, dcaMonth: month };
  },
};

export const STRATEGIES: Record<string, BotStrategy> = { [longTermStrategy.id]: longTermStrategy };
