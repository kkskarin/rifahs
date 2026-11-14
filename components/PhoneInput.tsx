"use client";

import { DIAL_CODES, joinPhone, splitPhone } from "@/lib/places";

/** A phone number as a country code you pick plus the number you type. */
export default function PhoneInput({ value, onChange, compact, disabled, name }: { value: string; onChange: (v: string) => void; compact?: boolean; disabled?: boolean; name?: string }) {
  const { code, national } = splitPhone(value);
  const known = DIAL_CODES.some((c) => c.code === code);
  // Keep the code while the number is still empty, so choosing a code first isn't lost.
  const emit = (c: string, n: string) => onChange(n.replace(/\D/g, "") ? joinPhone(c, n, compact) : c === "+91" ? "" : c);
  return (
    <span className="phone-input">
      <select aria-label="Country code" value={code} disabled={disabled} onChange={(e) => emit(e.target.value, national)}>
        {!known && <option value={code}>{code}</option>}
        {DIAL_CODES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} {c.country}
          </option>
        ))}
      </select>
      <input type="tel" inputMode="tel" aria-label="Phone number" value={national} disabled={disabled} onChange={(e) => emit(code, e.target.value)} placeholder={code === "+91" ? "98765 43210" : "Number"} />
      {name && <input type="hidden" name={name} value={national ? joinPhone(code, national, compact) : ""} />}
    </span>
  );
}
