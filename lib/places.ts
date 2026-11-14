// Pick-lists for addresses, so nothing that can be chosen has to be typed.
export const IN_STATE_NAMES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

export const COUNTRIES = [
  "India", "United Arab Emirates", "United States", "United Kingdom", "Singapore", "Malaysia", "Australia", "Canada", "Saudi Arabia", "Qatar",
  "Kuwait", "Oman", "Bahrain", "Sri Lanka", "Germany", "France", "Netherlands", "Ireland", "New Zealand", "Switzerland", "Sweden", "Italy",
  "Spain", "Japan", "Hong Kong", "South Africa", "Mauritius", "Maldives", "Bangladesh", "Nepal",
];

/** Match whatever spelling a lookup returns ("Tamilnadu", "Pondicherry") to the name in the list. */
export function matchState(raw: string): string {
  const k = raw.toLowerCase().replace(/[^a-z]/g, "");
  const alias: Record<string, string> = { pondicherry: "Puducherry", orissa: "Odisha", newdelhi: "Delhi", uttaranchal: "Uttarakhand", jammukashmir: "Jammu and Kashmir" };
  if (alias[k]) return alias[k];
  return IN_STATE_NAMES.find((s) => s.toLowerCase().replace(/[^a-z]/g, "") === k.replace(/&/g, "and")) ?? IN_STATE_NAMES.find((s) => s.toLowerCase().replace(/[^a-z]/g, "").replace(/and/g, "") === k.replace(/and/g, "")) ?? raw;
}

/** Phone country codes, India first. Same countries as the address list. */
export const DIAL_CODES: { code: string; country: string }[] = [
  { code: "+91", country: "India" }, { code: "+971", country: "United Arab Emirates" }, { code: "+1", country: "United States / Canada" },
  { code: "+44", country: "United Kingdom" }, { code: "+65", country: "Singapore" }, { code: "+60", country: "Malaysia" }, { code: "+61", country: "Australia" },
  { code: "+966", country: "Saudi Arabia" }, { code: "+974", country: "Qatar" }, { code: "+965", country: "Kuwait" }, { code: "+968", country: "Oman" },
  { code: "+973", country: "Bahrain" }, { code: "+94", country: "Sri Lanka" }, { code: "+49", country: "Germany" }, { code: "+33", country: "France" },
  { code: "+31", country: "Netherlands" }, { code: "+353", country: "Ireland" }, { code: "+64", country: "New Zealand" }, { code: "+41", country: "Switzerland" },
  { code: "+46", country: "Sweden" }, { code: "+39", country: "Italy" }, { code: "+34", country: "Spain" }, { code: "+81", country: "Japan" },
  { code: "+852", country: "Hong Kong" }, { code: "+27", country: "South Africa" }, { code: "+230", country: "Mauritius" }, { code: "+960", country: "Maldives" },
  { code: "+880", country: "Bangladesh" }, { code: "+977", country: "Nepal" },
];

/** Split any way a number was written into its country code and the rest ("09876543210" → +91, 9876543210). */
export function splitPhone(raw: string | null | undefined): { code: string; national: string } {
  const t = (raw ?? "").trim();
  const digits = t.replace(/\D/g, "");
  if (!digits) return { code: "+91", national: "" };
  if (t.startsWith("+") || t.startsWith("00")) {
    const d = t.startsWith("00") ? digits.slice(2) : digits;
    // Longest matching code wins (+971 before +97…, +1 last).
    const hit = [...DIAL_CODES].sort((a, b) => b.code.length - a.code.length).find((c) => d.startsWith(c.code.slice(1)));
    if (hit) return { code: hit.code, national: d.slice(hit.code.length - 1) };
    return { code: "+" + d.slice(0, Math.max(d.length - 10, 1)), national: d.slice(Math.max(d.length - 10, 1)) };
  }
  if (digits.length === 12 && digits.startsWith("91")) return { code: "+91", national: digits.slice(2) };
  if (digits.length === 11 && digits.startsWith("0")) return { code: "+91", national: digits.slice(1) };
  return { code: "+91", national: digits };
}
/** "+91 98765 43210" for reading; pass compact for "+919876543210" (what Shopify stores). */
export function joinPhone(code: string, national: string, compact = false): string {
  const n = national.replace(/\D/g, "");
  if (!n) return "";
  if (compact) return code + n;
  return `${code} ${code === "+91" && n.length === 10 ? `${n.slice(0, 5)} ${n.slice(5)}` : n}`;
}
