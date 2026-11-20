import { describe, expect, it } from "vitest";
import { TimeBoundedProvider } from "@/lib/prices/bounded";
import { FakeProvider } from "@/lib/prices/fake";
import type { Bar } from "@/lib/prices/types";
import { analyze, annualVol, maxDrawdown, pastReturn, rsi, sma } from "./indicators";
import { headlineTone, parseGoogleNewsRss } from "./news";
import { analyzeSymbol } from "./screen";

function barsFrom(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    date: new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    open: c,
    high: c * 1.01,
    low: c * 0.99,
    close: c,
    volume: 1000,
  }));
}

describe("ตัวชี้วัด", () => {
  it("SMA, ผลตอบแทนย้อนหลัง, drawdown", () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5);
    expect(sma([1, 2], 3)).toBeNull();
    expect(pastReturn([100, 110, 121], 2)).toBeCloseTo(0.21);
    expect(maxDrawdown([100, 120, 90, 130])).toBeCloseTo(-0.25);
  });
  it("RSI: ขึ้นล้วน = 100, ลงล้วน = 0, อยู่ในช่วง 0–100", () => {
    const up = Array.from({ length: 40 }, (_, i) => 100 + i);
    const down = Array.from({ length: 40 }, (_, i) => 100 - i);
    expect(rsi(up)).toBe(100);
    expect(rsi(down)).toBeCloseTo(0);
    const zig = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 ? 1 : -1) * (i % 7));
    const r = rsi(zig)!;
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(100);
  });
  it("ราคาคงที่ = ความผันผวน 0", () => {
    expect(annualVol(Array(80).fill(10))).toBe(0);
  });
});

describe("analyze: คะแนน Bot", () => {
  it("ขาขึ้นสม่ำเสมอได้คะแนนสูงกว่าขาลง", () => {
    const up = analyze(barsFrom(Array.from({ length: 260 }, (_, i) => 100 * Math.pow(1.002, i) * (1 + 0.004 * Math.sin(i)))))!;
    const down = analyze(barsFrom(Array.from({ length: 260 }, (_, i) => 100 * Math.pow(0.998, i) * (1 + 0.004 * Math.sin(i)))))!;
    expect(up.trend).toBe("up");
    expect(down.trend).toBe("down");
    expect(up.score).toBeGreaterThan(65);
    expect(down.score).toBeLessThan(40);
    expect(up.score).toBeLessThanOrEqual(100);
    expect(down.score).toBeGreaterThanOrEqual(0);
    expect(up.signals.length).toBeGreaterThan(2);
  });
  it("ข้อมูลน้อยกว่า 60 วัน = null", () => {
    expect(analyze(barsFrom(Array(59).fill(10)))).toBeNull();
  });
});

describe("Bot คัดหุ้นในโหมดย้อนอดีต: ไม่เห็นอนาคต", () => {
  // ขึ้นวันละ 1% ถึงวันจำลอง แล้วดิ่ง 50% หลังจากนั้น
  const path = [...Array.from({ length: 200 }, (_, i) => 100 * Math.pow(1.01, i)), ...Array.from({ length: 100 }, () => 50)];
  // 420 วันปฏิทิน = 300 วันทำการ = ความยาว path พอดี
  const inner = new FakeProvider({ start: "2020-01-01", days: 420, base: { X: 100 }, path: { X: path }, ignoreRange: true });
  it("คะแนนและราคาใช้เฉพาะข้อมูลถึงวันจำลอง", async () => {
    const all = await inner.getHistory("X", "2000-01-01", "2100-01-01", "1d");
    const simDay = all[199].date;
    const a = (await analyzeSymbol(new TimeBoundedProvider(inner, simDay), "X", simDay))!;
    expect(a.asOf).toBe(simDay);
    expect(a.price).toBeCloseTo(path[199]);
    expect(a.trend).toBe("up");
    // ถ้ารั่วข้อมูลหลังวันจำลอง ราคาจะเป็น 50 และแนวโน้มเป็นขาลง
    const leakedPrice = all.at(-1)!.close;
    expect(leakedPrice).toBe(50);
    expect(a.price).not.toBe(leakedPrice);
  });
});

describe("ข่าว", () => {
  it("แยก RSS ของ Google News และตัดชื่อสำนักข่าวท้ายพาดหัว", () => {
    const xml = `<rss><channel>
      <item><title>CGSI : PTT กำไรแข็งแกร่ง แนะนำ “ซื้อ” - มิติหุ้น</title><link>https://news.google.com/x</link><pubDate>Mon, 16 Nov 2026 08:03:45 GMT</pubDate><source url="https://a">มิติหุ้น</source></item>
      <item><title>ไม่มีลิงก์</title><link>javascript:alert(1)</link><pubDate>Mon, 16 Nov 2026 08:03:45 GMT</pubDate></item>
    </channel></rss>`;
    const items = parseGoogleNewsRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("CGSI : PTT กำไรแข็งแกร่ง แนะนำ “ซื้อ”");
    expect(items[0].publisher).toBe("มิติหุ้น");
    expect(items[0].time).toBe("2026-11-16T08:03:45.000Z");
  });
  it("จัดโทนพาดหัวคร่าว ๆ", () => {
    expect(headlineTone("โบรกฯ แนะนำซื้อ กำไรโตต่อเนื่อง")).toBe("pos");
    expect(headlineTone("หุ้นร่วงหนัก หลังขาดทุนไตรมาส 3")).toBe("neg");
    expect(headlineTone("Apple downgraded as iPhone sales miss estimates")).toBe("neg");
    expect(headlineTone("ประชุมผู้ถือหุ้นประจำปี")).toBe("neu");
  });
});

describe("Bot แนะนำ stop-loss / เป้าหมาย", () => {
  it("stop ต่ำกว่าราคา target สูงกว่า อัตรา 2:1 และอยู่บนช่วงราคา SET", async () => {
    const { suggestLevels } = await import("./levels");
    const { isOnTick } = await import("@/lib/rules/tick");
    const bars = barsFrom(Array.from({ length: 80 }, (_, i) => 37 + Math.sin(i / 3)));
    const lv = suggestLevels(bars, 37.5, "TH")!;
    expect(lv.stop).toBeLessThan(37.5);
    expect(lv.target).toBeGreaterThan(37.5);
    expect(1 - lv.stop / 37.5).toBeGreaterThanOrEqual(0.03 - 1e-9);
    expect(1 - lv.stop / 37.5).toBeLessThanOrEqual(0.15 + 0.01);
    expect(isOnTick(lv.stop)).toBe(true);
    expect(isOnTick(lv.target)).toBe(true);
    expect((lv.target - 37.5) / (37.5 - lv.stop)).toBeGreaterThan(1.8);
  });
  it("หุ้นแกว่งแรงมาก: จำกัด stop ไม่เกิน 15%", async () => {
    const { suggestLevels } = await import("./levels");
    const wild = barsFrom(Array.from({ length: 80 }, (_, i) => (i % 2 ? 100 : 70)));
    const lv = suggestLevels(wild, 100, "US")!;
    expect(lv.stop).toBeGreaterThanOrEqual(85);
  });
  it("ข้อมูลไม่พอ = null", async () => {
    const { suggestLevels } = await import("./levels");
    expect(suggestLevels(barsFrom([10, 11]), 11, "US")).toBeNull();
  });
});
