"use client";
import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, createChart, LineSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";

type Point = { time: string | number; open: number; high: number; low: number; close: number };

const RANGES = [
  { id: "1D", label: "1 วัน" },
  { id: "1M", label: "1ด." },
  { id: "3M", label: "3ด." },
  { id: "1Y", label: "1ปี" },
  { id: "5Y", label: "5ปี" },
];

export function PriceChart({ symbol, defaultRange = "1M", backtest = false }: { symbol: string; defaultRange?: string; backtest?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [range, setRange] = useState(defaultRange);
  const [candle, setCandle] = useState(false);
  const [data, setData] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setData(null);
    setError(null);
    fetch(`/api/history?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (j.error) setError(j.error);
        else setData(j.points);
      })
      .catch(() => !cancel && setError("โหลดกราฟไม่สำเร็จ"));
    return () => {
      cancel = true;
    };
  }, [symbol, range]);

  useEffect(() => {
    if (!el.current || !data || data.length === 0) return;
    const dark = document.documentElement.classList.contains("dark");
    const chart = createChart(el.current, {
      height: 240,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: dark ? "#e2e8f0" : "#334155", fontSize: 13 },
      grid: { vertLines: { visible: false }, horzLines: { color: dark ? "#1e293b" : "#e2e8f0" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: typeof data[0].time === "number" },
      localization: {
        locale: "th-TH-u-ca-gregory",
        timeFormatter: (t: number | string) =>
          typeof t === "number" ? new Date(t * 1000).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : String(t),
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;
    const first = data[0].close;
    const last = data[data.length - 1].close;
    const color = last >= first ? (dark ? "#4ade80" : "#15803d") : dark ? "#f87171" : "#b91c1c";
    const toTime = (t: string | number) => (typeof t === "number" ? (t as UTCTimestamp) : t);
    if (candle) {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: dark ? "#4ade80" : "#15803d",
        downColor: dark ? "#f87171" : "#b91c1c",
        borderVisible: false,
        wickUpColor: dark ? "#4ade80" : "#15803d",
        wickDownColor: dark ? "#f87171" : "#b91c1c",
      });
      s.setData(data.map((p) => ({ time: toTime(p.time), open: p.open, high: p.high, low: p.low, close: p.close })));
    } else {
      // กราฟเส้นเดียวเป็นค่าเริ่มต้น พร้อมป้ายค่าล่าสุด
      const s = chart.addSeries(LineSeries, { color, lineWidth: 3, lastValueVisible: true, priceLineVisible: true });
      s.setData(data.map((p) => ({ time: toTime(p.time), value: p.close })));
    }
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, candle]);

  return (
    <div>
      <div role="group" aria-label="ช่วงเวลากราฟ" className="mb-3 grid grid-cols-5 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={range === r.id}
            aria-label={{ "1D": "1 วัน", "1M": "1 เดือน", "3M": "3 เดือน", "1Y": "1 ปี", "5Y": "5 ปี" }[r.id]}
            disabled={backtest && r.id === "1D"}
            onClick={() => setRange(r.id)}
            className={`btn min-w-0 px-1 text-[0.85rem] ${range === r.id ? "bg-white text-blue-800 shadow dark:bg-slate-950 dark:text-blue-300" : "text-slate-700 dark:text-slate-300"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {data && data.length > 1 && (() => {
        const first = data[0].close;
        const last = data[data.length - 1].close;
        const r = last / first - 1;
        const d = r > 0.00004 ? "up" : r < -0.00004 ? "down" : "muted";
        const names: Record<string, string> = { "1D": "ตั้งแต่เปิดตลาด", "1M": "ช่วง 1 เดือน", "3M": "ช่วง 3 เดือน", "1Y": "ช่วง 1 ปี", "5Y": "ช่วง 5 ปี" };
        return (
          <p className="mb-1 text-[0.85rem]">
            <span className="muted">{names[range]}: </span>
            <span className={`${d} font-semibold`}>
              {d === "up" ? "▲ +" : d === "down" ? "▼ −" : "■ "}
              {Math.abs(r * 100).toFixed(2)}%
            </span>
          </p>
        );
      })()}
      <div ref={el} className="h-[240px] w-full" role="img" aria-label={`กราฟราคา ${symbol} ช่วง ${range}`}>
        {!data && !error && <p className="muted pt-20 text-center">กำลังโหลดกราฟ…</p>}
        {error && <p className="muted pt-16 text-center">{error}</p>}
        {data && data.length === 0 && <p className="muted pt-20 text-center">ไม่มีข้อมูลราคาในช่วงนี้</p>}
      </div>
      <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2">
        <input type="checkbox" className="h-5 w-5" checked={candle} onChange={(e) => setCandle(e.target.checked)} />
        แสดงเป็นกราฟแท่งเทียน
      </label>
    </div>
  );
}
