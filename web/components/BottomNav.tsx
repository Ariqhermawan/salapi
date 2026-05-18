"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", d: "M3 11.5 12 4l9 7.5M5 10v10h14V10" },
  { href: "/send", label: "Send", d: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" },
  {
    href: "/vaults",
    label: "Vaults",
    d: "M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm9 5v3",
  },
  { href: "/activity", label: "Activity", d: "M3 12h4l3 8 4-16 3 8h4" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav>
      <ul className="flex">
        {TABS.map((t) => {
          const active =
            t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold"
                style={{
                  color: active
                    ? "var(--color-action)"
                    : "var(--color-slate)",
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.4 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={t.d} />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
