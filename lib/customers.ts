"use client";

import { useMemo } from "react";
import useSWR, { mutate } from "swr";
import { sb } from "./supabase-browser";
import { useOrders, type OrderRow } from "./store";

/**
 * Customers are worked out from the orders in Core. A record is one distinct name + phone + email.
 * Records the team has merged are shown as one customer. Cancelled and refunded orders are not
 * counted as orders, and someone with no other order is not listed.
 */
export type Customer = {
  key: string;
  /** Every record folded into this customer (its own key first). */
  keys: string[];
  name: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  zip: string;
  orders: number;
  total: number;
  last: string;
  names: string[];
  phones: string[];
  addrKeys: string[];
  /** The address exactly as written on their newest order. */
  raw: { address1: string; address2: string; city: string; province: string; zip: string; country: string };
};
/** Cleaned-up details, saved by Claude or typed by the team (table: customers). */
export type Profile = {
  key: string;
  name: string;
  phone: string;
  email: string;
  address1: string;
  address2: string;
  city: string;
  district: string;
  state: string;
  pin: string;
  country: string;
  status: "clean" | "review";
  doubts: string[];
  source: "claude" | "person";
  updated_at: string;
};
export const PROFILE_FIELDS = ["name", "phone", "email", "address1", "address2", "city", "district", "state", "pin", "country"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export const FIELD_LABEL: Record<ProfileField, string> = { name: "Name", phone: "Phone", email: "Email", address1: "Address line 1", address2: "Address line 2", city: "City", district: "District", state: "State", pin: "PIN code", country: "Country" };
export type Reason = "mobile" | "address" | "name";
export const REASON_LABEL: Record<Reason, string> = { mobile: "Same mobile number", address: "Similar address", name: "Same name" };
export type MergeGroup = { signature: string; reason: Reason; members: Customer[] };

const phone10 = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);
const normName = (n: string) => n.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
const alnum = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Kept as plain lists: the cache decides whether to redraw by comparing old and new data, and it
// cannot see inside a Map or Set (two different Maps look "the same" to it).
type Stored = { links: [string, string][]; dismissed: string[] };
export function useCustomerDecisions() {
  return useSWR<Stored>(
    "customer-decisions",
    async () => {
      const [l, d] = await Promise.all([sb().from("customer_links").select("alias_key, primary_key"), sb().from("customer_dismissals").select("signature")]);
      if (l.error) throw l.error;
      if (d.error) throw d.error;
      return { links: (l.data ?? []).map((r) => [r.alias_key as string, r.primary_key as string] as [string, string]), dismissed: (d.data ?? []).map((r) => r.signature as string) };
    },
    { revalidateOnFocus: true, dedupingInterval: 5000, keepPreviousData: true },
  );
}

export function buildCustomers(orders: OrderRow[], links: Map<string, string>, dismissed: Set<string>) {
  const primaryOf = (k: string) => {
    let cur = k;
    for (let i = 0; i < 20 && links.has(cur); i++) cur = links.get(cur)!;
    return cur;
  };
  const m = new Map<string, Customer & { lastOwn: string }>();
  for (const o of orders) {
    // Test orders, cancellations and refunds are not real orders.
    if (o.is_internal || o.status === "cancelled" || o.status === "refunded") continue;
    const phone = phone10(o.customer_phone);
    const email = (o.customer_email ?? "").trim().toLowerCase();
    const base = `${normName(o.customer_name)}|${phone}|${email}`;
    const key = primaryOf(base);
    const a = (o.ship_address ?? {}) as Record<string, string | null>;
    const zip = alnum(a.zip);
    const street = alnum(a.address1);
    const c = m.get(key) ?? { key, keys: [key], name: "", phone: "", email: "", city: "", address: "", zip: "", orders: 0, total: 0, last: "", names: [], phones: [], addrKeys: [], lastOwn: "", raw: { address1: "", address2: "", city: "", province: "", zip: "", country: "" } };
    if (!c.keys.includes(base)) c.keys.push(base);
    c.orders += 1;
    c.total += Number(o.total ?? 0);
    const nm = o.customer_name.trim();
    if (nm && !c.names.includes(nm)) c.names.push(nm);
    if (phone && !c.phones.includes(phone)) c.phones.push(phone);
    // "Similar address" = same PIN code and the same opening of the street line.
    if (zip && street.length >= 6) {
      const ak = `${zip}|${street.slice(0, 12)}`;
      if (!c.addrKeys.includes(ak)) c.addrKeys.push(ak);
    }
    if (o.placed_at > c.last) c.last = o.placed_at;
    // Show the details of the record the team kept (or the newest order when nothing was merged).
    const own = base === key || c.keys.length === 1;
    if ((own && o.placed_at > c.lastOwn) || !c.name) {
      if (own) c.lastOwn = o.placed_at;
      c.name = nm || c.name;
      c.phone = o.customer_phone ?? c.phone;
      c.email = email || c.email;
      c.city = o.ship_city ?? c.city;
      c.address = [a.address1, a.city, a.zip].filter(Boolean).join(", ") || c.address;
      c.zip = a.zip ?? c.zip;
      c.raw = { address1: a.address1 ?? "", address2: a.address2 ?? "", city: a.city ?? o.ship_city ?? "", province: a.province ?? "", zip: a.zip ?? "", country: a.country ?? o.ship_country ?? "" };
    }
    m.set(key, c);
  }
  const customers: Customer[] = [...m.values()];

  // Suggestions, in the order the owner asked for: mobile first, then address, then name.
  const groups: MergeGroup[] = [];
  const taken = new Set<string>();
  const collect = (reason: Reason, keysOf: (c: Customer) => string[]) => {
    const by = new Map<string, Customer[]>();
    for (const c of customers) {
      if (taken.has(c.key)) continue;
      for (const k of keysOf(c)) by.set(k, [...(by.get(k) ?? []), c]);
    }
    const seen = new Set<string>();
    for (const list of by.values()) {
      const members = [...new Set(list)].filter((c) => !taken.has(c.key));
      if (members.length < 2) continue;
      const signature = members.map((c) => c.key).sort().join("~");
      if (seen.has(signature) || dismissed.has(signature)) continue;
      seen.add(signature);
      groups.push({ signature, reason, members: members.sort((a, b) => b.orders - a.orders || b.last.localeCompare(a.last)) });
      for (const c of members) taken.add(c.key);
    }
  };
  collect("mobile", (c) => c.phones);
  collect("address", (c) => c.addrKeys);
  collect("name", (c) => c.names.map(normName).filter((n) => n.length >= 6));
  return { customers, groups };
}

export function useCustomers() {
  const { data: orders } = useOrders();
  const { data: dec } = useCustomerDecisions();
  return useMemo(() => {
    if (!orders) return { ready: false, customers: [] as Customer[], groups: [] as MergeGroup[] };
    const { customers, groups } = buildCustomers(orders, new Map(dec?.links ?? []), new Set(dec?.dismissed ?? []));
    return { ready: true, customers, groups };
  }, [orders, dec]);
}

type R = { ok: boolean; message?: string };
/** Show a decision on screen at once, then confirm it against the database. */
const apply = (change: (d: Stored) => Stored) =>
  mutate<Stored>("customer-decisions", (cur) => change({ links: [...(cur?.links ?? [])], dismissed: [...(cur?.dismissed ?? [])] }), { revalidate: true });
/** Fold the other records into the one being kept. Only Core's view changes; it can be undone. */
export async function mergeCustomers(keep: Customer, others: Customer[], userId: string): Promise<R> {
  const rows = others.flatMap((c) => c.keys).filter((k) => k !== keep.key).map((alias_key) => ({ alias_key, primary_key: keep.key, created_by: userId }));
  const { error } = await sb().from("customer_links").upsert(rows);
  if (error) return { ok: false, message: error.message };
  const aliases = new Set(rows.map((r) => r.alias_key));
  await apply((d) => ({ ...d, links: [...d.links.filter(([a]) => !aliases.has(a)), ...rows.map((r) => [r.alias_key, r.primary_key] as [string, string])] }));
  return { ok: true, message: `Merged ${others.length + 1} records into ${keep.name}.` };
}
export async function dismissGroup(signature: string, userId: string): Promise<R> {
  const { error } = await sb().from("customer_dismissals").upsert({ signature, created_by: userId });
  if (error) return { ok: false, message: error.message };
  await apply((d) => ({ ...d, dismissed: [...d.dismissed, signature] }));
  return { ok: true, message: "Marked as different people." };
}
export async function unmergeCustomer(c: Customer): Promise<R> {
  const { error } = await sb().from("customer_links").delete().eq("primary_key", c.key);
  if (error) return { ok: false, message: error.message };
  await apply((d) => ({ ...d, links: d.links.filter(([, primary]) => primary !== c.key) }));
  return { ok: true, message: `${c.name} is separated again.` };
}

// ── Cleaned profiles ───────────────────────────────────────────
export function useProfiles() {
  return useSWR<Profile[]>(
    "customer-profiles",
    async () => {
      const { data, error } = await sb().from("customers").select("key, name, phone, email, address1, address2, city, district, state, pin, country, status, doubts, source, updated_at").limit(5000);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    { revalidateOnFocus: true, dedupingInterval: 5000, keepPreviousData: true },
  );
}

/** What the profile form starts from when nobody has cleaned this customer yet. */
export const draftFrom = (c: Customer): Record<ProfileField, string> => ({
  name: c.name, phone: c.phone, email: c.email, address1: c.raw.address1, address2: c.raw.address2, city: c.raw.city || c.city, district: "", state: c.raw.province, pin: c.raw.zip, country: c.raw.country || "India",
});

export async function saveProfile(key: string, values: Record<ProfileField, string>, userId: string): Promise<R> {
  const row = { key, ...Object.fromEntries(PROFILE_FIELDS.map((f) => [f, (values[f] ?? "").trim()])), status: "clean", doubts: [], source: "person", updated_at: new Date().toISOString(), updated_by: userId };
  const { error } = await sb().from("customers").upsert(row);
  if (error) return { ok: false, message: error.message };
  // Shown at once, then confirmed from the database.
  await mutate<Profile[]>("customer-profiles", (cur) => [...(cur ?? []).filter((p) => p.key !== key), row as unknown as Profile], { revalidate: true });
  return { ok: true, message: "Saved." };
}
