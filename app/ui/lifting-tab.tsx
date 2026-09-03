"use client";

import { useMemo, useState } from "react";
import type { HealthState } from "../health-model";
import {
  buildExerciseSummaries,
  buildWorkoutSessions,
  dateLabel,
  recentPersonalRecords,
  weeklyVolume,
} from "../health-model";
import { Tide } from "./tide";
import { Icon } from "./icons";
import { ConfirmButton, Note } from "./primitives";
import type { Modal } from "./types";

const VISIBLE_EXERCISES = 8;

/** Everything the Strong export adds up to: records, load, movements, sessions. */
export function LiftingTab({
  state,
  today,
  open,
  demo,
  onDeleteSession,
}: {
  state: HealthState;
  today: string;
  open: (modal: Modal) => void;
  demo: boolean;
  onDeleteSession: (startedAt: string) => void;
}) {
  const summaries = useMemo(() => buildExerciseSummaries(state.workoutSets), [state.workoutSets]);
  const sessions = useMemo(() => buildWorkoutSessions(state.workoutSets), [state.workoutSets]);
  const records = useMemo(() => recentPersonalRecords(summaries, today, 60), [summaries, today]);
  const volume = useMemo(() => weeklyVolume(state.workoutSets, today, 12), [state.workoutSets, today]);

  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Three lenses on one history rather than three panels stacked down a page.
  // They answer different questions about the same sets, so only one of them is
  // ever the one you came for.
  const [lens, setLens] = useState<Lens>("records");
  const [openNote, setOpenNote] = useState(false);

  if (!state.workoutSets.length) {
    return (
      <div className="tl-page">
        <h2 className="tl-hero">No workouts yet.</h2>
        <p className="tl-lede">
          Strong exports a CSV of every set you have logged. Drop it in and your history, records, and volume appear here.
        </p>
        {demo ? null : (
          <div className="tl-actions">
            <button type="button" className="button primary" onClick={() => open({ kind: "import" })}>
              <Icon name="upload" />
              Import a Strong export
            </button>
          </div>
        )}
      </div>
    );
  }

  const exercise = summaries.find((entry) => entry.name === selected) ?? null;
  const listed = showAll ? summaries : summaries.slice(0, VISIBLE_EXERCISES);
  const totalVolume = sessions.reduce((total, session) => total + session.volumeLb, 0);

  // What each fold says while it is closed. A fold whose head does not answer
  // anything is just a thing to click.
  const lastWeek = [...volume].reverse().find((point) => (point.value ?? 0) > 0) ?? null;
  const volumeLine = lastWeek
    ? `${Math.round(lastWeek.value ?? 0).toLocaleString("en-US")} lb in the week of ${dateLabel(lastWeek.date, { month: "short", day: "numeric" })}`
    : "nothing in the last twelve weeks";
  const lensLine =
    lens === "records"
      ? `${records.length} beaten in the last 60 days`
      : lens === "exercises"
        ? `${summaries.length} ${summaries.length === 1 ? "movement" : "movements"} logged`
        : `${sessions.length} logged, newest first`;

  return (
    <>
      <h2 className="tl-hero" style={{ marginTop: 18 }}>
        {`${sessions.length} ${sessions.length === 1 ? "workout" : "workouts"}.`}
      </h2>
      <p className="tl-lede">
        {sessions.length ? `Since ${dateLabel(sessions.at(-1)!.date, { month: "long", year: "numeric" })} · ` : ""}
        <b>{sessions.reduce((total, session) => total + session.sets, 0).toLocaleString("en-US")}</b>
        {" working sets · "}
        <b>{summaries.length}</b>
        {` distinct ${summaries.length === 1 ? "movement" : "movements"} · `}
        <b>{`${Math.round(totalVolume / 1_000).toLocaleString("en-US")}k lb`}</b>
        {" moved, rest timers excluded"}
      </p>

      {/* The load, week by week, as a tide: the page's one picture. */}
      <section className="tl-section" aria-label="Volume by week">
        <div className="tl-section-head">
          <span className="tl-caps">Volume · pounds a week · 12 weeks</span>
          <span className="tl-meta">{volumeLine}</span>
        </div>
        <Tide
          data={volume.map((point) => ({ date: point.date, value: point.value && point.value > 0 ? point.value : null }))}
          label="Volume, pounds moved a week"
          unit=" lb"
          min={0}
          format={(value) => Math.round(value).toLocaleString("en-US")}
          empty="No sets in the last twelve weeks."
          dateFormat={{ month: "short", day: "numeric" }}
        />
      </section>

      <section className="tl-section" aria-label="History">
        <div className="tl-section-head">
          <h2 className="tl-caps" style={{ margin: 0 }}>History</h2>
          <div className="tl-tabs" role="group" aria-label="What to look at">
            {([["records", "Records"], ["exercises", "Exercises"], ["sessions", "Sessions"]] as [Lens, string][]).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={lens === value} className={lens === value ? "active" : ""} onClick={() => setLens(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="tl-line" style={{ marginTop: 8 }}>{lensLine}</p>

        {lens === "records" ? (
          records.length ? (
            <>
              <ul className="tl-rows tl-list">
                {records.map((record) => (
                  <li className="tl-row is-static" key={record.exercise}>
                    <span className="tl-row-copy">
                      <b>{record.exercise}</b>
                      <small>
                        {dateLabel(record.date, { weekday: "short", month: "short", day: "numeric" })}
                        {record.previous === null
                          ? ""
                          : ` · beat ${Math.round(record.previous)}${record.bodyweight ? " reps" : " lb"}`}
                      </small>
                    </span>
                    <span className="tl-row-end stack up">
                      <b>
                        {record.bodyweight
                          ? `${record.reps ?? "—"} reps`
                          : `${record.weightLb ?? "—"} lb × ${record.reps ?? "—"}`}
                      </b>
                      {record.bodyweight || record.oneRepMax === null ? null : <small>{`est. 1RM ${record.oneRepMax} lb`}</small>}
                    </span>
                  </li>
                ))}
              </ul>
              {/* What an estimated max is and is not. True, and not something
                  anyone needs to read twice. */}
              <div className="coach-notes">
                <button
                  type="button"
                  className="note-toggle"
                  aria-expanded={openNote}
                  onClick={() => setOpenNote((current) => !current)}
                >
                  {openNote ? "Hide note" : "About estimated maxes"}
                  <Icon name="chevron" />
                </button>
                {openNote ? (
                  <Note>
                    An estimated one-rep max is Epley&rsquo;s formula on your best set, not a lift you performed. It
                    stops reporting past fifteen reps, where the arithmetic describes endurance rather than strength.
                  </Note>
                ) : null}
              </div>
            </>
          ) : (
            <p className="tl-line">Nothing beaten in the last sixty days.</p>
          )
        ) : null}

        {lens === "exercises" ? (
          <>
            <ul className="exercise-list">
              {listed.map((entry) => {
                const isOpen = entry.name === selected;
                return (
                  <li key={entry.name} className={isOpen ? "is-open" : ""}>
                    <button
                      type="button"
                      className={isOpen ? "exercise-row active" : "exercise-row"}
                      aria-expanded={isOpen}
                      onClick={() => setSelected((current) => (current === entry.name ? null : entry.name))}
                    >
                      <span className="exercise-name">
                        <b>{entry.name}</b>
                        <small>{`${entry.sessions} ${entry.sessions === 1 ? "session" : "sessions"} · last ${dateLabel(entry.lastDate)}`}</small>
                      </span>
                      {/* Both numbers, because they answer different questions:
                          the set is what you actually did, the max is what it
                          projects to. One without the other is half a record. */}
                      <span className="exercise-best">
                        <b>
                          {entry.bodyweight
                            ? `${entry.best?.reps ?? "—"} reps`
                            : `${entry.best?.weightLb ?? "—"} × ${entry.best?.reps ?? "—"}`}
                        </b>
                        <small>best set</small>
                      </span>
                      <span className="exercise-best">
                        <b>
                          {entry.bodyweight || entry.bestOneRepMax === null ? "—" : `${entry.bestOneRepMax} lb`}
                        </b>
                        <small>est. 1RM</small>
                      </span>
                    </button>
                    {/* A movement's own history, under the movement, rather
                        than in a second panel that spends most of its life
                        asking you to pick something. */}
                    {isOpen && exercise ? (
                      <div className="exercise-detail">
                        <Tide
                          data={exercise.history.map((session) => ({
                            date: session.date,
                            value: exercise.bodyweight ? session.topReps : session.oneRepMax,
                          }))}
                          label={exercise.bodyweight ? "Best reps, session by session" : "Estimated one-rep max, session by session"}
                          unit={exercise.bodyweight ? " reps" : " lb"}
                          format={(value) => String(Math.round(value))}
                          empty="Not enough sessions to draw a line."
                          dateFormat={{ month: "short", day: "numeric" }}
                        />
                        <dl className="report-rows">
                          <div>
                            <dt>Best set</dt>
                            <dd>
                              <b>
                                {exercise.bodyweight
                                  ? `${exercise.best?.reps ?? "—"} reps`
                                  : `${exercise.best?.weightLb ?? "—"} lb × ${exercise.best?.reps ?? "—"}`}
                              </b>
                              <small>{exercise.best ? dateLabel(exercise.best.date, { month: "short", day: "numeric", year: "numeric" }) : ""}</small>
                            </dd>
                          </div>
                          <div>
                            <dt>Total volume</dt>
                            <dd>
                              <b>{`${exercise.totalVolumeLb.toLocaleString("en-US")} lb`}</b>
                              <small>{`across ${exercise.sets} sets`}</small>
                            </dd>
                          </div>
                          <div>
                            <dt>First recorded</dt>
                            <dd>
                              <b>{dateLabel(exercise.firstDate, { month: "short", day: "numeric", year: "numeric" })}</b>
                              <small>{`${exercise.sessions} sessions since`}</small>
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {summaries.length > VISIBLE_EXERCISES ? (
              <p className="tl-line">
                <button type="button" className="text-button" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? "Show fewer" : `Show all ${summaries.length}`}
                </button>
              </p>
            ) : null}
          </>
        ) : null}

        {lens === "sessions" ? (
          <ul className="tl-rows tl-list">
            {sessions.slice(0, 20).map((session) => (
              <li className="tl-row is-static" key={session.startedAt}>
                <span className="tl-row-copy">
                  <b>{session.name || "Workout"}</b>
                  <small>
                    {dateLabel(session.date, { weekday: "short", month: "short", day: "numeric" })}
                    {` · ${session.exercises.slice(0, 3).join(", ")}${session.exercises.length > 3 ? `, +${session.exercises.length - 3}` : ""}`}
                  </small>
                </span>
                <span className="tl-row-end stack">
                  <b>{`${session.sets} sets`}</b>
                  <small>{`${session.volumeLb.toLocaleString("en-US")} lb`}</small>
                </span>
                <div className="row-actions">
                  <ConfirmButton
                    label={`Delete the session on ${dateLabel(session.date)}`}
                    onConfirm={() => onDeleteSession(session.startedAt)}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}

type Lens = "records" | "exercises" | "sessions";
