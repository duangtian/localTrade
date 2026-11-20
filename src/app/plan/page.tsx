import Link from "next/link";
import { buildPlanAction, cancelPlanAction } from "@/app/actions";
import { ConfirmPlan, ReviewItem } from "@/components/PlanActions";
import { StockBadge } from "@/components/StockBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { Disclaimer, EmptyState, More, PageTitle } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { buildReview, getPlan } from "@/lib/analysis/planner";
import { getDb } from "@/lib/db/client";
import { fmtMoney, fmtQty } from "@/lib/format";
import { loadState } from "@/lib/game/core";
import { loadGame } from "@/lib/server";

function Choice({ name, value, label, defaultChecked }: { name: string; value: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="fchip cursor-pointer has-[:checked]:border-white has-[:checked]:bg-white has-[:checked]:text-neutral-900">
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} className="sr-only" />
      {label}
    </label>
  );
}

export default async function PlanPage() {
  const db = getDb();
  const l = await loadGame({ sync: false });
  if (!l.game) {
    return (
      <EmptyState title="ยังไม่ได้เริ่มเกม">
        <Link href="/" className="btn-primary mt-2">
          ไปเลือกเงินเริ่มต้น
        </Link>
      </EmptyState>
    );
  }
  const plan = getPlan(db, l.ctx);
  const review = await buildReview(db, l.ctx, l.pid);
  const state = loadState(db, l.pid);
  const heldQty = (s: string) => state.positions.find((p) => p.symbol === s)?.qty ?? 0;
  const ai = aiEnabled(db);

  return (
    <>
      <PageTitle sub="AI เสนอแผนกระจายเงินและดูแลพอร์ต คุณตรวจแล้วกดยืนยันเอง">AI จัดพอร์ต</PageTitle>
      <p className="note-warn mb-4">
        แผนสร้างจากสถิติราคาในอดีต{l.ctx.mode === "live" ? "และข่าว" : ""} ไม่ได้รับประกันผล ลองเทียบกับเหตุผลของคุณเองก่อนยืนยัน คำสั่งจากแผนจะมีป้าย [แผน AI] และไม่นับในภารกิจ
      </p>

      <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6">
        {/* แผนกระจายเงินสด */}
        <section className="min-w-0">
          <h2 className="section-title mt-0">กระจายเงินสด</h2>
          <form action={buildPlanAction} className="card space-y-3">
            <fieldset>
              <legend className="label">ซื้อหุ้นตลาด</legend>
              <div className="flex flex-wrap gap-2">
                <Choice name="market" value="TH" label="ไทย" defaultChecked={(plan?.options.market ?? "TH") === "TH"} />
                <Choice name="market" value="US" label="สหรัฐฯ" defaultChecked={plan?.options.market === "US"} />
                <Choice name="market" value="BOTH" label="ทั้งสอง" defaultChecked={plan?.options.market === "BOTH"} />
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">จำนวนหุ้น</legend>
              <div className="flex flex-wrap gap-2">
                {[3, 5, 8].map((n) => (
                  <Choice key={n} name="n" value={String(n)} label={`${n} ตัว`} defaultChecked={(plan?.options.maxPositions ?? 5) === n} />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">ใช้เงินสด</legend>
              <div className="flex flex-wrap gap-2">
                {[0.5, 0.7, 0.9].map((u) => (
                  <Choice key={u} name="use" value={String(u)} label={`${u * 100}%`} defaultChecked={(plan?.options.usePct ?? 0.7) === u} />
                ))}
              </div>
              <p className="faint mt-1 text-[0.8rem]">เก็บเงินสดส่วนที่เหลือไว้ซื้อเพิ่มตอนราคาลง</p>
            </fieldset>
            <SubmitButton className="btn-accent w-full" pendingText="AI กำลังสแกนและจัดแผน…">
              {plan ? "จัดแผนใหม่" : "ให้ AI เสนอแผน"}
            </SubmitButton>
          </form>

          {plan && (
            <div className="mt-4 space-y-3">
              <div className="card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">แผนที่เสนอ</h3>
                  <span className="muted text-[0.85rem]">
                    ใช้ ≈ {fmtMoney(plan.usedThb)} จากเงินสด {fmtMoney(plan.cashThb)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line text-[0.95rem]">{plan.commentary}</p>
                <p className="faint mt-1 text-[0.8rem]">{plan.byAi ? "อธิบายโดย AI (Claude)" : ai ? "AI ไม่ตอบ ใช้คำอธิบายของ Bot" : "คำอธิบายของ Bot (เปิด Claude ในตั้งค่าเพื่อให้ AI อธิบาย)"}</p>
              </div>

              {plan.items.length > 0 && (
                <ol className="card overflow-hidden p-0">
                  {plan.exchangeThb > 0 && (
                    <li className="border-b border-line px-4 py-3 text-[0.9rem]">
                      <b>ขั้นแรก:</b> แลก {fmtMoney(plan.exchangeThb)} เป็น USD สำหรับหุ้นสหรัฐฯ
                    </li>
                  )}
                  {plan.items.map((it) => (
                    <li key={it.symbol} className="border-b border-line px-4 py-3 last:border-b-0">
                      <div className="flex items-center gap-3">
                        <StockBadge symbol={it.symbol} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold leading-tight">
                            {it.symbol.replace(".BK", "")} <span className="muted font-normal">· {it.sector}</span>
                          </p>
                          <p className="muted truncate text-[0.85rem]">{it.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{it.qty ? `${fmtQty(it.qty)} หุ้น` : fmtMoney(it.amountUsd!, "USD")}</p>
                          <p className="faint text-[0.8rem]">
                            ≈ {fmtMoney(it.costThb)} · {(it.weightAfter * 100).toFixed(0)}% ของพอร์ต
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-[0.85rem] text-white/75">{it.reason}</p>
                      {it.orderType === "limit" && <p className="faint text-[0.8rem]">ตลาดปิด: ตั้ง Limit ที่ราคา {it.price}</p>}
                    </li>
                  ))}
                </ol>
              )}

              {plan.skipped.length > 0 && (
                <More summary={`ตัวที่ข้าม (${plan.skipped.length})`}>
                  <ul className="space-y-1 text-[0.85rem]">
                    {plan.skipped.map((s) => (
                      <li key={s.symbol}>
                        <b>{s.symbol.replace(".BK", "")}</b> <span className="muted">— {s.why}</span>
                      </li>
                    ))}
                  </ul>
                </More>
              )}

              {plan.items.length > 0 && (
                <div className="card">
                  <ConfirmPlan count={plan.items.length} total={fmtMoney(plan.usedThb)} />
                  <form action={cancelPlanAction} className="mt-2">
                    <button type="submit" className="btn-secondary w-full">
                      ไม่เอาแผนนี้
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </section>

        {/* บริหารพอร์ต */}
        <section className="mt-6 min-w-0 lg:mt-0">
          <h2 className="section-title mt-0">ดูแลพอร์ต</h2>
          {state.positions.length === 0 ? (
            <div className="card muted">ยังไม่มีหุ้นให้ดูแล เมื่อซื้อแล้ว AI จะตรวจ stop-loss เป้าหมาย แนวโน้ม และสัดส่วนให้ทุกครั้งที่เปิดหน้านี้</div>
          ) : review.length === 0 ? (
            <div className="card">
              <p className="font-semibold">พอร์ตอยู่ในเกณฑ์ ไม่ต้องทำอะไร</p>
              <p className="muted mt-1 text-[0.9rem]">ไม่มีตัวไหนหลุด stop-loss ถึงเป้า แนวโน้มเสีย หรือเกิน 30% ของพอร์ต การไม่ทำอะไรก็เป็นการตัดสินใจที่ดีได้</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {review.map((a) => (
                <ReviewItem key={`${a.symbol}-${a.kind}`} a={a} held={heldQty(a.symbol)} />
              ))}
            </ul>
          )}
          <More summary="AI ดูแลพอร์ตด้วยกฎอะไร">
            <ul className="list-disc space-y-1 pl-5 text-[0.9rem]">
              <li>ราคาต่ำกว่า stop-loss ที่ตั้งตอนซื้อ: ขายทั้งหมด</li>
              <li>คะแนนสถิติต่ำกว่า 40 และแนวโน้มเป็นขาลง: ขายทั้งหมด</li>
              <li>ราคาถึงเป้าหมาย: ขายครึ่งหนึ่ง ให้ที่เหลือวิ่งต่อ</li>
              <li>หุ้นตัวเดียวเกิน 30% ของพอร์ต: ลดเหลือประมาณ 25%</li>
            </ul>
          </More>
        </section>
      </div>
      <Disclaimer />
    </>
  );
}
