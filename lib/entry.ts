// Order-entry maths, shared by the form (live totals) and the save (stored totals).
import type { OrderItem, TaxMode, TaxType } from "./types";

export type EntryLine = { title: string; size: string; quantity: number; price: number; tax_rate: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** One line's GST breakup. Inclusive: price already contains GST. Exclusive: GST is added on top. */
export function lineTotals(l: EntryLine, mode: TaxMode) {
  const gross = r2((l.quantity || 0) * (l.price || 0));
  const rate = mode === "none" ? 0 : (l.tax_rate || 0) / 100;
  const taxable = mode === "inclusive" ? r2(gross / (1 + rate)) : gross;
  const tax = mode === "inclusive" ? r2(gross - taxable) : r2(gross * rate);
  return { taxable, tax, amount: r2(taxable + tax) };
}

export function entryTotals(lines: EntryLine[], mode: TaxMode, shipping: number) {
  const rows = lines.map((l) => lineTotals(l, mode));
  const taxable = r2(rows.reduce((a, r) => a + r.taxable, 0));
  const tax = r2(rows.reduce((a, r) => a + r.tax, 0));
  return { rows, taxable, tax, shipping: r2(shipping || 0), total: r2(taxable + tax + (shipping || 0)) };
}

/** Within Tamil Nadu → CGST + SGST; any other state → IGST. */
export function taxTypeFor(state: string | null | undefined, country: string | null | undefined): TaxType {
  if (country && !/^(india|in)$/i.test(country.trim())) return "";
  return /^(tamil ?nadu|tn)$/i.test((state ?? "").trim()) ? "cgst_sgst" : "igst";
}

export const toItems = (lines: EntryLine[]): OrderItem[] =>
  lines
    .filter((l) => l.title.trim())
    .map((l) => ({ title: l.title.trim(), size: l.size || null, quantity: l.quantity || 1, price: l.price || 0, tax_rate: l.tax_rate || 0 }));
