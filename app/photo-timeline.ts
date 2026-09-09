import type { ProgressPhoto } from "./health-model";

/** Dates run left to right. IDs keep same-day photographs in a stable order. */
export function photoTimeline(photos: ProgressPhoto[], today: string): ProgressPhoto[] {
  return photos.filter(photo => photo.date <= today).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Repair stale selections after an upload, deletion, date edit or restore. */
export function photoSelection(photos: ProgressPhoto[], selectedId?: string | null, fromId?: string | null, toId?: string | null) {
  const selected = photos.find(photo => photo.id === selectedId) ?? photos.at(-1) ?? null;
  if (photos.length < 2) return { selected, index: selected ? 0 : -1, from: null, to: selected, days: null };
  let fromIndex = photos.findIndex(photo => photo.id === fromId);
  let toIndex = photos.findIndex(photo => photo.id === toId);
  if (fromIndex < 0) fromIndex = 0;
  if (toIndex < 0) toIndex = photos.length - 1;
  if (fromIndex === toIndex) {
    if (fromIndex > 0) fromIndex -= 1;
    else toIndex += 1;
  }
  if (fromIndex > toIndex) [fromIndex, toIndex] = [toIndex, fromIndex];
  const from = photos[fromIndex];
  const to = photos[toIndex];
  const days = Math.round((Date.parse(`${to.date}T12:00:00Z`) - Date.parse(`${from.date}T12:00:00Z`)) / 86_400_000);
  return { selected, index: photos.findIndex(photo => photo.id === selected?.id), from, to, days };
}

export function photoDateOption(photo: ProgressPhoto, photos: ProgressPhoto[]): string {
  const onDate = photos.filter(item => item.date === photo.date);
  return onDate.length > 1 ? ` · Photo ${onDate.findIndex(item => item.id === photo.id) + 1}` : "";
}

export function photoInterval(days: number): string {
  if (!days) return "Same day";
  if (days % 7 === 0) return `${days / 7} ${days === 7 ? "week" : "weeks"} apart`;
  return `${days} ${days === 1 ? "day" : "days"} apart`;
}
