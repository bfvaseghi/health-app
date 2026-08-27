import { addDays, validIsoDate } from "./health-model";

export type ThoughtJournalShortcutPayload = {
  text: string;
  title: string;
  date: string;
  createdAt: string;
  sourceKey: string;
};

export type ThoughtJournalShortcutResult =
  | { ok: true; value: ThoughtJournalShortcutPayload }
  | { ok: false; error: string };

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Strict input boundary for an iPhone Shortcut. Nothing except note text and metadata passes it. */
export function parseThoughtJournalShortcut(
  value: unknown,
  today: string,
): ThoughtJournalShortcutResult {
  const record = recordValue(value);
  if (!record) return { ok: false, error: "Send a JSON object containing text." };

  if (typeof record.text !== "string" || !record.text.trim()) {
    return { ok: false, error: "Thought text is required." };
  }
  const text = record.text.trim();
  if (text.length > 10_000) return { ok: false, error: "Thought text must be 10,000 characters or less." };

  if (record.title !== undefined && typeof record.title !== "string") {
    return { ok: false, error: "Title must be text." };
  }
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (title.length > 160) return { ok: false, error: "Title must be 160 characters or less." };

  if (record.createdAt !== undefined && typeof record.createdAt !== "string") {
    return { ok: false, error: "Created time must be an ISO timestamp." };
  }
  const rawCreatedAt = typeof record.createdAt === "string" ? record.createdAt.trim() : "";
  const parsedCreatedAt = rawCreatedAt ? Date.parse(rawCreatedAt) : Number.NaN;
  if (rawCreatedAt && !Number.isFinite(parsedCreatedAt)) {
    return { ok: false, error: "Created time must be an ISO timestamp." };
  }
  const createdAt = rawCreatedAt ? new Date(parsedCreatedAt).toISOString() : "";
  if (createdAt && createdAt.slice(0, 10) > addDays(today, 1)) {
    return { ok: false, error: "Created time cannot be in the future." };
  }

  if (record.date !== undefined && typeof record.date !== "string") {
    return { ok: false, error: "Date must use YYYY-MM-DD." };
  }
  const date = typeof record.date === "string" && record.date.trim()
    ? record.date.trim()
    : rawCreatedAt.slice(0, 10) || today;
  if (!validIsoDate(date)) return { ok: false, error: "Date must use YYYY-MM-DD." };
  // The worker's calendar is UTC. A phone just east of midnight may already be
  // on tomorrow locally, so tolerate one day without permitting arbitrary
  // future-dated notes to take over the journal chronology.
  if (date > addDays(today, 1)) return { ok: false, error: "Thought date cannot be in the future." };

  const rawSourceKey = record.sourceKey ?? record.externalId;
  if (rawSourceKey !== undefined && typeof rawSourceKey !== "string") {
    return { ok: false, error: "Source key must be text." };
  }
  const sourceKey = typeof rawSourceKey === "string" ? rawSourceKey.trim() : "";
  if (sourceKey.length > 160) return { ok: false, error: "Source key must be 160 characters or less." };

  return { ok: true, value: { text, title, date, createdAt, sourceKey } };
}

export function thoughtJournalFingerprint(value: ThoughtJournalShortcutPayload): string {
  return value.sourceKey || (value.createdAt
    ? `${value.createdAt}\n${value.title}`
    : `${value.date}\n${value.title}\n${value.text}`);
}
