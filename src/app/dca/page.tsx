import Link from "next/link";
import { resetDcaAction, saveDcaAction, toggleDcaAction } from "@/app/actions";
import { StockBadge } from "@/components/StockBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { Change, Disclaimer, EmptyState, More, PageTitle, Stat } from "@/components/ui";
import { findSeed } from "@/config/seeds";
import { getDb } from "@/lib/db/client";
import { fmtDate, fmtMoney, fmtQty } from "@/lib/format";
import { getDcaConfig } from "@/lib/game/auto";
import { findPortfolioId } from "@/lib/game/core";
import { portfolioStats } from "@/lib/game/stats";
import { loadGame } from "@/lib/server";

const PRESETS = [
  { id: "th", label: "หุ้นไทยพื้นฐานดี", items: "PTT 20\nCPALL 20\nKBANK 20\nADVANC 20\nBDMS 20" },
  { id: "us", label: "หุ้นสหรัฐฯ ยักษ์ใหญ่", items: "AAPL 20\nMSFT 20\nGOOGL 20\nAMZN 20\nNVDA 20" },
  { id: "mix", label: "ผสมไทย + สหรัฐฯ", items: "PTT 20\nKBANK 20\nCPALL 20\nAAPL 20\nMSFT 20" },
];

export default async function DcaPage({ searchParams }: { searchParams: Promise<{ edit?: string; preset?: string }> }) {
  const sp = await searchParams;
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
  const cfg = getDcaConfig(db, l.game.id);
  const pid = findPortfolioId(db, l.game.id, "dca");
  const editing = !cfg || sp.edit === "1";
  const preset = PRESETS.find((p) => p.id === sp.preset) ?? PRESETS[0];
  const defaultItems = cfg ? cfg.items.map((i) => `${i.symbol.replace(".BK", "")} ${Math.round(i.weight * 100)}`).join("\n") : preset.items;
  const stats = pid !== null ? await portfolioStats(db, l.ctx, pid) : null;

  return (
    <>
      <PageTitle sub="ลงเงินเท่า ๆ กันทุกเดือน ไม่ต้องเดาจังหวะตลาด ไม่ขาย">พอร์ต DCA</PageTitle>

      <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-4">
          {stats && cfg && (
            <section className="card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="muted">มูลค่าพอร์ต DCA</p>
                  <p className="big-num">{fmtMoney(stats.totalThb)}</p>
                  <p>
                    <Change pct={stats.returnPct} /> <span className="muted text-[0.85rem]">จากเงินเริ่มต้น {fmtMoney(l.game.startingCash)}</span>
                  </p>
                </div>
                <span className={`chip border ${cfg.active ? "border-emerald-400/40 text-emerald-300" : "border-white/20 text-white/60"}`}>{cfg.active ? "กำลังทำงาน" : "หยุดชั่วคราว"}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="ลงเงินไปแล้ว">{fmtMoney(stats.invested)}</Stat>
                <Stat label="เงินสดคงเหลือ">{fmtMoney(stats.view.valuation.cashThb + stats.view.valuation.cashUsdThb)}</Stat>
                <Stat label="ต่อเดือน">{fmtMoney(cfg.monthly)}</Stat>
              </div>
              <p className="faint mt-2 text-[0.8rem]">
                เริ่ม {fmtDate(cfg.startedAt)} · ซื้อวันทำการแรกของเดือนที่ตลาดเปิด{l.ctx.mode === "live" ? " (ทำงานเมื่อเปิดหน้าเว็บ)" : " (ทำงานตอนเลื่อนวัน)"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={toggleDcaAction}>
                  <button type="submit" className="btn-secondary">
                    {cfg.active ? "หยุดชั่วคราว" : "ทำต่อ"}
                  </button>
                </form>
                <Link href="/dca?edit=1" className="btn-secondary">
                  เปลี่ยนแผน
                </Link>
              </div>
            </section>
          )}

          {stats && stats.view.valuation.holdings.length > 0 && (
            <section>
              <h2 className="section-title">หุ้นที่สะสม</h2>
              <ul className="card overflow-hidden p-0">
                {stats.view.valuation.holdings.map((h) => (
                  <li key={h.symbol} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                    <StockBadge symbol={h.symbol} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{h.symbol.replace(".BK", "")}</p>
                      <p className="faint text-[0.8rem]">
                        {fmtQty(h.qty)} หุ้น · ต้นทุนเฉลี่ย {fmtMoney(h.avgCost, h.market === "TH" ? "THB" : "USD")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{fmtMoney(h.marketValueThb)}</p>
                      <Change pct={h.unrealizedPct} className="text-[0.85rem]" />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {editing && (
            <section>
              <h2 className="section-title">{cfg ? "เปลี่ยนแผน DCA" : "ตั้งแผน DCA"}</h2>
              {!cfg && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <Link key={p.id} href={`/dca?preset=${p.id}`} className={p.id === preset.id ? "fchip-active" : "fchip"}>
                      {p.label}
                    </Link>
                  ))}
                </div>
              )}
              <form action={saveDcaAction} className="card space-y-3">
                <div>
                  <label htmlFor="items" className="label">
                    หุ้นและสัดส่วน (บรรทัดละตัว: ชื่อย่อ เว้นวรรค %)
                  </label>
                  <textarea key={preset.id} id="items" name="items" rows={6} className="input font-mono text-[0.9rem]" defaultValue={defaultItems} required />
                  <p className="faint mt-1 text-[0.8rem]">หุ้นไทยพิมพ์ชื่อย่อได้เลย (เช่น PTT) สัดส่วนรวมไม่ต้องเป็น 100 ระบบปรับให้เอง สูงสุด 10 ตัว</p>
                </div>
                <div>
                  <label htmlFor="monthly" className="label">
                    เงินลงทุนต่อเดือน (บาท)
                  </label>
                  <input id="monthly" name="monthly" type="number" min={100} step={100} inputMode="numeric" className="input" defaultValue={cfg?.monthly ?? Math.round(l.game.startingCash / 12)} />
                  <p className="faint mt-1 text-[0.8rem]">พอร์ต DCA เริ่มด้วยเงิน {fmtMoney(l.game.startingCash)} (เท่าเงินเริ่มต้นของเกม) ลงทุนไปเรื่อย ๆ จนเงินหมด</p>
                </div>
                <SubmitButton className="btn-accent w-full" pendingText="กำลังบันทึก…">
                  {cfg ? "บันทึกแผน" : "เริ่ม DCA"}
                </SubmitButton>
              </form>
            </section>
          )}
        </div>

        <aside className="mt-4 min-w-0 space-y-4 lg:mt-0">
          {cfg && (
            <section className="card">
              <h2 className="font-semibold">แผนปัจจุบัน</h2>
              <ul className="mt-2 space-y-1.5 text-[0.9rem]">
                {cfg.items.map((i) => (
                  <li key={i.symbol} className="flex items-center justify-between gap-2">
                    <span>
                      {i.symbol.replace(".BK", "")} <span className="faint">{findSeed(i.symbol)?.name ?? ""}</span>
                    </span>
                    <span className="text-right">
                      {Math.round(i.weight * 100)}% <span className="faint">≈ {fmtMoney(cfg.monthly * i.weight)}/เดือน</span>
                      {i.symbol.endsWith(".BK") && (cfg.bank[i.symbol] ?? 0) > 1 && <span className="faint block text-[0.75rem]">สะสมรอซื้อ {fmtMoney(cfg.bank[i.symbol])}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {stats && stats.fills.length > 0 && (
            <section className="card">
              <h2 className="font-semibold">ประวัติการซื้อ</h2>
              <ul className="mt-2 divide-y divide-line text-[0.85rem]">
                {stats.fills.slice(0, 12).map((o) => (
                  <li key={o.id} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {fmtDate(o.createdAt)} · {o.symbol.replace(".BK", "")}
                    </span>
                    <span className="muted">
                      {fmtQty(o.fillQty ?? 0)} หุ้น @ {o.fillPrice}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <More summary="DCA คืออะไร ทำไมได้ผล">
            <ul className="list-disc space-y-1 pl-5 text-[0.9rem]">
              <li>ลงเงินเท่ากันทุกเดือน ตอนราคาถูกได้หุ้นมาก ตอนแพงได้น้อย ต้นทุนเฉลี่ยจึงไม่สูงเกินไป</li>
              <li>ไม่ต้องเดาจังหวะตลาด ลดผลของอารมณ์ (ไม่ซื้อไล่ราคา ไม่ขายตอนตกใจ)</li>
              <li>หุ้นไทยต้องซื้อทีละ 100 หุ้น งบเดือนไหนไม่พอ ระบบจะสะสมไว้ซื้อเดือนถัดไป</li>
              <li>DCA ไม่ได้รับประกันกำไร ถ้าหุ้นที่เลือกแย่ลงเรื่อย ๆ ก็ขาดทุนได้ เลือกหุ้นที่เชื่อในระยะยาว</li>
            </ul>
          </More>
          {cfg && (
            <form action={resetDcaAction}>
              <button type="submit" className="btn-sell-outline w-full">
                ล้างพอร์ต DCA แล้วเริ่มใหม่
              </button>
            </form>
          )}
        </aside>
      </div>
      <Disclaimer />
    </>
  );
}
