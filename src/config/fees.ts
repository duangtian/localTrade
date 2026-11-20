/**
 * ค่าธรรมเนียมแบบ Dime! (ค่าตั้งต้น)
 *
 * TODO: กรอกอัตราจริงจากแอป Dime!
 * ตอนนี้ทุกค่าเป็น 0 เพราะ "ห้ามเดาตัวเลข" แก้ได้ 2 ทาง:
 *   1) แก้ในหน้า ตั้งค่า ในแอป (บันทึกลงฐานข้อมูล จะทับค่าในไฟล์นี้)
 *   2) แก้ค่าในไฟล์นี้โดยตรง แล้วใส่วันที่ที่เก็บอัตราไว้ใน asOf
 */
export interface FeeConfig {
  /** วันที่เก็บอัตรา (YYYY-MM-DD) หรือ null ถ้ายังไม่ได้กรอก */
  asOf: string | null;
  th: {
    /** ค่าคอมเป็นสัดส่วนของมูลค่าซื้อขาย เช่น 0.0015 = 0.15% */
    commissionRate: number;
    /** ค่าคอมขั้นต่ำต่อคำสั่ง (บาท) */
    minCommissionThb: number;
    /** VAT ที่คิดบนค่าคอม เช่น 0.07 = 7% */
    vatRate: number;
  };
  us: {
    /** ค่าคอมเป็นสัดส่วนของมูลค่าซื้อขาย */
    commissionRate: number;
    /** ค่าคอมขั้นต่ำต่อคำสั่ง (USD) */
    minCommissionUsd: number;
    /** VAT ที่คิดบนค่าคอม */
    vatRate: number;
  };
  fx: {
    /** spread ค่าแลกเงิน เช่น 0.002 = 0.2% บวกเพิ่มจากอัตรากลาง THB=X */
    spreadRate: number;
  };
}

export const DEFAULT_FEES: FeeConfig = {
  asOf: null, // TODO: กรอกอัตราจริงจากแอป Dime!
  th: {
    commissionRate: 0, // TODO: กรอกอัตราจริงจากแอป Dime!
    minCommissionThb: 0, // TODO: กรอกอัตราจริงจากแอป Dime!
    vatRate: 0, // TODO: กรอกอัตราจริงจากแอป Dime!
  },
  us: {
    commissionRate: 0, // TODO: กรอกอัตราจริงจากแอป Dime!
    minCommissionUsd: 0, // TODO: กรอกอัตราจริงจากแอป Dime!
    vatRate: 0, // TODO: กรอกอัตราจริงจากแอป Dime!
  },
  fx: {
    spreadRate: 0, // TODO: กรอกอัตราจริงจากแอป Dime!
  },
};

export function feesAreUnset(f: FeeConfig): boolean {
  return f.asOf === null;
}
