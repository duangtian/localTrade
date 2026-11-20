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
        className="inline-flex h-[28px] min-w-[28px] items-center justify-center rounded-full bg-subtle align-middle text-[0.75rem] font-bold text-ink hover:bg-slate-300 before:absolute relative before:-inset-2 before:content-['']"
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="mt-1 block rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[0.85rem] font-normal text-white/85"
        >
          <b>{g.term}:</b> {g.def}
        </span>
      )}
    </span>
  );
}
