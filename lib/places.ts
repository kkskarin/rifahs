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
