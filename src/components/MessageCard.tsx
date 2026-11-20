import { dismissMessageAction } from "@/app/actions";
import { fmtDate } from "@/lib/format";

/** การ์ดข้อความจาก Bot ที่ปิดได้ (ไม่ใช่ popup บังจอ) */
export function MessageCard({ id, kind, date, text }: { id: number; kind: string; date: string; text: string }) {
  const title = kind === "summary" ? "📋 สรุปจากอาจารย์" : "🤖 Bot ถือยาวเพิ่งซื้อขาย";
  return (
    <article className="card border-l-4 border-blue-700 dark:border-blue-300">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold">
          {title} <span className="muted text-[0.85rem] font-normal">{fmtDate(date)}</span>
        </h3>
        <form action={dismissMessageAction.bind(null, id)}>
          <button type="submit" className="btn -mr-2 -mt-2 px-2" aria-label="ปิดการ์ดนี้ (อ่านแล้ว)">
            ✕
          </button>
        </form>
      </div>
      <p className="mt-1 whitespace-pre-line">{text}</p>
    </article>
  );
}
