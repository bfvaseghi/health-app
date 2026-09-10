"use client";

import { useMemo, useState } from "react";
import type { GoalSettings, HealthState, ProgressPhoto } from "../health-model";
import { dateLabel, phaseProgress } from "../health-model";
import { currentTrainingWeek, weekOutlook, weekStart } from "../training/coach";
import type { Muscle } from "../training/muscles";
import { BodyTab } from "./body-tab";
import { CoverageBody, MiniCoverage, coverageFacts } from "./coverage-row";
import { AnswerRow } from "./answer-row";
import { NextUpBody, TakeItWithYou, WeekPips, nextUpFacts } from "./next-up-row";
import { GymView } from "./gym-view";
import { readGymOpened, writeGymOpened } from "./gym-visit";
import { loopState } from "./loop-state";
import { PhaseScore, phaseScore, type PhaseScore as PhaseScoreFacts } from "./phase-score";
import { RecordCard } from "./record-stamp";
import { StrengthSpark, strengthFacts } from "./strength-row";
import { StrengthView } from "./strength-view";
import { RecordHeading } from "./primitives";
import { type FitnessOpen, type FitnessRow, type FitnessTab, type Modal } from "./types";

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
 * Now: a record card carrying where all of it came from, the three steps of
 * the week's round trip and the way to import — then Next up, Coverage,
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
  tab,
  onTab,
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
  /** Which half of Fitness is showing. Held above so it survives a view change. */
  tab: FitnessTab;
  onTab: (tab: FitnessTab) => void;
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
  const score = useMemo(() => phaseScore(state, today), [state, today]);
  const body = bodyFacts(state, today, score);
  const loop = useMemo(() => loopState(state, today, gymOpenedAt), [state, today, gymOpenedAt]);

  const toggle = (row: FitnessRow) => onRows({ ...rows, [row]: !rows[row] });
  const week = `${dateLabel(weekStart(today), { month: "short", day: "numeric" })}–${dateLabel(endOfWeek(today), { month: "short", day: "numeric" })}`;

  return (
    <div className="page fitness-page">
      <RecordHeading title="Fitness" />

      {/* Two halves, two panels. The week is a handful of rows you read on the
          way out; every lift you train with its own curve is a page. Squeezing
          the second into a row of the first is what made it a tally. */}
      <div className="fitness-tabs record-tabs" role="tablist" aria-label="Fitness">
        {(["training", "strength"] as const).map((value, index, tabs) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`fitness-tab-${value}`}
            aria-controls={`fitness-panel-${value}`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => onTab(value)}
            onKeyDown={event => {
              const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                : event.key === "Home" ? 0
                : event.key === "End" ? tabs.length - 1
                : null;
              if (next === null) return;
              event.preventDefault();
              onTab(tabs[next]);
              (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
            }}
          >{value === "training" ? "Training" : "Strength"}</button>
        ))}
      </div>

      <div id="fitness-panel-strength" role="tabpanel" aria-labelledby="fitness-tab-strength" hidden={tab !== "strength"}>
        {tab === "strength" ? <StrengthView state={state} today={today} weeks={weeks} onWeeks={setWeeks} /> : null}
      </div>

      <div id="fitness-panel-training" role="tabpanel" aria-labelledby="fitness-tab-training" hidden={tab !== "training"}>
      <RecordCard state={state} today={today} loop={loop} open={open} />

      <div className="answer-stack">
        <AnswerRow
          id="fitness-next"
          eyebrow={next.deload ? "NEXT UP · EASIER WEEK" : "NEXT UP"}
          window={hasHistory ? `${next.daysLeft} ${next.daysLeft === 1 ? "day" : "days"} left` : undefined}
          headline={hasHistory ? next.headline : "No workout yet"}
          subline={hasHistory ? next.subline : "Needs your Strong export"}
          tone={hasHistory ? "primary" : "empty"}
          graphic={hasHistory ? <WeekPips facts={next} scope={loop.uncertain} /> : null}
          action={hasHistory
            ? <TakeItWithYou facts={next} onGym={openGym} onNotice={onNotice} stepBack={loop.reason === "mid"} />
            : null}
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

        {/* A summary that goes somewhere rather than unfolding: every lift with
            its own curve is a page, and squeezing it into a fold is what turned
            it into a tally in the first place. */}
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
          onJump={strength.tone === "empty" ? undefined : () => onTab("strength")}
        />

        <AnswerRow
          id="fitness-body"
          eyebrow="BODY"
          window={body.phase}
          headline={body.headline}
          subline={body.subline}
          tone={body.tone}
          graphic={score ? <PhaseScore score={score} /> : null}
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

/** Weight and body fat, and whether the cut or bulk is working, in two lines. */
function bodyFacts(state: HealthState, today: string, score: PhaseScoreFacts | null): {
  headline: string;
  subline: string | null;
  tone: "neutral" | "warn" | "empty";
  phase: string | undefined;
} {
  const latest = state.dailyEntries.filter(entry => entry.date <= today && entry.weightLb !== null)[0];
  const fat = state.dailyEntries.filter(entry => entry.date <= today && entry.bodyFatPercent !== null)[0];
  const phase = phaseProgress(state, today);
  const label = phase ? `${phase.phase === "cut" ? "Cut" : "Bulk"} · week ${phase.weeks}` : undefined;
  if (!latest) return { headline: "No weight logged", subline: "Add a photo or a weight", tone: "empty", phase: label };
  return {
    headline: [`${(latest.weightLb as number).toFixed(1)} lb`, fat ? `${fat.bodyFatPercent}% fat` : null].filter(Boolean).join(" · "),
    // In a phase the subline is the verdict on it — down and holding, or up
    // and gaining — because that is the only reason to be in one.
    subline: score
      ? score.verdict
      : `${state.progressPhotos.length} ${state.progressPhotos.length === 1 ? "photo" : "photos"}`,
    tone: score?.tone ?? "neutral",
    phase: label,
  };
}
