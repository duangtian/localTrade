"use client";
import { useId, useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

/** ไอคอน (?) กดแล้วเห็นคำอธิบาย 1 บรรทัด (ไม่ใช่ popup บังจอ) */
export function Term({ k }: { k: GlossaryKey }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const g = GLOSSARY[k];
  return (
    <span className="inline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`ความหมายของ ${g.term}`}
        className="inline-flex h-[28px] min-w-[28px] items-center justify-center rounded-full bg-slate-200 align-middle text-[0.75rem] font-bold text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 before:absolute relative before:-inset-2 before:content-['']"
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="mt-1 block rounded-lg bg-blue-50 px-2 py-1 text-[0.85rem] font-normal text-blue-950 dark:bg-blue-950 dark:text-blue-100"
        >
          <b>{g.term}:</b> {g.def}
        </span>
      )}
    </span>
  );
}
