"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/black-market", label: "Transport Scanner" },
  { href: "/market", label: "Market tools" },
  ...(process.env.NEXT_PUBLIC_PORTABLE_MODE === "1" ? [
    { href: "/crafting", label: "Crafting" },
    { href: "/refining", label: "Refining" },
    { href: "/cooking", label: "Cooking" },
    { href: "/coverage", label: "Coverage" },
    { href: "/private-prices", label: "Private prices" },
    { href: "/account", label: "Account" },
  ] : []),
] as const;

export function SiteNav() {
  const pathname = usePathname();
  return <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Main navigation">
    {navItems.map((item) => {
      const active = pathname.startsWith(item.href);
      return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`shrink-0 rounded border px-3 py-2 text-sm font-medium transition-colors ${active ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900"}`}>{item.label}</Link>;
    })}
  </nav>;
}
