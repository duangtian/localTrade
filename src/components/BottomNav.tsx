"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCoach, IconHome, IconMarket, IconSettings, IconTarget, IconWallet } from "./icons";

const ITEMS = [
  { href: "/", label: "หน้าแรก", Icon: IconHome },
  { href: "/market", label: "ตลาด", Icon: IconMarket },
  { href: "/portfolio", label: "พอร์ต", Icon: IconWallet },
  { href: "/coach", label: "อาจารย์", Icon: IconCoach },
  { href: "/missions", label: "ภารกิจ", Icon: IconTarget },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/market") return ["/market", "/stock", "/trade", "/picks"].some((p) => path.startsWith(p));
  if (href === "/portfolio") return ["/portfolio", "/plan", "/dca", "/daytrade"].some((p) => path.startsWith(p));
  return path.startsWith(href);
}

/** มือถือ: แคปซูลกระจกลอยด้านล่าง · จอใหญ่: แคปซูลแนวตั้งแบบไอคอน พร้อม tooltip */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="เมนูหลัก"
      className="glass-bar fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 rounded-full px-2 py-1.5 lg:sticky lg:inset-auto lg:top-6 lg:flex lg:w-[76px] lg:shrink-0 lg:flex-col lg:items-center lg:gap-2 lg:px-0 lg:py-4"
    >
      <ul className="grid grid-cols-5 lg:flex lg:flex-col lg:gap-2">
        {ITEMS.map((it) => {
          const active = isActive(path, it.href);
          return (
            <li key={it.href} className="group relative flex justify-center">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                aria-label={it.label}
                className={`flex min-h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-full text-[0.7rem] font-medium transition-colors lg:h-12 lg:min-h-0 lg:w-12 ${
                  active ? "bg-white/[0.14] text-white" : "text-white/60 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                <it.Icon className="h-[22px] w-[22px]" />
                <span className="lg:sr-only">{it.label}</span>
              </Link>
              <span
                role="tooltip"
                className="glass-bar pointer-events-none absolute left-full top-1/2 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[0.85rem] opacity-0 transition-opacity group-hover:opacity-100 lg:block"
              >
                {it.label}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="group relative mt-4 hidden border-t border-white/10 pt-4 lg:flex lg:justify-center">
        <Link
          href="/settings"
          aria-label="ตั้งค่า"
          aria-current={path.startsWith("/settings") ? "page" : undefined}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${path.startsWith("/settings") ? "bg-white/[0.14] text-white" : "text-white/60 hover:bg-white/[0.08] hover:text-white"}`}
        >
          <IconSettings className="h-[22px] w-[22px]" />
        </Link>
        <span role="tooltip" className="glass-bar pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[0.85rem] opacity-0 transition-opacity group-hover:opacity-100">
          ตั้งค่า
        </span>
      </div>
    </nav>
  );
}
