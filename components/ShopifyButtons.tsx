"use client";

import { safe } from "@/lib/safe";
import { useState, useTransition } from "react";
import { syncShopifyNow } from "@/app/(ops)/actions";

export default function ShopifyButtons({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message?: string } | null>(null);
  return (
    <>
      <div className="form-actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn primary" disabled={disabled || pending} onClick={() => start(async () => setMsg((await safe(syncShopifyNow)) as { ok: boolean; message?: string }))}>
          {pending ? "Working…" : "Sync orders now"}
        </button>
      </div>
      {msg && <p className={msg.ok ? "success" : "error"}>{msg.message}</p>}
    </>
  );
}
