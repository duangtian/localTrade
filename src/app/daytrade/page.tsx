import Link from "next/link";
import { resetDaytradeAction, startDaytradeAction, toggleDaytradeAction } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Change, Disclaimer, EmptyState, More, PageTitle, Stat } from "@/components/ui";
import { DT_UNIVERSE } from "@/lib/bot/daytrade";
import { getDb } from "@/lib/db/client";
import { fmtDate, fmtMoney, fmtPct, fmtSignedMoney } from "@/lib/format";
import { getDaytradeConfig } from "@/lib/game/auto";
import { findPortfolioId } from "@/lib/game/core";
import { portfolioStats } from "@/lib/game/stats";
import { loadGame } from "@/lib/server";

function MarketChoice({ value, label, checked }: { value: string; label: string; checked: boolean }) {
  return (
    <label className="fchip cursor-pointer has-[:checked]:border-white has-[:checked]:bg-white has-[:checked]:text-neutral-900">
      <input type="radio" name="market" value={value} defaultChecked={checked} className="sr-only" />
      {label}
    </label>
  );
}

export default async function DaytradePage() {
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
  const cfg = getDaytradeConfig(db, l.game.id);
  const pid = findPortfolioId(db, l.game.id, "daytrade");
  const st = pid !== null ? await portfolioStats(db, l.ctx, pid) : null;
  const rounds = st ? st.sells.slice(0, 20) : [];
  const buyOf = (sell: (typeof rounds)[number]) => st!.fills.find((b) => b.side === "buy" && b.symbol === sell.symbol && b.createdAt.slice(0, 10) === sell.createdAt.slice(0, 10) && b.id < sell.id);

  return (
    <>
      <PageTitle sub="ซื้อและขายจบในวันเดียว ไม่ถือข้ามคืน — พอร์ตแยก เงินเริ่มต้นเท่ากับเกม">Bot เดย์เทรด</PageTitle>

      <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-4">
          {!cfg || !st ? (
            <section className="card">
              <p className="font-semibold">เริ่ม Bot เดย์เทรด</p>
              <p className="muted mt-1 text-[0.9rem]">Bot จะเทรดด้วยพอร์ตของตัวเอง แล้วคุณดูผลเทียบกับพอร์ตของคุณ, Bot ถือยาว และพอร์ต DCA ได้ว่าการเทรดบ่อย ๆ ได้ผลจริงไหม เมื่อหักค่าคอมแล้ว</p>
              <form action={startDaytradeAction} className="mt-3 space-y-3">
                <fieldset>
                  <legend className="label">ตลาด</legend>
                  <div className="flex flex-wrap gap-2">
                    <MarketChoice value="BOTH" label="ทั้งสอง" checked />
                    <MarketChoice value="TH" label="ไทย" checked={false} />
                    <MarketChoice value="US" label="สหรัฐฯ" checked={false} />
                  </div>
                </fieldset>
                <SubmitButton className="btn-accent w-full" pendingText="กำลังเริ่ม…">
                  เริ่ม Bot เดย์เทรด
                </SubmitButton>
              </form>
            </section>
          ) : (
            <>
              <section className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="muted">มูลค่าพอร์ตเดย์เทรด</p>
                    <p className="big-num">{fmtMoney(st.totalThb)}</p>
                    <p>
                      <Change pct={st.returnPct} /> <span className="muted text-[0.85rem]">ตั้งแต่ {fmtDate(cfg.startedAt)}</span>
                    </p>
                  </div>
                  <span className={`chip border ${cfg.active ? "border-emerald-400/40 text-emerald-300" : "border-white/20 text-white/60"}`}>{cfg.active ? "กำลังทำงาน" : "หยุดชั่วคราว"}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Stat label="จำนวนไม้">{st.trades}</Stat>
                  <Stat label="อัตราชนะ">{st.winRate === null ? "–" : fmtPct(st.winRate).replace("+", "")}</Stat>
                  <Stat label="กำไรสุทธิที่ปิดแล้ว">
                    <Change value={st.realizedThb} />
                  </Stat>
                  <Stat label="กำไรเฉลี่ยไม้ชนะ">{st.avgWin === null ? "–" : <span className="up">{fmtSignedMoney(st.avgWin)}</span>}</Stat>
                  <Stat label="ขาดทุนเฉลี่ยไม้แพ้">{st.avgLoss === null ? "–" : <span className="down">{fmtSignedMoney(st.avgLoss)}</span>}</Stat>
                  <Stat label="ค่าคอมที่จ่าย">{fmtMoney(st.commissionThb)}</Stat>
                </div>
                {st.commissionThb === 0 && <p className="note-warn mt-3">ค่าคอมยังเป็น 0 (ยังไม่ได้กรอกอัตรา Dime! ในหน้าตั้งค่า) ผลเดย์เทรดจะดูดีกว่าความจริง เพราะเทรดบ่อยต้องจ่ายค่าคอมทุกไม้</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={toggleDaytradeAction}>
                    <button type="submit" className="btn-secondary">
                      {cfg.active ? "หยุดชั่วคราว" : "ทำต่อ"}
                    </button>
                  </form>
                  <form action={resetDaytradeAction}>
                    <button type="submit" className="btn-sell-outline">
                      ล้างพอร์ตแล้วเริ่มใหม่
                    </button>
                  </form>
                </div>
              </section>

              <section>
                <h2 className="section-title">ไม้ล่าสุด</h2>
                {rounds.length === 0 ? (
                  <div className="card muted">
                    ยังไม่มีไม้ {l.ctx.mode === "backtest" ? "ลองเลื่อนวันที่หน้าแรก Bot จะเทรดทุกวันทำการที่มีสัญญาณ" : "Bot จะเทรดเมื่อตลาดเปิดและมีสัญญาณ (ทำงานเมื่อเปิดหน้าเว็บ)"}
                  </div>
                ) : (
                  <ul className="card overflow-hidden p-0">
                    {rounds.map((s) => {
                      const b = buyOf(s);
                      const pnl = s.realizedPnlThb ?? 0;
                      return (
                        <li key={s.id} className="border-b border-line px-4 py-3 last:border-b-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold">
                              {s.symbol.replace(".BK", "")} <span className="faint font-normal">· {fmtDate(s.createdAt)}</span>
                            </p>
                            <span className={`chip ${pnl > 0 ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"}`}>{fmtSignedMoney(pnl)}</span>
                          </div>
                          <p className="muted text-[0.85rem]">
                            ซื้อ {b?.fillPrice ?? "–"} → ขาย {s.fillPrice}
                          </p>
                          <p className="faint text-[0.8rem]">{s.reason.replace("เดย์เทรด: ", "")}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <aside className="mt-4 min-w-0 space-y-4 lg:mt-0">
          <section className="card">
            <h2 className="font-semibold">กฎของ Bot</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.9rem]">
              <li>
                <b>เข้า:</b> แนวโน้มขาขึ้น (ราคาปิดเมื่อวาน &gt; เส้นเฉลี่ย 20 วัน) และวันนี้ราคาเปิดกระโดดขึ้น 0.5–5%
              </li>
              <li>
                <b>ออก:</b> ขาดทุน −2% ตัดทันที · กำไร +3% ขาย · ไม่ถึงทั้งคู่ขายตอนปิดตลาด
              </li>
              <li>ไม้ละ ~20% ของพอร์ต ถือพร้อมกันไม่เกิน 3 ตัว</li>
              <li>หุ้นที่เทรด: {DT_UNIVERSE.map((s) => s.replace(".BK", "")).join(", ")}</li>
            </ul>
          </section>
          <More summary="ข้อจำกัดของการจำลอง">
            <ul className="list-disc space-y-1 pl-5 text-[0.9rem]">
              <li>โหมดย้อนอดีตมีแค่ราคารายวัน จึงซื้อที่ราคาเปิด และถ้าวันนั้นราคาแตะทั้ง stop และเป้า จะถือว่าโดน stop ก่อน (สมมติแบบระมัดระวัง)</li>
              <li>โหมดเวลาจริงใช้แท่ง 5 นาที (ราคาช้ากว่าตลาด ~15 นาที) และ Bot ทำงานเฉพาะตอนมีคนเปิดหน้าเว็บ ถ้าไม่ได้เปิดก่อนตลาดปิด หุ้นอาจค้างข้ามคืนและถูกขายในรอบถัดไป</li>
              <li>ของจริงมีค่าคอมทุกไม้ ส่วนต่างราคาเสนอซื้อ/ขาย และราคาวิ่งเร็ว ผลจริงมักแย่กว่าการจำลอง</li>
            </ul>
          </More>
          <Link href="/plan" className="row-link">
            <span className="flex-1">
              <span className="block font-semibold">อยากเดย์เทรดเอง?</span>
              <span className="muted block text-[0.85rem]">AI จัดพอร์ต → เลือกสไตล์เดย์เทรด</span>
            </span>
            <span aria-hidden className="text-white/45">›</span>
          </Link>
        </aside>
      </div>
      <Disclaimer />
    </>
  );
}
