"use client";

// Expense categories (with sub-categories) and vendors: the two masters behind every expense.

import useSWR, { mutate } from "swr";
import { sb } from "./supabase-browser";
import type { Expense, ExpenseCategory, Profile, Vendor } from "./types";

type Result = { ok: boolean; message?: string };
const opts = { revalidateOnFocus: true, dedupingInterval: 4000, keepPreviousData: true };

export function useExpenseCategories() {
  return useSWR<ExpenseCategory[]>(
    "expense-categories",
    async () => {
      const { data, error } = await sb().from("expense_categories").select("id, name, parent_id, sort").order("sort").order("name");
      if (error) throw error;
      return (data ?? []) as ExpenseCategory[];
    },
    opts,
  );
}

export function useVendors() {
  return useSWR<Vendor[]>(
    "vendors",
    async () => {
      const { data, error } = await sb().from("vendors").select("id, name, phone, notes, vendor_type, default_category_id").order("name");
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
    opts,
  );
}

/** Top-level categories in order, each followed by its sub-categories. */
export function categoryTree(cats: ExpenseCategory[] | undefined) {
  const list = cats ?? [];
  return list
    .filter((c) => !c.parent_id)
    .map((c) => ({ ...c, children: list.filter((x) => x.parent_id === c.id) }));
}

/** "Marketing › Ads" for a sub-category, "Fabric" for a top-level one. */
export function categoryLabel(cats: ExpenseCategory[] | undefined, id: string | null, fallback = "Uncategorised") {
  const c = (cats ?? []).find((x) => x.id === id);
  if (!c) return fallback;
  const parent = c.parent_id ? (cats ?? []).find((x) => x.id === c.parent_id) : null;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

const friendly = (m: string, what: string) =>
  /foreign key|violates|23503/i.test(m)
    ? `Can't delete — ${what}. Move or delete those first.`
    : /duplicate|unique/i.test(m)
      ? "That name already exists."
      : m;

export async function saveCategory(input: { id?: string; name: string; parent_id?: string | null }): Promise<Result> {
  const name = input.name.trim();
  if (!name) return { ok: false, message: "Enter a name" };
  const { error } = input.id
    ? await sb().from("expense_categories").update({ name }).eq("id", input.id)
    : await sb().from("expense_categories").insert({ name, parent_id: input.parent_id ?? null, sort: 99 });
  mutate("expense-categories");
  return error ? { ok: false, message: friendly(error.message, "") } : { ok: true };
}

export async function deleteCategory(id: string): Promise<Result> {
  const { error } = await sb().from("expense_categories").delete().eq("id", id);
  mutate("expense-categories");
  return error ? { ok: false, message: friendly(error.message, "it has sub-categories or expenses recorded against it") } : { ok: true };
}

export async function saveVendor(input: {
  id?: string;
  name: string;
  phone?: string;
  notes?: string;
  vendor_type?: string;
  default_category_id?: string | null;
}): Promise<Result & { id?: string }> {
  const fields = {
    name: input.name.trim(),
    phone: (input.phone ?? "").trim(),
    notes: (input.notes ?? "").trim(),
    vendor_type: (input.vendor_type ?? "").trim(),
    default_category_id: input.default_category_id || null,
  };
  if (!fields.name) return { ok: false, message: "Enter the vendor's name" };
  const { data, error } = input.id
    ? await sb().from("vendors").update(fields).eq("id", input.id).select("id").single()
    : await sb().from("vendors").insert(fields).select("id").single();
  await mutate("vendors");
  return error ? { ok: false, message: friendly(error.message, "") } : { ok: true, id: data?.id };
}

export async function deleteVendor(id: string): Promise<Result> {
  const { error } = await sb().from("vendors").delete().eq("id", id);
  mutate("vendors");
  return error ? { ok: false, message: friendly(error.message, "expenses are recorded against this vendor") } : { ok: true };
}

export async function addExpense(
  me: Profile,
  cats: ExpenseCategory[],
  vendors: Vendor[],
  input: { amount: string; category_id: string; vendor: string; vendor_id?: string; spent_on: string; note: string; bill?: { blob: Blob; name: string } | null },
): Promise<Result> {
  const amount = Number(input.amount.replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Enter an amount" };
  if (!input.category_id) return { ok: false, message: "Choose a category" };

  // Vendor lookup: pick an existing one by name, or add a new vendor to the master on the fly.
  const picked = input.vendor_id ? vendors.find((v) => v.id === input.vendor_id) : undefined;
  const vendorName = picked?.name ?? input.vendor.trim();
  let vendorId: string | null = picked?.id ?? null;
  let added = "";
  if (!picked && vendorName) {
    const hit = vendors.find((v) => v.name.toLowerCase() === vendorName.toLowerCase());
    if (hit) vendorId = hit.id;
    else {
      const { data, error } = await sb().from("vendors").insert({ name: vendorName }).select("id").single();
      if (error) return { ok: false, message: friendly(error.message, "") };
      vendorId = data.id;
      added = ` · “${vendorName}” added to vendors`;
      mutate("vendors");
    }
  }

  // Keep the bill itself, if one was attached.
  let bill_path: string | null = null;
  if (input.bill) {
    const ext = (input.bill.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    bill_path = `${(input.spent_on || new Date().toISOString()).slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    const up = await sb().storage.from("bills").upload(bill_path, input.bill.blob, { contentType: input.bill.blob.type || undefined });
    if (up.error) return { ok: false, message: `The bill couldn't be saved: ${up.error.message}` };
  }

  const { error } = await sb().from("expenses").insert({
    bill_path,
    bill_name: input.bill?.name ?? null,
    amount,
    category_id: input.category_id,
    vendor_id: vendorId,
    // plain-text copies keep older screens and exports readable
    category: categoryLabel(cats, input.category_id, "Other"),
    paid_to: vendorName,
    spent_on: input.spent_on || undefined,
    note: input.note,
    created_by: me.id,
  });
  if (error) return { ok: false, message: error.message };
  mutate("expenses");
  return { ok: true, message: `Expense added${added}` };
}

export function downloadExpensesCsv(rows: Expense[], cats: ExpenseCategory[] | undefined, vendors: Vendor[] | undefined, label: string) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const vname = (e: Expense) => (vendors ?? []).find((v) => v.id === e.vendor_id)?.name ?? e.paid_to;
  const lines = ["Date,Category,Vendor,Amount,Note"];
  for (const e of rows) lines.push([e.spent_on, categoryLabel(cats, e.category_id, e.category), vname(e), e.amount, e.note].map(esc).join(","));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  a.download = `rifahs-expenses-${label}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Open the bill kept with an expense (a link that works for one minute). */
export async function openBill(path: string) {
  const { data, error } = await sb().storage.from("bills").createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return alert(`Couldn't open the bill: ${error?.message ?? "not found"}`);
  window.open(data.signedUrl, "_blank", "noopener");
}
