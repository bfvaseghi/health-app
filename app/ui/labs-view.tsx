"use client";

import { useMemo, useState } from "react";
import { HealthState, buildLabTrends, dateLabel, filterLabTrends, labAskReason, labRangeStatus } from "../health-model";
import { Sparkline } from "./charts";
import { Icon } from "./icons";
import { ConfirmButton } from "./primitives";
import { Modal } from "./types";

export function LabsView({
  state,
  open,
  onDeleteLab,
  onAskLab,
}: {
  state: HealthState;
  open: (modal: Modal) => void;
  onDeleteLab: (id: string) => void;
  onAskLab: (id: string, ask: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const trends = useMemo(() => buildLabTrends(state.labResults), [state.labResults]);
  const flagged = trends.filter((trend) => labAskReason(trend) !== null);
  const shown = useMemo(
    () => filterLabTrends(trends, query).filter((trend) => filter === "all" || labAskReason(trend) !== null),
    [trends, query, filter],
  );

  return (
    <div className="page tl-page">
      <div className="tl-section-head">
        <span className="tl-caps">{trends.length ? `Labs · ${trends.length} ${trends.length === 1 ? "marker" : "markers"}` : "Labs"}</span>
        <button type="button" className="text-button" onClick={() => open({ kind: "lab" })}>
          <Icon name="plus" /> Add a result
        </button>
      </div>
      <h1 className="tl-hero" tabIndex={-1}>
        {!trends.length
          ? "No results yet."
          : flagged.length === 0
            ? "All within range."
            : flagged.length === 1
              ? "One result to ask about."
              : `${flagged.length} results to ask about.`}
      </h1>
      <p className="tl-lede">
        {!trends.length
          ? "Add a result with the reference range printed on the report. Results stay grouped by test and unit."
          : flagged.length
            ? `${flagged.map((trend) => `${trend.name} ${labAskReason(trend) === "outside range" ? trend.status : "flagged"}`).join(" · ")} · latest ${dateLabel(
                [...trends].sort((a, b) => b.latest.date.localeCompare(a.latest.date))[0].latest.date,
                { month: "long", day: "numeric", year: "numeric" },
              )}`
            : `${trends.length - flagged.length} within range or unrated · latest ${dateLabel(
                [...trends].sort((a, b) => b.latest.date.localeCompare(a.latest.date))[0].latest.date,
                { month: "long", day: "numeric", year: "numeric" },
              )}`}
      </p>

      <section className="tl-section" aria-labelledby="labs-results-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="labs-results-title" style={{ margin: 0 }}>Results</h2>
          {trends.length ? (
            <div className="tl-tabs" role="group" aria-label="Filter lab status">
              <button type="button" className={filter === "all" ? "active" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
                {`All ${trends.length}`}
              </button>
              <button type="button" className={filter === "flagged" ? "active" : ""} aria-pressed={filter === "flagged"} onClick={() => setFilter("flagged")}>
                {`Flagged ${flagged.length}`}
              </button>
            </div>
          ) : null}
        </div>

        {trends.length ? (
          <div className="search-field tl-search">
            <Icon name="search" />
            <input
              type="search"
              value={query}
              placeholder="Filter by test name"
              aria-label="Filter lab results by test name"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        ) : null}

        {trends.length ? (
          shown.length ? (
            <ul className="tl-list">
              {shown.map((trend) => {
                const isOpen = expanded === trend.key;
                const history = [...trend.results].reverse();
                const flaggedTrend = trend.status === "low" || trend.status === "high";
                const reference =
                  trend.latest.referenceLow === null && trend.latest.referenceHigh === null
                    ? "no range entered"
                    : `ref ${trend.latest.referenceLow ?? "—"}\u2011${trend.latest.referenceHigh ?? "—"}`;
                return (
                  <li key={trend.key} className="tl-lab">
                    <div className="tl-row is-static">
                      <span className="tl-row-copy">
                        <b>{trend.name}</b>
                        <small>
                          {trend.results.length === 1
                            ? `measured ${dateLabel(trend.latest.date, { month: "short", day: "numeric", year: "numeric" })}`
                            : `${trend.results.length} results · latest ${dateLabel(trend.latest.date, { month: "short", day: "numeric", year: "numeric" })}`}
                          {` · ${reference}`}
                          {trend.change === null ? "" : ` · ${trend.change > 0 ? "+" : ""}${Number(trend.change.toFixed(2))} since last`}
                        </small>
                      </span>
                      <span className="spark-slot">
                        <Sparkline
                          values={history
                            .map((result) => result.value)
                            .filter((value): value is number => value !== null)}
                          label={`${trend.name} history`}
                        />
                      </span>
                      <span className={flaggedTrend ? "tl-row-end down" : "tl-row-end"}>
                        {trend.latest.value === null ? "—" : trend.latest.value}
                        {trend.latest.value === null ? null : <small>{trend.latest.unit}</small>}
                      </span>
                    </div>
                    <div className="tl-lab-foot">
                      <span className="tl-lab-status">
                        <span className={`range-badge ${trend.status}`}>{trend.status}</span>
                        <button
                          type="button"
                          className={trend.latest.ask ? "chip primary small" : "chip small"}
                          aria-pressed={trend.latest.ask}
                          onClick={() => onAskLab(trend.latest.id, !trend.latest.ask)}
                        >
                          <Icon name="summary" />
                          {trend.latest.ask ? "On the doctor list" : "Ask my doctor"}
                        </button>
                      </span>
                      <div className="row-actions">
                        {trend.results.length > 1 ? (
                          <button
                            type="button"
                            className="row-action"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? `Hide ${trend.name} history` : `Show ${trend.name} history`}
                            onClick={() => setExpanded((current) => (current === trend.key ? null : trend.key))}
                          >
                            <Icon name="history" />
                            <span>{isOpen ? "Hide" : "History"}</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="row-action"
                          onClick={() => open({ kind: "lab", id: trend.latest.id })}
                          aria-label={`Edit ${trend.name}`}
                        >
                          <Icon name="pencil" />
                          <span>Edit</span>
                        </button>
                        <ConfirmButton
                          label={`Delete the latest ${trend.name} result`}
                          onConfirm={() => onDeleteLab(trend.latest.id)}
                        />
                      </div>
                    </div>

                    {isOpen ? (
                      <ul className="tl-rows tl-list tl-lab-history" aria-label={`${trend.name} history`}>
                        {trend.results.map((result) => {
                          const status = labRangeStatus(result);
                          return (
                            <li key={result.id} className="tl-row is-static">
                              <span className="tl-row-copy">
                                <b className="tl-plain">{dateLabel(result.date, { month: "short", day: "numeric", year: "numeric" })}</b>
                                <small>
                                  {result.referenceLow === null && result.referenceHigh === null
                                    ? "no range entered"
                                    : `ref ${result.referenceLow ?? "—"}\u2011${result.referenceHigh ?? "—"}`}
                                  {` · ${status}`}
                                </small>
                              </span>
                              <span className={status === "low" || status === "high" ? "tl-row-end down" : "tl-row-end"}>
                                {result.value === null ? "—" : result.value}
                                {result.value === null ? null : <small>{result.unit}</small>}
                              </span>
                              <div className="row-actions">
                                <button
                                  type="button"
                                  className="icon-button"
                                  onClick={() => open({ kind: "lab", id: result.id })}
                                  aria-label={`Edit ${trend.name} from ${result.date}`}
                                >
                                  <Icon name="pencil" />
                                </button>
                                <ConfirmButton
                                  label={`Delete ${trend.name} from ${result.date}`}
                                  onConfirm={() => onDeleteLab(result.id)}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="tl-line">
              {query ? `No test matches “${query}”. ` : "No flagged results in this view."}
              {query ? <button type="button" className="text-button" onClick={() => setQuery("")}>Clear search</button> : null}
            </p>
          )
        ) : (
          <p className="tl-line">
            Ranges vary by lab, so use the one that came with your result. Results stay grouped by test and unit.
          </p>
        )}
      </section>
    </div>
  );
}
