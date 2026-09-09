"use client";

import type { ReactNode } from "react";
import { Icon } from "./icons";

export type RowTone = "primary" | "neutral" | "warn" | "empty";

/**
 * One row of the Fitness stack: a question already answered.
 *
 * The shut row carries the answer — a headline, the window it was measured
 * over, and where it helps a picture of it. That is the whole idea. A row you
 * have to open to find out what it says is a tab with a chevron, and tabs are
 * what made this section unreadable.
 *
 * A row with nothing in it renders no button and no chevron. An empty row that
 * opens onto an empty screen is a promise the app cannot keep, and the dimmed,
 * inert row says "nothing here yet" without a sentence saying it.
 */
export function AnswerRow({
  id,
  eyebrow,
  window: windowLabel,
  headline,
  subline,
  tone = "neutral",
  graphic,
  aside,
  action,
  open,
  onToggle,
  children,
}: {
  id: string;
  eyebrow: string;
  window?: string;
  headline: string;
  subline?: ReactNode;
  tone?: RowTone;
  /** Drawn under the headline on the shut row: the answer as a picture. */
  graphic?: ReactNode;
  /** Pinned to the right of the headline — a photo, a thumbnail. */
  aside?: ReactNode;
  /** Sits below everything on the shut row, reachable without opening it. */
  action?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const inert = tone === "empty" || !children;
  const head = (
    <>
      <span className="answer-eyebrow">
        <span>{eyebrow}</span>
        {windowLabel ? <span>{windowLabel}</span> : null}
      </span>
      <span className="answer-lines">
        <span className="answer-headline">{headline}</span>
        {subline ? <span className="answer-subline">{subline}</span> : null}
      </span>
      {aside ? <span className="answer-aside">{aside}</span> : null}
      {inert ? null : <Icon name="chevron" className="answer-chevron" />}
    </>
  );

  return (
    <section
      className={`answer-row is-${tone}${open ? " is-open" : ""}`}
      aria-labelledby={`${id}-head`}
    >
      {inert ? (
        <div className="answer-head" id={`${id}-head`}>{head}</div>
      ) : (
        <button
          type="button"
          className="answer-head"
          id={`${id}-head`}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={onToggle}
        >
          {head}
        </button>
      )}
      {graphic ? <div className="answer-graphic">{graphic}</div> : null}
      {action ? <div className="answer-action">{action}</div> : null}
      {inert ? null : (
        <div className="answer-body" id={`${id}-body`} role="region" aria-labelledby={`${id}-head`} hidden={!open}>
          {open ? children : null}
        </div>
      )}
    </section>
  );
}
