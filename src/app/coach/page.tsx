import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { askCannedAction, chatAction } from "@/app/actions";
import { MessageCard } from "@/components/MessageCard";
import { SubmitButton } from "@/components/SubmitButton";
import { Change, Disclaimer, EmptyState, More, PageTitle } from "@/components/ui";
import { findSeed } from "@/config/seeds";
import { aiEnabled, aiUsage } from "@/lib/ai";
import { longTermStrategy } from "@/lib/bot/longterm";
import { CANNED_QA } from "@/lib/coach";
import { getDb } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { findPortfolioId, viewPortfolio } from "@/lib/game/core";
import { returns } from "@/lib/game/flow";
import { loadGame } from "@/lib/server";

export default async function CoachPage() {
  const l = await loadGame();
  if (!l.game) {
    return (
      <EmptyState title="ยังไม่ได้เริ่มเกม">
        <Link href="/" className="btn-primary mt-2">
          เลือกเงินเริ่มต้น
        </Link>
      </EmptyState>
    );
  }
  const db = getDb();
  const r = await returns(l.ctx);
  const autoRet = async (owner: "dca" | "daytrade") => {
    const id = findPortfolioId(getDb(), l.game.id, owner);
    return id === null ? null : (await viewPortfolio(l.ctx, id)).valuation.totalThb / l.game.startingCash - 1;
  };
  const [dcaRet, dtRet] = await Promise.all([autoRet("dca"), autoRet("daytrade")]);
  const board = [
    { label: "พอร์ตคุณ", ret: r.playerReturn as number | null, href: "/portfolio", hint: "" },
    { label: "Bot ถือยาว", ret: r.botReturn as number | null, href: "", hint: "DCA หุ้นพื้นฐานดี ไม่ขาย" },
    { label: "Bot เดย์เทรด", ret: dtRet, href: "/daytrade", hint: "ซื้อขายจบในวัน" },
    { label: "พอร์ต DCA ของคุณ", ret: dcaRet, href: "/dca", hint: "ลงเงินทุกเดือนตามแผนคุณ" },
  ];
  const all = db.select().from(messages).where(eq(messages.gameId, l.game.id)).orderBy(desc(messages.id)).limit(200).all();
  const cards = all.filter((m) => (m.kind === "summary" || m.kind === "bot_trade") && !m.dismissed).slice(0, 5);
  const old = all.filter((m) => (m.kind === "summary" || m.kind === "bot_trade") && m.dismissed).slice(0, 30);
  const chat = all
    .filter((m) => m.kind === "chat_user" || m.kind === "chat_bot")
    .slice(0, 20)
    .reverse();
  const ai = aiEnabled(db);
  const usage = aiUsage(db);
  const bv = r.bot.valuation;

  return (
    <>
      <PageTitle sub={ai ? `ใช้ Claude อยู่ (วันนี้ใช้ไป ${usage.used}/${usage.limit} ข้อความ)` : "โหมดฟรี: อาจารย์แบบกฎ (เปิด Claude ได้ในหน้าตั้งค่า)"}>อาจารย์</PageTitle>

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="min-w-0">
          <section className="card mb-4">
            <h2 className="font-semibold">เทียบผลตอบแทนทุกพอร์ต</h2>
            <p className="faint text-[0.8rem]">ทุกพอร์ตเริ่มด้วยเงิน {fmtMoney(l.game.startingCash)}</p>
            <ul className="mt-2 divide-y divide-line">
              {board.map((b) => (
                <li key={b.label} className="flex min-h-[48px] items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    {b.href ? (
                      <Link href={b.href} className="font-medium hover:underline">
                        {b.label}
                      </Link>
                    ) : (
                      <span className="font-medium">{b.label}</span>
                    )}
                    {b.hint && <span className="faint block text-[0.8rem]">{b.hint}</span>}
                  </span>
                  {b.ret === null ? (
                    <Link href={b.href} className="btn-secondary min-h-[40px] px-3 text-[0.85rem]">
                      เริ่ม
                    </Link>
                  ) : (
                    <Change pct={b.ret} />
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2 className="font-bold">Bot บุคลิก &quot;{longTermStrategy.name}&quot;</h2>
            <p className="muted text-[0.9rem]">{longTermStrategy.description}</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <div className="muted text-[0.85rem]">ผลตอบแทน Bot</div>
                <Change pct={r.botReturn} className="text-xl" />
              </div>
              <div>
                <div className="muted text-[0.85rem]">ผลตอบแทนคุณ</div>
                <Change pct={r.playerReturn} className="text-xl" />
              </div>
            </div>
            <More summary="ดูพอร์ตของ Bot">
              {bv.holdings.length === 0 ? (
                <p className="muted">Bot ยังไม่ได้ซื้อหุ้น (จะเริ่ม DCA เมื่อตลาดเปิด)</p>
              ) : (
                <ul className="space-y-1">
                  {bv.holdings.map((h) => (
                    <li key={h.symbol} className="flex justify-between gap-2">
                      <span>
                        {h.symbol.replace(".BK", "")} <span className="muted text-[0.85rem]">{findSeed(h.symbol)?.sector}</span>
                      </span>
                      <span>
                        {fmtMoney(h.marketValueThb)} <Change pct={h.unrealizedPct} className="text-[0.85rem]" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted mt-2 text-[0.85rem]">
                มูลค่ารวม {fmtMoney(bv.totalThb)} · เงินสด {fmtMoney(bv.cashThb)} + {fmtMoney(bv.cashUsd, "USD")}
              </p>
            </More>
          </section>

          <h2 className="mb-2 mt-5 text-lg font-bold">ข้อความใหม่จากอาจารย์</h2>
          {cards.length === 0 ? (
            <EmptyState title="ยังไม่มีข้อความใหม่">
              {l.game.mode === "backtest" ? "กดเลื่อนวันที่หน้าแรก แล้วอาจารย์จะสรุปผลให้" : "อาจารย์จะสรุปผลหลังตลาดปิด และอธิบายทุกไม้ที่ Bot ซื้อขาย"}
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {cards.map((m) => (
                <MessageCard key={m.id} id={m.id} kind={m.kind} date={m.date} text={m.text} />
              ))}
            </div>
          )}

          {old.length > 0 && (
            <More summary="ข้อความที่อ่านแล้ว">
              <ul className="space-y-2">
                {old.map((m) => (
                  <li key={m.id} className="card whitespace-pre-line text-[0.9rem]">
                    <span className="muted">{fmtDate(m.date)} · </span>
                    {m.text}
                  </li>
                ))}
              </ul>
            </More>
          )}
        </div>

        <div className="min-w-0 lg:sticky lg:top-6">
          <Link href="/picks" className="btn-secondary mt-5 w-full lg:mt-0">
            ดูหุ้นน่าสนใจที่ Bot และ AI คัดให้
          </Link>
          <section className="card mt-3">
            <h2 className="font-bold">คำถามสำเร็จรูป</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {CANNED_QA.map((qa, i) => (
                <form key={qa.q} action={askCannedAction.bind(null, i)}>
                  <button type="submit" className="btn-secondary text-[0.9rem]">
                    {qa.q}
                  </button>
                </form>
              ))}
            </div>
            {chat.length > 0 && (
              <ol className="mt-4 space-y-2" aria-label="บทสนทนา">
                {chat.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-lg px-3 py-2 ${m.kind === "chat_user" ? "ml-8 bg-accent text-white" : "mr-8 bg-subtle"}`}
                  >
                    <span className="sr-only">{m.kind === "chat_user" ? "คุณ: " : "อาจารย์: "}</span>
                    {m.text}
                  </li>
                ))}
              </ol>
            )}
            {ai ? (
              <form action={chatAction} className="mt-3 flex gap-2">
                <label htmlFor="chat" className="sr-only">
                  พิมพ์คำถาม
                </label>
                <input id="chat" name="text" className="input" placeholder="ถามอาจารย์…" maxLength={500} required />
                <SubmitButton className="btn-primary shrink-0" pendingText="…">
                  ส่ง
                </SubmitButton>
              </form>
            ) : (
              <p className="muted mt-3 text-[0.85rem]">แชทพิมพ์อิสระใช้ได้เมื่อเปิด Claude (ใส่ ANTHROPIC_API_KEY และเปิดสวิตช์ในตั้งค่า)</p>
            )}
          </section>
        </div>
      </div>
      <p className="muted mt-3 text-[0.85rem]">
        คุณ {fmtPct(r.playerReturn)} · Bot {fmtPct(r.botReturn)}
      </p>
      <Disclaimer />
    </>
  );
}
