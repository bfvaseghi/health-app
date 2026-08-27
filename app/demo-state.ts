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
      caloriesKcal: Math.round(2_350 + ((index * 97) % 360)),
      medicationTaken: null,
      journaled: day === 0 || day === 3 || day === 5,
      meditationMinutes: day === 1 || day === 2 || day === 4 || day === 6 ? (index % 3 === 0 ? 15 : 10) : null,
      meditationNote: "",
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

  // A light first week gives the block a clean anchor and a complete movement
  // vocabulary without pretending the demo user arrived with years of data.
  addSession(-4, 0, "07:00", "Full body", 3_900, [
    { exercise: "Incline Bench Press (Dumbbell)", sets: 1, weightLb: 60, reps: 8, restSeconds: 150 },
    { exercise: "Lat Pulldown (Cable)", sets: 1, weightLb: 125, reps: 8, restSeconds: 150 },
    { exercise: "Overhead Press (Barbell)", sets: 1, weightLb: 100, reps: 7, restSeconds: 180 },
    { exercise: "Lateral Raise (Dumbbell)", sets: 1, weightLb: 17.5, reps: 10, restSeconds: 90 },
    { exercise: "Face Pull (Cable)", sets: 1, weightLb: 45, reps: 12, restSeconds: 90 },
    { exercise: "Bicep Curl (Dumbbell)", sets: 1, weightLb: 27.5, reps: 9, restSeconds: 90 },
    { exercise: "Triceps Pushdown (Cable)", sets: 1, weightLb: 45, reps: 9, restSeconds: 90 },
    { exercise: "Squat (Barbell)", sets: 1, weightLb: 215, reps: 7, restSeconds: 180 },
    { exercise: "Romanian Deadlift (Barbell)", sets: 1, weightLb: 195, reps: 7, restSeconds: 180 },
    { exercise: "Standing Calf Raise (Machine)", sets: 1, weightLb: 130, reps: 10, restSeconds: 90 },
    { exercise: "Hanging Leg Raise", sets: 1, weightLb: null, reps: 12, restSeconds: 75 },
  ]);

  for (const relativeWeek of [-2, -1]) {
    const newer = relativeWeek === -1;
    addSession(relativeWeek, 0, "07:00", "Upper", 3_300, [
      { exercise: "Bench Press (Barbell)", sets: 2, weightLb: 185, reps: newer ? 9 : 8, restSeconds: 180 },
      { exercise: "Bent Over Row (Barbell)", sets: 2, weightLb: 155, reps: 8, restSeconds: 150 },
      { exercise: "Overhead Press (Barbell)", sets: 2, weightLb: 105, reps: newer ? 8 : 7, restSeconds: 180 },
      { exercise: "Bicep Curl (Dumbbell)", sets: 2, weightLb: 30, reps: newer ? 9 : 8, restSeconds: 90 },
      { exercise: "Triceps Pushdown (Cable)", sets: 2, weightLb: 50, reps: newer ? 9 : 8, restSeconds: 90 },
    ]);
    addSession(relativeWeek, 2, "07:00", "Lower", 3_600, [
      { exercise: "Squat (Barbell)", sets: 3, weightLb: 225, reps: 8, restSeconds: 180 },
      { exercise: "Romanian Deadlift (Barbell)", sets: 3, weightLb: 205, reps: 8, restSeconds: 180 },
      { exercise: "Standing Calf Raise (Machine)", sets: 2, weightLb: 140, reps: newer ? 11 : 10, restSeconds: 90 },
      { exercise: "Hanging Leg Raise", sets: 2, weightLb: null, reps: 14, restSeconds: 75 },
    ]);
  }

  addSession(-2, 4, "07:00", "Full", 3_900, [
    { exercise: "Incline Bench Press (Dumbbell)", sets: 2, weightLb: 65, reps: 9, restSeconds: 150 },
    { exercise: "Lat Pulldown (Cable)", sets: 2, weightLb: 130, reps: 9, restSeconds: 150 },
    { exercise: "Leg Press (Machine)", sets: 2, weightLb: 300, reps: 8, restSeconds: 180 },
    { exercise: "Seated Leg Curl (Machine)", sets: 2, weightLb: 100, reps: 10, restSeconds: 90 },
    { exercise: "Romanian Deadlift (Barbell)", sets: 2, weightLb: 205, reps: 8, restSeconds: 150 },
    { exercise: "Lateral Raise (Dumbbell)", sets: 2, weightLb: 20, reps: 10, restSeconds: 90 },
  ]);
  addSession(-1, 4, "07:00", "Full", 3_900, [
    { exercise: "Bench Press (Barbell)", sets: 2, weightLb: 185, reps: [10, 10], restSeconds: 180 },
    { exercise: "Bent Over Row (Barbell)", sets: 1, weightLb: 155, reps: 8, restSeconds: 150 },
    { exercise: "Leg Press (Machine)", sets: 2, weightLb: 300, reps: 9, restSeconds: 180 },
    { exercise: "Seated Leg Curl (Machine)", sets: 2, weightLb: 100, reps: 10, restSeconds: 90 },
    { exercise: "Romanian Deadlift (Barbell)", sets: 2, weightLb: 205, reps: 8, restSeconds: 150 },
    { exercise: "Lateral Raise (Dumbbell)", sets: 2, weightLb: 20, reps: 11, restSeconds: 90 },
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
    { id: "demo-ldl-1", name: "LDL cholesterol", date: addDays(today, -210), value: 121, unit: "mg/dL", referenceLow: 0, referenceHigh: 100, note: "" },
    { id: "demo-ldl-2", name: "LDL cholesterol", date: addDays(today, -120), value: 114, unit: "mg/dL", referenceLow: 0, referenceHigh: 100, note: "" },
    { id: "demo-ldl-3", name: "LDL cholesterol", date: addDays(today, -30), value: 108, unit: "mg/dL", referenceLow: 0, referenceHigh: 100, note: "" },
    { id: "demo-vitd-1", name: "Vitamin D", date: addDays(today, -210), value: 24, unit: "ng/mL", referenceLow: 30, referenceHigh: 100, note: "" },
    { id: "demo-vitd-2", name: "Vitamin D", date: addDays(today, -120), value: 31, unit: "ng/mL", referenceLow: 30, referenceHigh: 100, note: "" },
    { id: "demo-vitd-3", name: "Vitamin D", date: addDays(today, -30), value: 38, unit: "ng/mL", referenceLow: 30, referenceHigh: 100, note: "" },
    { id: "demo-a1c-1", name: "Hemoglobin A1c", date: addDays(today, -210), value: 5.5, unit: "%", referenceLow: 4, referenceHigh: 5.6, note: "" },
    { id: "demo-a1c-2", name: "Hemoglobin A1c", date: addDays(today, -30), value: 5.3, unit: "%", referenceLow: 4, referenceHigh: 5.6, note: "" },
    { id: "demo-ferritin-1", name: "Ferritin", date: addDays(today, -120), value: 68, unit: "ng/mL", referenceLow: 30, referenceHigh: 400, note: "" },
    { id: "demo-ferritin-2", name: "Ferritin", date: addDays(today, -30), value: 74, unit: "ng/mL", referenceLow: 30, referenceHigh: 400, note: "" },
  ];
}

/**
 * A date-relative record made entirely from invented values.
 *
 * Demo mode never merges this with a saved record. Its caller keeps it in
 * memory and drops it on reload, so trying the app cannot read or replace the
 * private D1 record, the browser fallback, or local progress photos.
 */
export function demoHealthState(today: string): HealthState {
  const dueDay = utcDay(today);
  return normalizeHealthState({
    version: 1,
    updatedAt: `${today}T12:00:00.000Z`,
    medications: [
      { id: "demo-daily", name: "Demo daily tablet", schedule: "daily", dueDay: null, archived: false },
      { id: "demo-weekly", name: "Demo weekly dose", schedule: "weekly", dueDay, archived: false },
    ],
    medicationDoses: demoMedicationDoses(today),
    dailyEntries: demoDailyEntries(today),
    sleepEntries: demoSleepEntries(today),
    labResults: demoLabs(today),
    workoutSets: demoWorkoutSets(today),
    therapyNotes: [
      { id: "demo-note-1", date: addDays(today, -8), text: "Synthetic example: ask what made the rushed day feel different.", shared: true, sharedDate: addDays(today, -6) },
      { id: "demo-note-2", date: addDays(today, -2), text: "Synthetic example: practise one short pause before answering.", shared: false, sharedDate: "" },
    ],
    progressPhotos: [],
    goals: {
      sleepHours: 8.2,
      sleepConsistencyMinutes: 60,
      trackMedication: true,
      weightGoalLb: 190,
      weightDirection: "lose",
      proteinTargetG: 180,
      bodyFatTargetPercent: 16,
      trainingDays: [],
      addedSets: [],
      trainingBlockStart: "",
      trainingAnchorSets: {},
    },
  });
}
