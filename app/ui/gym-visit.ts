/**
 * When this phone last opened the workout card.
 *
 * Deliberately not in the health record. It is a fact about a device, not about
 * a body, and putting it in the record would cost real things: every tap would
 * bump the sync revision, burn one of the thirty recovery snapshots, discard an
 * unsaved edit in Goals, and re-run the whole training computation on the one
 * interaction whose job is to get out of the way. It would also survive "erase
 * every record", which a UI timestamp has no business doing.
 *
 * So: localStorage, alongside the workout draft, with the same demo guard —
 * a demo must never write to the real device's keys.
 */

const KEY = "baseline-gym-opened";

export function readGymOpened(demo: boolean): string | null {
  if (demo || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw && /^\d{4}-\d{2}-\d{2}T/.test(raw) ? raw : null;
  } catch {
    // Private browsing, or storage turned off. The loop strip simply shows the
    // un-struck steps, which is the honest reading of "we don't know".
    return null;
  }
}

export function writeGymOpened(demo: boolean, at: string): void {
  if (demo || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, at);
  } catch {
    /* nothing to do — the strip falls back to the un-struck steps */
  }
}
