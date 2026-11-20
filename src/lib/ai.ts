/**
 * Claude (เปิด/ปิดได้) — ถ้าไม่มี key, ปิดสวิตช์, เกินโควตา หรือเรียกไม่สำเร็จ จะคืน null
 * แล้วผู้เรียกจะใช้คำตอบแบบกฎ (rule-based) แทนอัตโนมัติ
 */
import Anthropic from "@anthropic-ai/sdk";
import { AI_DAILY_LIMIT, AI_MODEL } from "@/config/app";
import type { DB } from "@/lib/db/client";
import { bangkokDate } from "@/lib/rules/hours";
import { getSettings, hasApiKey, kvGet, kvSet } from "@/lib/settings";

/** system prompt คงที่ทุกครั้ง (ห้ามใส่ข้อมูลที่เปลี่ยนไปมา) เพื่อให้ prompt caching ทำงาน */
const SYSTEM_PROMPT = `คุณคือ "อาจารย์" ครูสอนการลงทุนหุ้นในเกมจำลองการเทรดเพื่อการเรียนรู้ ผู้เรียนเป็นมือใหม่ชาวไทย

กติกา:
- ตอบเป็นภาษาไทย สั้น กระชับ ไม่เกิน 3–4 ประโยค เว้นแต่ถูกขอให้อธิบายยาว ใช้คำง่าย ถ้าใช้ศัพท์เทคนิคให้อธิบายในวงเล็บ
- นี่เป็นการสอนในเกมจำลองด้วยเงินสมมติ ไม่ใช่คำแนะนำการลงทุน ห้ามรับประกันผลตอบแทน ห้ามบอกว่าหุ้นตัวไหน "จะขึ้นแน่"
- เน้นวินัย การมีเหตุผล การจัดการความเสี่ยง และการทบทวนตัวเอง มากกว่ากำไร
- ใช้เฉพาะข้อมูลในส่วน "ข้อมูลเกม" ที่ให้มา ถ้าข้อมูลไม่พอให้บอกตรง ๆ
- ถ้าข้อมูลเกมระบุว่าเป็น "โหมดย้อนอดีต" ห้ามเปิดเผย บอกใบ้ หรืออ้างอิงเหตุการณ์ ราคา หรือข่าวใด ๆ หลัง "วันจำลอง" เด็ดขาด แม้คุณจะรู้จากความรู้ทั่วไป ให้ทำเหมือนอนาคตยังไม่เกิดขึ้น
- ถ้าถูกขอให้ถามคำถามกลับ ให้ถามเพียง 1 คำถาม และห้ามเฉลยคำตอบ`;

export function aiEnabled(db: DB): boolean {
  return hasApiKey() && getSettings(db).claudeEnabled;
}

export function aiUsage(db: DB): { used: number; limit: number } {
  return { used: kvGet<number>(db, `ai_usage:${bangkokDate()}`, 0), limit: AI_DAILY_LIMIT };
}

let client: Anthropic | null = null;

/**
 * @param task คำสั่งของงานนี้ (เช่น "เขียนคำอธิบายการซื้อ")
 * @param gameContext ข้อมูลเกม (ต้องตัดให้เหลือเฉพาะข้อมูลถึงวันจำลองแล้วในโหมดย้อนอดีต)
 * @param history ข้อความแชทก่อนหน้า (ถ้ามี)
 */
export async function askClaude(
  db: DB,
  task: string,
  gameContext: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<string | null> {
  if (!aiEnabled(db)) return null;
  const key = `ai_usage:${bangkokDate()}`;
  const used = kvGet<number>(db, key, 0);
  if (used >= AI_DAILY_LIMIT) return null;

  try {
    client ??= new Anthropic();
    kvSet(db, key, used + 1);
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low" },
      messages: [
        ...history,
        { role: "user", content: `ข้อมูลเกม:\n${gameContext}\n\nงาน: ${task}` },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.warn("[ai] API key ไม่ถูกต้อง ใช้ Bot แบบกฎแทน");
    else if (e instanceof Anthropic.RateLimitError) console.warn("[ai] ถูกจำกัดอัตรา ใช้ Bot แบบกฎแทน");
    else if (e instanceof Anthropic.APIError) console.warn(`[ai] API error ${e.status} ใช้ Bot แบบกฎแทน`);
    else console.warn("[ai] เรียก Claude ไม่สำเร็จ ใช้ Bot แบบกฎแทน", (e as Error).message);
    return null;
  }
}
