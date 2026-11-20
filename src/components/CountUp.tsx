"use client";
import { useEffect, useState } from "react";
import { fmtMoney } from "@/lib/format";

/** ตัวเลขนับขึ้นจาก 0 (~0.8 วินาที, ease-out) ถ้าผู้ใช้ตั้งลดการเคลื่อนไหวจะแสดงค่าทันที */
export function CountUp({ value, currency = "THB", duration = 800 }: { value: number; currency?: "THB" | "USD"; duration?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setV(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      setV(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    setV(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <span aria-label={fmtMoney(value, currency)}>
      <span aria-hidden>{fmtMoney(v, currency)}</span>
    </span>
  );
}
