import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/settings";
import "./globals.css";

export const dynamic = "force-dynamic";

const font = IBM_Plex_Sans_Thai({
  weight: ["400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  variable: "--font-thai",
  display: "swap",
});

export const metadata: Metadata = {
  title: "เกมเทรดหุ้นเพื่อการเรียนรู้",
  description: "เกมจำลองการเทรดหุ้นด้วยเงินสมมติ ใช้ราคาจริง เพื่อฝึกวินัย",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1d4ed8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = getSettings(getDb());
  return (
    <html lang="th" className={`${font.variable} ${settings.theme === "dark" ? "dark" : ""}`}>
      <body className="font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
          ข้ามไปเนื้อหา
        </a>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-2">
            <Link href="/" className="min-w-0 truncate font-bold text-blue-800 dark:text-blue-300">
              📈 เทรดเพื่อการเรียนรู้
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              <span className="chip whitespace-nowrap bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                {settings.mode === "live" ? "เวลาจริง" : "ย้อนอดีต"}
              </span>
              <Link href="/settings" className="btn px-2 text-2xl" aria-label="ตั้งค่า">
                ⚙️
              </Link>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-2xl px-4 pb-28 pt-4">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
