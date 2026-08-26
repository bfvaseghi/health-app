"use client";

import { useMemo, useState } from "react";
import { HealthState, ReportRow, buildHealthReport, dateLabel, reportToText } from "../health-model";
import { Icon } from "./icons";
import { Note, PageHeading, Segmented } from "./primitives";
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
  const report = useMemo(() => buildHealthReport(state, today, days), [state, today, days]);

  return (
    <div className="page report-page">
      <PageHeading
        eyebrow="For an appointment"
        title="Summary"
        body="A dated page to print or paste into a message."
        action={
          <div className="heading-actions no-print">
            <button
              type="button"
              className="button secondary"
              onClick={async () =>
                onNotice(
                  (await copyText(reportToText(report)))
                    ? "Summary copied as text."
                    : "Copying is blocked in this browser. Print instead.",
                )
              }
            >
              <Icon name="copy" />
              Copy as text
            </button>
            <button type="button" className="button primary" onClick={() => window.print()}>
              <Icon name="printer" />
              Print
            </button>
          </div>
        }
      />

      <section className="panel wide-panel report-header">
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
                { value: "7", label: "1W" },
                { value: "30", label: "1M" },
                { value: "90", label: "3M" },
              ]}
              onChange={(value) => setDays(Number(value))}
            />
          </div>
        </div>
        <p className="panel-body">
          {`Recorded in this period: ${report.coverage.sleepNights} ${
            report.coverage.sleepNights === 1 ? "night" : "nights"
          } of sleep and ${report.coverage.medicationDays} ${
            report.coverage.medicationDays === 1 ? "day" : "days"
          } of medication, out of ${report.days}. Every figure below is drawn only from recorded days.`}
        </p>
      </section>

      <div className="report-grid">
        {groups.map((group) => {
          const rows = report.rows.filter((row) => row.group === group);
          // A row reading "No data" over "not recorded" is two ways of saying
          // nothing. Six of them in a row is a wall between a clinician and the
          // figures that do exist, so what was not recorded is named once,
          // which is all a gap in a record needs.
          const recorded = rows.filter((row) => row.value !== "No data");
          const missing = rows.filter((row) => row.value === "No data");
          return (
            <section className="panel report-block" key={group}>
              <div className="panel-head">
                <div>
                  <p className="kicker">{group}</p>
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
                    ? // Medication rows are labelled with the name on the box, and
                      // a name keeps its capitals.
                      `Not recorded: ${listWords(
                        missing.map((row) => (group === "Medication" ? row.label : row.label.toLowerCase())),
                      )}.`
                    : "Nothing recorded in this period."}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>

      {report.toRaise.length ? (
        <section className="panel wide-panel">
          <div className="panel-head">
            <div>
              <p className="kicker">Kept as they came up</p>
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

      <section className="panel wide-panel">
        <div className="panel-head">
          <div>
            <p className="kicker">Lab history</p>
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

      {report.notes.length ? (
        <section className="panel wide-panel">
          <div className="panel-head wrap">
            <div>
              <h2>{`Notes from ${report.notes.length} ${report.notes.length === 1 ? "day" : "days"}`}</h2>
            </div>
            <button type="button" className="text-button no-print" onClick={() => setShowNotes((value) => !value)}>
              {showNotes ? "Hide notes" : "Show notes"} <Icon name="chevron" />
            </button>
          </div>
          {showNotes ? (
            <ul className="note-list">
              {report.notes.map((note) => (
                <li key={note.date}>
                  <b>{dateLabel(note.date, { weekday: "short", month: "short", day: "numeric" })}</b>
                  <p>{note.note}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-body no-print">Hidden until shown, including when printing.</p>
          )}
        </section>
      ) : null}

      <Note icon="info">
        These are self-recorded observations and user-entered reference ranges. They are not a diagnosis, and they do not
        replace a measurement taken by a clinician.
      </Note>
    </div>
  );
}
