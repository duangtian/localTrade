/**
 * รายชื่อหุ้นตั้งต้น
 *
 * TODO: ตรวจรายชื่อ SET50 ปัจจุบันจาก https://www.set.or.th/th/market/index/set50/overview
 * (SET ปรับรายชื่อทุก 6 เดือน รายการนี้อาจไม่ตรงกับรอบล่าสุด)
 */
export interface SeedStock {
  symbol: string; // ชื่อย่อแบบ Yahoo เช่น PTT.BK
  name: string;
  sector: string; // ชื่อกลุ่มอุตสาหกรรมภาษาไทย
}

export const SET50: SeedStock[] = [
  { symbol: "ADVANC.BK", name: "แอดวานซ์ อินโฟร์ เซอร์วิส", sector: "เทคโนโลยี/สื่อสาร" },
  { symbol: "AOT.BK", name: "ท่าอากาศยานไทย", sector: "ขนส่ง" },
  { symbol: "AWC.BK", name: "แอสเสท เวิรด์ คอร์ป", sector: "อสังหาริมทรัพย์" },
  { symbol: "BANPU.BK", name: "บ้านปู", sector: "พลังงาน" },
  { symbol: "BBL.BK", name: "ธนาคารกรุงเทพ", sector: "ธนาคาร" },
  { symbol: "BDMS.BK", name: "กรุงเทพดุสิตเวชการ", sector: "การแพทย์" },
  { symbol: "BEM.BK", name: "ทางด่วนและรถไฟฟ้ากรุงเทพ", sector: "ขนส่ง" },
  { symbol: "BGRIM.BK", name: "บี.กริม เพาเวอร์", sector: "พลังงาน" },
  { symbol: "BH.BK", name: "โรงพยาบาลบำรุงราษฎร์", sector: "การแพทย์" },
  { symbol: "BJC.BK", name: "เบอร์ลี่ ยุคเกอร์", sector: "พาณิชย์" },
  { symbol: "BTS.BK", name: "บีทีเอส กรุ๊ป", sector: "ขนส่ง" },
  { symbol: "CBG.BK", name: "คาราบาวกรุ๊ป", sector: "อาหารและเครื่องดื่ม" },
  { symbol: "CCET.BK", name: "แคล-คอมพ์ อีเล็คโทรนิคส์", sector: "ชิ้นส่วนอิเล็กทรอนิกส์" },
  { symbol: "CENTEL.BK", name: "โรงแรมเซ็นทรัลพลาซา", sector: "ท่องเที่ยว" },
  { symbol: "COM7.BK", name: "คอมเซเว่น", sector: "พาณิชย์" },
  { symbol: "CPALL.BK", name: "ซีพี ออลล์", sector: "พาณิชย์" },
  { symbol: "CPF.BK", name: "เจริญโภคภัณฑ์อาหาร", sector: "อาหารและเครื่องดื่ม" },
  { symbol: "CPN.BK", name: "เซ็นทรัลพัฒนา", sector: "อสังหาริมทรัพย์" },
  { symbol: "CRC.BK", name: "เซ็นทรัล รีเทล คอร์ปอเรชั่น", sector: "พาณิชย์" },
  { symbol: "DELTA.BK", name: "เดลต้า อีเลคโทรนิคส์", sector: "ชิ้นส่วนอิเล็กทรอนิกส์" },
  { symbol: "EGCO.BK", name: "ผลิตไฟฟ้า", sector: "พลังงาน" },
  { symbol: "GLOBAL.BK", name: "สยามโกลบอลเฮ้าส์", sector: "พาณิชย์" },
  { symbol: "GPSC.BK", name: "โกลบอล เพาเวอร์ ซินเนอร์ยี่", sector: "พลังงาน" },
  { symbol: "GULF.BK", name: "กัลฟ์ ดีเวลลอปเมนท์", sector: "พลังงาน" },
  { symbol: "HMPRO.BK", name: "โฮม โปรดักส์ เซ็นเตอร์", sector: "พาณิชย์" },
  { symbol: "ITC.BK", name: "ไอ-เทล คอร์ปอเรชั่น", sector: "อาหารและเครื่องดื่ม" },
  { symbol: "IVL.BK", name: "อินโดรามา เวนเจอร์ส", sector: "ปิโตรเคมี" },
  { symbol: "KBANK.BK", name: "ธนาคารกสิกรไทย", sector: "ธนาคาร" },
  { symbol: "KKP.BK", name: "ธนาคารเกียรตินาคินภัทร", sector: "ธนาคาร" },
  { symbol: "KTB.BK", name: "ธนาคารกรุงไทย", sector: "ธนาคาร" },
  { symbol: "KTC.BK", name: "บัตรกรุงไทย", sector: "เงินทุนและหลักทรัพย์" },
  { symbol: "LH.BK", name: "แลนด์ แอนด์ เฮ้าส์", sector: "อสังหาริมทรัพย์" },
  { symbol: "MINT.BK", name: "ไมเนอร์ อินเตอร์เนชั่นแนล", sector: "ท่องเที่ยว" },
  { symbol: "MTC.BK", name: "เมืองไทย แคปปิตอล", sector: "เงินทุนและหลักทรัพย์" },
  { symbol: "OR.BK", name: "ปตท. น้ำมันและการค้าปลีก", sector: "พลังงาน" },
  { symbol: "OSP.BK", name: "โอสถสภา", sector: "อาหารและเครื่องดื่ม" },
  { symbol: "PTT.BK", name: "ปตท.", sector: "พลังงาน" },
  { symbol: "PTTEP.BK", name: "ปตท.สำรวจและผลิตปิโตรเลียม", sector: "พลังงาน" },
  { symbol: "PTTGC.BK", name: "พีทีที โกลบอล เคมิคอล", sector: "ปิโตรเคมี" },
  { symbol: "RATCH.BK", name: "ราช กรุ๊ป", sector: "พลังงาน" },
  { symbol: "SCB.BK", name: "เอสซีบี เอกซ์", sector: "ธนาคาร" },
  { symbol: "SCC.BK", name: "ปูนซิเมนต์ไทย", sector: "วัสดุก่อสร้าง" },
  { symbol: "SCGP.BK", name: "เอสซีจี แพคเกจจิ้ง", sector: "บรรจุภัณฑ์" },
  { symbol: "TCAP.BK", name: "ทุนธนชาต", sector: "ธนาคาร" },
  { symbol: "TISCO.BK", name: "ทิสโก้ไฟแนนเชียลกรุ๊ป", sector: "ธนาคาร" },
  { symbol: "TLI.BK", name: "ไทยประกันชีวิต", sector: "ประกันภัย" },
  { symbol: "TOP.BK", name: "ไทยออยล์", sector: "พลังงาน" },
  { symbol: "TRUE.BK", name: "ทรู คอร์ปอเรชั่น", sector: "เทคโนโลยี/สื่อสาร" },
  { symbol: "TTB.BK", name: "ธนาคารทีเอ็มบีธนชาต", sector: "ธนาคาร" },
  { symbol: "WHA.BK", name: "ดับบลิวเอชเอ คอร์ปอเรชั่น", sector: "อสังหาริมทรัพย์" },
];

export const US_POPULAR: SeedStock[] = [
  { symbol: "AAPL", name: "Apple", sector: "เทคโนโลยี" },
  { symbol: "MSFT", name: "Microsoft", sector: "เทคโนโลยี" },
  { symbol: "NVDA", name: "NVIDIA", sector: "เทคโนโลยี" },
  { symbol: "GOOGL", name: "Alphabet (Google)", sector: "เทคโนโลยี/สื่อสาร" },
  { symbol: "AMZN", name: "Amazon", sector: "พาณิชย์" },
  { symbol: "META", name: "Meta Platforms", sector: "เทคโนโลยี/สื่อสาร" },
  { symbol: "TSLA", name: "Tesla", sector: "ยานยนต์" },
  { symbol: "AVGO", name: "Broadcom", sector: "เทคโนโลยี" },
  { symbol: "AMD", name: "AMD", sector: "เทคโนโลยี" },
  { symbol: "INTC", name: "Intel", sector: "เทคโนโลยี" },
  { symbol: "ORCL", name: "Oracle", sector: "เทคโนโลยี" },
  { symbol: "NFLX", name: "Netflix", sector: "สื่อและบันเทิง" },
  { symbol: "DIS", name: "Walt Disney", sector: "สื่อและบันเทิง" },
  { symbol: "BRK-B", name: "Berkshire Hathaway B", sector: "เงินทุนและหลักทรัพย์" },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "ธนาคาร" },
  { symbol: "BAC", name: "Bank of America", sector: "ธนาคาร" },
  { symbol: "V", name: "Visa", sector: "เงินทุนและหลักทรัพย์" },
  { symbol: "MA", name: "Mastercard", sector: "เงินทุนและหลักทรัพย์" },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "การแพทย์" },
  { symbol: "UNH", name: "UnitedHealth", sector: "การแพทย์" },
  { symbol: "PFE", name: "Pfizer", sector: "การแพทย์" },
  { symbol: "PG", name: "Procter & Gamble", sector: "สินค้าอุปโภค" },
  { symbol: "KO", name: "Coca-Cola", sector: "อาหารและเครื่องดื่ม" },
  { symbol: "PEP", name: "PepsiCo", sector: "อาหารและเครื่องดื่ม" },
  { symbol: "MCD", name: "McDonald's", sector: "อาหารและเครื่องดื่ม" },
  { symbol: "WMT", name: "Walmart", sector: "พาณิชย์" },
  { symbol: "COST", name: "Costco", sector: "พาณิชย์" },
  { symbol: "HD", name: "Home Depot", sector: "พาณิชย์" },
  { symbol: "NKE", name: "Nike", sector: "สินค้าอุปโภค" },
  { symbol: "XOM", name: "Exxon Mobil", sector: "พลังงาน" },
  { symbol: "CVX", name: "Chevron", sector: "พลังงาน" },
];

/** หุ้นที่ Bot "ถือยาว" ใช้ (กระจาย ≥ 4 กลุ่ม) */
export const BOT_LONGTERM_PICKS: string[] = [
  "PTT.BK", // พลังงาน
  "ADVANC.BK", // สื่อสาร
  "CPALL.BK", // พาณิชย์
  "KBANK.BK", // ธนาคาร
  "BDMS.BK", // การแพทย์
  "MSFT", // เทคโนโลยี
  "JNJ", // การแพทย์
  "KO", // อาหารและเครื่องดื่ม
  "JPM", // ธนาคาร
  "PG", // สินค้าอุปโภค
];

export const BENCHMARKS = { SET: "^SET.BK", SP500: "^GSPC" } as const;
export const FX_SYMBOL = "THB=X";

const ALL = new Map([...SET50, ...US_POPULAR].map((s) => [s.symbol, s]));
export function findSeed(symbol: string): SeedStock | undefined {
  return ALL.get(symbol);
}
export function sectorOf(symbol: string): string {
  return ALL.get(symbol)?.sector ?? "อื่น ๆ";
}
