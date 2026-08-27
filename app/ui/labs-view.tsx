"use client";

import { useMemo, useState } from "react";
import { HealthState, buildLabTrends, dateLabel, filterLabTrends, labRangeStatus } from "../health-model";
import { Sparkline } from "./charts";
import { Icon } from "./icons";
import { ConfirmButton, Empty, PageHeading } from "./primitives";
import { Modal } from "./types";

export function LabsView({
  state,
  open,
  onDeleteLab,
}: {
  state: HealthState;
  open: (modal: Modal) => void;
  onDeleteLab: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const trends = useMemo(() => buildLabTrends(state.labResults), [state.labResults]);
  const flagged = trends.filter((trend) => trend.status === "low" || trend.status === "high");
  const shown = useMemo(
    () => filterLabTrends(trends, query).filter((trend) => filter === "all" || trend.status === "low" || trend.status === "high"),
    [trends, query, filter],
  );

  return (
    <div className="page">
      <PageHeading
        title="Labs"
        body={trends.length ? `${flagged.length} flagged · ${trends.length - flagged.length} within range or unrated` : "Results stay grouped by test and unit."}
        action={
          <button type="button" className="button primary" onClick={() => open({ kind: "lab" })}>
            <Icon name="plus" />
            Add result
          </button>
        }
      />

      <section className="panel wide-panel">
        <div className="panel-head wrap">
          <div>
            <h2>Results</h2>
          </div>
          {trends.length ? (
            <div className="search-field">
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
        </div>

        {trends.length ? (
          <div className="lab-filter-row" role="group" aria-label="Filter lab status">
            <button type="button" className={filter === "all" ? "chip primary" : "chip"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All {trends.length}</button>
            <button type="button" className={filter === "flagged" ? "chip primary" : "chip"} aria-pressed={filter === "flagged"} onClick={() => setFilter("flagged")}>Flagged {flagged.length}</button>
          </div>
        ) : null}

        {trends.length ? (
          shown.length ? (
            <ul className="record-list">
              {shown.map((trend) => {
                const isOpen = expanded === trend.key;
                const history = [...trend.results].reverse();
                return (
                  <li key={trend.key} className="lab-group">
                    <div className="record-row lab-row">
                      <div className="lab-name">
                        <b>{trend.name}</b>
                        <small>
                          {trend.results.length === 1
                            ? `Measured ${dateLabel(trend.latest.date, { month: "short", day: "numeric", year: "numeric" })}`
                            : `${trend.results.length} results · latest ${dateLabel(trend.latest.date, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}`}
                        </small>
                      </div>
                      <div>
                        <small>Result</small>
                        <b>{trend.latest.value === null ? "—" : `${trend.latest.value} ${trend.latest.unit}`}</b>
                      </div>
                      <div>
                        <small>Reference</small>
                        <b>
                          {trend.latest.referenceLow === null && trend.latest.referenceHigh === null
                            ? "Not entered"
                            : `${trend.latest.referenceLow ?? "—"} – ${trend.latest.referenceHigh ?? "—"}`}
                        </b>
                      </div>
                      <div>
                        <small>Change</small>
                        <b>
                          {trend.change === null
                            ? "—"
                            : `${trend.change > 0 ? "+" : ""}${Number(trend.change.toFixed(2))} ${trend.unit}`}
                        </b>
                      </div>
                      <div className="spark-slot">
                        <Sparkline
                          values={history
                            .map((result) => result.value)
                            .filter((value): value is number => value !== null)}
                          label={`${trend.name} history`}
                        />
                      </div>
                      <span className={`range-badge ${trend.status}`}>{trend.status}</span>
                      <div className="row-actions">
                        {trend.results.length > 1 ? (
                          <button
                            type="button"
                            className="row-action"
                            aria-expanded={isOpen}
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
                      <div className="table-wrap lab-history">
                        <table>
                          <caption>{`${trend.name} history`}</caption>
                          <thead>
                            <tr>
                              <th scope="col">Date</th>
                              <th scope="col">Result</th>
                              <th scope="col">Reference</th>
                              <th scope="col">Status</th>
                              <th scope="col">
                                <span className="visually-hidden">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {trend.results.map((result) => (
                              <tr key={result.id}>
                                <th scope="row">
                                  {dateLabel(result.date, { month: "short", day: "numeric", year: "numeric" })}
                                </th>
                                <td>{result.value === null ? "—" : `${result.value} ${result.unit}`}</td>
                                <td>
                                  {result.referenceLow === null && result.referenceHigh === null
                                    ? "Not entered"
                                    : `${result.referenceLow ?? "—"} – ${result.referenceHigh ?? "—"}`}
                                </td>
                                <td>
                                  <span className={`range-badge ${labRangeStatus(result)}`}>
                                    {labRangeStatus(result)}
                                  </span>
                                </td>
                                <td>
                                  <div className="row-actions">
                                    <button
                                      type="button"
                                      className="row-action"
                                      onClick={() => open({ kind: "lab", id: result.id })}
                                      aria-label={`Edit ${trend.name} from ${result.date}`}
                                    >
                                      <Icon name="pencil" />
                                      <span>Edit</span>
                                    </button>
                                    <ConfirmButton
                                      label={`Delete ${trend.name} from ${result.date}`}
                                      onConfirm={() => onDeleteLab(result.id)}
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-inline">
              <p className="panel-body">{query ? `No test matches “${query}”.` : "No flagged results in this view."}</p>
              {query ? <button type="button" className="text-button" onClick={() => setQuery("")}>Clear search</button> : null}
            </div>
          )
        ) : (
          // The heading already carries "Add result", a few hundred pixels
          // up and in a stronger style. Two buttons doing the same thing on
          // one empty screen is not twice as helpful.
          <Empty
            icon="records"
            title="No lab results yet"
            body="Add a result with the reference range printed on the report. Ranges vary by lab, so use the one that came with your result."
          />
        )}
      </section>
    </div>
  );
}
