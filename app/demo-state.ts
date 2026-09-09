import type {
  DailyEntry,
  HealthState,
  LabResult,
  MedicationDose,
  SleepEntry,
  WorkoutSet,
} from "./health-model";
import { addDays, normalizeHealthState } from "./health-model";
import { weekStart } from "./training/coach";

type DemoMovement = {
  exercise: string;
  sets: number;
  weightLb: number | null;
  reps: number | number[];
  restSeconds: number;
};

function round(value: number, digits = 1): number {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function clock(totalMinutes: number): string {
  const value = ((Math.round(totalMinutes) % 1_440) + 1_440) % 1_440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function utcDay(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function demoDailyEntries(today: string): DailyEntry[] {
  return Array.from({ length: 60 }, (_, index) => {
    const date = addDays(today, index - 59);
    const wave = Math.sin(index * 0.72);
    const day = utcDay(date);
    return {
      date,
      weightLb: index % 2 === 0 || index === 59 ? round(196.4 - index * 0.045 + wave * 0.35) : null,
      bodyFatPercent: index % 7 === 3 || index === 59 ? round(18.1 - index * 0.018 + wave * 0.12) : null,
      steps: Math.round(7_600 + ((index * 1_187) % 4_900) + wave * 420),
      restingHeartRate: Math.round(60 - index * 0.045 + Math.cos(index * 0.55) * 2),
      hrvMs: Math.round(48 + index * 0.19 + Math.sin(index * 0.41) * 5),
      proteinG: index % 11 === 2 ? null : Math.round(168 + ((index * 13) % 31)),
      waterMl: index % 9 === 4 ? null : 1000 + ((index * 3) % 7) * 250,
      caloriesKcal: Math.round(2_350 + ((index * 97) % 360)),
      medicationTaken: null,
      journaled: index === 59 || day === 0 || day === 3 || day === 5,
      meditationMinutes: day === 1 || day === 2 || day === 4 || day === 6 ? (index % 3 === 0 ? 15 : 10) : null,
      meditationNote: (day === 1 || day === 2 || day === 4 || day === 6) && index > 45 ? ["Noticed my shoulders relaxing when I slowed down.", "My attention wandered. Returning to the breath felt easier without judging it.", "I could notice the urge to plan without following it."][index % 3] : "",
      note: "",
    };
  });
}

function demoSleepEntries(today: string): SleepEntry[] {
  const entries: SleepEntry[] = [];
  for (let index = 0; index < 60; index += 1) {
    const date = addDays(today, index - 59);
    const duration = round(7.65 + Math.sin(index * 0.58) * 0.55 + ((index * 7) % 5) * 0.12);
    const bedtimeMinutes = 23 * 60 + 32 + Math.round(Math.sin(index * 0.43) * 22) + (index % 4) * 5;
    const wakeMinutes = bedtimeMinutes + duration * 60;
    const heartRate = Math.round(58 - index * 0.035 + Math.cos(index * 0.47) * 2);
    const hrv = Math.round(51 + index * 0.16 + Math.sin(index * 0.38) * 5);
    entries.push({
      date,
      source: "oura",
      bedtime: clock(bedtimeMinutes),
      wakeTime: clock(wakeMinutes),
      durationHours: duration,
      quality: duration >= 8.3 ? 5 : duration >= 7.7 ? 4 : 3,
      efficiencyPercent: Math.round(88 + Math.sin(index * 0.5) * 3),
      deepHours: round(1.35 + Math.sin(index * 0.61) * 0.22),
      remHours: round(1.75 + Math.cos(index * 0.49) * 0.25),
      restingHeartRate: heartRate,
      hrvMs: hrv,
      note: "",
    });
    if (index % 12 === 4) {
      entries.push({
        date,
        source: "apple",
        bedtime: clock(bedtimeMinutes + 4),
        wakeTime: clock(wakeMinutes - 3),
        durationHours: round(duration - 0.12),
        quality: null,
        efficiencyPercent: null,
        deepHours: round(1.25 + Math.sin(index) * 0.15),
        remHours: round(1.65 + Math.cos(index) * 0.18),
        restingHeartRate: heartRate + 1,
        hrvMs: hrv - 2,
        note: "",
      });
    }
  }
  return entries;
}

function demoWorkoutSets(today: string): WorkoutSet[] {
  const sets: WorkoutSet[] = [];
  const monday = weekStart(today);

  const addSession = (
    relativeWeek: number,
    day: number,
    time: string,
    name: string,
    durationSeconds: number,
    movements: DemoMovement[],
  ) => {
    const date = addDays(monday, relativeWeek * 7 + day);
    const startedAt = `${date}T${time}:00`;
    for (const movement of movements) {
      for (let set = 1; set <= movement.sets; set += 1) {
        const reps = Array.isArray(movement.reps)
          ? movement.reps[set - 1] ?? movement.reps[movement.reps.length - 1] ?? 8
          : movement.reps;
        sets.push({
          date,
          startedAt,
          workoutName: name,
          exercise: movement.exercise,
          setNumber: set,
          weightLb: movement.weightLb,
          reps,
          distance: null,
          seconds: null,
          rpe: 8,
          restSeconds: movement.restSeconds,
          durationSeconds,
        });
      }
    }
  };

  // Six complete weeks, followed by the elapsed training days this week.
  for (let relativeWeek = -6; relativeWeek <= -1; relativeWeek += 1) {
    const buildWeek = relativeWeek + 6;
    const upperReps = Math.min(10, 8 + Math.floor(buildWeek / 2));
    const isolationReps = Math.min(12, 9 + Math.floor(buildWeek / 2));

    addSession(relativeWeek, 0, "07:00", "Upper", 3_300, [
      {
        exercise: "Incline Bench Press (Dumbbell)",
        sets: 2,
        weightLb: 65,
        reps: upperReps,
        restSeconds: 150,
      },
      // Holding this row steady for the last three sessions gives the demo a
      // believable stall recommendation alongside Bench's earned step up.
      { exercise: "Bent Over Row (Barbell)", sets: 2, weightLb: 155, reps: 8, restSeconds: 150 },
      { exercise: "Overhead Press (Barbell)", sets: 1, weightLb: 105, reps: upperReps, restSeconds: 180 },
      { exercise: "Bicep Curl (Dumbbell)", sets: 1, weightLb: 30, reps: isolationReps, restSeconds: 90 },
      { exercise: "Triceps Pushdown (Cable)", sets: 1, weightLb: 50, reps: isolationReps, restSeconds: 90 },
      { exercise: "Face Pull (Cable)", sets: 1, weightLb: 45, reps: isolationReps, restSeconds: 90 },
    ]);

    addSession(relativeWeek, 2, "07:00", "Lower", 3_450, [
      { exercise: "Squat (Barbell)", sets: 2, weightLb: 225, reps: 8, restSeconds: 180 },
      { exercise: "Romanian Deadlift (Barbell)", sets: 2, weightLb: 205, reps: 8, restSeconds: 180 },
      { exercise: "Standing Calf Raise (Machine)", sets: 2, weightLb: 140, reps: isolationReps, restSeconds: 90 },
      { exercise: "Hanging Leg Raise", sets: 2, weightLb: null, reps: Math.min(15, 12 + buildWeek), restSeconds: 75 },
    ]);

    addSession(relativeWeek, 4, "07:00", "Full", 3_600, [
      {
        exercise: "Bench Press (Barbell)",
        sets: 2,
        weightLb: 185,
        reps: relativeWeek === -1 ? [10, 10] : upperReps,
        // This earned increase is already supported by a two-minute timer.
        restSeconds: 120,
      },
      { exercise: "Lat Pulldown (Cable)", sets: 1, weightLb: 130, reps: upperReps, restSeconds: 150 },
      { exercise: "Leg Press (Machine)", sets: 1, weightLb: 300, reps: upperReps, restSeconds: 180 },
      { exercise: "Seated Leg Curl (Machine)", sets: 1, weightLb: 100, reps: isolationReps, restSeconds: 90 },
      { exercise: "Lateral Raise (Dumbbell)", sets: 1, weightLb: 20, reps: isolationReps, restSeconds: 90 },
      { exercise: "Face Pull (Cable)", sets: 1, weightLb: 45, reps: isolationReps, restSeconds: 90 },
      { exercise: "Hanging Leg Raise", sets: 1, weightLb: null, reps: Math.min(15, 12 + buildWeek), restSeconds: 75 },
    ]);
  }

  // Monday always precedes or equals the date shown by the demo.
  addSession(0, 0, "07:00", "Lower", 3_450, [
    { exercise: "Squat (Barbell)", sets: 4, weightLb: 225, reps: [8, 8, 8, 10], restSeconds: 180 },
    { exercise: "Romanian Deadlift (Barbell)", sets: 3, weightLb: 205, reps: 8, restSeconds: 180 },
    { exercise: "Standing Calf Raise (Machine)", sets: 2, weightLb: 140, reps: 12, restSeconds: 90 },
    { exercise: "Hanging Leg Raise", sets: 4, weightLb: null, reps: 15, restSeconds: 75 },
  ]);

  if (addDays(monday, 2) <= today) addSession(0, 2, "07:00", "Upper", 3_900, [
    { exercise: "Incline Bench Press (Dumbbell)", sets: 4, weightLb: 65, reps: 10, restSeconds: 150 },
    { exercise: "Bent Over Row (Barbell)", sets: 3, weightLb: 155, reps: 8, restSeconds: 150 },
    { exercise: "Overhead Press (Barbell)", sets: 3, weightLb: 105, reps: 8, restSeconds: 180 },
    { exercise: "Bicep Curl (Dumbbell)", sets: 3, weightLb: 30, reps: 10, restSeconds: 90 },
    { exercise: "Triceps Pushdown (Cable)", sets: 2, weightLb: 50, reps: 10, restSeconds: 90 },
    { exercise: "Face Pull (Cable)", sets: 2, weightLb: 45, reps: 10, restSeconds: 90 },
    { exercise: "Lateral Raise (Dumbbell)", sets: 2, weightLb: 20, reps: 10, restSeconds: 90 },
  ]);
  if (addDays(monday, 4) <= today) addSession(0, 4, "07:00", "Lower", 3_450, [
    { exercise: "Squat (Barbell)", sets: 4, weightLb: 225, reps: 8, restSeconds: 180 },
    { exercise: "Romanian Deadlift (Barbell)", sets: 3, weightLb: 205, reps: 8, restSeconds: 180 },
    { exercise: "Standing Calf Raise (Machine)", sets: 2, weightLb: 140, reps: 12, restSeconds: 90 },
    { exercise: "Hanging Leg Raise", sets: 4, weightLb: null, reps: 15, restSeconds: 75 },
  ]);

  return sets;
}

function demoMedicationDoses(today: string): MedicationDose[] {
  const doses: MedicationDose[] = [];
  const dueDay = utcDay(today);
  for (let offset = -29; offset <= 0; offset += 1) {
    const date = addDays(today, offset);
    doses.push({ medicationId: "demo-daily", date, taken: offset !== -17 });
    if (utcDay(date) === dueDay) doses.push({ medicationId: "demo-weekly", date, taken: true });
  }
  return doses;
}

function demoLabs(today: string): LabResult[] {
  return [
    { id: "demo-ldl-1", name: "LDL cholesterol", date: addDays(today, -210), value: 121, unit: "mg/dL", referenceLow: 0, referenceHigh: 100, note: "", ask: false },
    { id: "demo-ldl-2", name: "LDL cholesterol", date: addDays(today, -120), value: 114, unit: "mg/dL", referenceLow: 0, referenceHigh: 100, note: "", ask: false },
    { id: "demo-ldl-3", name: "LDL cholesterol", date: addDays(today, -30), value: 108, unit: "mg/dL", referenceLow: 0, referenceHigh: 100, note: "", ask: false },
    { id: "demo-vitd-1", name: "Vitamin D", date: addDays(today, -210), value: 24, unit: "ng/mL", referenceLow: 30, referenceHigh: 100, note: "", ask: false },
    { id: "demo-vitd-2", name: "Vitamin D", date: addDays(today, -120), value: 31, unit: "ng/mL", referenceLow: 30, referenceHigh: 100, note: "", ask: false },
    { id: "demo-vitd-3", name: "Vitamin D", date: addDays(today, -30), value: 38, unit: "ng/mL", referenceLow: 30, referenceHigh: 100, note: "", ask: false },
    { id: "demo-a1c-1", name: "Hemoglobin A1c", date: addDays(today, -210), value: 5.5, unit: "%", referenceLow: 4, referenceHigh: 5.6, note: "", ask: false },
    { id: "demo-a1c-2", name: "Hemoglobin A1c", date: addDays(today, -30), value: 5.3, unit: "%", referenceLow: 4, referenceHigh: 5.6, note: "", ask: false },
    { id: "demo-ferritin-1", name: "Ferritin", date: addDays(today, -120), value: 68, unit: "ng/mL", referenceLow: 30, referenceHigh: 400, note: "", ask: false },
    { id: "demo-ferritin-2", name: "Ferritin", date: addDays(today, -30), value: 74, unit: "ng/mL", referenceLow: 30, referenceHigh: 400, note: "", ask: false },
  ];
}

/**
 * A date-relative record made entirely from invented values.
 *
 * Demo mode never merges this with a saved record. Its caller keeps it in
 * memory and drops it on reload, so trying the app cannot read or replace the
 * private D1 record, the browser fallback, or local progress photos.
 */
export function demoHealthState(today: string, asOfTime = "12:00"): HealthState {
  const dueDay = utcDay(today);
  // Today stays populated even when opened early, without future event times.
  const morningTime = asOfTime < "09:00" ? asOfTime : "09:00";
  const journalTime = asOfTime < "10:30" ? asOfTime : "10:30";
  const dailyEntries = demoDailyEntries(today);
  return normalizeHealthState({
    version: 1,
    updatedAt: `${today}T12:00:00.000Z`,
    medications: [
      { id: "demo-daily", name: "Demo daily tablet", schedule: "daily", dueDay: null, archived: false },
      { id: "demo-weekly", name: "Demo weekly dose", schedule: "weekly", dueDay, archived: false },
    ],
    medicationDoses: demoMedicationDoses(today),
    dailyEntries,
    sleepEntries: demoSleepEntries(today),
    labResults: demoLabs(today),
    workoutSets: demoWorkoutSets(today),
    therapyNotes: [
      { id: "demo-note-1", date: addDays(today, -8), text: "An unfinished conversation.", shared: true, sharedDate: addDays(today, -6) },
      { id: "demo-note-2", date: addDays(today, -2), text: "A decision I keep postponing.", shared: false, sharedDate: "" },
    ],
    thoughtLoops: [
      { id: "demo-loop-1", name: "Rumination", reply: "Choose one useful next step, then return to the day.", createdAt: addDays(today, -55), archived: false },
      { id: "demo-loop-2", name: "Needing to be certain", reply: "Leave room for uncertainty and decide at the time I set.", createdAt: addDays(today, -9), archived: false },
    ],
    loopEvents: demoLoopEvents(today),
    habits: [
      { id: "demo-habit-1", name: "Masturbation", createdAt: addDays(today, -49), archived: false },
      { id: "demo-caffeine", name: "Caffeine", createdAt: addDays(today, -14), archived: false, caffeine: { dailyLimitMg: 300, cutoffTime: "14:00", usualDoseMg: 100 } },
    ],
    habitEvents: [...demoHabitEvents(today),
      { id: "demo-caffeine-today", habitId: "demo-caffeine", at: `${today}T${morningTime}`, date: today, kind: "intake", amountMg: 150 },
      ...Array.from({ length: 14 }, (_, index) => {
      const date = addDays(today, -index - 1);
      return { id: `demo-caffeine-${index}`, habitId: "demo-caffeine", at: `${date}T09:00`, date, kind: "intake", amountMg: index < 7 ? 200 : 300 };
    })],
    thoughtJournal: [
      {
        id: "demo-thought-today",
        date: today,
        createdAt: `${today}T${journalTime}:00`,
        source: "manual",
        title: "A little more room",
        text: "I left my phone at home for a short walk. The task I had been putting off felt smaller when I got back. Tomorrow I want to leave the same space before opening my inbox.",
      },
      {
        id: "demo-thought-1",
        date: addDays(today, -1),
        createdAt: `${addDays(today, -1)}T20:15:00.000Z`,
        source: "manual",
        title: "An unfinished task",
        text: "I changed the order of two tasks. The first took longer than expected.",
      },
      {
        id: "demo-thought-2",
        date: addDays(today, -4),
        createdAt: `${addDays(today, -4)}T09:30:00.000Z`,
        source: "apple-notes",
        title: "After a meeting",
        text: "I had a question but did not ask it. I wrote it down afterward.",
      },
      {
        id: "demo-thought-3",
        date: addDays(today, -9),
        createdAt: `${addDays(today, -9)}T18:40:00.000Z`,
        source: "manual",
        title: "An open decision",
        text: "I made a shortlist of two options and set a date to choose.",
      },
    ],
    progressPhotos: [
      {
        id: "demo-progress-earlier",
        date: addDays(today, -42),
        weightLb: dailyEntries[17].weightLb,
        bodyFatPercent: dailyEntries[17].bodyFatPercent,
        note: "Fictional example · generated image",
      },
      {
        id: "demo-progress-middle",
        date: addDays(today, -21),
        weightLb: dailyEntries[38].weightLb,
        bodyFatPercent: dailyEntries[38].bodyFatPercent,
        note: "Fictional example · generated image",
      },
      {
        id: "demo-progress-recent",
        date: today,
        weightLb: dailyEntries[59].weightLb,
        bodyFatPercent: dailyEntries[59].bodyFatPercent,
        note: "Fictional example · generated image",
      },
    ],
    goals: {
      sleepHours: 8.2,
      sleepConsistencyMinutes: 60,
      trackMedication: true,
      weightGoalLb: 190,
      weightDirection: "lose",
      phaseStart: addDays(today, -35),
      weeklyRateLb: 0.75,
      proteinTargetG: 180,
      bodyFatTargetPercent: 16,
      trainingDays: [],
      trainingSessionMinutes: 75,
      addedSets: [],
      // The demo always opens on build week one. Its anchor is frozen exactly
      // as a real block's would be, so browsing or editing the sample does not
      // make the four-week ramp move underneath the screenshots.
      trainingBlockStart: weekStart(today),
      trainingAnchorSets: {
        chest: 8,
        back: 8,
        shoulders: 6,
        rearDelts: 4,
        biceps: 5,
        triceps: 5,
        quads: 6,
        hamstrings: 5,
        glutes: 4,
        calves: 4,
        core: 8,
      },
    },
  });
}

/**
 * Eight weeks of one loop coming up less and less, mostly in the evenings, and
 * a newer loop that has only just been named. Deterministic, so the demo reads
 * the same every time.
 */
function demoLoopEvents(today: string): Array<{ id: string; loopId: string; at: string; date: string; move: string; recurrence?: string; response?: string }> {
  const perWeek = [12, 10, 9, 8, 6, 5, 4, 2];
  const hours = [21, 19, 22, 20, 8, 21, 18, 23, 20];
  // Early weeks it pulled them in more often than not; lately it mostly passes.
  const early = ["hooked", "hooked", "passed", "hooked", "passed", "hooked", "passed", "noticed", "hooked"];
  const late = ["passed", "passed", "passed", "passed", "hooked", "passed", "passed", "noticed", "passed"];
  const events: Array<{ id: string; loopId: string; at: string; date: string; move: string; recurrence?: string; response?: string }> = [];
  perWeek.forEach((count, weekIndex) => {
    const weekEnd = addDays(today, -(perWeek.length - 1 - weekIndex) * 7);
    for (let n = 0; n < count; n += 1) {
      const date = addDays(weekEnd, -((n * 3) % 7));
      if (date > today) continue;
      const hour = hours[n % hours.length];
      events.push({
        id: `demo-loop-1-${weekIndex}-${n}`,
        loopId: "demo-loop-1",
        at: date === today ? `${date}T00:00` : `${date}T${String(hour).padStart(2, "0")}:${n % 2 ? "40" : "15"}`,
        date,
        recurrence: weekIndex < 3 ? "often" : n % 2 ? "few" : "once",
        move: (weekIndex < 3 ? early : late)[n % early.length],
        ...(weekIndex >= 6 ? { response: n % 2 ? "I noticed the worry, put my phone down, and went back to cooking." : "I picked one small task for tomorrow and went for a walk." } : {}),
      });
    }
  });
  for (let n = 0; n < 5; n += 1) {
    const date = addDays(today, -(n * 2));
    events.push({ id: `demo-loop-2-${n}`, loopId: "demo-loop-2", at: date === today ? `${date}T00:00` : `${date}T${n % 2 ? "07" : "13"}:05`, date, recurrence: n % 2 ? "often" : "few", move: n === 0 ? "noticed" : "passed", response: n === 0 ? "I left the decision until Friday and carried on with my afternoon." : "I wrote down the next step and stopped comparing the options." });
  }
  return events;
}

/** Seven weeks of a habit being cut back: slips falling, urges still passing. */
function demoHabitEvents(today: string): Array<{ id: string; habitId: string; at: string; date: string; kind: string }> {
  const slipsPerWeek = [6, 5, 4, 3, 3, 2, 1];
  const events: Array<{ id: string; habitId: string; at: string; date: string; kind: string }> = [];
  slipsPerWeek.forEach((count, weekIndex) => {
    const weekEnd = addDays(today, -(slipsPerWeek.length - 1 - weekIndex) * 7);
    for (let n = 0; n < count; n += 1) {
      const date = addDays(weekEnd, -((n * 2 + 1) % 7));
      if (date > today) continue;
      events.push({ id: `demo-habit-1-slip-${weekIndex}-${n}`, habitId: "demo-habit-1", at: `${date}T23:${n % 2 ? "40" : "10"}`, date, kind: "slip" });
    }
    for (let n = 0; n < 3; n += 1) {
      const date = addDays(weekEnd, -((n * 3) % 7));
      if (date > today) continue;
      events.push({ id: `demo-habit-1-urge-${weekIndex}-${n}`, habitId: "demo-habit-1", at: `${date}T22:${n % 2 ? "30" : "05"}`, date, kind: "urge" });
    }
  });
  return events;
}

/** Synthetic Strong export for the import preview. */
export function demoStrongCsv(today: string): string {
  const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows: unknown[][] = [["Date", "Workout Name", "Duration", "Exercise Name", "Set Order", "Weight (lb)", "Reps", "Distance", "Seconds", "RPE"]];
  for (const set of demoWorkoutSets(today).filter(set => set.date <= today)) {
    const duration = `${Math.round((set.durationSeconds ?? 0) / 60)}m`;
    rows.push([set.startedAt.replace("T", " "), set.workoutName, duration, set.exercise, set.setNumber, set.weightLb, set.reps, "", "", set.rpe]);
    if (set.restSeconds !== null) rows.push([set.startedAt.replace("T", " "), set.workoutName, duration, set.exercise, "Rest Timer", "", "", "", set.restSeconds, ""]);
  }
  return rows.map(row => row.map(cell).join(",")).join("\n");
}
