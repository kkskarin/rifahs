"use client";

import { useEffect, useState } from "react";

const MINE = process.env.NEXT_PUBLIC_BUILD ?? "";
const reload = () => window.location.reload();

/** Menu button: load the newest version of the app (a home-screen app has no browser reload button). */
export function ReloadButton() {
  return (
    <button role="menuitem" onClick={reload}>
      Reload app
    </button>
  );
}

/** A bar at the bottom of the screen when a newer version has been published. */
export function UpdateBar() {
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { build } = (await r.json()) as { build?: string };
        if (!stop && build && MINE && build !== MINE) setNewer(true);
      } catch {}
    };
    check();
    const t = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  if (!newer) return null;
  return (
    <div className="update-bar" role="status">
      <span>A new version is ready.</span>
      <button className="btn small primary" onClick={reload}>
        Reload
      </button>
    </div>
  );
}
