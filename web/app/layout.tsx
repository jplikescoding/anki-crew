import "./globals.css";

export const metadata = { title: "Anki Crew", description: "Three friends, one scoreboard" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
