import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "./ui/service-worker";

// Applies a saved theme before first paint so an explicit dark choice never
// flashes light. System theme needs no script: the stylesheet handles it.
const themeBootstrap = `try{var d=new URLSearchParams(location.search).get("demo")==="1";if(!d){var t=localStorage.getItem("bardia-health-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}}catch(e){}`;

export const metadata: Metadata = {
  metadataBase: new URL("https://baseline.bardia-faghihvaseghi.chatgpt.site"),
  title: "Baseline",
  description: "A private record of sleep, training, and the commitments that matter.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  // Installed on iOS this runs without browser chrome, so it needs to say what
  // it is called on the home screen.
  appleWebApp: {
    capable: true,
    title: "Baseline",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "Baseline",
    description: "Sleep, training, and the signals that matter.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Baseline" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Baseline",
    description: "Sleep, training, and the signals that matter.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  // Vinext 0.0.50 does not yet render Viewport.viewportFit. Supplying the
  // complete directive through width keeps one valid viewport tag instead of
  // adding a second, conflicting tag by hand.
  width: "device-width, initial-scale=1, viewport-fit=cover",
  initialScale: undefined,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1211" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The bootstrap script below stamps data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Rendered here rather than through metadata: Safari still wants the
            apple-prefixed tag to launch a saved app without browser chrome, and
            the framework only emits the standard one. React hoists it. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
