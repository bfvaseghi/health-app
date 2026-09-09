import type { HealthState } from "./health-model";
import { buildWorkoutSessions, preferredSleepEntries } from "./health-model";

export function recordDates(state: HealthState, through: string): string[] {
  const rows = [
    ...state.dailyEntries, ...state.sleepEntries, ...state.workoutSets,
    ...state.medicationDoses, ...state.labResults, ...state.thoughtJournal,
    ...state.therapyNotes, ...state.loopEvents, ...state.habitEvents, ...state.progressPhotos,
  ];
  return [...new Set(rows.map((row) => row.date).filter((date) => date <= through))].sort();
}

export function recordDay(state: HealthState, date: string) {
  const sets = state.workoutSets.filter((row) => row.date === date);
  return {
    date,
    daily: state.dailyEntries.find((row) => row.date === date) ?? null,
    sleep: preferredSleepEntries(state.sleepEntries).find((row) => row.date === date) ?? null,
    sleepSources: state.sleepEntries.filter((row) => row.date === date),
    sessions: buildWorkoutSessions(sets),
    sets,
    doses: state.medicationDoses.filter((row) => row.date === date).map((dose) => ({
      ...dose, name: state.medications.find((row) => row.id === dose.medicationId)?.name ?? "Medication",
    })),
    labs: state.labResults.filter((row) => row.date === date),
    journal: state.thoughtJournal.filter((row) => row.date === date),
    therapy: state.therapyNotes.filter((row) => row.date === date),
    thoughts: state.loopEvents.filter((row) => row.date === date).map((event) => ({
      ...event, name: state.thoughtLoops.find((row) => row.id === event.loopId)?.name ?? "Recurring thought",
    })),
    habits: state.habitEvents.filter((row) => row.date === date).map((event) => ({
      ...event, name: state.habits.find((row) => row.id === event.habitId)?.name ?? "Habit",
    })),
    photos: state.progressPhotos.filter((row) => row.date === date),
  };
}
