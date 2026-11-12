import type { Prefs } from "./types";

const KEY = "core-prefs";

/** Apply theme + text size to the page, and remember them on this device so they load instantly next time. */
export function applyPrefs(p: Prefs | undefined | null) {
  if (typeof document === "undefined") return;
  const theme = p?.theme || "cream";
  const font = p?.font || "normal";
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.font = font;
  try {
    localStorage.setItem(KEY, JSON.stringify({ theme, font }));
  } catch {}
}

/** Runs before the page paints (inline in <head>) so there is no flash of the wrong theme. */
export const PREFS_BOOT = `try{var p=JSON.parse(localStorage.getItem("${KEY}")||"{}");var d=document.documentElement;d.dataset.theme=p.theme||"cream";d.dataset.font=p.font||"normal"}catch(e){}`;
