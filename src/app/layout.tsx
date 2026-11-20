import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import localFont from "next/font/local";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { IconLogo, IconSettings } from "@/components/icons";
import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/settings";
import "./globals.css";

export const dynamic = "force-dynamic";

// ตัวเลข/ละติน = Outfit (เรขาคณิต มน), ภาษาไทย = IBM Plex Sans Thai (Outfit ไม่มีอักษรไทย)
// Outfit (OFL) เก็บไว้ในโปรเจกต์ เพราะตัวโหลดฟอนต์ Google ของ Next ดึงไฟล์นี้ไม่สำเร็จ
const latin = localFont({ src: "./fonts/Outfit-latin.woff2", weight: "100 900", variable: "--font-latin", display: "swap" });
const thai = IBM_Plex_Sans_Thai({ weight: ["400", "500", "600", "700"], subsets: ["thai"], variable: "--font-thai", display: "swap" });

export const metadata: Metadata = {
  title: "เกมเทรดหุ้นเพื่อการเรียนรู้",
  description: "เกมจำลองการเทรดหุ้นด้วยเงินสมมติ ใช้ราคาจริง เพื่อฝึกวินัย",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1c1d20" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = getSettings(getDb());
  return (
    <html lang="th" className={`${latin.variable} ${thai.variable} dark`}>
      <body className="font-sans antialiased">
        <div className="app-bg" aria-hidden />
        <div className="app-smoke" aria-hidden />
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-neutral-900">
          ข้ามไปเนื้อหา
        </a>
        <div className="mx-auto max-w-7xl px-2 pb-28 pt-2 sm:px-4 lg:flex lg:items-start lg:gap-5 lg:px-6 lg:py-6">
          <BottomNav />
          {/* ชั้น 1: แผงกระจกใหญ่ */}
          <div className="glass-panel min-h-[calc(100vh-8rem)] min-w-0 flex-1 lg:min-h-[calc(100vh-3rem)]">
            <header className="flex items-center justify-between gap-2 px-4 pt-3 lg:px-7 lg:pt-5">
              <Link href="/" className="flex min-h-[44px] min-w-0 items-center gap-2.5 font-semibold">
                <IconLogo className="h-8 w-8 shrink-0" />
                <span className="truncate">เทรดเพื่อการเรียนรู้</span>
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="chip whitespace-nowrap border border-white/10 bg-white/[0.06] text-white/80">
                  <span aria-hidden className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${settings.mode === "live" ? "bg-emerald-400" : "bg-white/60"}`} />
                  {settings.mode === "live" ? "เวลาจริง" : "ย้อนอดีต"}
                </span>
                <Link href="/settings" className="btn h-11 w-11 border border-white/10 bg-white/[0.06] p-0 text-white/80 hover:bg-white/[0.12] lg:hidden" aria-label="ตั้งค่า">
                  <IconSettings className="h-5 w-5" />
                </Link>
              </div>
            </header>
            <main id="main" className="page-enter px-3 pb-6 pt-3 sm:px-4 lg:px-7 lg:pb-8">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
