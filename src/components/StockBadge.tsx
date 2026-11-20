/** วงกลมตัวย่อหุ้น (สีกลาง ไม่แยกสีตามกลุ่ม) */
export function StockBadge({ symbol, size = "md" }: { symbol: string; sector?: string; size?: "md" | "lg" }) {
  const label = symbol.replace(".BK", "").replace(/^\^/, "").slice(0, 2);
  const dim = size === "lg" ? "h-12 w-12 text-base" : "h-10 w-10 text-[0.8rem]";
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-subtle font-semibold text-ink-muted ${dim}`}>
      {label}
    </span>
  );
}

/** ป้าย % เปลี่ยนแปลง มีพื้นสี + ลูกศร + เครื่องหมาย */
export function ChangePill({ pct, className = "" }: { pct: number | null; className?: string }) {
  if (pct === null || !Number.isFinite(pct)) return <span className={`muted text-[0.85rem] ${className}`}>–</span>;
  const v = pct * 100;
  const d = v > 0.004 ? "up" : v < -0.004 ? "down" : "flat";
  const cls =
    d === "up"
      ? "bg-emerald-400/15 text-emerald-300"
      : d === "down"
        ? "bg-rose-400/15 text-rose-300"
        : "bg-white/10 text-white/70";
  const arrow = d === "up" ? "▲" : d === "down" ? "▼" : "■";
  const text = d === "flat" ? "0.00%" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.85rem] font-semibold ${cls} ${className}`}>
      <span aria-hidden>{arrow}</span>
      <span className="sr-only">{d === "up" ? "ขึ้น" : d === "down" ? "ลง" : "ไม่เปลี่ยน"}</span>
      {text}
    </span>
  );
}
