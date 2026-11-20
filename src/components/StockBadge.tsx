/** วงกลมตัวย่อหุ้น สีตามกลุ่มอุตสาหกรรม (สีเดียวกันทุกหน้า) */
const PALETTE = [
  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100",
  "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100",
  "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100",
  "bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-100",
  "bg-cyan-100 text-cyan-900 dark:bg-cyan-900 dark:text-cyan-100",
  "bg-lime-100 text-lime-900 dark:bg-lime-900 dark:text-lime-100",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-100",
];

export function sectorColor(sector: string): string {
  let h = 0;
  for (const ch of sector) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function StockBadge({ symbol, sector, size = "md" }: { symbol: string; sector: string; size?: "md" | "lg" }) {
  const label = symbol.replace(".BK", "").replace(/^\^/, "").slice(0, 2);
  const dim = size === "lg" ? "h-14 w-14 text-lg" : "h-11 w-11 text-[0.85rem]";
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${dim} ${sectorColor(sector)}`}>
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
      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
      : d === "down"
        ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  const arrow = d === "up" ? "▲" : d === "down" ? "▼" : "■";
  const text = d === "flat" ? "0.00%" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[0.85rem] font-semibold ${cls} ${className}`}>
      <span aria-hidden>{arrow}</span>
      <span className="sr-only">{d === "up" ? "ขึ้น" : d === "down" ? "ลง" : "ไม่เปลี่ยน"}</span>
      {text}
    </span>
  );
}
