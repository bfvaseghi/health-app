"use client";

import { useMemo, useState } from "react";
import type { GoalSettings, HealthState, ProgressPhoto } from "../health-model";
import { dateLabel, phaseProgress } from "../health-model";
import { currentTrainingWeek, weekOutlook, weekStart } from "../training/coach";
import type { Muscle } from "../training/muscles";
import { BodyTab } from "./body-tab";
import { CoverageBody, MiniCoverage, coverageFacts } from "./coverage-row";
import { AnswerRow } from "./answer-row";
import { LoopSteps, NextUpBody, TakeItWithYou, WeekPips, nextUpFacts } from "./next-up-row";
import { GymView } from "./gym-view";
import { readGymOpened, writeGymOpened } from "./gym-visit";
import { loopState } from "./loop-state";
import { RecordStamp } from "./record-stamp";
import { StrengthBody, StrengthSpark, strengthFacts } from "./strength-row";
import { Icon } from "./icons";
import { RecordHeading } from "./primitives";
import { type FitnessOpen, type FitnessRow, type Modal } from "./types";

/**
 * Fitness: four questions, each already answered on its own shut row.
 *
 * The section used to be four numbered tabs named after its own internals.
 * Every one of them made you open it to find out what it said, so the state of
 * the training was never on screen, and the numbers read as four things you had
 * failed to do rather than as a loop. Worse, three of the four answered the
 * same question — "am I covered?" — with three different arithmetics in the same
 * words, so one tab could say nothing was behind while the next said nine of
 * eleven muscles were short.
 *
 * Now: a stamp saying where all of it came from, then Next up, Coverage,
 * Strength and Body, each stating its answer with the window it measured. One
 * question is answered in exactly one place. Opening a row is only ever for the
 * working behind a number already read, and rows open independently, because
 * the reason to look at coverage is usually a number just read on the workout.
 */
export function FitnessView({
  state,
  rows,
  onRows,
  loadImage,
  editableState,
  today,
  open,
  onAddPhoto,
  onUpdatePhoto,
  onDeletePhoto,
  onDeleteDay,
  onGoals,
  onNotice,
  demo = false,
}: {
  state: HealthState;
  /** Which rows are open. Held above this component so it survives a view change. */
  rows: FitnessOpen;
  onRows: (next: FitnessOpen) => void;
  loadImage?: (id: string) => Promise<Blob | null>;
  editableState: HealthState;
  today: string;
  onAddPhoto: (photo: ProgressPhoto, blob: Blob) => Promise<void>;
  onUpdatePhoto: (photo: ProgressPhoto) => void;
  onDeletePhoto: (id: string) => void;
  onDeleteDay: (date: string) => void;
  onGoals: (goals: GoalSettings | ((current: GoalSettings) => GoalSettings)) => void;
  onNotice: (message: string) => void;
  open: (modal: Modal) => void;
  /** A demo never writes this device's keys, and never offers a real import. */
  demo?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<Muscle | null>(null);
  const [weeks, setWeeks] = useState(12);
  const [gym, setGym] = useState(false);
  // Where he is in the week's round trip. Kept in component state as well as
  // localStorage so the strip restrikes immediately on opening the card, and so
  // the demo can demonstrate the whole loop without touching stored keys.
  const [gymOpenedAt, setGymOpenedAt] = useState<string | null>(() => readGymOpened(demo));

  const openGym = () => {
    const at = new Date().toISOString();
    setGymOpenedAt(at);
    writeGymOpened(demo, at);
    setGym(true);
  };

  const { plan } = useMemo(() => currentTrainingWeek(state, today), [state, today]);
  const outlook = useMemo(() => weekOutlook(plan, state, today), [plan, state, today]);
  const logged = state.workoutSets.filter(set => set.date <= today);
  const hasHistory = logged.length >= 10;

  const next = useMemo(() => nextUpFacts(plan, state, today), [plan, state, today]);
  const coverage = useMemo(() => coverageFacts(outlook, state, today), [outlook, state, today]);
  const strength = useMemo(() => strengthFacts(state, today, weeks), [state, today, weeks]);
  const body = bodyFacts(state, today);
  const loop = useMemo(() => loopState(state, today, gymOpenedAt), [state, today, gymOpenedAt]);

  const toggle = (row: FitnessRow) => onRows({ ...rows, [row]: !rows[row] });
  const week = `${dateLabel(weekStart(today), { month: "short", day: "numeric" })}–${dateLabel(endOfWeek(today), { month: "short", day: "numeric" })}`;

  return (
    <div className="page fitness-page">
      <RecordHeading title="Fitness" />
      <RecordStamp state={state} today={today} open={open} />

      <div className="answer-stack">
        <AnswerRow
          id="fitness-next"
          eyebrow={next.deload ? "NEXT UP · EASIER WEEK" : "NEXT UP"}
          window={hasHistory ? `${next.daysLeft} ${next.daysLeft === 1 ? "day" : "days"} left` : undefined}
          headline={hasHistory ? next.headline : "No workout yet"}
          subline={hasHistory ? next.subline : "Needs your Strong export"}
          tone={hasHistory ? "primary" : "empty"}
          graphic={hasHistory ? <WeekPips facts={next} scope={loop.show} /> : null}
          action={hasHistory
            ? <><LoopSteps loop={loop} /><TakeItWithYou facts={next} onGym={openGym} onNotice={onNotice} /></>
            : <button type="button" className="button primary" onClick={() => open({ kind: "import", source: "strong" })}><Icon name="upload" />Import from Strong</button>}
          open={rows.next}
          onToggle={() => toggle("next")}
        >
          {hasHistory ? <NextUpBody
            plan={plan}
            state={state}
            today={today}
            facts={next}
            selected={selected}
            onSelect={setSelected}
            onGoals={onGoals}
            onMuscle={muscle => { setFocus(muscle as Muscle); onRows({ ...rows, coverage: true }); }}
          /> : null}
        </AnswerRow>

        <AnswerRow
          id="fitness-coverage"
          eyebrow="COVERAGE"
          window={week}
          headline={coverage.headline}
          subline={coverage.subline}
          tone={coverage.tone}
          graphic={<MiniCoverage outlook={outlook} />}
          open={rows.coverage}
          onToggle={() => toggle("coverage")}
        >
          {coverage.tone === "empty" ? null : <CoverageBody
            plan={plan}
            state={state}
            today={today}
            outlook={outlook}
            onGoals={onGoals}
            onNotice={onNotice}
            focus={focus}
            onFocus={setFocus}
          />}
        </AnswerRow>

        <AnswerRow
          id="fitness-strength"
          eyebrow="STRENGTH"
          window={strength.window}
          headline={strength.headline}
          subline={strength.subline}
          tone={strength.tone}
          graphic={strength.tone === "empty" ? null : <StrengthSpark state={state} today={today} weeks={weeks} />}
          open={rows.strength}
          onToggle={() => toggle("strength")}
        >
          {strength.tone === "empty" ? null : <StrengthBody state={state} today={today} weeks={weeks} onWeeks={setWeeks} facts={strength} />}
        </AnswerRow>

        <AnswerRow
          id="fitness-body"
          eyebrow="BODY"
          window={body.phase}
          headline={body.headline}
          subline={body.subline}
          tone={body.tone}
          open={rows.body}
          onToggle={() => toggle("body")}
        >
          <BodyTab
            state={state}
            editableState={editableState}
            today={today}
            open={open}
            onAddPhoto={onAddPhoto}
            onUpdatePhoto={onUpdatePhoto}
            onDeletePhoto={onDeletePhoto}
            onDeleteDay={onDeleteDay}
            onNotice={onNotice}
            onGoals={onGoals}
            loadImage={loadImage}
          />
        </AnswerRow>
      </div>
      {gym && next.hero ? <GymView
        session={next.hero}
        label={next.headline}
        onClose={() => setGym(false)}
        onImport={() => { setGym(false); open({ kind: "import", source: "strong" }); }}
      /> : null}
    </div>
  );
}

function endOfWeek(today: string): string {
  const monday = weekStart(today);
  const date = new Date(`${monday}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

/** Weight and body fat, and how the cut or bulk is going, in two lines. */
function bodyFacts(state: HealthState, today: string): {
  headline: string;
  subline: string | null;
  tone: "neutral" | "empty";
  phase: string | undefined;
} {
  const latest = state.dailyEntries.filter(entry => entry.date <= today && entry.weightLb !== null)[0];
  const fat = state.dailyEntries.filter(entry => entry.date <= today && entry.bodyFatPercent !== null)[0];
  const phase = phaseProgress(state, today);
  const label = state.goals.weightDirection === "lose" ? "Cut" : state.goals.weightDirection === "gain" ? "Bulk" : undefined;
  if (!latest) return { headline: "No weight logged", subline: "Add a photo or a weight", tone: "empty", phase: label };
  return {
    headline: [`${(latest.weightLb as number).toFixed(1)} lb`, fat ? `${fat.bodyFatPercent}% fat` : null].filter(Boolean).join(" · "),
    subline: phase && phase.changeLb !== null
      ? `${Math.abs(phase.changeLb).toFixed(1)} lb ${phase.changeLb < 0 ? "down" : "up"} in ${phase.weeks} ${phase.weeks === 1 ? "week" : "weeks"}`
      : `${state.progressPhotos.length} ${state.progressPhotos.length === 1 ? "photo" : "photos"}`,
    tone: "neutral",
    phase: label,
  };
}
