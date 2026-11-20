"use client";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ChartRow = { date: string; you?: number; bot?: number; set?: number; sp?: number };

const SERIES = [
  { key: "you", label: "พอร์ตคุณ", color: "#3B82F6", darkColor: "#3B82F6", dash: undefined },
  { key: "bot", label: "Bot ถือยาว", color: "#e5e5e5", darkColor: "#e5e5e5", dash: "6 4" },
  { key: "set", label: "ดัชนี SET", color: "#a3a3a3", darkColor: "#a3a3a3", dash: undefined },
  { key: "sp", label: "S&P 500", color: "#737373", darkColor: "#8a8a8a", dash: "2 4" },
] as const;

export function PortfolioChart({ rows }: { rows: ChartRow[] }) {
  const [show, setShow] = useState<Record<string, boolean>>({ you: true, bot: false, set: true, sp: true });
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (rows.length < 2) {
    return <p className="muted">ยังมีข้อมูลไม่พอ กราฟจะเริ่มแสดงเมื่อเล่นไปอย่างน้อย 2 วัน</p>;
  }
  const last = rows[rows.length - 1];
  return (
    <div>
      <div className="h-[240px] w-full" role="img" aria-label={`กราฟผลตอบแทนเทียบดัชนี ล่าสุด พอร์ตคุณ ${last.you?.toFixed(2)}%`}>
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.6)" }} minTickGap={40} />
            <YAxis tickFormatter={(v) => `${+Number(v).toFixed(1)}%`} tick={{ fontSize: 12, fill: "rgba(255,255,255,0.6)" }} width={56} />
            <Tooltip
              formatter={(v) => `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2)}%`}
              contentStyle={{ background: "rgba(28,29,32,0.9)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, backdropFilter: "blur(12px)" }}
            />
            {SERIES.filter((s) => show[s.key]).map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={dark ? s.darkColor : s.color}
                strokeWidth={s.key === "you" ? 3 : 1.75}
                strokeDasharray={s.dash}
                dot={false}
                connectNulls
                isAnimationActive={!reduced}
                animationDuration={900}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4" role="group" aria-label="เลือกเส้นที่แสดง">
        {SERIES.map((s) => (
          <label key={s.key} className="flex min-h-[44px] cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-5 w-5" checked={show[s.key]} onChange={(e) => setShow({ ...show, [s.key]: e.target.checked })} />
            <span aria-hidden className="inline-block h-1 w-5 rounded" style={{ background: dark ? s.darkColor : s.color, height: s.key === "you" ? 4 : 3 }} />
            {s.label}
          </label>
        ))}
      </div>
    </div>
  );
}
