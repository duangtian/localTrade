import type { FeeConfig } from "@/config/fees";
import type { PortfolioState } from "@/lib/engine/portfolio";
import type { PriceProvider } from "@/lib/prices/types";

/**
 * ข้อมูลที่ Bot เห็นได้ — provider ตรงนี้ถูกจำกัดเวลาแล้วในโหมดย้อนอดีต
 * Bot ต้องใช้ข้อมูลจาก ctx เท่านั้น ห้าม import provider อื่นเอง
 */
export interface BotContext {
  today: string;
  provider: PriceProvider;
  state: PortfolioState;
  startingCash: number;
  lastDcaMonth: string | null;
  fees: FeeConfig;
  fxMid: number;
  canTrade(symbol: string): Promise<boolean>;
}

export type BotAction =
  | { kind: "exchange"; thb: number }
  | { kind: "buy"; symbol: string; qty?: number; amountUsd?: number; explanation: string }
  | { kind: "sell"; symbol: string; qty: number; explanation: string };

export interface BotDecision {
  actions: BotAction[];
  /** ถ้าตั้งค่า = บันทึกว่า DCA เดือนนี้แล้ว */
  dcaMonth?: string;
}

/** เพิ่มบุคลิกใหม่ (เช่น Day trader ใน v2) ได้โดย implement interface นี้ */
export interface BotStrategy {
  id: string;
  name: string;
  description: string;
  decide(ctx: BotContext): Promise<BotDecision>;
}
