"use client";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ChartRow = { date: string; you?: number; bot?: number; set?: number; sp?: number };

const SERIES = [
  { key: "you", label: "พอร์ตคุณ", color: "#1d4ed8", darkColor: "#93c5fd" },
  { key: "bot", label: "Bot ถือยาว", color: "#7c3aed", darkColor: "#c4b5fd" },
  { key: "set", label: "ดัชนี SET", color: "#b45309", darkColor: "#fcd34d" },
  { key: "sp", label: "S&P 500", color: "#0f766e", darkColor: "#5eead4" },
] as const;

export function PortfolioChart({ rows }: { rows: ChartRow[] }) {
  const [show, setShow] = useState<Record<string, boolean>>({ you: true, bot: false, set: true, sp: true });
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  if (rows.length < 2) {
    return <p className="muted">ยังมีข้อมูลไม่พอ กราฟจะเริ่มแสดงเมื่อเล่นไปอย่างน้อย 2 วัน</p>;
  }
  const last = rows[rows.length - 1];
  return (
    <div>
      <div className="h-[240px] w-full" role="img" aria-label={`กราฟผลตอบแทนเทียบดัชนี ล่าสุด พอร์ตคุณ ${last.you?.toFixed(2)}%`}>
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={dark ? "#1e293b" : "#e2e8f0"} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: dark ? "#cbd5e1" : "#475569" }} minTickGap={40} />
            <YAxis tickFormatter={(v) => `${+Number(v).toFixed(1)}%`} tick={{ fontSize: 12, fill: dark ? "#cbd5e1" : "#475569" }} width={56} />
            <Tooltip
              formatter={(v) => `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2)}%`}
              contentStyle={{ background: dark ? "#0f172a" : "#fff", border: "1px solid #94a3b8" }}
            />
            {SERIES.filter((s) => show[s.key]).map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={dark ? s.darkColor : s.color}
                strokeWidth={s.key === "you" ? 3 : 2}
                dot={false}
                connectNulls
                isAnimationActive={false}
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
