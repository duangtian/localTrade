import os from "node:os";

// อนุญาตให้มือถือในวง LAN เดียวกันเปิดหน้า dev ได้ (Next 15 บล็อก cross-origin dev request โดยค่าเริ่มต้น)
const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal)
  .map((n) => n.address);

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "yahoo-finance2"],
  allowedDevOrigins: [...lanIps, "*.local"],
  // ปุ่ม dev ของ Next บังเมนูล่างบนมือถือ
  devIndicators: false,
};

export default nextConfig;
