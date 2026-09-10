"use client";

import type { HealthState } from "../health-model";
import { dateLabel, daysBetween, phaseProgress } from "../health-model";
import { buildProgress } from "../training/progress";

/**
 * Whether the cut or the bulk is working.
 *
 * A cut is not "did the number go down" and a bulk is not "did it go up" —
 * either is trivially achievable and neither is the point. The question in a
 * cut is whether the weight came off while the lifts held, and in a bulk
 * whether the lifts went up for the weight you put on. Two numbers, side by
 * side, over the same weeks. Until now the app knew both and printed only the
 * first, so choosing "cut" in Goals changed a label and nothing else.
 */

export type PhaseScore = {
  phase: "cut" | "bulk";
  start: string;
  weeks: number;
  /** Pounds since the phase began; negative is downward. */
  changeLb: number | null;
  ratePerWeek: number | null;
  targetRateLb: number | null;
  pace: "on pace" | "slow" | "fast" | null;
  /** Median percent across the measured lifts over the same span. */
  strengthPercent: number | null;
  /** How that reads for this phase. */
  strengthVerdict: "gaining" | "holding" | "losing" | null;
  /** One line: is it working? */
  verdict: string;
  tone: "neutral" | "warn";
};

/** Below this a cut is holding rather than losing strength: it is noise. */
const HOLD_BAND = 1.5;

export function phaseScore(state: HealthState, today: string): PhaseScore | null {
  const phase = phaseProgress(state, today);
  if (!phase) return null;

  // The lifting window is the phase itself, so both numbers describe the same
  // weeks. buildProgress floors at four; a fortnight-old cut has no strength
  // answer yet and says so rather than borrowing one from before it started.
  const days = daysBetween(phase.start, today) + 1;
  const weeks = Math.max(1, Math.round(days / 7));
  const progress = weeks >= 4 ? buildProgress(state, today, weeks) : null;
  const strengthPercent = progress && progress.lifts.length ? progress.trendPercent : null;

  const strengthVerdict = strengthPercent === null
    ? null
    : strengthPercent > HOLD_BAND ? "gaining" as const
    : strengthPercent < -HOLD_BAND ? "losing" as const
    : "holding" as const;

  const round1 = (value: number) => Math.round(Math.abs(value) * 10) / 10;
  const moved = phase.changeLb === null
    ? null
    : `${phase.changeLb < 0 ? "Down" : "Up"} ${round1(phase.changeLb)} lb`;

  // A cut wants the weight down and the lifts held; a bulk wants the weight up
  // and the lifts rising. Anything else is worth naming rather than smoothing.
  const wrongWay = phase.changeLb !== null
    && (phase.phase === "cut" ? phase.changeLb > 0 : phase.changeLb < 0);
  const strengthBad = phase.phase === "cut"
    ? strengthVerdict === "losing"
    : strengthVerdict === "losing" || strengthVerdict === "holding";

  const verdict = moved === null
    ? "Too early to say"
    : strengthVerdict === null
    ? `${moved} · strength needs 4 weeks`
    : `${moved} · strength ${strengthVerdict}`;

  return {
    phase: phase.phase,
    start: phase.start,
    weeks: phase.weeks,
    changeLb: phase.changeLb,
    ratePerWeek: phase.ratePerWeek,
    targetRateLb: phase.targetRateLb,
    pace: phase.pace,
    strengthPercent,
    strengthVerdict,
    verdict,
    tone: wrongWay || strengthBad ? "warn" : "neutral",
  };
}

/**
 * The two numbers, in a row each, with the target beside the one that has one.
 *
 * Deliberately not a chart. There are two figures and they are both already
 * numbers; a picture of two numbers is decoration.
 */
export function PhaseScore({ score }: { score: PhaseScore }) {
  const round1 = (value: number) => Math.round(Math.abs(value) * 10) / 10;
  const since = dateLabel(score.start, { month: "short", day: "numeric" });
  return (
    <dl className="phase-score" aria-label={`${score.phase === "cut" ? "Cut" : "Bulk"} progress since ${since}`}>
      <div>
        <dt>Body weight</dt>
        <dd className={`phase-figure is-${score.changeLb === null ? "none" : (score.phase === "cut") === (score.changeLb < 0) ? "good" : "off"}`}>
          {score.changeLb === null ? "—" : `${score.changeLb < 0 ? "−" : "+"}${round1(score.changeLb)} lb`}
        </dd>
        <dd className="phase-note">{score.ratePerWeek === null
          ? `since ${since}`
          : `${round1(score.ratePerWeek)} lb/wk${score.targetRateLb !== null ? ` · target ${score.targetRateLb}` : ""}${score.pace ? ` · ${score.pace}` : ""}`}</dd>
      </div>
      <div>
        <dt>Strength</dt>
        <dd className={`phase-figure is-${score.strengthVerdict === "losing" ? "off" : score.strengthVerdict === null ? "none" : "good"}`}>
          {score.strengthPercent === null ? "—" : `${score.strengthPercent > 0 ? "+" : score.strengthPercent < 0 ? "−" : ""}${round1(score.strengthPercent)}%`}
        </dd>
        <dd className="phase-note">{score.strengthVerdict === null
          ? "needs 4 weeks of the phase"
          : `${score.strengthVerdict} · same ${score.weeks} ${score.weeks === 1 ? "week" : "weeks"}`}</dd>
      </div>
    </dl>
  );
}
