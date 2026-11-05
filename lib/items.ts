import type { OrderItem } from "./types";

/** "Ziya Plum Set (M) x2" lines or "A · B" → item list. Used for manual entries. */
export function cleanItemsInput(raw: string, size: string | null): OrderItem[] {
  return raw
    .split(/\n|·|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*?)\s*[x×]\s*(\d+)$/i);
      const base = m ? m[1] : s;
      const sizeMatch = base.match(/^(.*?)\s*\(([^)]+)\)$/);
      return {
        title: (sizeMatch ? sizeMatch[1] : base).trim(),
        size: sizeMatch ? sizeMatch[2] : size,
        quantity: m ? Number(m[2]) : 1,
      };
    });
}
