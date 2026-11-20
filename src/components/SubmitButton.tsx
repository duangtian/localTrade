"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn-primary", pendingText = "กำลังทำรายการ…" }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
