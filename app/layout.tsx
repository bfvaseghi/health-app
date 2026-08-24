import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bardia-health.bardia-faghihvaseghi.chatgpt.site"),
  title: "Bardia Health",
  description: "A private dashboard for sleep, mental health, and the commitments that matter.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Bardia Health",
    description: "Sleep, goals, and the signals that matter.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Bardia Health" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bardia Health",
    description: "Sleep, goals, and the signals that matter.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
