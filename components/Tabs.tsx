"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; n?: number; hot?: boolean };

export default function Tabs({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className="tab" aria-current={path.startsWith(t.href) ? "page" : undefined}>
          {t.label}
          {t.n ? <span className={`n${t.hot ? " hot" : ""}`}>{t.n}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
