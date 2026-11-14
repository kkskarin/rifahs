import type { Metadata } from "next";

export const metadata: Metadata = { title: "Customers · Sales" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
