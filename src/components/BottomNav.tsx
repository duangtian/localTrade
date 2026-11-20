"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "หน้าแรก", icon: "🏠" },
  { href: "/market", label: "ตลาด", icon: "🔎" },
  { href: "/portfolio", label: "พอร์ต", icon: "💼" },
  { href: "/coach", label: "อาจารย์", icon: "🧑‍🏫" },
  { href: "/missions", label: "ภารกิจ", icon: "🎯" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-950"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {ITEMS.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href) || (it.href === "/market" && (path.startsWith("/stock") || path.startsWith("/trade")));
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[0.8rem] font-semibold ${
                  active ? "text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-slate-300"
                }`}
              >
                <span aria-hidden className="text-xl leading-none">
                  {it.icon}
                </span>
                {it.label}
                {active && <span className="mt-0.5 h-1 w-6 rounded-full bg-blue-700 dark:bg-blue-300" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
