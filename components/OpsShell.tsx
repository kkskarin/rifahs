"use client";

import Link from "next/link";
import { ReloadButton, UpdateBar } from "@/components/Reload";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { isAdmin } from "@/lib/roles";
import Avatar from "./Avatar";
import { applyPrefs } from "@/lib/prefs";
import { setViewAs, signOutEverywhere, useMe, useRealMe, useTeam } from "@/lib/store";

export const APP_NAME = "Kaleidoscope · Core";

type Header = { label: string; href: string; match: string[]; adminOnly?: boolean };
export const HEADERS: Header[] = [
  { label: "Sales", href: "/orders", match: ["/orders", "/express", "/international", "/stitching", "/order"] },
  { label: "Order Status", href: "/status", match: ["/status"] },
  { label: "Purchase", href: "/purchase", match: ["/purchase"] },
  { label: "Inventory", href: "/inventory", match: ["/inventory"] },
  { label: "Expenses", href: "/expenses", match: ["/expenses"], adminOnly: true },
  { label: "Disputes", href: "/disputes", match: ["/disputes"] },
  { label: "Masters", href: "/masters", match: ["/masters"] },
  { label: "Reports", href: "/reports", match: ["/reports"], adminOnly: true },
];



const SETTINGS_PATHS = ["/team", "/templates", "/settings", "/personalise"];
const nameFromEmail = (e: string) => {
  const n = e.split("@")[0].split(/[._\-+0-9]/)[0];
  return n ? n[0].toUpperCase() + n.slice(1) : e;
};

export default function OpsShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data: me, isLoading } = useMe();
  const admin = me ? isAdmin(me) : false;
  const { data: real } = useRealMe();
  const { data: team } = useTeam(real?.role === "owner");

  // Each person's own theme and text size, wherever they sign in.
  useEffect(() => {
    if (real) applyPrefs(real.prefs);
  }, [real]);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isLoading && (me === null || (me && !me.active))) window.location.href = "/login?error=no-access";
  }, [me, isLoading]);

  useEffect(() => {
    setMenu(false);
    // keep the active header visible when the header row scrolls sideways
    // Sideways only: centre the active header in its strip without ever moving anything vertically.
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav) {
      nav.scrollTop = 0;
      if (active) nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    }
  }, [path]);

  // Belt and braces for iPhone: if the header strip ever gets nudged vertically, snap it straight back.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const fix = () => {
      if (nav.scrollTop !== 0) nav.scrollTop = 0;
    };
    nav.addEventListener("scroll", fix, { passive: true });
    return () => nav.removeEventListener("scroll", fix);
  }, []);

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
        {me?.viewingAs && (
          <div className="viewas-banner">
            Viewing as <b>{me.full_name || nameFromEmail(me.email)}</b> ({me.role}) — this is what they see.{" "}
            <button onClick={() => setViewAs(null)}>Back to my view</button>
          </div>
        )}
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
            <button className={`settings-btn${me?.viewingAs ? " is-viewing" : ""}`} aria-label="Account and settings" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <span />
              <span />
              <span />
            </button>
            {menu && (
              <div className="settings-menu" role="menu">
                <div className="who-block">
                  <Avatar p={me} size={44} />
                  <div>
                    <b>{me ? me.full_name || nameFromEmail(me.email) : "—"}</b>
                    <span>{me?.email}</span>
                  </div>
                </div>
                {real?.role === "owner" && (
                  <label className="viewas">
                    <span>View as</span>
                    <select
                      value={me?.viewingAs ?? ""}
                      onChange={(e) => {
                        setViewAs((team ?? []).find((p) => p.id === e.target.value) ?? null);
                        setMenu(false);
                      }}
                    >
                      <option value="">Myself ({real.full_name || nameFromEmail(real.email)})</option>
                      {(team ?? [])
                        .filter((p) => p.active && p.id !== real.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name || nameFromEmail(p.email)} — {p.role}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <Link href={admin ? "/team" : "/personalise"} role="menuitem" aria-current={SETTINGS_PATHS.includes(path) ? "page" : undefined}>
                  Settings
                </Link>
                <button role="menuitem" onClick={signOutEverywhere}>
                  Sign out
                </button>
                <ReloadButton />
                <div className="build-tag">Version {process.env.NEXT_PUBLIC_BUILD}</div>
              </div>
            )}
          </div>
        </div>
      </header>

      <UpdateBar />
      <main className="page">
        <Suspense fallback={<p className="empty">Loading…</p>}>{me ? children : <p className="empty">Loading…</p>}</Suspense>
      </main>
    </>
  );
}
