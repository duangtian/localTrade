/** Next.js เรียกครั้งเดียวตอน server เริ่ม: เปิดตัวสแกนหุ้นเบื้องหลัง */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/analysis/background");
    startScheduler();
  }
}
