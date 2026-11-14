"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCustomers, useProfiles } from "@/lib/customers";
import { useCan, type PermKey } from "@/lib/perms";
import { isAdmin } from "@/lib/roles";
import { useIssues, useMe, useOrders } from "@/lib/store";

/**
 * The two bands under the header tabs.
 *   Header tabs  — Sales, Purchase, Inventory, Reports, Masters (components/OpsShell.tsx)
 *   Main tabs    — the dark band: the sections of the header tab you are in
 *   Sub tabs     — the light row beneath: views inside the main tab you are in
 */
type Ctx = { path: string; q: (k: string) => string | null };
type Sub = { label: string; href: string; on: (c: Ctx) => boolean; perm?: PermKey; n?: number };
type Main = { label: string; href: string; on: (c: Ctx) => boolean; perms?: PermKey[]; who?: "admin" | "owner"; n?: number; hot?: boolean; subs?: Sub[] };

const is = (...paths: string[]) => (c: Ctx) => paths.includes(c.path);

export default function NavBands() {
  const path = usePathname();
  const sp = useSearchParams();
  const ctx: Ctx = { path, q: (k) => sp.get(k) };
  const { can } = useCan();
  const { data: me } = useMe();
  const { data: orders } = useOrders();
  const { data: issues } = useIssues();
  const admin = me ? isAdmin(me) : false;
  const owner = me?.role === "owner";
  const openIssues = (issues ?? []).filter((i) => i.status !== "resolved").length;
  const allOrders = (orders ?? []).filter((o) => !o.is_internal).length;
  // How many customers look like duplicates of someone else (shown on the Merge sub tab).
  const mergeable = useCustomers().groups.reduce((a, g) => a + g.members.length, 0);
  // Customers where Claude had a question for the owner (shown on the Clean Up sub tab).
  const toAnswer = (useProfiles().data ?? []).filter((p) => p.status === "review").length;

  const SALES: Main[] = [
    {
      label: "All Sales",
      href: "/orders",
      on: is("/orders", "/order", "/orders/new", "/express", "/international", "/stitching"),
      perms: ["sales_all", "stitching"],
      n: allOrders,
      subs: [
        { label: "Orders", href: "/orders", on: is("/orders", "/order", "/orders/new"), perm: "sales_all" },
        { label: "Express", href: "/express", on: is("/express"), perm: "sales_all" },
        { label: "International", href: "/international", on: is("/international"), perm: "sales_all" },
        { label: "Stitching Queue", href: "/stitching", on: is("/stitching"), perm: "stitching" },
      ],
    },
    { label: "Order Status", href: "/status", on: is("/status"), perms: ["sales_status"] },
    {
      label: "Disputes",
      href: "/disputes",
      on: is("/disputes"),
      perms: ["sales_disputes"],
      n: openIssues,
      hot: openIssues > 0,
      subs: [
        { label: "Shipping", href: "/disputes?t=shipping", on: (c) => (c.q("t") ?? "shipping") === "shipping" },
        { label: "Customer", href: "/disputes?t=customer", on: (c) => c.q("t") === "customer" },
      ],
    },
    {
      label: "Customers",
      href: "/customers",
      on: is("/customers"),
      perms: ["sales_all"],
      subs: [
        { label: "All Customers", href: "/customers", on: (c) => c.q("v") !== "merge" && c.q("v") !== "clean" },
        { label: "Merge", href: "/customers?v=merge", on: (c) => c.q("v") === "merge", n: mergeable },
        { label: "Clean Up", href: "/customers?v=clean", on: (c) => c.q("v") === "clean", n: toAnswer },
      ],
    },
  ];
  const PURCHASE: Main[] = [{ label: "Expenses", href: "/expenses", on: is("/expenses"), perms: ["purchase"] }];
  const MASTERS: Main[] = [
    { label: "Designs", href: "/masters", on: (c) => (c.q("m") ?? "designs") === "designs" },
    { label: "Expense Categories", href: "/masters?m=categories", on: (c) => c.q("m") === "categories", perms: ["purchase"] },
    { label: "Vendors", href: "/masters?m=vendors", on: (c) => c.q("m") === "vendors" },
  ];
  const SETTINGS: Main[] = [
    { label: "Team", href: "/team", on: is("/team"), who: "admin" },
    { label: "Roles", href: "/roles", on: is("/roles"), who: "owner" },
    { label: "Templates", href: "/templates", on: is("/templates"), who: "admin" },
    { label: "Shopify", href: "/settings", on: is("/settings"), who: "admin" },
    { label: "Personalise", href: "/personalise", on: is("/personalise") },
  ];

  const section = SALES.some((m) => m.on(ctx))
    ? SALES
    : path === "/expenses"
      ? PURCHASE
      : path === "/masters"
        ? MASTERS
        : SETTINGS.some((m) => m.on(ctx))
          ? SETTINGS
          : null;
  if (!section) return null;

  const allowed = (m: Main) => (!m.perms || m.perms.some(can)) && (m.who === "owner" ? owner : m.who === "admin" ? admin : true);
  const mains = section
    .filter(allowed)
    .map((m) => {
      const subs = (m.subs ?? []).filter((s) => !s.perm || can(s.perm));
      // A main tab opens on the first sub tab this person may see.
      return { ...m, subs, href: subs.length && !subs.some((s) => s.href === m.href) ? subs[0].href : m.href };
    });
  const current = mains.find((m) => m.on(ctx));
  const label = section === SALES ? "Sales" : section === PURCHASE ? "Purchase" : section === MASTERS ? "Masters" : "Settings";

  return (
    <div className="navbands no-print">
      <nav className="mainband" aria-label={`${label} sections`}>
        {mains.map((m) => (
          <Link key={m.label} href={m.href} aria-current={m === current ? "page" : undefined}>
            {m.label}
            {m.n ? <span className={`n${m.hot ? " hot" : ""}`}>{m.n}</span> : null}
          </Link>
        ))}
      </nav>
      {current && current.subs.length > 1 && (
        <nav className="subband" aria-label={`${current.label} views`}>
          {current.subs.map((s) => (
            <Link key={s.label} href={s.href} aria-current={s.on(ctx) ? "page" : undefined} scroll={false}>
              {s.label}
              {s.n ? <span className="n">{s.n}</span> : null}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
