import { dismissMessageAction } from "@/app/actions";
import { fmtDate } from "@/lib/format";
import { IconClose } from "./icons";

/** การ์ดข้อความจาก Bot ที่ปิดได้ (ไม่ใช่ popup บังจอ) */
export function MessageCard({ id, kind, date, text }: { id: number; kind: string; date: string; text: string }) {
  const title = kind === "summary" ? "สรุปจากอาจารย์" : "Bot ถือยาวซื้อขาย";
  return (
    <article className="card">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">
          {title} <span className="muted text-[0.8rem] font-normal">· {fmtDate(date)}</span>
        </h3>
        <form action={dismissMessageAction.bind(null, id)}>
          <button type="submit" className="btn -mr-2 -mt-2 px-2 text-ink-muted hover:text-ink" aria-label="ปิดการ์ดนี้ (อ่านแล้ว)">
            <IconClose />
          </button>
        </form>
      </div>
      <p className="mt-1 whitespace-pre-line text-[0.95rem]">{text}</p>
    </article>
  );
}
