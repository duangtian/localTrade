import Link from "next/link";
import { DateTime } from "luxon";
import { aiPicksAction, runScanAction } from "@/app/actions";
import { ScanList } from "@/components/ScanList";
import { SubmitButton } from "@/components/SubmitButton";
import { Disclaimer, EmptyState, More, PageTitle } from "@/components/ui";
import { INDEXES, type IndexId } from "@/config/indices";
import { aiEnabled, aiUsage } from "@/lib/ai";
import { aiPicksKey, rulePicksSummary } from "@/lib/analysis/advice";
import { getCachedScan } from "@/lib/analysis/screen";
import { getDb } from "@/lib/db/client";
import { fmtDate } from "@/lib/format";
import { getIndexStocks } from "@/lib/indices";
import { loadGame } from "@/lib/server";
import { kvGet } from "@/lib/settings";

export default async function PicksPage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const { u } = await searchParams;
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
  const choices = INDEXES.map((d) => ({ d, n: getIndexStocks(db, d.id).stocks.length })).filter((x) => x.n > 0);
  const universe = (choices.find((x) => x.d.id === u) ?? choices[0]).d.id as IndexId;
  const current = choices.find((x) => x.d.id === universe)!;
  const scan = getCachedScan(db, l.ctx, universe);
  const ai = aiEnabled(db);
  const usage = aiUsage(db);
  const aiText = scan ? kvGet<string | null>(db, aiPicksKey(scan.key), null) : null;
  const backtest = l.ctx.mode === "backtest";
  const estSec = Math.max(5, Math.round(current.n / 8));

  return (
    <>
      <PageTitle sub={`Bot คัดจากสถิติกราฟ${backtest ? "" : " + ข่าว"} · ข้อมูลถึง ${fmtDate(l.ctx.today)}`}>หุ้นน่าสนใจ</PageTitle>

      <p className="note-warn mb-4">
        คะแนนดูจากราคาในอดีตเท่านั้น ไม่ได้บอกว่าหุ้นจะขึ้นต่อ ใช้เป็นจุดเริ่มต้นในการศึกษา แล้วเขียนเหตุผลของคุณเองก่อนซื้อ
      </p>

      <nav aria-label="เลือกกลุ่มหุ้นที่จะสแกน" className="mb-3 flex flex-wrap gap-2">
        {choices.map(({ d, n }) => (
          <Link
            key={d.id}
            href={`/picks?u=${d.id}`}
            aria-current={universe === d.id ? "page" : undefined}
            className={universe === d.id ? "fchip-active" : "fchip"}
          >
            {d.label} <span className="text-[0.75rem] font-normal opacity-70">{n}</span>
          </Link>
        ))}
      </nav>
      {backtest && (current.d.id === "sp500" || current.d.id === "ndx") && (
        <p className="muted mb-3 text-[0.85rem]">
          หมายเหตุ: รายชื่อ {current.d.label} เป็นรายชื่อปัจจุบัน ในโหมดย้อนอดีตจึงมีหุ้นที่ &quot;รอดมาถึงวันนี้&quot; เท่านั้น (survivorship bias) และหุ้นที่ยังไม่เข้าตลาด ณ วันจำลองจะถูกข้าม
        </p>
      )}

      {!scan ? (
        <section className="card text-center">
          <p className="font-semibold">ยังไม่ได้สแกน {current.d.label}</p>
          <p className="muted mt-1">Bot จะดึงราคาย้อนหลังของหุ้น {current.n} ตัว แล้วให้คะแนนจากแนวโน้ม โมเมนตัม และความเสี่ยง</p>
          <form action={runScanAction.bind(null, universe)} className="mt-3">
            <SubmitButton className="btn-primary w-full" pendingText={`กำลังสแกน… (ประมาณ ${estSec} วินาทีครั้งแรก)`}>
              สแกน {current.d.label}
            </SubmitButton>
          </form>
        </section>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
          <div className="order-2 min-w-0 lg:order-1">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="muted text-[0.85rem]">
                สแกนเมื่อ {DateTime.fromISO(scan.at).setZone("Asia/Bangkok").toFormat("HH:mm")} น. · {scan.rows.length} ตัว
                {scan.failed.length > 0 && ` · ข้อมูลไม่พอ ${scan.failed.length} ตัว`}
              </p>
              <form action={runScanAction.bind(null, universe)}>
                <SubmitButton className="btn-secondary text-[0.9rem]" pendingText="กำลังสแกน…">
                  สแกนใหม่
                </SubmitButton>
              </form>
            </div>
            <ScanList rows={scan.rows} />
          </div>

          <aside className="order-1 mb-4 min-w-0 lg:sticky lg:top-6 lg:order-2">
            <section className="card">
              <h2 className="font-semibold">สรุปจาก {aiText ? "AI (Claude)" : "Bot"}</h2>
              {aiText ? (
                <p className="mt-2 whitespace-pre-line text-[0.95rem]">{aiText}</p>
              ) : (
                <p className="mt-2 whitespace-pre-line text-[0.95rem]">{rulePicksSummary(scan.rows)}</p>
              )}
              {ai && !aiText && (
                <form action={aiPicksAction.bind(null, universe)} className="mt-3">
                  <SubmitButton className="btn-primary w-full" pendingText="AI กำลังอ่านกราฟและข่าว…">
                    ให้ AI วิเคราะห์ 5 อันดับแรก{backtest ? "" : " + ข่าว"}
                  </SubmitButton>
                  <p className="muted mt-1 text-[0.8rem]">
                    ใช้ 1 ข้อความ (วันนี้ใช้ไป {usage.used}/{usage.limit})
                  </p>
                </form>
              )}
              {!ai && (
                <p className="muted mt-3 text-[0.85rem]">
                  อยากให้ AI อ่านข่าวและสรุปให้: ใส่ ANTHROPIC_API_KEY แล้วเปิด Claude ใน{" "}
                  <Link href="/settings" className="text-accent-text underline">
                    ตั้งค่า
                  </Link>
                </p>
              )}
            </section>
            <More summary="Bot ให้คะแนนอย่างไร">
              <ul className="list-disc space-y-1 pl-5 text-[0.9rem]">
                <li>เริ่มที่ 50 คะแนน</li>
                <li>แนวโน้ม: ราคาเหนือเส้นค่าเฉลี่ย 50 วัน (±10) และเส้น 50 วันเหนือเส้น 200 วัน (±10)</li>
                <li>โมเมนตัม: ผลตอบแทน 6 เดือน (สูงสุด ±15) และ 3 เดือน (สูงสุด ±10)</li>
                <li>RSI เกิน 70 = ร้อนแรงเกินไป (−8), 45–65 = ปกติ (+3)</li>
                <li>ความผันผวนสูง (−5 ถึง −10) ต่ำ (+5) และระยะห่างจากจุดสูงสุดรอบปี</li>
                <li>ข่าวไม่นำมาคิดคะแนน แต่ใช้ประกอบการตัดสินใจ (ดูในหน้าหุ้นแต่ละตัว)</li>
              </ul>
              <p className="muted mt-2 text-[0.85rem]">
                กลยุทธ์ตามแนวโน้ม (trend following) ได้ผลดีในตลาดขาขึ้น แต่มักซื้อแพงและโดนกลับตัวแรงได้ ลองทดสอบในโหมดย้อนอดีตว่าหุ้นคะแนนสูงไปต่อจริงไหม
              </p>
            </More>
          </aside>
        </div>
      )}
      <Disclaimer />
    </>
  );
}
