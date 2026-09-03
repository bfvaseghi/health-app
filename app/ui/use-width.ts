"use client";

import { RefObject, useEffect, useState } from "react";

/**
 * The rendered width of an element, in CSS pixels, kept current as it resizes.
 * An SVG whose viewBox width equals its rendered width draws its text at true
 * size on every screen instead of scaling it with the picture. The fallback is
 * what the server renders and what the first paint uses.
 */
export function useWidth(ref: RefObject<Element | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
