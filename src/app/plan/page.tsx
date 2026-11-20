import Link from "next/link";
import { buildPlanAction, cancelPlanAction } from "@/app/actions";
import { ConfirmPlan, ReviewItem } from "@/components/PlanActions";
import { PlanItemCard, PlanSummary } from "@/components/PlanSummary";
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
              <legend className="label">สไตล์</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="cursor-pointer rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/15">
                  <input type="radio" name="style" value="long" defaultChecked={(plan?.options.style ?? "long") === "long"} className="sr-only" />
                  <span className="block font-semibold">ถือยาว</span>
                  <span className="muted block text-[0.8rem]">แนวโน้มดี กระจายกลุ่ม ถือเป็นเดือน มี stop ตามความผันผวน</span>
                </label>
                <label className="cursor-pointer rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/15">
                  <input type="radio" name="style" value="day" defaultChecked={plan?.options.style === "day"} className="sr-only" />
                  <span className="block font-semibold">เดย์เทรด</span>
                  <span className="muted block text-[0.8rem]">สัญญาณวันนี้ stop −2% เป้า +3% ปิดสถานะภายในวัน</span>
                </label>
              </div>
            </fieldset>
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
              <PlanSummary plan={plan} ai={ai} />

              {plan.items.length > 0 && (
                <>
                  <h3 className="section-title">หุ้นในแผน ({plan.items.length} ตัว)</h3>
                  <ol className="card overflow-hidden p-0">
                    {plan.items.map((it) => (
                      <PlanItemCard key={it.symbol} it={it} />
                    ))}
                  </ol>
                </>
              )}

              {plan.skipped.length > 0 && (
                <More summary={`ตัวที่ข้าม (${plan.skipped.length}) และเหตุผล`}>
                  <ul className="space-y-3 text-[0.9rem]">
                    {Object.entries(
                      plan.skipped.reduce<Record<string, string[]>>((g, x) => {
                        (g[x.why] ??= []).push(x.symbol.replace(".BK", ""));
                        return g;
                      }, {}),
                    )
                      .sort((x, y) => y[1].length - x[1].length)
                      .map(([why, syms]) => (
                        <li key={why}>
                          <p className="font-medium">
                            {why} <span className="faint font-normal">· {syms.length} ตัว</span>
                          </p>
                          <p className="muted text-[0.85rem]">{syms.join(", ")}</p>
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
