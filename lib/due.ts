"use client";

import useSWR, { mutate } from "swr";
import { daysUntil, shortDate } from "./format";
import { sb } from "./supabase-browser";
import type { Order } from "./types";

export type DueRules = { standard_days: number; express_days: number; unstitched_days: number };
export const DEFAULT_RULES: DueRules = { standard_days: 21, express_days: 7, unstitched_days: 5 };

export function useDueRules() {
  const { data } = useSWR<DueRules>("due-rules", async () => {
    const { data } = await sb().from("app_settings").select("value").eq("key", "due_rules").maybeSingle();
    return { ...DEFAULT_RULES, ...((data?.value as Partial<DueRules>) ?? {}) };
  });
  return data ?? DEFAULT_RULES;
}

export async function saveDueRules(rules: DueRules, userId: string) {
  const { error } = await sb().from("app_settings").upsert({ key: "due_rules", value: rules, updated_by: userId, updated_at: new Date().toISOString() });
  mutate("due-rules");
  return error ? { ok: false, message: error.message } : { ok: true };
}

const addDays = (isoDate: string, n: number) => {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The date an order should be dispatched by: the promised date if set, else order date + the standard time. */
export function dueDate(o: Order, rules: DueRules): string {
  if (o.promise_date) return o.promise_date;
  const placed = new Date(o.placed_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const allUnstitched = o.items.length > 0 && o.items.every((i) => /unstitched/i.test(`${i.size ?? ""} ${i.title}`));
  return addDays(placed, o.is_express ? rules.express_days : allUnstitched ? rules.unstitched_days : rules.standard_days);
}

export type DueLevel = "overdue" | "red" | "yellow" | "green";
export const DUE_LEVELS: { key: DueLevel; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "red", label: "Due in 0–5 days" },
  { key: "yellow", label: "Due in 6–10 days" },
  { key: "green", label: "More than 10 days" },
];

export function dueInfo(o: Order, rules: DueRules) {
  const date = dueDate(o, rules);
  const days = daysUntil(date) ?? 0;
  const level: DueLevel = days < 0 ? "overdue" : days <= 5 ? "red" : days <= 10 ? "yellow" : "green";
  const when =
    days < 0 ? `Overdue by ${-days} day${days === -1 ? "" : "s"}` : days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`;
  return { date, days, level, label: `${when} · ${shortDate(date)}`, promised: Boolean(o.promise_date) };
}
