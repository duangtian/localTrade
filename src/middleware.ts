import { NextResponse, type NextRequest } from "next/server";

/**
 * ป้องกันด้วยรหัสผ่าน (HTTP Basic Auth) เมื่อตั้ง APP_PASSWORD ใน .env
 * ใช้ตอนเปิดให้เข้าผ่านอินเทอร์เน็ต (เช่น Cloudflare Tunnel) ชื่อผู้ใช้ใส่อะไรก็ได้
 */
export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (safeEqual(given, password)) return NextResponse.next();
    } catch {
      /* header เสีย */
    }
  }
  return new NextResponse("ต้องใส่รหัสผ่าน", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="TradingGame", charset="UTF-8"', "content-type": "text/plain; charset=utf-8" },
  });
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = {
  // ไอคอนแอปไม่ต้องใช้รหัส
  matcher: ["/((?!icon.svg|favicon.ico).*)"],
};
