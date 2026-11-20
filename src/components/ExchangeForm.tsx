"use client";
import { useState, useTransition } from "react";
import { exchangeAction } from "@/app/actions";
import { fmtMoney, fmtPrice } from "@/lib/format";
import { Term } from "./Term";

export function ExchangeForm({ fx, spread, cashThb, cashUsd }: { fx: number; spread: number; cashThb: number; cashUsd: number }) {
  const [dir, setDir] = useState<"THB_TO_USD" | "USD_TO_THB">("THB_TO_USD");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rate = dir === "THB_TO_USD" ? fx * (1 + spread) : fx * (1 - spread);
  const n = Number(amount);
  const result = n > 0 && rate > 0 ? (dir === "THB_TO_USD" ? n / rate : n * rate) : 0;

  if (!(fx > 0)) return <p className="muted">ยังไม่มีอัตราแลกเปลี่ยน ลองใหม่อีกครั้ง</p>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="ทิศทางการแลกเงิน">
        <button type="button" aria-pressed={dir === "THB_TO_USD"} onClick={() => setDir("THB_TO_USD")} className={`btn ${dir === "THB_TO_USD" ? "bg-blue-700 text-white dark:bg-blue-400 dark:text-slate-950" : "bg-slate-100 dark:bg-slate-800"}`}>
          บาท → USD
        </button>
        <button type="button" aria-pressed={dir === "USD_TO_THB"} onClick={() => setDir("USD_TO_THB")} className={`btn ${dir === "USD_TO_THB" ? "bg-blue-700 text-white dark:bg-blue-400 dark:text-slate-950" : "bg-slate-100 dark:bg-slate-800"}`}>
          USD → บาท
        </button>
      </div>
      <p className="muted text-[0.85rem]">
        อัตรา 1 USD = {fmtPrice(rate)} บาท (อัตรากลาง {fmtPrice(fx)} {spread > 0 ? `${dir === "THB_TO_USD" ? "+" : "−"} spread ${(spread * 100).toFixed(2)}%` : "ยังไม่ได้กรอก spread"}) <Term k="fxSpread" />
      </p>
      <label className="label" htmlFor="fx-amt">
        จำนวน ({dir === "THB_TO_USD" ? "บาท" : "USD"}) · มี {dir === "THB_TO_USD" ? fmtMoney(cashThb) : fmtMoney(cashUsd, "USD")}
      </label>
      <input id="fx-amt" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="เช่น 1000" />
      {result > 0 && <p>จะได้ประมาณ <b>{dir === "THB_TO_USD" ? fmtMoney(result, "USD") : fmtMoney(result)}</b></p>}
      <button
        type="button"
        className="btn-secondary w-full"
        disabled={pending || !(n > 0)}
        onClick={() =>
          start(async () => {
            const r = await exchangeAction(dir, n);
            setMsg(r.ok ? `แลกสำเร็จ: ${fmtMoney(r.thb)} ↔ ${fmtMoney(r.usd, "USD")}` : r.error);
            if (r.ok) setAmount("");
          })
        }
      >
        {pending ? "กำลังแลก…" : "ยืนยันแลกเงิน"}
      </button>
      {msg && (
        <p role="status" className="font-semibold">
          {msg}
        </p>
      )}
    </div>
  );
}
