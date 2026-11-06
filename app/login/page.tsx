import type { Metadata } from "next";
import PasswordLogin from "./PasswordLogin";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "no-access": "Your account isn't active on the team. Ask an owner to add you.",
  link: "That sign-in link has expired. Sign in below or ask for a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="login">
      <div className="box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/logo.png" alt="Kaleidoscope by Rifah" />
        <h1>
          Kaleidoscope <em>Core</em>
        </h1>
        <p>For Rifah&apos;s team. Sign in to continue.</p>
        <PasswordLogin next={sp.next ?? "/"} error={sp.error ? ERRORS[sp.error] : undefined} />
      </div>
    </main>
  );
}
