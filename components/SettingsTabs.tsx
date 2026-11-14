"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAdmin } from "@/lib/roles";
import { useMe } from "@/lib/store";

const TABS = [
  { href: "/team", label: "Team", adminOnly: true },
  { href: "/roles", label: "Roles", adminOnly: true, ownerOnly: true },
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
    </>
  );
}
