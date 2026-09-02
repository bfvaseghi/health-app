"use client";

import { useMemo, useState } from "react";
import { HealthState, ReportRow, buildHealthReport, dateLabel, reportToText } from "../health-model";
import { Icon } from "./icons";
import { Note, Segmented } from "./primitives";
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

      <section className="panel wide-panel report-header" style={{ marginTop: 26 }}>
        <div className="panel-head wrap">
          <div>
            <p className="kicker">Period</p>
            <h2>
              {dateLabel(report.start, { month: "long", day: "numeric" })} –{" "}
              {dateLabel(report.end, { month: "long", day: "numeric", year: "numeric" })}
            </h2>
          </div>
          <div className="no-print">
            <Segmented
              label="Report period"
              value={String(days)}
              options={[
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
              ]}
              onChange={(value) => setDays(Number(value))}
            />
          </div>
        </div>
        <p className="panel-body">
          {`Coverage in this period: sleep ${report.coverage.sleepNights}/${report.days} nights · medication ${report.coverage.medicationDosesAnswered}/${report.coverage.medicationDosesDue} due doses answered.`}
        </p>
        <div className="report-inclusions no-print" aria-label="Choose private details to include">
          <label><input type="checkbox" checked={includeTherapy} onChange={(event) => setIncludeTherapy(event.target.checked)} /> Include therapy topics</label>
          <label><input type="checkbox" checked={showNotes} onChange={(event) => setShowNotes(event.target.checked)} /> Include daily notes</label>
        </div>
      </section>

      {includeTherapy && report.toRaise.length ? (
        <section className="panel wide-panel report-priority therapy-priority">
          <div className="panel-head">
            <div>
              <p className="kicker">Current concern · not limited to the selected period</p>
              <h2>{`${report.toRaise.length} ${report.toRaise.length === 1 ? "thing" : "things"} for therapy`}</h2>
            </div>
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

      <section className="panel wide-panel report-priority labs-priority">
        <div className="panel-head">
          <div>
            <p className="kicker">Current concern · not limited to the selected period</p>
            <h2>Latest result per test, outside its range</h2>
          </div>
        </div>
        {report.flaggedLabs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Test</th>
                  <th scope="col">Result</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {report.flaggedLabs.map((result) => (
                  <tr key={result.id}>
                    <th scope="row">{result.name}</th>
                    <td>{result.value === null ? "—" : `${result.value} ${result.unit}`}</td>
                    <td>{`${result.referenceLow ?? "—"} – ${result.referenceHigh ?? "—"} ${result.unit}`}</td>
                    <td>{dateLabel(result.date, { month: "short", day: "numeric", year: "numeric" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="panel-body">
            The most recent result for each test sits inside the range you entered, or has no range to judge it by.
          </p>
        )}
      </section>

      <div className="report-grid">
        {groups.map((group) => {
          const rows = report.rows.filter((row) => row.group === group);
          const recorded = rows.filter((row) => row.value !== "No data");
          const missing = rows.filter((row) => row.value === "No data");
          return (
            <section className="panel report-block" key={group} aria-labelledby={`report-${group.toLowerCase()}`}>
              <div className="panel-head">
                <div>
                  <h2 className="kicker" id={`report-${group.toLowerCase()}`}>{group}</h2>
                </div>
              </div>
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
        <section className="panel wide-panel report-notes">
          <div className="panel-head wrap">
            <div>
              <h2>{`Notes from ${report.notes.length} ${report.notes.length === 1 ? "day" : "days"}`}</h2>
            </div>
            <span className="panel-meta">Included in copy and print</span>
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
