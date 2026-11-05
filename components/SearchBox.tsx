"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function SearchBox({ placeholder = "Search name, product, order #" }: { placeholder?: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (q) sp.set("q", q);
      else sp.delete("q");
      if (sp.toString() !== params.toString()) router.replace(`${path}?${sp.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, params, path, router]);

  return (
    <label className="search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span className="sr-only">Search</span>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} type="search" />
    </label>
  );
}
