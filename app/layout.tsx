import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./field-record.css";
import "./baseline.css";
import { ServiceWorker } from "./ui/service-worker";

// Applies a saved theme before first paint so an explicit dark choice never
// flashes light. System theme needs no script: the stylesheet handles it.
const themeBootstrap = `try{var d=new URLSearchParams(location.search).get("demo")==="1";if(!d){var t=localStorage.getItem("bardia-health-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}}catch(e){}`;

export const metadata: Metadata = {
  metadataBase: new URL("https://baseline.bardia-faghihvaseghi.chatgpt.site"),
  title: "Baseline",
  description: "Personal health record.",
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
    description: "Personal health record.",
    type: "website",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Baseline" }],
  },
  twitter: {
    card: "summary",
    title: "Baseline",
    description: "Personal health record.",
    images: ["/icon-512.png"],
  },
};

export const viewport: Viewport = {
  // Vinext 0.0.50 does not yet render Viewport.viewportFit. Supplying the
  // complete directive through width keeps one valid viewport tag instead of
  // adding a second, conflicting tag by hand.
  width: "device-width, initial-scale=1, viewport-fit=cover",
  initialScale: undefined,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eff3f5" },
    { media: "(prefers-color-scheme: dark)", color: "#102330" },
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
