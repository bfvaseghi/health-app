/** Small browser-side helpers shared by the views. Anything that reasons about
 * health data itself belongs in `health-model.ts`, not here. */

import { formatClock } from "../health-model";

export function formatTime(value: string): string {
  return formatClock(value) ?? "Unknown";
}

export function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function formatMetric(label: string, value: number): string {
  if (label === "Steps") return Math.round(value).toLocaleString("en-US");
  if (label === "Weight") return `${value.toFixed(1)} lb`;
  if (label === "Sleep") return `${value.toFixed(1)} h`;
  if (label === "Resting heart rate") return `${Math.round(value)} bpm`;
  if (label === "Body fat") return `${value.toFixed(1)}%`;
  if (label === "Protein") return `${Math.round(value)} g`;
  if (label === "Volume") return `${Math.round(value).toLocaleString("en-US")} lb`;
  if (label === "Est. 1RM") return `${Math.round(value)} lb`;
  if (label === "Reps") return `${Math.round(value)}`;
  if (label === "HRV") return `${Math.round(value)} ms`;
  return value.toFixed(1);
}

export function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1_024) return `${Math.round(bytes)} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

function download(name: string, type: string, contents: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function downloadJson(name: string, value: unknown) {
  download(name, "application/json", JSON.stringify(value, null, 2));
}

export function downloadCsv(name: string, contents: string) {
  download(name, "text/csv;charset=utf-8", contents);
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/** "chest", "chest and back", "chest, back and 6 others". */
export function listWords(words: string[], cap = 3): string {
  if (words.length <= 1) return words[0] ?? "";
  if (words.length <= cap) return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  const rest = words.length - cap;
  return `${words.slice(0, cap).join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`;
}
