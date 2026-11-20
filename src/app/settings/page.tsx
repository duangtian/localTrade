import { resetIndexAction, saveFeesAction, saveIndexAction, updateSettingsAction } from "@/app/actions";
import { getIndexOverride } from "@/lib/indices";
import { SET50_DEFAULT_SYMBOLS } from "@/config/seeds";
import { SetupForm } from "@/components/SetupForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Term } from "@/components/Term";
import { PageTitle } from "@/components/ui";
import { AI_DAILY_LIMIT, AI_MODEL } from "@/config/app";
import { feesAreUnset } from "@/config/fees";
import { SET_HOLIDAYS, SET_SESSIONS, SET_TICK_SIZES, SET_TICK_SIZES_SOURCE, US_SESSIONS } from "@/config/market";
import { aiUsage } from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import { fmtDate } from "@/lib/format";
import { getActiveGame } from "@/lib/game/core";
import { maxSimDate } from "@/lib/game/flow";
import { getFees, getSettings, hasApiKey } from "@/lib/settings";

export default function SettingsPage() {
  const db = getDb();
  const s = getSettings(db);
  const fees = getFees(db);
  const game = getActiveGame(db, s.mode);
  const usage = aiUsage(db);
  const pct = (n: number) => +(n * 100).toFixed(4);

  return (
    <>
      <PageTitle>ตั้งค่า</PageTitle>
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:[&>section]:mt-0">
        <section className="card">
          <h2 className="text-lg font-bold">การแสดงผล</h2>
          <form action={updateSettingsAction} className="mt-2 grid grid-cols-2 gap-2">
            <button
              name="theme"
              value="light"
              className={`btn ${s.theme === "light" ? "bg-blue-700 text-white" : "bg-slate-100 dark:bg-slate-800"}`}
              aria-pressed={s.theme === "light"}
            >
              ☀️ โหมดสว่าง
            </button>
            <button
              name="theme"
              value="dark"
              className={`btn ${s.theme === "dark" ? "bg-blue-400 text-slate-950" : "bg-slate-100 dark:bg-slate-800"}`}
              aria-pressed={s.theme === "dark"}
            >
              🌙 โหมดมืด
            </button>
          </form>
        </section>

        <section className="card mt-3">
          <h2 className="text-lg font-bold">Bot แบบ Claude</h2>
          {hasApiKey() ? (
            <>
              <p className="muted text-[0.9rem]">
                พบ ANTHROPIC_API_KEY · โมเดล {AI_MODEL} · จำกัด {AI_DAILY_LIMIT} ข้อความ/วัน (วันนี้ใช้ {usage.used})
              </p>
              <form action={updateSettingsAction} className="mt-2">
                <input type="hidden" name="claude" value={s.claudeEnabled ? "off" : "on"} />
                <SubmitButton className={s.claudeEnabled ? "btn-secondary w-full" : "btn-primary w-full"}>
                  {s.claudeEnabled ? "ปิด Claude (กลับไปใช้แบบกฎ)" : "เปิดใช้ Claude"}
                </SubmitButton>
              </form>
              <p className="mt-1 text-[0.9rem]">สถานะ: {s.claudeEnabled ? "✅ เปิดอยู่" : "⏸️ ปิดอยู่"}</p>
            </>
          ) : (
            <p className="muted text-[0.9rem]">ยังไม่มี ANTHROPIC_API_KEY ในไฟล์ .env ตอนนี้ใช้อาจารย์แบบกฎ (ฟรี) ดูวิธีใส่ key ใน README.md</p>
          )}
        </section>

        <section className="card mt-3">
          <h2 className="text-lg font-bold">
            ค่าธรรมเนียม (แบบ Dime!) <Term k="commission" />
          </h2>
          {feesAreUnset(fees) ? (
            <p className="mt-1 rounded-xl bg-amber-100 p-2 text-[0.9rem] text-amber-950 dark:bg-amber-900 dark:text-amber-50">
              ⚠️ TODO: กรอกอัตราจริงจากแอป Dime! (ตอนนี้ทุกค่าเป็น 0)
            </p>
          ) : (
            <p className="muted text-[0.9rem]">อัตราที่ใช้ เก็บเมื่อ {fmtDate(fees.asOf!)}</p>
          )}
          <form action={saveFeesAction} className="mt-3 space-y-3">
            <Field name="asOf" label="วันที่เก็บอัตรา" type="date" defaultValue={fees.asOf ?? ""} />
            <fieldset className="grid grid-cols-3 gap-2">
              <legend className="label">หุ้นไทย</legend>
              <Field name="thRate" label="ค่าคอม %" defaultValue={pct(fees.th.commissionRate)} />
              <Field name="thMin" label="ขั้นต่ำ ฿" defaultValue={fees.th.minCommissionThb} />
              <Field name="thVat" label="VAT %" defaultValue={pct(fees.th.vatRate)} />
            </fieldset>
            <fieldset className="grid grid-cols-3 gap-2">
              <legend className="label">หุ้นสหรัฐฯ</legend>
              <Field name="usRate" label="ค่าคอม %" defaultValue={pct(fees.us.commissionRate)} />
              <Field name="usMin" label="ขั้นต่ำ $" defaultValue={fees.us.minCommissionUsd} />
              <Field name="usVat" label="VAT %" defaultValue={pct(fees.us.vatRate)} />
            </fieldset>
            <Field name="fxSpread" label="Spread ค่าแลกเงิน %" defaultValue={pct(fees.fx.spreadRate)} />
            <SubmitButton className="btn-secondary w-full">บันทึกอัตรา</SubmitButton>
          </form>
        </section>

        <div className="mt-3">
          <SetupForm mode={s.mode} defaultCash={game?.startingCash ?? s.startingCash} maxDate={maxSimDate()} isReset={Boolean(game)} />
          <p className="muted mt-1 px-1 text-[0.85rem]">รีเซ็ตเฉพาะพอร์ตของโหมด{s.mode === "live" ? "เวลาจริง" : "ย้อนอดีต"} (พอร์ตของอีกโหมดไม่เปลี่ยน)</p>
        </div>

        <section id="indexes" className="card mt-3 scroll-mt-20">
          <h2 className="text-lg font-bold">รายชื่อดัชนีหุ้นไทย</h2>
          <p className="muted text-[0.9rem]">
            เว็บ SET ไม่เปิดให้แอปดึงรายชื่ออัตโนมัติ ให้เปิดหน้าดัชนีบนเว็บ SET แล้วคัดลอกชื่อย่อทั้งหมดมาวาง (คั่นด้วยเว้นวรรค จุลภาค หรือขึ้นบรรทัดใหม่ก็ได้) SET
            ปรับรายชื่อทุก 6 เดือน (มกราคม / กรกฎาคม)
          </p>
          {(["set50", "set100"] as const).map((id) => {
            const o = getIndexOverride(db, id);
            const label = id === "set50" ? "SET50" : "SET100";
            return (
              <div key={id} className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-bold">{label}</h3>
                  <span className="muted text-[0.85rem]">
                    {o
                      ? `ใช้รายชื่อที่คุณวาง ${o.symbols.length} ตัว (ณ ${o.asOf})`
                      : id === "set50"
                        ? `ใช้รายชื่อตั้งต้นจาก Wikipedia (2025) ${SET50_DEFAULT_SYMBOLS.length} ตัว`
                        : "ยังไม่มีรายชื่อ"}
                  </span>
                </div>
                <a
                  href={`https://www.set.or.th/th/market/index/${id}/overview`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[0.9rem] text-blue-700 underline dark:text-blue-300"
                >
                  เปิดหน้า {label} บนเว็บ SET
                </a>
                <form action={saveIndexAction.bind(null, id)} className="mt-2 space-y-2">
                  <label htmlFor={`sym-${id}`} className="sr-only">
                    ชื่อย่อหุ้นใน {label}
                  </label>
                  <textarea
                    id={`sym-${id}`}
                    name="symbols"
                    rows={4}
                    className="input font-mono text-[0.85rem]"
                    placeholder="เช่น ADVANC AOT BBL BDMS ..."
                    defaultValue={o ? o.symbols.map((s) => s.replace(".BK", "")).join(" ") : ""}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-[0.9rem]">
                      <span className="muted">รายชื่อรอบ</span>
                      <input name="asOf" className="input w-40" placeholder="เช่น ม.ค.–มิ.ย. 2027" defaultValue={o?.asOf ?? ""} />
                    </label>
                    <SubmitButton className="btn-primary" pendingText="กำลังบันทึก…">
                      บันทึก {label}
                    </SubmitButton>
                  </div>
                </form>
                {o && (
                  <form action={resetIndexAction.bind(null, id)} className="mt-2">
                    <button type="submit" className="btn-secondary text-[0.9rem]">
                      ล้างรายชื่อที่วาง (กลับไปใช้ค่าตั้งต้น)
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </section>

        <section className="card mt-3 text-[0.9rem]">
          <h2 className="text-lg font-bold">กติกาตลาดที่ใช้</h2>
          <p className="mt-1 font-semibold">Tick size หุ้นไทย</p>
          <table className="mt-1 w-full">
            <thead>
              <tr className="muted text-left">
                <th className="font-normal">ราคา (บาท)</th>
                <th className="font-normal">ขยับทีละ</th>
              </tr>
            </thead>
            <tbody>
              {SET_TICK_SIZES.map((b, i) => (
                <tr key={i}>
                  <td>{`${i === 0 ? "ต่ำกว่า" : `${SET_TICK_SIZES[i - 1].below} –`} ${b.below ?? "ขึ้นไป"}`}</td>
                  <td>{b.tick}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted mt-1">
            ตรวจจากเว็บ SET เมื่อ {SET_TICK_SIZES_SOURCE.checkedAt} (มีผล {SET_TICK_SIZES_SOURCE.effectiveSince})
          </p>
          <p className="mt-2">SET: {SET_SESSIONS.map((x) => `${x.open}–${x.close}`).join(", ")} (เวลาไทย) · ceiling/floor ±30%</p>
          <p>สหรัฐฯ: {US_SESSIONS.map((x) => `${x.open}–${x.close}`).join(", ")} (เวลา New York, ปรับตาม daylight saving)</p>
          <p className="muted">วันหยุด SET ใน config: {SET_HOLIDAYS.length} วัน (แก้ได้ที่ src/config/market.ts)</p>
        </section>
      </div>
    </>
  );
}

function Field({ name, label, defaultValue, type = "text" }: { name: string; label: string; defaultValue: string | number; type?: string }) {
  return (
    <div>
      <label className="text-[0.85rem] font-semibold" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} type={type} inputMode={type === "text" ? "decimal" : undefined} defaultValue={defaultValue} className="input" />
    </div>
  );
}
