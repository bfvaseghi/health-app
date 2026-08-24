/**
 * Local-calendar date helpers, shared by every model in the app.
 *
 * Extracted so that `health-model.ts` and `therapy-model.ts` can both use them
 * without importing each other. Dates are local-calendar keys (`YYYY-MM-DD`),
 * never UTC timestamps: a journal entry written at 11pm belongs to that
 * evening.
 */

const DAY_MS = 86_400_000;

export function todayLocal(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function addDays(value: string, amount: number): string {
  const safe = validIsoDate(value) ? value : todayLocal();
  const [year, month, day] = safe.split("-").map(Number);
  const safeAmount = Number.isFinite(amount) ? Math.trunc(amount) : 0;
  const date = new Date(Date.UTC(year, month - 1, day + safeAmount));
  return date.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  if (!validIsoDate(a) || !validIsoDate(b)) return 0;
  const toUtc = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

export function dateLabel(value: string, options?: Intl.DateTimeFormatOptions): string {
  if (!validIsoDate(value)) return "Unknown date";
  const [year, month, day] = value.split("-").map(Number);
  const formatOptions = options ?? { month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-US", {
    ...formatOptions,
    timeZone: formatOptions.timeZone ?? "UTC",
  }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
