import { describe, expect, it } from "vitest";
import { INDEXES, indexDef, parseThaiSymbols } from "./indices";
import { findSeed, sectorOf } from "./seeds";

describe("parseThaiSymbols", () => {
  it("รับได้ทั้งเว้นวรรค จุลภาค ขึ้นบรรทัด ตัวเล็ก และ .BK ตัดตัวซ้ำ", () => {
    expect(parseThaiSymbols("advanc, AOT\nBBL\tbbl  PTT.BK")).toEqual(["ADVANC.BK", "AOT.BK", "BBL.BK", "PTT.BK"]);
  });
  it("ข้ามคำที่ไม่ใช่ชื่อย่อ (ตัวเลขล้วน ภาษาไทย หัวตาราง ราคา)", () => {
    expect(parseThaiSymbols("ชื่อย่อ 1 ADVANC 334.00 -1.18% L&E")).toEqual(["ADVANC.BK", "L&E.BK"]);
  });
});

describe("รายชื่อดัชนี", () => {
  it("S&P 500 และ Nasdaq-100 ครบ ไม่มีชื่อย่อซ้ำ ใช้รูปแบบ Yahoo", () => {
    const sp = indexDef("sp500")!.stocks;
    const nd = indexDef("ndx")!.stocks;
    expect(sp.length).toBeGreaterThanOrEqual(500);
    expect(nd.length).toBeGreaterThanOrEqual(100);
    for (const list of [sp, nd]) {
      expect(new Set(list.map((s) => s.symbol)).size).toBe(list.length);
      for (const s of list) expect(s.symbol).toMatch(/^[A-Z][A-Z0-9-]*$/);
    }
    expect(sp.some((s) => s.symbol === "BRK-B")).toBe(true);
  });
  it("ทุกตัวมีกลุ่มอุตสาหกรรม", () => {
    for (const i of INDEXES) for (const s of i.stocks) expect(s.sector, s.symbol).not.toBe("อื่น ๆ");
  });
  it("SET50 ตั้งต้นมีชื่อไทยครบ และหาได้ด้วย findSeed/sectorOf", () => {
    const set50 = indexDef("set50")!.stocks;
    expect(set50.length).toBeGreaterThanOrEqual(50);
    for (const s of set50) {
      expect(s.symbol.endsWith(".BK")).toBe(true);
      expect(s.sector).not.toBe("ไม่ระบุกลุ่ม");
    }
    expect(findSeed("NVDA")?.name).toBeTruthy();
    expect(sectorOf("ASML")).toBe("เทคโนโลยี");
  });
});
