import type { Metadata } from "next";
import { Sora, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";

// Sora carries the interface and the numerals — geometric, tabular, a little
// technical. Zen Kaku Gothic New carries the Japanese, which is the actual
// content and deserves a face chosen for it rather than a system fallback.
const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sora",
  display: "swap",
});

const zen = Zen_Kaku_Gothic_New({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-zen",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Anki Crew",
  description: "Three friends, one scoreboard, and whatever they studied today.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${zen.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
