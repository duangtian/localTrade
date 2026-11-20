"use client";
import { useEffect, useRef, useState } from "react";
import { AreaSeries, CandlestickSeries, ColorType, createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";

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
    const tz = symbol.endsWith(".BK") ? "Asia/Bangkok" : "America/New_York";
    const tzLabel = symbol.endsWith(".BK") ? "น." : "(เวลา NY)";
    const hhmm = (t: number) => new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "Outfit, 'IBM Plex Sans Thai', sans-serif" },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,0.06)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: typeof data[0].time === "number",
        // แกนเวลาของกราฟ 1 วันแสดงเป็นเวลาของตลาดนั้น (ค่าเริ่มต้นของไลบรารีเป็น UTC)
        tickMarkFormatter: (t: unknown) => (typeof t === "number" ? hhmm(t) : null),
      },
      localization: {
        locale: "th-TH-u-ca-gregory",
        timeFormatter: (t: number | string) => (typeof t === "number" ? `${hhmm(t)} ${tzLabel}` : String(t)),
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;
    const first = data[0].close;
    const last = data[data.length - 1].close;
    const color = last >= first ? "#34d399" : "#fb7185";
    const toTime = (t: string | number) => (typeof t === "number" ? (t as UTCTimestamp) : t);
    if (candle) {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: "#34d399",
        downColor: "#fb7185",
        borderVisible: false,
        wickUpColor: "#34d399",
        wickDownColor: "#fb7185",
      });
      s.setData(data.map((p) => ({ time: toTime(p.time), open: p.open, high: p.high, low: p.low, close: p.close })));
    } else {
      // กราฟเส้นสีขาวพร้อมพื้นจาง ๆ (ทิศทางบอกด้วยตัวเลข % สีเขียว/แดงด้านบน)
      const s = chart.addSeries(AreaSeries, {
        lineColor: "rgba(255,255,255,0.92)",
        topColor: "rgba(255,255,255,0.18)",
        bottomColor: "rgba(255,255,255,0)",
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor: color,
      });
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
      <div role="group" aria-label="ช่วงเวลากราฟ" className="mb-3 grid grid-cols-5 gap-1 rounded-lg bg-subtle p-1">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={range === r.id}
            aria-label={{ "1D": "1 วัน", "1M": "1 เดือน", "3M": "3 เดือน", "1Y": "1 ปี", "5Y": "5 ปี" }[r.id]}
            disabled={backtest && r.id === "1D"}
            onClick={() => setRange(r.id)}
            className={`btn min-w-0 px-1 text-[0.85rem] ${range === r.id ? "bg-white/[0.14] text-white" : "text-ink-muted"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {data &&
        data.length > 1 &&
        (() => {
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
      <div ref={el} className="h-[340px] w-full sm:h-[400px] lg:h-[460px]" role="img" aria-label={`กราฟราคา ${symbol} ช่วง ${range}`}>
        {!data && !error && <p className="muted pt-32 text-center">กำลังโหลดกราฟ…</p>}
        {error && <p className="muted pt-28 text-center">{error}</p>}
        {data && data.length === 0 && <p className="muted pt-32 text-center">ไม่มีข้อมูลราคาในช่วงนี้</p>}
      </div>
      <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2">
        <input type="checkbox" className="h-5 w-5" checked={candle} onChange={(e) => setCandle(e.target.checked)} />
        แสดงเป็นกราฟแท่งเทียน
      </label>
    </div>
  );
}
