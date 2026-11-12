"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAdmin } from "@/lib/roles";
import { useMe } from "@/lib/store";

const TABS = [
  { href: "/team", label: "Team", adminOnly: true },
  { href: "/templates", label: "Templates", adminOnly: true },
  { href: "/settings", label: "Shopify", adminOnly: true },
  { href: "/personalise", label: "Personalise", adminOnly: false },
];

/** Heading + tabs shared by the four Settings pages. */
export default function SettingsTabs() {
  const path = usePathname();
  const { data: me } = useMe();
  const admin = me ? isAdmin(me) : false;
  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      <nav className="tabs" aria-label="Settings">
        {TABS.filter((t) => !t.adminOnly || admin).map((t) => (
          <Link key={t.href} href={t.href} className="tab" aria-current={path === t.href ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
