import { describe, expect, it } from "vitest";
import { TimeBoundedProvider } from "./bounded";
import { FakeProvider } from "./fake";

describe("TimeBoundedProvider: ห้ามรั่วข้อมูลอนาคต", () => {
  const inner = new FakeProvider({ start: "2020-01-01", days: 120, base: { AAPL: 100, "THB=X": 30 } });
  const p = new TimeBoundedProvider(inner, "2020-02-14");

  it("history ไม่มีแท่งหลังวันจำลอง แม้ขอช่วงยาวเกิน", async () => {
    const bars = await p.getHistory("AAPL", "2020-01-01", "2020-12-31", "1d");
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.every((b) => b.date <= "2020-02-14")).toBe(true);
    expect(bars[bars.length - 1].date).toBe("2020-02-14");
  });

  it("ถ้า provider ข้างในคืนข้อมูลเกินมา ก็ยังกรองออก", async () => {
    const leaky = new FakeProvider({ start: "2020-01-01", days: 120, base: { AAPL: 100 }, ignoreRange: true });
    const bp = new TimeBoundedProvider(leaky, "2020-02-14");
    const bars = await bp.getHistory("AAPL", "2020-01-01", "2020-12-31", "1d");
    expect(bars.every((b) => b.date <= "2020-02-14")).toBe(true);
  });

  it("quote = ราคาปิดของวันจำลอง ไม่ใช่วันหลังจากนั้น", async () => {
    const q = await p.getQuote("AAPL");
    const all = await inner.getHistory("AAPL", "2020-01-01", "2020-12-31", "1d");
    const onDay = all.find((b) => b.date === "2020-02-14")!;
    expect(q.price).toBe(onDay.close);
    expect(q.time).toBe("2020-02-14");
    expect(q.pe).toBeNull(); // ข้อมูลพื้นฐานปัจจุบันถือเป็นข้อมูลอนาคต
  });

  it("วันจำลองเป็นวันเสาร์: ใช้ราคาปิดวันศุกร์", async () => {
    const sat = new TimeBoundedProvider(inner, "2020-02-15");
    expect((await sat.getQuote("AAPL")).time).toBe("2020-02-14");
    expect(await sat.barOn("AAPL", "2020-02-15")).toBeNull();
  });

  it("ค่าเงินก็ถูกจำกัดเวลา", async () => {
    const fx = await p.getFxRate();
    expect(fx.time).toBe("2020-02-14");
  });

  it("ห้ามใช้ intraday ในโหมดย้อนอดีต", async () => {
    await expect(p.getHistory("AAPL", "2020-02-14", "2020-02-14", "5m")).rejects.toThrow();
  });

  it("barOn วันในอนาคตคืน null", async () => {
    expect(await p.barOn("AAPL", "2020-03-02")).toBeNull();
  });
});
