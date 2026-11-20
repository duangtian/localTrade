# เกมเทรดหุ้นเพื่อการเรียนรู้ (App v1)

เกมจำลองการเทรดหุ้นไทย (SET) และหุ้นสหรัฐฯ ด้วย**เงินสมมติ** แต่ใช้**ราคาจริง** เป้าหมายคือฝึกวินัย ฝึกเขียนเหตุผลก่อนซื้อขาย และทบทวนย้อนหลัง

> ⚠️ เกมจำลองเพื่อการเรียนรู้ ไม่ใช่คำแนะนำการลงทุน

## วิธีรัน

ต้องมี Node.js 22 ขึ้นไป

```bash
npm install
npm run dev
```

เปิด http://localhost:3000 แล้วเลือกเงินเริ่มต้น (1,000 / 10,000 / 100,000 บาท) เพื่อเริ่มเกม

ข้อมูลทั้งหมดเก็บในไฟล์ `data/game.db` (SQLite) ถ้าอยากล้างทุกอย่าง ให้ปิด server แล้วลบไฟล์ `data/game.db*`

### เปิดจากมือถือ (Wi-Fi เดียวกัน)

`npm run dev` ฟังทุก network interface อยู่แล้ว (`-H 0.0.0.0`)

1. ดู IP ของคอม: `ipconfig` (หา IPv4 Address เช่น `192.168.1.43`)
2. เปิดบนมือถือ: `http://192.168.1.43:3000`
3. ถ้าเปิดไม่ได้ ให้อนุญาต Node.js ใน Windows Firewall (หน้าต่างถามตอนรันครั้งแรก ให้ติ๊ก Private network) หรือรันใน PowerShell แบบ Administrator:
   ```powershell
   New-NetFirewallRule -DisplayName "TradingGame 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private
   ```

### ทดสอบ

```bash
npm test          # Vitest: logic ซื้อขาย ค่าคอม มูลค่าพอร์ต และกันข้อมูลอนาคตในโหมดย้อนอดีต
npm run typecheck
```

## ใส่ API key ของ Claude (ไม่บังคับ)

ถ้าไม่ใส่ เกมใช้ "อาจารย์แบบกฎ" ได้ครบทุกอย่างฟรี

1. คัดลอก `.env.example` เป็น `.env`
2. ใส่ `ANTHROPIC_API_KEY=sk-ant-...`
3. รัน `npm run dev` ใหม่
4. ไปหน้า **ตั้งค่า** (ไอคอน ⚙️ มุมขวาบน) → กด **เปิดใช้ Claude**

เมื่อเปิดแล้ว Bot ใช้โมเดล `claude-haiku-5-5` เขียนคำอธิบายแต่ละไม้, ถามกลับก่อนส่งคำสั่ง, สรุปผล และตอบแชทอิสระ
จำกัดไม่เกิน 30 ข้อความต่อวัน (แก้ได้ที่ `AI_DAILY_LIMIT` ใน `src/config/app.ts`) ถ้าเรียก API ไม่สำเร็จหรือครบโควตา จะกลับไปใช้แบบกฎอัตโนมัติ

## แก้ค่าคอมมิชชัน / ค่าแลกเงิน

ค่าเริ่มต้นทุกตัวเป็น **0** และมีป้าย TODO เพราะยังไม่ได้กรอกอัตราจริงของ Dime!

- **วิธีที่ 1 (แนะนำ):** หน้า ตั้งค่า → "ค่าธรรมเนียม (แบบ Dime!)" กรอก % ค่าคอม, ขั้นต่ำ, VAT, spread ค่าแลกเงิน และ**วันที่เก็บอัตรา** แล้วกดบันทึก
- **วิธีที่ 2:** แก้ `src/config/fees.ts` (ค่าที่บันทึกในหน้าตั้งค่าจะทับค่าในไฟล์)

## ไฟล์ที่ควรรู้

| ไฟล์ | เนื้อหา |
| --- | --- |
| `src/config/fees.ts` | ค่าคอม/spread แบบ Dime! (TODO กรอกอัตราจริง) |
| `src/config/market.ts` | tick size SET, ceiling/floor, เวลาตลาด, **วันหยุดตลาด (แก้ได้)** |
| `src/config/seeds.ts` | รายชื่อ SET50, หุ้นสหรัฐฯ ยอดนิยม, หุ้นของ Bot |
| `src/config/app.ts` | เงินเริ่มต้น, preset วันย้อนอดีต, โควตา Claude, เกณฑ์เตือน 40% |
| `src/lib/glossary.ts` | อภิธานศัพท์กลาง (ไอคอน ?) |
| `src/lib/prices/` | `PriceProvider`, `YahooProvider`, `SetSmartProvider` (ช่องว่างไว้), cache, `TimeBoundedProvider` |
| `src/lib/engine/portfolio.ts` | logic ซื้อขาย/มูลค่าพอร์ตแบบ pure function |
| `src/lib/game/` | เวลาเกม, คำสั่ง, Limit, เลื่อนวัน, sync โหมดเวลาจริง |
| `src/lib/bot/` | `BotStrategy` interface และบุคลิก "ถือยาว" |
| `DECISIONS.md` | การตัดสินใจที่ requirement ไม่ได้ระบุชัด |

## เลือกผู้ให้บริการราคา

ตั้งใน `.env`: `PRICE_PROVIDER=yahoo` (ค่าเริ่มต้น) หรือ `setsmart` (ยังเป็นโครงว่าง ดู `src/lib/prices/setsmart.ts`)
