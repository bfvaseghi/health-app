"use client";

import { useMemo, useState } from "react";
import { HealthState, ReportRow, buildHealthReport, dateLabel, reportToText } from "../health-model";
import { Icon } from "./icons";
import { Note } from "./primitives";
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
  const [showNotes, setShowNotes] = useState(false);
  const [includeTherapy, setIncludeTherapy] = useState(true);
  const report = useMemo(() => buildHealthReport(state, today, days), [state, today, days]);

  return (
    <div className="page report-page">
      <span className="tl-caps">{`For your doctor · last ${days} days`}</span>
      <h1 className="tl-hero" tabIndex={-1}>Ready to bring along.</h1>
      <p className="tl-lede">
        {`${dateLabel(report.start, { month: "short", day: "numeric" })} – ${dateLabel(report.end, { month: "short", day: "numeric" })} · `}
        <b>{`${report.coverage.sleepNights} of ${report.days}`}</b>
        {" nights · "}
        <b>{`${report.coverage.medicationDosesAnswered} of ${report.coverage.medicationDosesDue}`}</b>
        {" due doses answered"}
        {report.flaggedLabs.length ? <>{" · "}<b>{report.flaggedLabs.length}</b>{` ${report.flaggedLabs.length === 1 ? "result" : "results"} outside range`}</> : null}
        {includeTherapy && report.toRaise.length ? <>{" · "}<b>{report.toRaise.length}</b>{" to raise"}</> : null}
      </p>
      <div className="tl-actions no-print">
        <button
          type="button"
          className="button primary"
          onClick={async () =>
            onNotice(
              (await copyText(reportToText(report, { includeTherapy, includeNotes: showNotes })))
                ? "Summary copied as text."
                : "Copying is blocked in this browser. Print instead.",
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

      <section className="tl-section report-header" aria-labelledby="period-title">
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
        <p className="tl-line" style={{ marginTop: 8 }}>
          {`Coverage in this period: sleep ${report.coverage.sleepNights}/${report.days} nights · medication ${report.coverage.medicationDosesAnswered}/${report.coverage.medicationDosesDue} due doses answered.`}
        </p>
        <div className="report-inclusions no-print" aria-label="Choose private details to include">
          <label><input type="checkbox" checked={includeTherapy} onChange={(event) => setIncludeTherapy(event.target.checked)} /> Include therapy topics</label>
          <label><input type="checkbox" checked={showNotes} onChange={(event) => setShowNotes(event.target.checked)} /> Include daily notes</label>
        </div>
      </section>

      {includeTherapy && report.toRaise.length ? (
        <section className="tl-section report-priority therapy-priority" aria-labelledby="raise-title">
          <div className="tl-section-head">
            <h2 className="tl-caps" id="raise-title" style={{ margin: 0 }}>
              {`For therapy · ${report.toRaise.length} ${report.toRaise.length === 1 ? "thing" : "things"} waiting`}
            </h2>
            <span className="tl-meta">not limited to the period</span>
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

      <section className="tl-section report-priority labs-priority" aria-labelledby="flagged-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="flagged-title" style={{ margin: 0 }}>Labs · latest result outside its range</h2>
          <span className="tl-meta">not limited to the period</span>
        </div>
        {report.flaggedLabs.length ? (
          <ul className="tl-rows tl-list">
            {report.flaggedLabs.map((result) => (
              <li className="tl-row is-static" key={result.id}>
                <span className="tl-row-copy">
                  <b>{result.name}</b>
                  <small>
                    {`ref ${result.referenceLow ?? "—"}\u2011${result.referenceHigh ?? "—"} ${result.unit} · ${dateLabel(result.date, { month: "short", day: "numeric", year: "numeric" })}`}
                  </small>
                </span>
                <span className="tl-row-end down">
                  {result.value === null ? "—" : result.value}
                  {result.value === null ? null : <small>{result.unit}</small>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tl-line">
            The most recent result for each test sits inside the range you entered, or has no range to judge it by.
          </p>
        )}
      </section>

      <div className="report-grid">
        {groups.map((group) => {
          const rows = report.rows.filter((row) => row.group === group);
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
                        <small>{row.detail}</small>
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
                    : "Nothing recorded in this period."}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>

      {report.notes.length && showNotes ? (
        <section className="tl-section report-notes" aria-labelledby="notes-title">
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

      <Note icon="info">
        These are self-recorded observations and user-entered reference ranges. They are not a diagnosis, and they do not
        replace a measurement taken by a clinician.
      </Note>
    </div>
  );
}
