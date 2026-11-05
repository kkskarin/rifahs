import Link from "next/link";

export default function NotFound() {
  return (
    <main className="login">
      <div className="box">
        <h1>
          Not <em>here.</em>
        </h1>
        <p>That page or order doesn&apos;t exist.</p>
        <Link className="btn" href="/orders">
          Back to orders
        </Link>
      </div>
    </main>
  );
}
