"use client";

import type { HealthState } from "../health-model";
import { buildWorkoutSessions, dateLabel } from "../health-model";
import { recordAge, sinceLabel } from "../training/recommend";
import { Icon } from "./icons";
import type { Modal } from "./types";

/**
 * Step one, and the one everything else depends on.
 *
 * Every number this app shows is read off the last Strong export you brought
 * across. That was never said anywhere, so a plan drawn from a three-week-old
 * record looked exactly like one drawn from yesterday's. Here it is the whole
 * page: how current you are, and the three things to do about it.
 */
export function ImportStep({
  state,
  today,
  open,
}: {
  state: HealthState;
  today: string;
  open: (modal: Modal) => void;
}) {
  const age = recordAge(state, today);
  const sessions = buildWorkoutSessions(state.workoutSets.filter(set => set.date <= today));
  const stale = age.days === null || age.days >= 7;

  return (
    <div className="training-workspace step-page">
      <div className={stale ? "step-status is-stale" : "step-status"}>
        <span className="tl-caps">Your record</span>
        <b>{age.days === null ? "Nothing imported yet" : `Last workout ${sinceLabel(age.days)}`}</b>
        <span>
          {age.days === null
            ? "Everything this app tells you comes from your Strong export. Until one is here, it has nothing to work from."
            : `${sessions.length} ${sessions.length === 1 ? "workout" : "workouts"} in your record${age.date ? `, most recent ${dateLabel(age.date, { month: "long", day: "numeric" })}` : ""}.${stale ? " That is old enough that the next workout is probably out of date." : ""}`}
        </span>
      </div>

      <ol className="step-how">
        <li>
          <span className="n">1</span>
          <span>
            <b>Export from Strong</b>
            <small>In Strong: Profile, then the settings gear, then Export Data. It makes a CSV file.</small>
          </span>
        </li>
        <li>
          <span className="n">2</span>
          <span>
            <b>Bring it here</b>
            <small>Drop the file in. Sets you already have are matched, not duplicated.</small>
            <button type="button" className="button primary" onClick={() => open({ kind: "import", source: "strong" })}>
              <Icon name="upload" />
              {age.days === null ? "Import your Strong export" : "Import a newer export"}
            </button>
          </span>
        </li>
        <li>
          <span className="n">3</span>
          <span>
            <b>Do it again after each workout</b>
            <small>That is the whole maintenance of this app. Everything downstream — what to lift, what is behind, whether you are gaining — recalculates from it.</small>
          </span>
        </li>
      </ol>
    </div>
  );
}
