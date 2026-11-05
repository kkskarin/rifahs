import Link from "next/link";
import { requireMember, isAdmin } from "@/lib/session";
import { getIntlOpenCount, getStatusCounts, getSummary } from "@/lib/data";
import { money } from "@/lib/format";
import { signOut } from "../login/actions";
import Tabs from "@/components/Tabs";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  // One parallel round trip: the profile check and the header numbers together.
  // (Row-level security means the numbers are empty for anyone who isn't a member.)
  const [me, summary, counts, intl] = await Promise.all([
    requireMember(),
    getSummary(),
    getStatusCounts(),
    getIntlOpenCount(),
  ]);
  const admin = isAdmin(me);
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  const tabs = [
    { href: "/orders", label: "Orders", n: total },
    { href: "/express", label: "Express", n: summary.expressDue, hot: summary.expressDue > 0 },
    { href: "/international", label: "International", n: intl },
    { href: "/issues", label: "Issues", n: summary.openIssues, hot: summary.openIssues > 0 },
    ...(admin
      ? [
          { href: "/money", label: "Money" },
          { href: "/team", label: "Team" },
          { href: "/settings", label: "Shopify" },
        ]
      : []),
  ];

  return (
    <div className="wrap">
      <header className="topbar">
        <Link href="/orders" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Kaleidoscope by Rifah" />
          <small>Order book</small>
        </Link>
        <div className="who">
          <span>{me.full_name || me.email}</span>
          <form action={signOut}>
            <button className="link">Sign out</button>
          </form>
        </div>
      </header>

      <section className="hero">
        <h1>
          Every order, <em>one place.</em>
        </h1>
        <p>Orders, express promises, international parcels, courier issues and money — kept for you and Amma.</p>
      </section>

      <section className="stats" aria-label="Summary">
        {admin ? (
          <>
            <div className="stat">
              <div className="label">Sales</div>
              <div className="value">{money(summary.sales)}</div>
            </div>
            <div className="stat">
              <div className="label">Spent</div>
              <div className="value">{money(summary.spent)}</div>
            </div>
            <div className="stat">
              <div className="label">Approx. profit</div>
              <div className="value">{money(summary.sales - summary.spent)}</div>
            </div>
          </>
        ) : (
          <>
            <div className="stat">
              <div className="label">Express due</div>
              <div className="value">{summary.expressDue}</div>
            </div>
            <div className="stat">
              <div className="label">International</div>
              <div className="value">{intl}</div>
            </div>
            <div className="stat">
              <div className="label">Open issues</div>
              <div className="value">{summary.openIssues}</div>
            </div>
          </>
        )}
        <div className="stat">
          <div className="label">Not dispatched</div>
          <div className="value accent">{summary.notDispatched}</div>
        </div>
      </section>

      <Tabs tabs={tabs} />
      {children}

      <Link href="/orders/new" className="btn primary fab">
        + Add entry
      </Link>
    </div>
  );
}
