"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { isAdmin } from "@/lib/roles";
import { signOutEverywhere, useMe } from "@/lib/store";

export const APP_NAME = "Kaleidoscope · Core";

type Header = { label: string; href: string; match: string[]; adminOnly?: boolean };
export const HEADERS: Header[] = [
  { label: "Sales", href: "/orders", match: ["/orders", "/express", "/international", "/issues", "/order"] },
  { label: "Purchase", href: "/purchase", match: ["/purchase"] },
  { label: "Inventory", href: "/inventory", match: ["/inventory"] },
  { label: "Masters", href: "/masters", match: ["/masters"] },
  { label: "Reports", href: "/reports", match: ["/reports"], adminOnly: true },
];

const SETTINGS: { label: string; href: string; adminOnly?: boolean; ownerOnly?: boolean }[] = [
  { label: "Team", href: "/team", adminOnly: true },
  { label: "Email templates", href: "/templates", adminOnly: true },
  { label: "Shopify", href: "/settings", adminOnly: true },
];


export default function OpsShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data: me, isLoading } = useMe();
  const admin = me ? isAdmin(me) : false;
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isLoading && (me === null || (me && !me.active))) window.location.href = "/login?error=no-access";
  }, [me, isLoading]);

  useEffect(() => {
    setMenu(false);
    // keep the active header visible when the header row scrolls sideways
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const isPreview = typeof window !== "undefined" && window.location.hostname.startsWith("preview--");
  const headers = HEADERS.filter((h) => !h.adminOnly || admin);

  return (
    <>
      <header className="appbar">
        {isPreview && <div className="preview-banner">Preview version — not live yet. Orders and stock you change here are real.</div>}
        <div className="appbar-row">
          <Link href="/" className="brand" aria-label={`${APP_NAME} home`}>
            {/* Phones: just the kaleidoscope mark. Tablets and up: the full logo. */}
            <picture>
              <source media="(max-width: 640px)" srcSet="/mark.png" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Kaleidoscope by Rifah" />
            </picture>
          </Link>
          <nav className="headers" ref={navRef} aria-label="Sections">
            {headers.map((h) => (
              <Link key={h.href} href={h.href} className="header-link" aria-current={h.match.some((m) => path === m || path.startsWith(m + "/")) ? "page" : undefined}>
                {h.label}
              </Link>
            ))}
          </nav>
          <div className="settings" ref={menuRef}>
            <button className="settings-btn" aria-label="Settings" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <span />
              <span />
              <span />
            </button>
            {menu && (
              <div className="settings-menu" role="menu">
                <div className="who-block">
                  <b>{me?.full_name || "—"}</b>
                  <span>{me?.email}</span>
                  {me && <small>{me.role[0].toUpperCase() + me.role.slice(1)}</small>}
                </div>
                {SETTINGS.filter((s) => !s.adminOnly || admin).map((s) => (
                  <Link key={s.href} href={s.href} role="menuitem" aria-current={path === s.href ? "page" : undefined}>
                    {s.label}
                  </Link>
                ))}
                <button role="menuitem" onClick={signOutEverywhere}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="page">
        <Suspense fallback={<p className="empty">Loading…</p>}>{me ? children : <p className="empty">Loading…</p>}</Suspense>
      </main>
    </>
  );
}
