"use client";

/**
 * The small pictures that go next to a number.
 *
 * "29 out of 30 days" and "5 of the last 7 days" were the shape of every
 * statistic in this app: a number, a preposition, and nothing to look at. A
 * count cannot show you a streak, where the gap was, or whether last week was
 * better than this one — and those are the only reasons to look at it. So every
 * count now carries the days it was counted from.
 *
 * Three shapes, used everywhere, so a filled cell means the same thing on Meds
 * as it does on Mind:
 *
 *   DayStrip  one cell a day — did it happen, was it missed, was it even due
 *   Meter     one value against a target, with the target marked
 *   MiniBars  a small amount per day, where the size matters
 */

export type CellState =
  /** It happened. */
  | "on"
  /** Partly: some of the target, or a lighter version of the thing. */
  | "half"
  /** It was due and it did not happen. */
  | "miss"
  /** Nothing recorded, but there could have been. */
  | "open"
  /** Not due, not applicable — drawn faintly so it cannot read as a miss. */
  | "none";

export type DayCell = { date: string; state: CellState; label: string };

/**
 * One cell a day, oldest on the left.
 *
 * The cells stretch to fill whatever width they are given, so the same
 * component draws 7 days or 30 without a size prop.
 */
export function DayStrip({ cells, label, size = "regular" }: {
  cells: DayCell[];
  label: string;
  size?: "regular" | "small";
}) {
  return (
    <div className={`day-strip is-${size}`} role="img" aria-label={label}>
      {cells.map(cell => <i key={cell.date} className={`is-${cell.state}`} title={cell.label} />)}
    </div>
  );
}

/**
 * A value against a target.
 *
 * The target is a notch drawn on top of the fill rather than a band behind it,
 * so it stays visible once it has been passed — the same rule the muscle chart
 * uses, so the two read the same way.
 */
export function Meter({ value, target, max, label, tone = "accent" }: {
  value: number;
  target?: number | null;
  /** The end of the scale. Defaults to the target, or the value if it is over. */
  max?: number;
  label: string;
  tone?: "accent" | "warn" | "quiet";
}) {
  const ceiling = Math.max(max ?? 0, target ?? 0, value, 1);
  const pct = (amount: number) => `${Math.min(100, Math.max(0, (amount / ceiling) * 100))}%`;
  return (
    <div className={`meter is-${tone}`} role="img" aria-label={label}>
      <span className="meter-fill" style={{ width: pct(value) }} />
      {target ? <span className="meter-notch" style={{ left: pct(target) }} /> : null}
    </div>
  );
}

/**
 * A small amount per day, where how much matters and not just whether.
 *
 * Drawn against the largest day in the window, so the shape of the week is the
 * point; the number beside it carries the size.
 */
export function MiniBars({ values, label, target }: {
  values: Array<{ date: string; value: number | null }>;
  label: string;
  target?: number | null;
}) {
  const numbers = values.map(entry => entry.value ?? 0);
  const ceiling = Math.max(target ?? 0, ...numbers, 1);
  return (
    <div className="mini-bars" role="img" aria-label={label}>
      {values.map(entry => (
        <i key={entry.date} className={entry.value === null ? "is-empty" : ""}>
          <span style={{ height: `${((entry.value ?? 0) / ceiling) * 100}%` }} />
        </i>
      ))}
      {target ? <span className="mini-bars-target" style={{ bottom: `${(target / ceiling) * 100}%` }} /> : null}
    </div>
  );
}
