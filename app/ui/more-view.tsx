"use client";

import { Icon } from "./icons";
import { PageHeading } from "./primitives";
import { View, viewLabels } from "./types";

const destinations: Array<{ view: View; detail: string }> = [
  { view: "meds", detail: "What is due, what was answered, and medication history" },
  { view: "labs", detail: "Results, reference ranges, and trends over time" },
  { view: "summary", detail: "A controlled report for an appointment" },
  { view: "data", detail: "Imports, automatic sync, goals, backups, and source code" },
];

export function MoreView({ go }: { go: (view: View) => void; demo?: boolean }) {
  return (
    <div className="page more-page">
      <PageHeading title="More" />
      <p className="page-intro">The health record and the controls that do not need to occupy the everyday navigation.</p>
      <div className="more-list">
        {destinations.map((item) => (
          <button type="button" key={item.view} className="more-row" onClick={() => go(item.view)}>
            <span className="more-icon"><Icon name={item.view === "data" ? "settings" : item.view} /></span>
            <span>
              <b>{viewLabels[item.view]}</b>
              <small>{item.detail}</small>
            </span>
            <Icon name="chevron" />
          </button>
        ))}
      </div>
    </div>
  );
}
