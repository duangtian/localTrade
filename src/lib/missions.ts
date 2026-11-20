/** ภารกิจ: ตรวจอัตโนมัติจากข้อมูลการซื้อขาย ให้คะแนนจาก "วินัย" ไม่ใช่กำไร */
import { DateTime } from "luxon";
import { CONCENTRATION_WARN } from "@/config/app";
import { sectorOf } from "@/config/seeds";
import type { OrderRow } from "@/lib/game/core";
import type { Valuation } from "@/lib/engine/portfolio";
import { AI_PLAN_PREFIX } from "@/lib/analysis/allocate";

export interface MissionInput {
  today: string;
  orders: OrderRow[]; // ของผู้เล่น ทุกสถานะ
  valuation: Valuation;
  summariesRead: number;
  /** ประวัติจำนวนหุ้นที่ถือรายวัน: ใช้วันเปิดสถานะจาก positions */
  positionsOpenedAt: { symbol: string; openedAt: string }[];
}

export interface Mission {
  id: string;
  title: string;
  hint: string;
  points: number;
  done: boolean;
  progress?: string;
}

const day = (s: string) => s.slice(0, 10);

export function evaluateMissions(input: MissionInput): Mission[] {
  // คำสั่งที่มาจาก "AI จัดพอร์ต" ไม่นับในภารกิจ เพราะภารกิจวัดวินัยของผู้เล่นเอง
  const m = { ...input, orders: input.orders.filter((o) => !o.reason.startsWith(AI_PLAN_PREFIX)) };
  const filled = m.orders.filter((o) => o.status === "filled").sort((a, b) => a.id - b.id);
  const buys = filled.filter((o) => o.side === "buy");
  const sells = filled.filter((o) => o.side === "sell");
  const allPlaced = m.orders.filter((o) => o.status !== "rejected").sort((a, b) => a.id - b.id);
  const buyPlaced = allPlaced.filter((o) => o.side === "buy");

  // ตั้ง stop-loss ทุกไม้ 5 ครั้งติด
  let streak = 0;
  let best = 0;
  for (const o of buyPlaced) {
    streak = o.stopLoss ? streak + 1 : 0;
    best = Math.max(best, streak);
  }

  const sectors = new Set(m.valuation.holdings.map((h) => sectorOf(h.symbol)));
  const longReasons = allPlaced.filter((o) => o.reason.trim().length >= 50).length;

  // ขายตื่นตระหนก = ขายขาดทุนภายใน 7 วันหลังซื้อหุ้นตัวนั้น
  const panic = sells.some((s) => {
    if ((s.realizedPnlThb ?? 0) >= 0) return false;
    const buy = [...buys].reverse().find((b) => b.symbol === s.symbol && b.id < s.id);
    if (!buy) return false;
    return DateTime.fromISO(day(s.filledAt ?? s.createdAt)).diff(DateTime.fromISO(day(buy.filledAt ?? buy.createdAt)), "days").days < 7;
  });
  const longestHold = Math.max(
    0,
    ...m.positionsOpenedAt.map((p) => DateTime.fromISO(m.today).diff(DateTime.fromISO(p.openedAt), "days").days),
  );

  const usBuy = buys.some((o) => o.market === "US");
  const diversified = m.valuation.holdings.length >= 3 && m.valuation.holdings.every((h) => h.weight <= CONCENTRATION_WARN);

  return [
    { id: "first_buy", title: "ซื้อหุ้นตัวแรกพร้อมเหตุผล", hint: "ไปที่หน้า ตลาด เลือกหุ้น แล้วเขียนเหตุผลก่อนซื้อ", points: 10, done: buys.length > 0 },
    {
      id: "three_sectors",
      title: "ถือหุ้น 3 กลุ่มอุตสาหกรรม",
      hint: "กระจายไปหลายธุรกิจ เช่น ธนาคาร พลังงาน การแพทย์",
      points: 15,
      done: sectors.size >= 3,
      progress: `${Math.min(sectors.size, 3)}/3 กลุ่ม`,
    },
    {
      id: "stoploss_streak",
      title: "ตั้ง stop-loss ทุกไม้ 5 ครั้งติด",
      hint: "ในขั้นตอนซื้อ ใส่ราคา stop-loss ทุกครั้ง",
      points: 20,
      done: best >= 5,
      progress: `${Math.min(streak, 5)}/5 ไม้ติดกัน`,
    },
    {
      id: "hold_30",
      title: "ถือครบ 30 วันโดยไม่ขายตื่นตระหนก",
      hint: "ถือหุ้นตัวใดตัวหนึ่งครบ 30 วัน และไม่ขายขาดทุนภายใน 7 วันหลังซื้อ",
      points: 20,
      done: longestHold >= 30 && !panic,
      progress: panic ? "มีการขายตื่นตระหนก เริ่มใหม่ด้วยการถือให้ครบ" : `ถือนานสุด ${Math.floor(longestHold)}/30 วัน`,
    },
    {
      id: "long_reason",
      title: "เขียนเหตุผลละเอียด (50 ตัวอักษรขึ้นไป) 3 ไม้",
      hint: "บอกว่าธุรกิจทำอะไร ทำไมน่าสนใจ และจะทำอย่างไรถ้าผิดคาด",
      points: 10,
      done: longReasons >= 3,
      progress: `${Math.min(longReasons, 3)}/3 ไม้`,
    },
    { id: "target", title: "ตั้งเป้าหมายราคาครั้งแรก", hint: "ใส่ราคาเป้าหมายในขั้นตอนซื้อ", points: 5, done: allPlaced.some((o) => o.targetPrice) },
    { id: "us_first", title: "แลกเงิน USD แล้วซื้อหุ้นสหรัฐฯ ตัวแรก", hint: "หุ้นสหรัฐฯ ซื้อเป็นเศษหุ้นได้ แต่ต้องแลกเงินก่อน", points: 10, done: usBuy },
    {
      id: "diversified",
      title: "ถือ 3 ตัวขึ้นไป และไม่มีตัวไหนเกิน 40%",
      hint: "การกระจายช่วยให้พอร์ตไม่พังเพราะหุ้นตัวเดียว",
      points: 15,
      done: diversified,
    },
    {
      id: "review",
      title: "อ่านสรุปจากอาจารย์ 3 ครั้ง",
      hint: "กดปิดการ์ดสรุปหลังอ่านแล้ว (หน้าอาจารย์)",
      points: 5,
      done: m.summariesRead >= 3,
      progress: `${Math.min(m.summariesRead, 3)}/3 ครั้ง`,
    },
  ];
}
