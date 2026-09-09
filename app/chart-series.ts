import type { SeriesPoint } from "./series";

export type PlotPoint = { date: string; value: number; position: number };

export function plotSeries(data: SeriesPoint[]): { points: PlotPoint[]; segments: PlotPoint[][]; gaps: Array<[PlotPoint, PlotPoint]> } {
  const points: PlotPoint[] = [];
  const segments: PlotPoint[][] = [];
  const first = Date.parse(`${data[0]?.date}T00:00:00Z`);
  const last = Date.parse(`${data.at(-1)?.date}T00:00:00Z`);
  let segment: PlotPoint[] = [];
  for (const [index, point] of data.entries()) {
    if (point.value === null || !Number.isFinite(point.value)) {
      if (segment.length) segments.push(segment);
      segment = [];
      continue;
    }
    const time = Date.parse(`${point.date}T00:00:00Z`);
    const position = last > first && Number.isFinite(time) ? (time - first) / (last - first) : data.length > 1 ? index / (data.length - 1) : 0.5;
    const plotted = { date: point.date, value: point.value, position };
    points.push(plotted);
    segment.push(plotted);
  }
  if (segment.length) segments.push(segment);
  const gaps = segments.slice(1).map((segment, index): [PlotPoint, PlotPoint] => [segments[index].at(-1)!, segment[0]]);
  return { points, segments, gaps };
}
