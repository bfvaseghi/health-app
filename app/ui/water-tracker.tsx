"use client";

import { useState } from "react";
import type { DailyEntry } from "../health-model";
import { Icon } from "./icons";
import { Meter } from "./spark";

/**
 * Water, against a target.
 *
 * It was a number with nothing to be — "1.5 L today" and no idea whether that
 * was good — so it did not read as a tracker at all. The target turns the
 * number into a position, and the bar shows the position without being read.
 */
export function WaterTracker({ date, value, target, updateDaily }: {
  date: string;
  value: number | null;
  target: number | null;
  updateDaily: (date: string, update: (current: DailyEntry) => DailyEntry) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [lastAdded, setLastAdded] = useState<{ amount: number; before: number | null; after: number } | null>(null);
  const add = (amount: number) => {
    let change: typeof lastAdded = null;
    updateDaily(date, current => {
      const before = current.waterMl;
      const after = Math.min(20_000, (before ?? 0) + amount);
      change = { amount: after - (before ?? 0), before, after };
      return { ...current, waterMl: after };
    });
    setLastAdded(change);
  };
  return <div className="water-tracker">
    <div className="tl-row">
      <span className="tl-well"><Icon name="water" /></span>
      <span className="tl-row-copy">
        <b>Water</b>
        <small role="status">{value == null ? "Not logged" : `${litres(value)}${target ? ` of ${litres(target)}` : ""} today`}</small>
        {target ? <Meter value={value ?? 0} target={target} label={`Water ${litres(value ?? 0)} of ${litres(target)}`} /> : null}
      </span>
      <button type="button" className="chip" onClick={() => add(250)} disabled={(value ?? 0) >= 20_000}>+250 mL</button>
      <button type="button" className="icon-button" aria-label="Edit water" aria-expanded={editing} onClick={() => setEditing(current => !current)}><Icon name="pencil" /></button>
    </div>
    {editing ? <form className="water-edit" onSubmit={event => {
      event.preventDefault();
      const raw = String(new FormData(event.currentTarget).get("water") ?? "").trim();
      const amount = Number(raw);
      if (raw && Number.isFinite(amount) && amount >= 0 && amount <= 20_000) {
        updateDaily(date, current => ({ ...current, waterMl: Math.round(amount) }));
        setEditing(false);
        setLastAdded(null);
      }
    }}>
      <div className="tl-actions"><button type="button" className="chip" onClick={() => add(500)}>+500 mL bottle</button></div>
      <label>Total today (mL)<input key={value} type="number" name="water" min="0" max="20000" step="1" required defaultValue={value ?? ""} inputMode="numeric" autoFocus /></label>
      <div className="tl-actions"><button type="submit" className="button primary small">Save total</button><button type="button" className="text-button" onClick={() => setEditing(false)}>Cancel</button>{value != null ? <button type="button" className="text-button" onClick={() => { updateDaily(date, current => ({ ...current, waterMl: null })); setEditing(false); setLastAdded(null); }}>Clear</button> : null}</div>
    </form> : lastAdded ? <div className="water-undo"><span>Added {lastAdded.amount} mL</span><button type="button" className="text-button" onClick={() => { updateDaily(date, current => ({ ...current, waterMl: current.waterMl === null ? null : current.waterMl === lastAdded.after ? lastAdded.before : Math.max(0, (current.waterMl ?? 0) - lastAdded.amount) })); setLastAdded(null); }}>Undo</button></div> : null}
  </div>;
}

function litres(ml: number): string {
  return ml >= 1000 ? `${Number((ml / 1000).toFixed(2))} L` : `${ml} mL`;
}
