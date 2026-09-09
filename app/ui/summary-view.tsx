"use client";

import { useMemo, useState } from "react";
import { HealthState, ReportRow, ReportOptions, ReportAudience, buildHealthReport, dateLabel, reportToText, reportRows, reportOptionsFor, labRangeStatus } from "../health-model";
import { Icon } from "./icons";
import { RecordHeading } from "./primitives";
import { copyText, listWords } from "./format";

const groups: Array<ReportRow["group"]> = ["Sleep", "Medication", "Body", "Training", "Mind"];

export function SummaryView({
  state,
  today,
  onNotice,
}: {
  state: HealthState;
  today: string;
  onNotice: (message: string) => void;
}) {
  const [days, setDays] = useState(30);
  const [audience, setAudience] = useState<ReportAudience | null>("doctor");
  const [options, setOptions] = useState<ReportOptions>(() => reportOptionsFor("doctor"));
  const { includeNotes: showNotes, includeTherapy, includeLabs } = options;
  const included = options.groups ?? groups;
  const changeOptions = (next: ReportOptions) => { setOptions(next); setAudience(null); };
  const report = useMemo(() => buildHealthReport(state, today, days), [state, today, days]);

  return (
    <div className="page report-page">
      <RecordHeading title="Summary" detail="Choose what to bring to your appointment" />
      <div className="tl-actions no-print">
        <button
          type="button"
          className="button primary"
          onClick={async () =>
            onNotice(
              (await copyText(reportToText(report, options)))
                ? "Summary copied."
                : "Copy unavailable.",
            )
          }
        >
          <Icon name="copy" />
          Copy as text
        </button>
        <button type="button" className="button secondary" onClick={() => window.print()}>
          <Icon name="printer" />
          Print
        </button>
      </div>

      <section className="tl-section report-header record-sheet" aria-labelledby="period-title">
        <div className="tl-tabs report-audience no-print" role="group" aria-label="Appointment type">
          {([['doctor', 'Doctor'], ['therapy', 'Therapy'], ['all', 'All records']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={audience === value} className={audience === value ? "active" : ""} onClick={() => { setAudience(value); setOptions(reportOptionsFor(value)); }}>{label}</button>
          ))}
        </div>
        <div className="tl-section-head">
          <h2 className="tl-caps" id="period-title" style={{ margin: 0 }}>
            {`Period · ${dateLabel(report.start, { month: "short", day: "numeric" })} – ${dateLabel(report.end, { month: "short", day: "numeric", year: "numeric" })}`}
          </h2>
          <div className="tl-tabs no-print" role="group" aria-label="Report period">
            {[7, 30, 90].map((option) => (
              <button key={option} type="button" aria-pressed={days === option} className={days === option ? "active" : ""} onClick={() => setDays(option)}>
                {`${option} days`}
              </button>
            ))}
          </div>
        </div>
        <p className="tl-line" style={{ marginTop: 8 }}>{[
          ...(included.includes("Sleep") ? [`Sleep · ${report.coverage.sleepNights}/${report.days} nights`] : []),
          ...(included.includes("Medication") ? [`Medication · ${report.coverage.medicationDosesAnswered}/${report.coverage.medicationDosesDue} doses logged`] : []),
        ].join(" · ")}</p>
        <details className="report-selection no-print">
          <summary>Included sections</summary>
          <div className="report-inclusions" aria-label="Included sections">
            {groups.map((group) => <label key={group}><input type="checkbox" checked={included.includes(group)} onChange={(event) => changeOptions({ ...options, groups: event.target.checked ? [...included, group] : included.filter((item) => item !== group) })} />{group}</label>)}
            <label><input type="checkbox" checked={Boolean(includeLabs)} onChange={(event) => changeOptions({ ...options, includeLabs: event.target.checked })} />Flagged labs</label>
            <label><input type="checkbox" checked={Boolean(includeTherapy)} onChange={(event) => changeOptions({ ...options, includeTherapy: event.target.checked })} />Therapy topics and recurring thoughts</label>
            <label><input type="checkbox" checked={Boolean(showNotes)} onChange={(event) => changeOptions({ ...options, includeNotes: event.target.checked })} />Daily notes</label>
          </div>
        </details>
      </section>

      {includeTherapy && report.toRaise.length ? (
        <section className="tl-section record-sheet report-priority therapy-priority" aria-labelledby="raise-title">
          <div className="tl-section-head">
            <h2 className="tl-caps" id="raise-title" style={{ margin: 0 }}>
              {`Therapy · ${report.toRaise.length} ${report.toRaise.length === 1 ? "topic" : "topics"}`}
            </h2>
            <span className="tl-meta">all dates</span>
          </div>
          <ul className="raise-list">
            {report.toRaise.map((note) => (
              <li key={note.id}>
                <p>{note.text}</p>
                <small>{dateLabel(note.date, { month: "short", day: "numeric" })}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {includeLabs ? <section className="tl-section record-sheet report-priority labs-priority" aria-labelledby="flagged-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="flagged-title" style={{ margin: 0 }}>Flagged labs</h2>
          <span className="tl-meta">latest result per test · all dates</span>
        </div>
        {report.flaggedLabs.length ? (
          <ul className="tl-rows tl-list">
            {report.flaggedLabs.map((result) => (
              <li className="tl-row is-static" key={result.id}>
                <span className="tl-row-copy">
                  <b>{result.name}</b>
                  <small>
                    {`ref ${result.referenceLow ?? "—"}\u2011${result.referenceHigh ?? "—"} ${result.unit} · ${dateLabel(result.date, { month: "short", day: "numeric", year: "numeric" })} · ${
                      labRangeStatus(result) === "low" || labRangeStatus(result) === "high" ? labRangeStatus(result) : "Flagged"
                    }`}
                  </small>
                </span>
                <span className={labRangeStatus(result) === "low" || labRangeStatus(result) === "high" ? "tl-row-end down" : "tl-row-end"}>
                  {result.value === null ? "—" : result.value}
                  {result.value === null ? null : <small>{result.unit}</small>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tl-line">
            No flagged results.
          </p>
        )}
      </section> : null}

      <div className="report-grid">
        {groups.map((group) => {
          const rows = reportRows(report, includeTherapy, included).filter((row) => row.group === group);
          if (!rows.length) return null;
          const recorded = rows.filter((row) => row.value !== "No data");
          const missing = rows.filter((row) => row.value === "No data");
          return (
            <section className="tl-section report-block" key={group} aria-labelledby={`report-${group.toLowerCase()}`}>
              <h2 className="tl-caps" id={`report-${group.toLowerCase()}`} style={{ margin: 0 }}>{group}</h2>
              {recorded.length ? (
                <dl className="report-rows">
                  {recorded.map((row) => (
                    <div key={row.id}>
                      <dt>{row.label}</dt>
                      <dd>
                        <b>{row.value}</b>
                        {row.detail ? <small>{row.detail}</small> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {missing.length ? (
                <p className="report-none">
                  {recorded.length
                    ? `Not recorded: ${listWords(
                        missing.map((row) => (group === "Medication" ? row.label : row.label.toLowerCase())),
                      )}.`
                    : "No records."}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>

      {report.notes.length && showNotes ? (
        <section className="tl-section record-sheet report-notes" aria-labelledby="notes-title">
          <div className="tl-section-head">
            <h2 className="tl-caps" id="notes-title" style={{ margin: 0 }}>{`Notes from ${report.notes.length} ${report.notes.length === 1 ? "day" : "days"}`}</h2>
            <span className="tl-meta">included in copy and print</span>
          </div>
          <ul className="note-list">
            {report.notes.map((note) => (
              <li key={note.date}>
                <b>{dateLabel(note.date, { weekday: "short", month: "short", day: "numeric" })}</b>
                <p>{note.note}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}


    </div>
  );
}
