"use client";

import useSWR from "swr";
import { sb } from "./supabase-browser";
import { useMe } from "./store";

/** Everything a role can be allowed. The Roles page in Settings is built from this list. */
export const PERM_GROUPS = [
  {
    title: "Tabs and sub-tabs",
    hint: "Which pages this role can open.",
    perms: [
      { key: "sales_all", label: "Sales → All Sales" },
      { key: "sales_status", label: "Sales → Order Status" },
      { key: "sales_disputes", label: "Sales → Disputes" },
      { key: "stitching", label: "Sales → Stitching queue" },
      { key: "purchase", label: "Purchase" },
      { key: "inventory", label: "Inventory" },
      { key: "reports", label: "Reports" },
      { key: "masters", label: "Masters" },
    ],
  },
  {
    title: "Money",
    hint: "What money figures this role sees.",
    perms: [
      { key: "see_amounts", label: "Order amounts and prices" },
      { key: "see_sales_total", label: "Sales totals and profit (Sales figure, home tiles, Reports)" },
    ],
  },
  {
    title: "Customer data",
    hint: "Personal details of customers.",
    perms: [{ key: "see_contact", label: "Phone, email and address" }],
  },
  {
    title: "What they can change",
    hint: "Without these the role can look but not change.",
    perms: [
      { key: "edit_orders", label: "Add and edit orders, change status, dispatch" },
      { key: "edit_inventory", label: "Change inventory numbers" },
      { key: "edit_masters", label: "Edit masters (designs, vendors, categories)" },
    ],
  },
] as const;

export type PermKey = (typeof PERM_GROUPS)[number]["perms"][number]["key"];
export const ALL_PERMS = PERM_GROUPS.flatMap((g) => g.perms.map((p) => p.key)) as PermKey[];
export type Role = { key: string; name: string; permissions: Partial<Record<PermKey, boolean>>; builtin: boolean };

// Used only if the roles table can't be read: the access each built-in role had before roles existed.
const STAFF_OFF: PermKey[] = ["purchase", "reports", "see_sales_total", "edit_masters"];

export function useRoles() {
  return useSWR<Role[]>(
    "roles",
    async () => {
      const { data, error } = await sb().from("roles").select("key, name, permissions, builtin").order("builtin", { ascending: false }).order("name");
      if (error) throw error;
      return (data ?? []) as Role[];
    },
    { revalidateOnFocus: true, dedupingInterval: 10000, keepPreviousData: true },
  );
}

/** `can("purchase")` for the signed-in person (or the person an owner is viewing as). Owners can do everything. */
export function useCan() {
  const { data: me } = useMe();
  const { data: roles, error } = useRoles();
  const ready = Boolean(me && (roles || error || me.role === "owner"));
  const row = roles?.find((r) => r.key === (me?.role_key ?? me?.role));
  const can = (k: PermKey) => {
    if (!me) return false;
    if (me.role === "owner") return true;
    if (row) return Boolean(row.permissions[k]);
    return me.role === "admin" ? true : !STAFF_OFF.includes(k);
  };
  return { can, ready, roleName: me?.role === "owner" ? "Owner" : (row?.name ?? me?.role ?? "") };
}

/** Which permission each page needs. */
export const PATH_PERM: [string, PermKey][] = [
  ["/orders", "sales_all"],
  ["/order", "sales_all"],
  ["/express", "sales_all"],
  ["/international", "sales_all"],
  ["/customers", "sales_all"],
  ["/status", "sales_status"],
  ["/disputes", "sales_disputes"],
  ["/stitching", "stitching"],
  ["/expenses", "purchase"],
  ["/inventory", "inventory"],
  ["/reports", "reports"],
  ["/masters", "masters"],
];
export const permForPath = (path: string) => PATH_PERM.find(([p]) => path === p || path.startsWith(p + "/"))?.[1] ?? null;
