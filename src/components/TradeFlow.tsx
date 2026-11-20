"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { coachQuestionAction, placeOrderAction, previewOrderAction, type TradeDraft } from "@/app/actions";
import { fmtMoney, fmtPrice, fmtQty, fmtUpdated } from "@/lib/format";
import { Term } from "./Term";

interface Props {
  symbol: string;
  side: "buy" | "sell";
  market: "TH" | "US";
  price: number;
  priceTime: string;
  tradableNow: boolean;
  tradableReason: string;
  heldQty: number;
  cashThb: number;
  cashUsd: number;
  fx: number;
  tick: number;
  band: { floor: number; ceiling: number } | null;
  feesUnset: boolean;
  mode: "live" | "backtest";
}

type Preview = { qty: number; price: number; gross: number; commission: number; total: number; currency: "THB" | "USD" };

const STEPS = ["จำนวน", "เหตุผล", "สรุป", "เสร็จ"];

export function TradeFlow(p: Props) {
  const cur = p.market === "TH" ? "THB" : "USD";
  const isBuy = p.side === "buy";
  const [step, setStep] = useState(0);
  const [type, setType] = useState<"market" | "limit">(p.tradableNow ? "market" : "limit");
  const [lots, setLots] = useState(1);
  const [usMode, setUsMode] = useState<"amount" | "qty">(isBuy ? "amount" : "qty");
  const [amount, setAmount] = useState("");
  const [qty, setQty] = useState(p.side === "sell" && p.market === "US" ? String(p.heldQty) : "");
  const [limit, setLimit] = useState(fmtPrice(p.price).replace(/,/g, ""));
  const [reason, setReason] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [target, setTarget] = useState("");
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);
  const [pending, start] = useTransition();

  const draft = (): TradeDraft => ({
    symbol: p.symbol,
    side: p.side,
    type,
    qty: p.market === "TH" ? lots * 100 : usMode === "qty" ? Number(qty) : undefined,
    amountUsd: p.market === "US" && usMode === "amount" ? Number(amount) : undefined,
    limitPrice: type === "limit" ? Number(limit) : undefined,
  });

  const maxLots = p.market === "TH" ? (isBuy ? Math.floor(p.cashThb / (p.price * 100)) : Math.floor(p.heldQty / 100)) : 0;

  const next1 = () =>
    start(async () => {
      setError(null);
      if (type === "market" && !p.tradableNow) return setError(`ตอนนี้ส่งคำสั่ง Market ไม่ได้: ${p.tradableReason}`);
      const r = await previewOrderAction(draft());
      if (!r.ok) return setError(r.error);
      setPreview(r.preview);
      setStep(1);
    });

  const next2 = () =>
    start(async () => {
      setError(null);
      if (reason.trim().length < 10) return setError("กรุณาเขียนเหตุผลอย่างน้อย 10 ตัวอักษร");
      const r = await coachQuestionAction({ ...draft(), reason, stopLoss: stopLoss ? Number(stopLoss) : null });
      setQuestion(r.question || null);
      setStep(2);
    });

  const confirm = () =>
    start(async () => {
      setError(null);
      const r = await placeOrderAction({
        ...draft(),
        reason,
        stopLoss: stopLoss ? Number(stopLoss) : null,
        targetPrice: target ? Number(target) : null,
        coachQuestion: question,
        coachAnswer: answer.trim() || null,
      });
      if (!r.ok) return setError(r.error);
      setResult({ status: r.status, message: r.message });
      setStep(3);
    });

  const sideLabel = isBuy ? "ซื้อ" : "ขาย";
  const sideBtn = isBuy ? "btn-buy" : "btn-sell";

  return (
    <section className="card" aria-labelledby="trade-title">
      <h1 id="trade-title" className="text-xl font-bold">
        <span className={isBuy ? "up" : "down"}>{sideLabel}</span> {p.symbol.replace(".BK", "")}
      </h1>
      <p className="muted text-[0.85rem]">
        ราคาล่าสุด {fmtMoney(p.price, cur)} · {fmtUpdated(p.priceTime)}
      </p>
      <ol className="my-3 grid grid-cols-4 gap-1 text-center text-[0.8rem]" aria-label="ขั้นตอน">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={`rounded-lg py-1 font-semibold ${i === step ? "bg-blue-700 text-white dark:bg-blue-400 dark:text-slate-950" : i < step ? "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <fieldset>
            <legend className="label">ประเภทคำสั่ง</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["market", "limit"] as const).map((t) => (
                <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={`btn ${type === t ? "bg-blue-700 text-white dark:bg-blue-400 dark:text-slate-950" : "bg-slate-100 dark:bg-slate-800"}`}>
                  {t === "market" ? "Market" : "Limit"}
                </button>
              ))}
            </div>
            <p className="muted mt-1 text-[0.85rem]">
              {type === "market" ? "ทำรายการทันทีที่ราคาตลาด" : p.mode === "backtest" ? "ตั้งราคาไว้ ระบบจะตรวจกับราคาสูง/ต่ำของวันถัด ๆ ไป" : "ตั้งราคาไว้ ทำรายการเมื่อราคาถึง"}{" "}
              <Term k={type === "market" ? "market" : "limit"} />
            </p>
            {!p.tradableNow && <p className="muted mt-1 text-[0.85rem]">⏸️ {p.tradableReason}</p>}
          </fieldset>

          {p.market === "TH" ? (
            <div>
              <label className="label" htmlFor="lots">
                จำนวน (ทีละ 100 หุ้น) <Term k="boardLot" />
              </label>
              <div className="flex items-center gap-2">
                <button type="button" className="btn-secondary text-xl" aria-label="ลด 100 หุ้น" onClick={() => setLots((v) => Math.max(1, v - 1))}>
                  −
                </button>
                <input id="lots" className="input text-center" inputMode="numeric" value={lots * 100} onChange={(e) => setLots(Math.max(1, Math.round(Number(e.target.value.replace(/\D/g, "")) / 100) || 1))} />
                <button type="button" className="btn-secondary text-xl" aria-label="เพิ่ม 100 หุ้น" onClick={() => setLots((v) => v + 1)}>
                  +
                </button>
              </div>
              <p className="muted mt-1 text-[0.85rem]">
                {isBuy ? `เงินที่ใช้ได้ ${fmtMoney(p.cashThb)} · ซื้อได้ประมาณ ${fmtQty(maxLots * 100)} หุ้น` : `ขายได้สูงสุด ${fmtQty(p.heldQty)} หุ้น`}
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-2 grid grid-cols-2 gap-2" role="group" aria-label="ระบุแบบ">
                <button type="button" aria-pressed={usMode === "amount"} onClick={() => setUsMode("amount")} className={`btn ${usMode === "amount" ? "bg-blue-700 text-white dark:bg-blue-400 dark:text-slate-950" : "bg-slate-100 dark:bg-slate-800"}`}>
                  เป็นจำนวนเงิน
                </button>
                <button type="button" aria-pressed={usMode === "qty"} onClick={() => setUsMode("qty")} className={`btn ${usMode === "qty" ? "bg-blue-700 text-white dark:bg-blue-400 dark:text-slate-950" : "bg-slate-100 dark:bg-slate-800"}`}>
                  เป็นจำนวนหุ้น
                </button>
              </div>
              {usMode === "amount" ? (
                <>
                  <label className="label" htmlFor="amt">
                    จำนวนเงิน (USD)
                  </label>
                  <input id="amt" className="input" inputMode="decimal" placeholder="เช่น 25" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </>
              ) : (
                <>
                  <label className="label" htmlFor="qty">
                    จำนวนหุ้น (เป็นทศนิยมได้) <Term k="fractional" />
                  </label>
                  <input id="qty" className="input" inputMode="decimal" placeholder="เช่น 0.5" value={qty} onChange={(e) => setQty(e.target.value)} />
                </>
              )}
              <p className="muted mt-1 text-[0.85rem]">
                {isBuy ? `เงิน USD ที่ใช้ได้ ${fmtMoney(p.cashUsd, "USD")}` : `ขายได้สูงสุด ${fmtQty(p.heldQty)} หุ้น`}
                {p.fx > 0 && ` · 1 USD ≈ ${fmtPrice(p.fx)} บาท`}
              </p>
              {isBuy && p.cashUsd <= 0 && <p className="mt-1 font-semibold">💱 ต้องแลกเงินบาทเป็น USD ก่อน (ด้านล่างหน้านี้)</p>}
            </div>
          )}

          {type === "limit" && (
            <div>
              <label className="label" htmlFor="limit">
                ราคา Limit ({cur === "THB" ? "บาท" : "USD"}) {p.market === "TH" && <Term k="tickSize" />}
              </label>
              <input id="limit" className="input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
              {p.market === "TH" && (
                <p className="muted mt-1 text-[0.85rem]">
                  ขยับทีละ {p.tick} บาท{p.band ? ` · ช่วงที่ตั้งได้ ${fmtPrice(p.band.floor)}–${fmtPrice(p.band.ceiling)}` : ""}
                </p>
              )}
            </div>
          )}
          <button type="button" className={`${sideBtn} w-full`} onClick={next1} disabled={pending}>
            {pending ? "กำลังตรวจ…" : "ถัดไป: เขียนเหตุผล"}
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="reason">
              ทำไมถึง{sideLabel}? <Term k="journal" />
            </label>
            <textarea
              id="reason"
              className="input min-h-[120px]"
              placeholder={isBuy ? "เช่น ธุรกิจนี้มีลูกค้าทั่วประเทศ กำไรโตต่อเนื่อง ตั้งใจถือ 1 ปี ถ้าตก 10% จะทบทวนเหตุผลใหม่" : "เช่น เหตุผลที่ซื้อเปลี่ยนไปแล้ว เพราะ..."}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby="reason-count"
            />
            <p id="reason-count" className={`text-[0.85rem] ${reason.trim().length >= 10 ? "muted" : "down"}`}>
              {reason.trim().length}/10 ตัวอักษรขั้นต่ำ
            </p>
          </div>
          {isBuy && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="sl">
                  Stop-loss <Term k="stopLoss" />
                </label>
                <input id="sl" className="input" inputMode="decimal" placeholder="ไม่บังคับ" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="tg">
                  เป้าหมาย <Term k="target" />
                </label>
                <input id="tg" className="input" inputMode="decimal" placeholder="ไม่บังคับ" value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep(0)}>
              ย้อนกลับ
            </button>
            <button type="button" className={sideBtn} onClick={next2} disabled={pending}>
              {pending ? "กำลังตรวจ…" : "ถัดไป: สรุป"}
            </button>
          </div>
        </div>
      )}

      {step === 2 && preview && (
        <div className="space-y-4">
          {question && (
            <div className="rounded-xl bg-blue-50 p-3 ring-1 ring-blue-200 dark:bg-blue-950 dark:ring-blue-800">
              <p className="font-semibold">🧑‍🏫 อาจารย์ถาม: {question}</p>
              <label className="sr-only" htmlFor="answer">
                คำตอบของคุณ
              </label>
              <textarea id="answer" className="input mt-2 min-h-[70px]" placeholder="ลองตอบในใจหรือพิมพ์ไว้ก็ได้ (ไม่บังคับ)" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            </div>
          )}
          <dl className="space-y-1">
            <Row label="คำสั่ง">{`${sideLabel} ${type === "market" ? "Market" : `Limit ที่ ${fmtMoney(preview.price, cur)}`}`}</Row>
            <Row label="จำนวน">{`${fmtQty(preview.qty)} หุ้น`}</Row>
            <Row label={type === "market" ? "ราคา (ประมาณ)" : "ราคาที่ตั้ง"}>{fmtMoney(preview.price, cur)}</Row>
            <Row label="มูลค่า">{fmtMoney(preview.gross, cur)}</Row>
            <Row label="ค่าคอม + VAT" term>
              {fmtMoney(preview.commission, cur)}
            </Row>
            <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
              <Row label={isBuy ? "เงินที่ใช้รวม" : "เงินที่ได้รับ"} big>
                {fmtMoney(preview.total, cur)}
              </Row>
              {cur === "USD" && p.fx > 0 && <p className="muted text-right text-[0.85rem]">≈ {fmtMoney(preview.total * p.fx)}</p>}
            </div>
          </dl>
          {p.feesUnset && <p className="text-[0.85rem] text-amber-800 dark:text-amber-200">⚠️ ยังไม่ได้กรอกอัตราค่าคอมจริงของ Dime! (แก้ได้ในหน้าตั้งค่า)</p>}
          <p className="muted text-[0.85rem]">เหตุผล: “{reason.trim()}”</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
              ย้อนกลับ
            </button>
            <button type="button" className={sideBtn} onClick={confirm} disabled={pending}>
              {pending ? "กำลังส่ง…" : `ยืนยัน${sideLabel}`}
            </button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="space-y-3" role="status">
          <p className="text-lg font-bold">{result.status === "filled" ? "✅ " : "⏳ "}{result.message}</p>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/portfolio" className="btn-primary">
              ดูพอร์ต
            </Link>
            <Link href="/market" className="btn-secondary">
              กลับไปตลาด
            </Link>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="down mt-3 font-semibold">
          ⚠️ {error}
        </p>
      )}
    </section>
  );
}

function Row({ label, children, big, term }: { label: string; children: React.ReactNode; big?: boolean; term?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="muted">
        {label} {term && <Term k="commission" />}
      </dt>
      <dd className={big ? "text-2xl font-bold" : "font-semibold"}>{children}</dd>
    </div>
  );
}
