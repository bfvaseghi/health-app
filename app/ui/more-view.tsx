"use client";

import { Icon } from "./icons";
import { RecordHeading } from "./primitives";
import { View, viewLabels } from "./types";

const destinations: Array<{ view: View; detail: string }> = [
  { view: "urges", detail: "Masturbation & caffeine" },
  { view: "compare", detail: "See what changed between two periods" },
  { view: "labs", detail: "Results, ranges & questions to bring up" },
  { view: "summary", detail: "Prepare a record for your appointment" },
  { view: "data", detail: "Imports, backups, connections & settings" },
];

export function MoreView({ go }: { go: (view: View) => void }) {
  return (
    <div className="page more-page">
      <RecordHeading title="More" detail="Explore & manage your record" />

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
