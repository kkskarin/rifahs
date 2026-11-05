import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "no-access": "Your account isn't active on the team. Ask an admin to add you.",
  link: "That sign-in link has expired. Request a new code below.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="login">
      <div className="box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/logo.png" alt="Kaleidoscope by Rifah" />
        <h1>
          The <em>order book</em>
        </h1>
        <p>For the Rifah&apos;s team. Sign in with your email.</p>
        <LoginForm next={sp.next ?? "/orders"} error={sp.error ? ERRORS[sp.error] : undefined} />
      </div>
    </main>
  );
}
