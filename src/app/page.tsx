import Link from "next/link";
import { AdvanceBar } from "@/components/AdvanceBar";
import { MessageCard } from "@/components/MessageCard";
import { ModeSwitch } from "@/components/ModeSwitch";
import { SetupForm } from "@/components/SetupForm";
import { Term } from "@/components/Term";
import { Change, Disclaimer, More, Stat } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { returns, maxSimDate } from "@/lib/game/flow";
import { fmtDate, fmtMoney, fmtPct, fmtUpdated } from "@/lib/format";
import { marketStatus } from "@/lib/rules/hours";
import { loadGame } from "@/lib/server";
import { latestCard, missionsFor } from "@/lib/views";

export default async function Home() {
  const l = await loadGame();
  const db = getDb();

  if (!l.game) {
    return (
      <>
        <ModeSwitch mode={l.settings.mode} />
        <Disclaimer />
        <SetupForm mode={l.settings.mode} defaultCash={l.settings.startingCash} maxDate={maxSimDate()} />
      </>
    );
  }

  const r = await returns(l.ctx);
  const v = r.player.valuation;
  const totalPnl = v.totalThb - l.game.startingCash;
  const card = latestCard(db, l.game.id);
  const missions = missionsFor(db, l.game.id, l.pid, l.ctx.today, v);
  const nextMission = missions.find((m) => !m.done);
  const hasStock = v.holdings.length > 0;

  return (
    <>
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="min-w-0">
          <ModeSwitch mode={l.settings.mode} />
          {l.game.mode === "backtest" ? (
            <AdvanceBar simDateLabel={fmtDate(l.ctx.today)} atEnd={l.ctx.today >= maxSimDate()} />
          ) : (
            <p className="muted mb-2 text-[0.85rem]">
              {marketStatus("TH").label} · {marketStatus("US").label}
            </p>
          )}

          <section aria-labelledby="total" className="card">
            <h2 id="total" className="muted">
              มูลค่าพอร์ตรวม <Term k="portfolio" />
            </h2>
            <p className="big-num">{fmtMoney(v.totalThb)}</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Stat label="กำไร/ขาดทุนวันนี้" term="dayChange">
                <Change value={v.dayChangeThb} />
              </Stat>
              <Stat label="กำไร/ขาดทุนทั้งหมด">
                <Change value={totalPnl} pct={totalPnl / l.game.startingCash} />
              </Stat>
            </div>
            <p className="muted mt-2 text-[0.8rem]">{fmtUpdated(r.player.updatedAt ?? (l.game.mode === "backtest" ? l.ctx.today : null))}</p>
            <More>
              <dl className="grid grid-cols-2 gap-3">
                <Stat label="เงินสด (บาท)">{fmtMoney(v.cashThb)}</Stat>
                <Stat label="เงินสด (USD)">
                  {fmtMoney(v.cashUsd, "USD")} <span className="muted text-[0.85rem]">≈ {fmtMoney(v.cashUsdThb)}</span>
                </Stat>
                <Stat label="มูลค่าหุ้น">{fmtMoney(v.holdingsThb)}</Stat>
                <Stat label="เงินเริ่มต้น">{fmtMoney(l.game.startingCash)}</Stat>
                <Stat label="ผลตอบแทนของคุณ">
                  <Change pct={r.playerReturn} />
                </Stat>
                <Stat label="ผลตอบแทนของ Bot">
                  <Change pct={r.botReturn} />
                </Stat>
              </dl>
              <p className="muted mt-2 text-[0.85rem]">เริ่มเกมวันที่ {fmtDate(l.game.startDate)}</p>
            </More>
          </section>
        </div>

        <div className="min-w-0">
          <h2 className="mb-2 mt-5 text-lg font-bold lg:mt-0">สิ่งที่ควรทำต่อ</h2>
          {card ? (
            <MessageCard id={card.id} kind={card.kind} date={card.date} text={card.text} />
          ) : !hasStock ? (
            <div className="card">
              <p>ยังไม่มีหุ้น ลองค้นหาหุ้นตัวแรกที่หน้า ตลาด แล้วเขียนเหตุผลก่อนซื้อ</p>
              <Link href="/market" className="btn-primary mt-3 w-full">
                ไปหน้าตลาด
              </Link>
            </div>
          ) : nextMission ? (
            <div className="card">
              <p className="font-semibold">🎯 ภารกิจถัดไป: {nextMission.title}</p>
              <p className="muted">{nextMission.hint}</p>
              <Link href="/missions" className="btn-primary mt-3 w-full">
                ดูภารกิจ
              </Link>
            </div>
          ) : (
            <div className="card">
              <p>ทำภารกิจครบแล้ว! ลองทบทวนเหตุผลของแต่ละไม้ในหน้า พอร์ต</p>
              <Link href="/portfolio" className="btn-primary mt-3 w-full">
                ทบทวนพอร์ต
              </Link>
            </div>
          )}
          <p className="muted mt-3 text-[0.85rem]">
            คุณ {fmtPct(r.playerReturn)} · Bot {fmtPct(r.botReturn)}
          </p>
        </div>
      </div>
      <Disclaimer />
    </>
  );
}
