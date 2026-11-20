import { direction, fmtPct, fmtSignedMoney } from "@/lib/format";
import { Term } from "./Term";
import type { GlossaryKey } from "@/lib/glossary";

export function Disclaimer() {
  return <p className="muted mt-6 border-t border-line pt-3 text-[0.8rem]">เกมจำลองเพื่อการเรียนรู้ ใช้เงินสมมติ ไม่ใช่คำแนะนำการลงทุน</p>;
}

/** แสดงการเปลี่ยนแปลง: สี + ลูกศร + เครื่องหมาย (ไม่สื่อด้วยสีอย่างเดียว) */
export function Change({ value, pct, currency = "THB", className = "" }: { value?: number; pct?: number; currency?: "THB" | "USD"; className?: string }) {
  const d = direction(value ?? pct ?? 0);
  const arrow = d === "up" ? "▲" : d === "down" ? "▼" : "■";
  const cls = d === "up" ? "up" : d === "down" ? "down" : "muted";
  const label = d === "up" ? "ขึ้น" : d === "down" ? "ลง" : "ไม่เปลี่ยน";
  return (
    <span className={`${cls} font-semibold ${className}`}>
      <span aria-hidden>{arrow} </span>
      <span className="sr-only">{label} </span>
      {value !== undefined && fmtSignedMoney(value, currency)}
      {value !== undefined && pct !== undefined && " "}
      {pct !== undefined && (value !== undefined ? `(${fmtPct(pct)})` : fmtPct(pct))}
    </span>
  );
}

export function Stat({ label, term, children }: { label: string; term?: GlossaryKey; children: React.ReactNode }) {
  return (
    <div>
      <div className="muted text-[0.85rem]">
        {label} {term && <Term k={term} />}
      </div>
      <div className="font-semibold">{children}</div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="muted mt-2">{children}</div>}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h1 className="text-[1.5rem] font-semibold tracking-tight">{children}</h1>
      {sub && <p className="muted text-[0.9rem]">{sub}</p>}
    </div>
  );
}

export function More({ summary = "ดูเพิ่ม", children }: { summary?: string; children: React.ReactNode }) {
  return (
    <details className="group mt-3">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between border-t border-line pt-2 text-[0.9rem] font-medium text-white/80 hover:text-white">
        {summary}
        <span className="transition group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
