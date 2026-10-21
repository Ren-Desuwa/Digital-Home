import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digital Home · A little teamwork",
  description: "A calmer home, together. Your family's chores, meals and everyday plans in one place.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
