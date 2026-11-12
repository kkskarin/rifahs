import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { PREFS_BOOT } from "@/lib/prefs";

const fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-fraunces", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Kaleidoscope · Core", template: "%s · Kaleidoscope · Core" },
  description: "Orders, inventory and money for Kaleidoscope by Rifah — for Rifah's team.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Core", statusBarStyle: "default" },
  // Stop phones turning emails and numbers in the app into underlined links.
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#F4EAC4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
