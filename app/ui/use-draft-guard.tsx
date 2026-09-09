"use client";

import { useRef, useState } from "react";

/** Keep a date change or dismissal from silently throwing away a form edit. */
export function useDraftGuard() {
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const request = (action: () => void) => {
    if (!dirty) { action(); return; }
    opener.current = document.activeElement as HTMLElement | null;
    setPending(() => action);
  };
  const notice = pending ? (
    <div className="draft-notice" role="alert">
      <b>You have unsaved changes.</b>
      <p>Keep editing, or discard them to continue.</p>
      <div className="tl-actions">
        <button autoFocus type="button" className="button primary" onClick={() => { setPending(null); opener.current?.focus(); }}>Keep editing</button>
        <button type="button" className="button secondary" onClick={() => { setDirty(false); setPending(null); pending(); }}>Discard changes</button>
      </div>
    </div>
  ) : null;
  return { request, notice, markDirty: () => setDirty(true) };
}
