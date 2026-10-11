"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/", label: "Oversigt" },
  { href: "/udsolgt", label: "Hvad er udsolgt nu" },
  { href: "/attributter", label: "Attributindeks" },
  { href: "/brands", label: "Brands" },
  { href: "/positionering", label: "Positionering" },
  { href: "/data", label: "Datakvalitet" },
  { href: "/metode", label: "Metode" },
];

export default function Nav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="border-b border-hair bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3">
        <Link href="/" className="text-base font-semibold tracking-tight text-ink">
          Trendmonitor
        </Link>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "border-b-2 border-ink pb-0.5 font-medium text-ink"
                      : "border-b-2 border-transparent pb-0.5 text-ink2 hover:text-ink"
                  }
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
