import type { Metadata } from "next";
import { Suspense } from "react";
import JoinForm from "./JoinForm";

export const metadata: Metadata = { title: "Set up your account" };

export default function JoinPage() {
  return (
    <main className="login">
      <div className="box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/logo.png" alt="Kaleidoscope by Rifah" />
        <Suspense>
          <JoinForm />
        </Suspense>
      </div>
    </main>
  );
}
