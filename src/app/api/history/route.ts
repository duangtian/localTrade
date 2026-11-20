import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { getBaseProvider } from "@/lib/prices";
import { exchangeDate, marketOf } from "@/lib/rules/hours";
import { loadGame } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol") ?? "";
  const range = url.searchParams.get("range") ?? "1M";
  if (!/^[\^A-Z0-9.\-=&]{1,20}$/.test(symbol)) return NextResponse.json({ error: "ชื่อย่อไม่ถูกต้อง" }, { status: 400 });
  const l = await loadGame({ sync: false });
  if (!l.game) return NextResponse.json({ error: "ยังไม่ได้เริ่มเกม" }, { status: 400 });
  const today = l.ctx.today;

  try {
    if (range === "1D") {
      if (l.ctx.mode === "backtest") {
        return NextResponse.json({ error: "โหมดย้อนอดีตใช้ราคาปิดรายวัน จึงไม่มีกราฟ 1 วัน ลองดู 1M" });
      }
      const from = DateTime.fromISO(today).minus({ days: 6 }).toISODate()!;
      const bars = await getBaseProvider().getHistory(symbol, from, today, "5m");
      if (bars.length === 0) return NextResponse.json({ points: [] });
      const lastDay = exchangeDate(marketOf(symbol), new Date(bars[bars.length - 1].date));
      const points = bars
        .filter((b) => exchangeDate(marketOf(symbol), new Date(b.date)) === lastDay)
        .map((b) => ({ time: Math.floor(new Date(b.date).getTime() / 1000), open: b.open, high: b.high, low: b.low, close: b.close }));
      return NextResponse.json({ points, intraday: true, day: lastDay });
    }
    const from = DateTime.fromISO(today).minus(range === "1Y" ? { years: 1 } : { months: 1 }).toISODate()!;
    // ctx.provider ถูกจำกัดเวลาแล้วในโหมดย้อนอดีต: จะไม่มีแท่งหลังวันจำลอง
    const bars = await l.ctx.provider.getHistory(symbol, from, today, "1d");
    return NextResponse.json({
      points: bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close })),
      intraday: false,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "โหลดกราฟไม่สำเร็จ" });
  }
}
