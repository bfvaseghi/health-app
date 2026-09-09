"use client";

import { useMemo, useState } from "react";
import type { AddedSet, GoalSettings, HealthState } from "../health-model";
import type { FixChoice, MuscleDetail, MuscleOutlook, Plan } from "../training/coach";
import {
  fixChoices, minimumDirect, muscleVolume, unclassifiedExercises,
  muscleDetail, weekStart,
} from "../training/coach";
import type { Muscle } from "../training/muscles";
import { MUSCLES, muscleLabels, weeklyTargets } from "../training/muscles";
import { muscleFreshness, sinceLabel, sinceShort } from "../training/recommend";
import { Icon } from "./icons";
import { labelSessions } from "./workout-labels";

/** Two letters a muscle, so eleven bars can be labelled at 393px. */
const SHORT: Record<Muscle, string> = {
  chest: "CH", back: "BA", shoulders: "SH", rearDelts: "RD", biceps: "BI", triceps: "TR",
  quads: "QU", hamstrings: "HA", glutes: "GL", calves: "CA", core: "CO",
};

/** Half-set credits stay visible rather than rounding up. */
export function sets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export type CoverageFacts = {
  headline: string;
  tone: "neutral" | "warn" | "empty";
  subline: string | null;
  short: MuscleOutlook[];
  logged: boolean;
};

/**
 * Where a muscle lands if you do only the work you actually have to do.
 *
 * The chart's total used to include sessions the workout screen calls "only if
 * you want it", so a week could read as covered on every bar and then not be,
 * because he skipped the optional day in good faith. Everything that states a
 * verdict judges on this; the optional contribution is drawn, never counted.
 */
export function requiredValue(row: MuscleOutlook): number {
  return row.done + row.comingRequired;
}

export function isShort(row: MuscleOutlook): boolean {
  return requiredValue(row) < row.target.min;
}

/**
 * The one verdict on coverage, stated once.
 *
 * The section used to answer "am I covered?" three ways on one screen — days
 * since a muscle was touched, sets banked this calendar week, and sets from the
 * first two sessions only — in the same words, so a strip could say "all
 * current" two inches above a panel saying nine of eleven were short. Volume is
 * the answer here and recency is a column inside the chart. Nothing else.
 */
export function coverageFacts(outlook: MuscleOutlook[], state: HealthState, today: string): CoverageFacts {
  if (!state.workoutSets.filter(set => set.date <= today).length) {
    return { headline: "Nothing logged yet", tone: "empty", subline: null, short: [], logged: false };
  }
  const monday = weekStart(today);
  const logged = state.workoutSets.some(set => set.date >= monday && set.date <= today);
  // The verdict is about the week as planned, because the plan is what the app
  // is asking him to do. What the extra sessions carry is said underneath it —
  // the old chart counted them silently, so a bar could read as covered and
  // then not be, and nothing on screen said which bars were exposed.
  const short = outlook.filter(row => row.status === "under");
  const needsExtra = outlook.filter(row => row.status !== "under" && isShort(row));
  if (!logged) {
    // A stale export otherwise reads "0 of 11" directly above a strength row
    // reporting a gain, because the two are anchored to different weeks.
    return {
      headline: "Nothing logged this week",
      tone: "neutral",
      subline: short.length ? `Planned: ${short.length} still short` : "Planned: all 11 on target",
      short,
      logged: false,
    };
  }
  const exposed = needsExtra.length
    ? `${needsExtra.length} of them ${needsExtra.length === 1 ? "needs" : "need"} the extra ${needsExtra.length === 1 ? "workout" : "workouts"}`
    : null;
  const covered = outlook.length - short.length;
  if (!short.length) {
    return {
      headline: `All ${outlook.length} muscle groups covered`,
      tone: "neutral",
      subline: exposed,
      short,
      logged: true,
    };
  }
  const names = short.map(row => row.label.toLowerCase());
  return {
    headline: `${covered} of ${outlook.length} covered`,
    tone: "warn",
    subline: `Short: ${names.slice(0, 4).join(", ")}${names.length > 4 ? ` +${names.length - 4}` : ""}`,
    short,
    logged: true,
  };
}

/**
 * The answer as a picture, on the shut row.
 *
 * One shared ceiling across all eleven bars, so equal set counts draw equal
 * lengths — the full chart used to give every row its own grid, which made the
 * tracks different widths and the bars incomparable. The target floor is a
 * notch drawn on top of the fill rather than a band painted underneath it, so
 * it stays visible once it has been met.
 */
/**
 * The answer as eleven marks: filled means that muscle got its week's sets.
 *
 * The previous version drew eleven part-filled bars against each muscle's own
 * target with a line across them. It was honest and completely undecodable —
 * no axis, no numbers, no key on screen, so a filled bar and a half-filled bar
 * meant nothing you could name. A picture that needs a legend you cannot see
 * is decoration.
 *
 * So: one mark a muscle, two states, and the words above it say the same thing.
 * The full chart underneath has the numbers, the axis and the labels; this is
 * only the verdict, drawn.
 */
export function MiniCoverage({ outlook }: { outlook: MuscleOutlook[] }) {
  return <div className="mini-coverage">
    {outlook.map(row => {
      const short = row.status === "under";
      return <span key={row.muscle} className={`mini-mark${short ? " is-short" : ""}`} title={`${row.label}: ${sets(row.projected)} of ${row.target.min}–${row.target.max} sets`}>
        <i aria-hidden="true" />
        <small>{SHORT[row.muscle]}</small>
      </span>;
    })}
    <span className="mini-key">Filled = at or above its weekly sets</span>
  </div>;
}

export function CoverageBody({
  plan, state, today, outlook, onGoals, onNotice, focus, onFocus,
}: {
  plan: Plan;
  state: HealthState;
  today: string;
  outlook: MuscleOutlook[];
  onGoals: (goals: GoalSettings | ((current: GoalSettings) => GoalSettings)) => void;
  onNotice: (message: string) => void;
  focus: Muscle | null;
  onFocus: (muscle: Muscle | null) => void;
}) {
  const [lens, setLens] = useState<"week" | "month">("week");
  const unknown = useMemo(() => unclassifiedExercises(state.workoutSets), [state.workoutSets]);
  const volume = useMemo(() => muscleVolume(state.workoutSets, today, 4), [state.workoutSets, today]);
  const freshness = useMemo(() => new Map(muscleFreshness(state, today).map(entry => [entry.muscle, entry.days])), [state, today]);
  const names = labelSessions(plan.sessions);
  const ceiling = lens === "week"
    ? Math.max(20, ...outlook.map(row => row.projected))
    : Math.max(20, ...volume.map(row => row.effective));

  return <>
    <div className="tl-tabs lens-tabs" role="group" aria-label="Coverage window">
      <button type="button" className={lens === "week" ? "active" : ""} aria-pressed={lens === "week"} onClick={() => setLens("week")}>This week</button>
      <button type="button" className={lens === "month" ? "active" : ""} aria-pressed={lens === "month"} onClick={() => setLens("month")}>Last 4 weeks</button>
    </div>

    <div className="muscle-chart-legend">
      <span><i className="chart-key logged" />Logged</span>
      {lens === "week" ? <span><i className="chart-key planned" />Planned</span> : null}
      {lens === "week" ? <span><i className="chart-key optional" />Optional</span> : null}
      <span><i className="chart-key target" />Target</span>
    </div>
    {/* The whole content of the fold that used to be called "How sets count",
        printed permanently on the number it decodes. A disclosure may hide
        detail; it may not hide the key to a number visible above it. */}
    <p className="chart-key-caption">direct 1 · assist ½{lens === "month" ? " · averaged over the weeks you trained" : ""}</p>
    <div className="chart-axis" aria-hidden="true"><span>0</span><span>{ceiling} sets</span></div>

    {lens === "week"
      ? <WeekChart plan={plan} state={state} today={today} outlook={outlook} ceiling={ceiling} freshness={freshness} focus={focus} onFocus={onFocus} onGoals={onGoals} onNotice={onNotice} names={names} />
      : <MonthChart volume={volume} ceiling={ceiling} freshness={freshness} />}

    {unknown.length ? <details className="counted-fold"><summary>Not counted ({unknown.length})</summary>
      <p className="tl-line">{unknown.join(", ")} {unknown.length === 1 ? "counts" : "count"} toward nothing — no muscle is mapped to {unknown.length === 1 ? "it" : "them"}.</p>
    </details> : null}
  </>;
}

function WeekChart({
  plan, state, today, outlook, ceiling, freshness, focus, onFocus, onGoals, onNotice, names,
}: {
  plan: Plan;
  state: HealthState;
  today: string;
  outlook: MuscleOutlook[];
  ceiling: number;
  freshness: Map<Muscle, number | null>;
  focus: Muscle | null;
  onFocus: (muscle: Muscle | null) => void;
  onGoals: (goals: GoalSettings | ((current: GoalSettings) => GoalSettings)) => void;
  onNotice: (message: string) => void;
  names: Map<string, string>;
}) {
  const detail = useMemo(() => focus ? muscleDetail(plan, state, focus, today) : null, [focus, plan, state, today]);
  const missing = new Set(plan.missing ?? []);

  const add = (choice: FixChoice, count: number) => {
    const same = (entry: AddedSet) => entry.weekStart === weekStart(today) && entry.session === choice.session && entry.exercise === choice.exercise;
    onGoals(current => {
      const total = (current.addedSets.find(same)?.sets ?? 0) + count;
      return { ...current, addedSets: [
        ...current.addedSets.filter(entry => !same(entry)),
        ...(total === 0 ? [] : [{ weekStart: weekStart(today), session: choice.session, exercise: choice.exercise, sets: total }]),
      ] };
    });
    onNotice(`${count > 0 ? "Added" : "Removed"} ${Math.abs(count)} ${Math.abs(count) === 1 ? "set" : "sets"} of ${choice.exercise} · ${names.get(choice.session) ?? choice.session}`);
  };

  return <ul className="muscle-chart-list" aria-label="Weekly muscle group graph">
    {outlook.map(row => {
      const width = (value: number) => `${Math.min(100, (value / ceiling) * 100)}%`;
      const isOpen = focus === row.muscle;
      const directShort = row.direct < minimumDirect(row.muscle);
      const short = row.status === "under";
      const status = short ? "low" : row.status === "over" ? "high" : "ok";
      // Two failures that used to render identically. The fix differs
      // completely: more sets of anything, or sets that actually target this.
      const suffix = short
        ? (directShort && row.projected >= row.target.min ? "low direct" : "low")
        : row.status === "over" ? "high" : isShort(row) ? "+ extra" : "";
      const last = freshness.get(row.muscle);
      const isMissing = missing.has(row.muscle);
      return <li key={row.muscle} className={`muscle-chart-item ${status}${isOpen ? " is-open" : ""}${isMissing ? " is-missing" : ""}`}>
        <button
          type="button"
          className="muscle-chart-row"
          aria-expanded={isOpen}
          aria-label={`${row.label}: ${sets(row.done)} logged plus ${sets(row.coming)} planned equals ${sets(row.projected)} sets. Target ${row.target.min} to ${row.target.max}. ${suffix || "Within target"}. Last trained ${sinceLabel(last ?? null)}. Show exercises`}
          onClick={() => onFocus(isOpen ? null : row.muscle)}
        >
          <span className="muscle-chart-name"><b>{row.label}</b><Icon name="chevron" />{suffix ? <small>{suffix}</small> : null}</span>
          <span className="muscle-chart-track" aria-hidden="true">
            {row.comingOptional > 0 ? <span className="muscle-chart-optional" style={{ width: width(row.projected) }} /> : null}
            <span className="muscle-chart-planned" style={{ width: width(row.done + row.comingRequired) }} />
            <span className="muscle-chart-logged" style={{ width: width(row.done) }} />
            <span className="muscle-chart-band" style={{ left: width(row.target.min), width: width(row.target.max - row.target.min) }} />
          </span>
          <span className="muscle-chart-total">{isMissing ? "—" : sets(row.projected)}</span>
          <span className="muscle-chart-last">{sinceShort(last ?? null)}</span>
        </button>
        {isOpen && detail ? <Detail
          detail={detail}
          row={row}
          choices={fixChoices(plan, state, row.muscle, today).slice(0, 6)}
          names={names}
          onAdd={add}
          missing={isMissing}
        /> : null}
      </li>;
    })}
  </ul>;
}

/** Where the four-week average lives: a fact about last month, said as one. */
function MonthChart({ volume, ceiling, freshness }: {
  volume: ReturnType<typeof muscleVolume>;
  ceiling: number;
  freshness: Map<Muscle, number | null>;
}) {
  const byMuscle = new Map(volume.map(row => [row.muscle, row]));
  return <ul className="muscle-chart-list is-static" aria-label="Four-week muscle group average">
    {MUSCLES.map(muscle => {
      const row = byMuscle.get(muscle);
      const target = weeklyTargets[muscle];
      const value = row?.effective ?? 0;
      const status = value < target.min ? "low" : value > target.max ? "high" : "ok";
      return <li key={muscle} className={`muscle-chart-item ${status}`}>
        <div className="muscle-chart-row is-static">
          <span className="muscle-chart-name"><b>{muscleLabels[muscle]}</b>{status === "low" ? <small>low</small> : null}</span>
          <span className="muscle-chart-track" aria-hidden="true">
            <span className="muscle-chart-logged" style={{ width: `${Math.min(100, (value / ceiling) * 100)}%` }} />
            <span className="muscle-chart-band" style={{ left: `${(target.min / ceiling) * 100}%`, width: `${((target.max - target.min) / ceiling) * 100}%` }} />
          </span>
          <span className="muscle-chart-total">{value ? sets(value) : "none"}</span>
          <span className="muscle-chart-last">{sinceShort(freshness.get(muscle) ?? null)}</span>
        </div>
      </li>;
    })}
  </ul>;
}

/**
 * One muscle's week, itemised, and the dropdown that fixes it.
 *
 * The engine ranks every lift that would close the gap and says which session
 * it would go in. The old UI took the head of that list and offered a blind
 * "+1" whose caption named two indistinguishable workouts; here the list is the
 * control.
 */
function Detail({ detail, row, choices, names, onAdd, missing }: {
  detail: MuscleDetail;
  row: MuscleOutlook;
  choices: FixChoice[];
  names: Map<string, string>;
  onAdd: (choice: FixChoice, count: number) => void;
  missing: boolean;
}) {
  const [pick, setPick] = useState(0);
  const directFloor = minimumDirect(row.muscle);
  const directPass = row.direct >= directFloor;
  const choice = choices[pick];
  const label = (name: string) => names.get(name) ?? name;

  if (missing) return <div className="row-detail"><p className="row-note">No lift in your record trains this. Import a workout containing one, or add one in Strong.</p></div>;

  return <div className="row-detail">
    <div className="threshold-equation">
      <b>{`${sets(row.done)} logged + ${sets(row.coming)} planned = ${sets(row.projected)}`}</b>
      <span>{`direct ${sets(row.direct)} · assisting ${sets(row.indirect)} × ½`}</span>
      <span className={directPass ? "threshold-check is-pass" : "threshold-check is-fail"}>{`Direct ≥${directFloor} ${directPass ? "✓" : "✕"}`}</span>
      <span className={row.status === "under" ? "threshold-check is-fail" : row.status === "over" ? "threshold-check is-over" : "threshold-check is-pass"}>
        {`Weekly ${row.target.min}–${row.target.max} ${row.status === "under" ? "✕" : row.status === "over" ? "over" : "✓"}`}
      </span>
    </div>
    {choices.length ? <div className="fix-picker">
      <label>
        <span>Add sets</span>
        <select aria-label={`Add sets for ${row.label}`} value={pick} onChange={event => setPick(Number(event.target.value))}>
          {choices.map((entry, index) => <option key={`${entry.session}:${entry.exercise}`} value={index}>
            {entry.exercise} · {label(entry.session)}
          </option>)}
        </select>
      </label>
      <button type="button" className="button secondary small" onClick={() => choice && onAdd(choice, 1)}>Add 1</button>
      {detail.work.some(item => !item.done) ? <button type="button" className="text-button" onClick={() => choice && onAdd(choice, -1)}>Remove 1</button> : null}
    </div> : null}
    {detail.work.length ? <ul>
      {detail.work.map(item => <li key={`${item.where}:${item.exercise}:${item.done}`} className={item.done ? "is-done" : ""}>
        <span className="detail-where">{item.done ? "Logged" : label(item.where)}</span>
        <span className="detail-name">{item.exercise}</span>
        <span className="detail-sets">{item.direct ? `${item.sets}` : `${item.sets} → ${sets(item.sets * 0.5)}`}</span>
      </li>)}
    </ul> : <p className="row-note">No planned sets.</p>}
  </div>;
}
