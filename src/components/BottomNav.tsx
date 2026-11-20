"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCoach, IconHome, IconMarket, IconTarget, IconWallet } from "./icons";

const ITEMS = [
  { href: "/", label: "หน้าแรก", Icon: IconHome },
  { href: "/market", label: "ตลาด", Icon: IconMarket },
  { href: "/portfolio", label: "พอร์ต", Icon: IconWallet },
  { href: "/coach", label: "อาจารย์", Icon: IconCoach },
  { href: "/missions", label: "ภารกิจ", Icon: IconTarget },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-950/95"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {ITEMS.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href) || (it.href === "/market" && (path.startsWith("/stock") || path.startsWith("/trade")));
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 py-1 text-[0.8rem] font-semibold ${
                  active ? "text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-slate-300"
                }`}
              >
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition ${active ? "bg-blue-100 dark:bg-blue-950" : ""}`}>
                  <it.Icon className="h-6 w-6" />
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
