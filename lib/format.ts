import type { OrderItem } from "./types";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function money(n: number | null | undefined, currency = "INR") {
  if (n === null || n === undefined) return "—";
  if (currency === "INR") return inr.format(n);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

/** "Monochrome Muse · Ziya Plum Set · M" — matches how the team already writes orders. */
export function itemsLine(items: OrderItem[]) {
  if (!items?.length) return "";
  const sizes = new Set(items.map((i) => i.size).filter(Boolean));
  if (sizes.size <= 1) {
    const names = items.map((i) => (i.quantity > 1 ? `${i.title} ×${i.quantity}` : i.title));
    const size = [...sizes][0];
    return [...names, size].filter(Boolean).join(" · ");
  }
  return items
    .map((i) => `${i.title}${i.size ? ` (${i.size})` : ""}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`)
    .join(" · ");
}

export function shortDate(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export function dateTime(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/** Today's date in India as YYYY-MM-DD. */
export function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function daysUntil(date: string | null) {
  if (!date) return null;
  const a = new Date(todayIST() + "T00:00:00Z").getTime();
  const b = new Date(date + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}
