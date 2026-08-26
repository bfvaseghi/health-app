"use client";

import { useEffect } from "react";

/**
 * Registers the offline shell.
 *
 * Only in a real browser over a secure origin — a service worker is refused on
 * plain http, and a refusal here would be an unhandled rejection on every load
 * during local development.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    // After load, so registering never competes with the first paint.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
