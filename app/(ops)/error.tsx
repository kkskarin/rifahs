"use client";

import { useEffect } from "react";

// Safety net: if anything on a page fails, show this instead of a blank "Application error".
export default function OpsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  const stale = /Server Action|ChunkLoad|Loading chunk|failed to fetch dynamically/i.test(error.message);
  return (
    <div className="panel" style={{ marginTop: 24 }}>
      <h2>Something went wrong.</h2>
      <p className="hint">
        {stale
          ? "The app was just updated while this page was open. Reloading will fix it."
          : "Nothing was lost — try again, or reload the page."}
      </p>
      <div className="form-actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn primary" onClick={() => (stale ? window.location.reload() : reset())}>
          {stale ? "Reload" : "Try again"}
        </button>
        <button className="btn ghost" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
      {error.digest && <p className="hint">Error ref: {error.digest}</p>}
    </div>
  );
}
