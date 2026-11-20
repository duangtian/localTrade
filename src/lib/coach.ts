/** อาจารย์แบบกฎ (ไม่มีค่าใช้จ่าย) + ตัวสร้างข้อมูลบริบทสำหรับ Claude */
import { CONCENTRATION_WARN } from "@/config/app";
import { findSeed } from "@/config/seeds";
import type { OrderRow } from "@/lib/game/core";
import type { Valuation } from "@/lib/engine/portfolio";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";

export interface CoachInput {
  side: "buy" | "sell";
  symbol: string;
  reason: string;
  price: number;
  currency: "THB" | "USD";
  stopLoss?: number | null;
  /** สัดส่วนของหุ้นตัวนี้ในพอร์ตหลังทำรายการ (0–1) */
  weightAfter?: number;
}

const has = (text: string, words: string[]) => words.some((w) => text.toLowerCase().includes(w));

/** ถามกลับ 1 คำถามจากเหตุผลที่ผู้เล่นเขียน (ไม่บอกคำตอบ) */
export function coachQuestion(i: CoachInput): string {
  const r = i.reason;
  if (i.side === "sell") {
    if (has(r, ["กลัว", "ตก", "ลง", "panic", "ตื่น"])) {
      return "เหตุผลที่คุณซื้อหุ้นตัวนี้ตอนแรกยังเป็นจริงอยู่ไหม หรือที่ขายเพราะราคาอย่างเดียว?";
    }
    return "ถ้าขายแล้วราคาขึ้นต่ออีก 10% เหตุผลที่ขายวันนี้ยังใช้ได้อยู่ไหม?";
  }
  if (i.weightAfter !== undefined && i.weightAfter > CONCENTRATION_WARN) {
    return `หลังซื้อ หุ้นตัวนี้จะเป็น ${(i.weightAfter * 100).toFixed(0)}% ของพอร์ต ถ้ากิจการนี้มีข่าวร้าย พอร์ตของคุณจะเป็นอย่างไร?`;
  }
  if (has(r, ["เพื่อน", "ข่าว", "tiktok", "ติ๊กต็อก", "youtube", "ยูทูป", "กลุ่ม", "บอก", "ฮิต", "กำลังขึ้น", "ขึ้นเยอะ"])) {
    return "ถ้าข้อมูลที่ได้ยินมาไม่จริง เหตุผลนี้ยังทำให้คุณอยากซื้ออยู่ไหม?";
  }
  if (!i.stopLoss && !has(r, ["ขาดทุน", "stop", "ตัด", "ตก", "ลง"])) {
    const p10 = fmtMoney(i.price * 0.9, i.currency);
    return `ถ้าราคาตก 10% (เหลือประมาณ ${p10}) คุณจะทำอย่างไร?`;
  }
  if (!has(r, ["เดือน", "ปี", "ยาว", "สั้น", "วัน", "สัปดาห์"])) {
    return "คุณตั้งใจจะถือหุ้นตัวนี้นานแค่ไหน และอะไรจะทำให้คุณขาย?";
  }
  return "อะไรคือสัญญาณที่จะบอกคุณว่าเหตุผลนี้ผิด?";
}

export interface SummaryInput {
  date: string;
  playerReturn: number;
  botReturn: number;
  valuation: Valuation;
  recentOrders: OrderRow[];
  cashRatio: number;
  daysSinceStart: number;
}

/** ชี้จุดที่ควรปรับ 1 ข้อ */
export function improvementTip(s: SummaryInput): string {
  const big = s.valuation.holdings.find((h) => h.weight > CONCENTRATION_WARN);
  if (big) {
    return `${big.symbol.replace(".BK", "")} เป็น ${(big.weight * 100).toFixed(0)}% ของพอร์ต ซึ่งเกิน 40% ลองกระจายไปกลุ่มอื่นเพื่อลดความเสี่ยง`;
  }
  const buys = s.recentOrders.filter((o) => o.status === "filled" && o.side === "buy").slice(0, 5);
  if (buys.length >= 2 && buys.some((o) => !o.stopLoss)) {
    return "บางไม้ยังไม่ได้ตั้ง stop-loss ลองกำหนดจุดตัดขาดทุนก่อนซื้อทุกครั้ง จะได้ไม่ต้องตัดสินใจตอนตื่นตระหนก";
  }
  const panic = s.recentOrders.find((o) => o.status === "filled" && o.side === "sell" && (o.realizedPnlThb ?? 0) < 0);
  if (panic) {
    return `คุณขาย ${panic.symbol.replace(".BK", "")} แบบขาดทุน ลองกลับไปอ่านเหตุผลตอนซื้อ แล้วถามตัวเองว่าขายเพราะเหตุผลเปลี่ยน หรือเพราะกลัว`;
  }
  const filled = s.recentOrders.filter((o) => o.status === "filled");
  if (filled.length >= 6) {
    return "ช่วงนี้ซื้อขายบ่อย ค่าคอมจะกินกำไร ลองกำหนดว่าจะซื้อขายเฉพาะเมื่อมีเหตุผลใหม่จริง ๆ";
  }
  if (s.cashRatio > 0.8 && s.daysSinceStart >= 14) {
    return "เงินสดยังเหลือเกิน 80% ลองแบ่งลงทุนทีละน้อยแบบ DCA เพื่อฝึกวินัยโดยไม่ต้องเดาจังหวะ";
  }
  if (filled.length === 0) {
    return "ยังไม่ได้ซื้อหุ้นเลย ลองเลือกกิจการที่คุณเข้าใจธุรกิจ 1 ตัว แล้วเขียนเหตุผลก่อนซื้อ";
  }
  return "ลองอ่านเหตุผลที่เขียนไว้ตอนซื้อไม้ล่าสุด แล้วจดว่าตอนนี้ยังเห็นด้วยกับตัวเองไหม";
}

export function summaryText(s: SummaryInput): string {
  const diff = s.playerReturn - s.botReturn;
  const verdict =
    Math.abs(diff) < 0.001 ? "ใกล้เคียงกับ Bot" : diff > 0 ? `ดีกว่า Bot ${fmtPct(diff).replace("+", "")}` : `ตามหลัง Bot ${fmtPct(-diff).replace("+", "")}`;
  return `สรุปวันที่ ${fmtDate(s.date)}: พอร์ตคุณ ${fmtPct(s.playerReturn)} เทียบ Bot ${fmtPct(s.botReturn)} (${verdict}) จำไว้ว่าเป้าหมายคือวินัย ไม่ใช่ชนะ Bot\nจุดที่ควรปรับ: ${improvementTip(s)}`;
}

export const CANNED_QA: { q: string; a: string }[] = [
  {
    q: "P/E คืออะไร",
    a: "P/E คือราคาหุ้นหารด้วยกำไรต่อหุ้น เช่น P/E 10 แปลว่าจ่าย 10 บาทเพื่อกำไร 1 บาทต่อปี P/E สูงไม่ได้แปลว่าแย่เสมอ อาจเพราะตลาดคาดว่ากำไรจะโต ควรเทียบกับบริษัทในกลุ่มเดียวกัน",
  },
  {
    q: "ทำไมต้องกระจายหุ้น",
    a: "ถ้าถือตัวเดียวแล้วกิจการนั้นมีปัญหา พอร์ตจะเสียหายหนัก การถือหลายตัวหลายกลุ่มทำให้ข่าวร้ายของตัวหนึ่งกระทบพอร์ตน้อยลง ในเกมนี้จะเตือนเมื่อหุ้นตัวเดียวเกิน 40%",
  },
  {
    q: "DCA คืออะไร",
    a: "DCA คือการลงเงินเท่า ๆ กันเป็นประจำ เช่น ทุกเดือน ไม่ว่าราคาจะขึ้นหรือลง ตอนราคาต่ำจะได้หุ้นมากขึ้น ตอนราคาสูงได้น้อยลง ช่วยให้ไม่ต้องเดาจังหวะตลาด Bot ในเกมใช้วิธีนี้",
  },
  {
    q: "Stop-loss คืออะไร",
    a: "Stop-loss คือราคาที่ตั้งใจไว้ล่วงหน้าว่าจะขายตัดขาดทุน เช่น ซื้อ 100 บาท ตั้งไว้ 90 บาท ข้อดีคือได้ตัดสินใจตอนใจเย็น ไม่ใช่ตอนตื่นตระหนก",
  },
  {
    q: "ค่าเงินมีผลกับหุ้นสหรัฐฯ อย่างไร",
    a: "หุ้นสหรัฐฯ ซื้อด้วยดอลลาร์ ถ้าดอลลาร์แข็งค่า (บาทอ่อน) มูลค่าเป็นบาทจะเพิ่มขึ้น ถ้าดอลลาร์อ่อนค่าจะลดลง แม้ราคาหุ้นไม่เปลี่ยน หน้า พอร์ต จะแยกกำไรจากราคาหุ้นกับค่าเงินให้ดู",
  },
  {
    q: "ทำไม Bot ไม่ขายตอนตลาดตก",
    a: "Bot ถือยาวซื้อกิจการพื้นฐานดีและตั้งใจถือหลายปี ราคาที่ตกระยะสั้นมักมาจากอารมณ์ตลาด ถ้าพื้นฐานกิจการไม่เปลี่ยน การขายตอนตกคือการล็อกขาดทุน Bot จึงซื้อต่อตามแผนแทน",
  },
  {
    q: "ปันผลคืออะไร",
    a: "ปันผลคือส่วนแบ่งกำไรที่บริษัทจ่ายให้ผู้ถือหุ้นเป็นเงินสด อัตราปันผลคือปันผลต่อปีหารด้วยราคาหุ้น (เกมนี้ v1 ยังไม่จ่ายปันผลเข้าพอร์ต)",
  },
];

/** สร้างข้อความบริบทสำหรับ Claude — รับเฉพาะข้อมูลที่ผ่าน provider ที่ถูกจำกัดเวลาแล้ว */
export function buildAiContext(opts: {
  mode: "live" | "backtest";
  today: string;
  startingCash: number;
  valuation: Valuation;
  botReturn: number;
  recentOrders: OrderRow[];
}): string {
  const v = opts.valuation;
  const lines = [
    opts.mode === "backtest"
      ? `โหมด: ย้อนอดีต วันจำลอง = ${opts.today} (ห้ามพูดถึงสิ่งที่เกิดหลังวันนี้)`
      : `โหมด: เวลาจริง วันนี้ = ${opts.today}`,
    `เงินเริ่มต้น: ${fmtMoney(opts.startingCash)} มูลค่าพอร์ตตอนนี้: ${fmtMoney(v.totalThb)} (${fmtPct(v.totalThb / opts.startingCash - 1)}) Bot: ${fmtPct(opts.botReturn)}`,
    `เงินสด: ${fmtMoney(v.cashThb)} และ ${fmtMoney(v.cashUsd, "USD")}`,
    "หุ้นที่ถือ:",
    ...(v.holdings.length
      ? v.holdings.map(
          (h) =>
            `- ${h.symbol} (${findSeed(h.symbol)?.sector ?? "ไม่ทราบกลุ่ม"}) ${h.qty} หุ้น ต้นทุน ${h.avgCost.toFixed(2)} ราคา ${h.price.toFixed(2)} กำไรยังไม่เกิด ${fmtMoney(h.unrealizedThb)} สัดส่วน ${(h.weight * 100).toFixed(0)}%`,
        )
      : ["- ยังไม่มี"]),
    "คำสั่งล่าสุด:",
    ...(opts.recentOrders.length
      ? opts.recentOrders
          .filter((o) => o.createdAt.slice(0, 10) <= opts.today)
          .slice(0, 8)
          .map((o) => `- ${o.createdAt.slice(0, 10)} ${o.side === "buy" ? "ซื้อ" : "ขาย"} ${o.symbol} (${o.status}) เหตุผล: "${o.reason}"${o.stopLoss ? ` stop-loss ${o.stopLoss}` : ""}`)
      : ["- ยังไม่มี"]),
  ];
  return lines.join("\n");
}
