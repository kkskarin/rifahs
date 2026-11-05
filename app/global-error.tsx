"use client";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F4EAC4", color: "#2A1416", padding: 32 }}>
        <h2>Something went wrong.</h2>
        <p>Please reload the page. If it keeps happening, send a screenshot of this message.</p>
        <button onClick={() => window.location.reload()} style={{ padding: "10px 18px", background: "#822537", color: "#F4EAC4", border: 0 }}>
          Reload
        </button>
        {error.digest && <p style={{ opacity: 0.6 }}>Error ref: {error.digest}</p>}
      </body>
    </html>
  );
}
