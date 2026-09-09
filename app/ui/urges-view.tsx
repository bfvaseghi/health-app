"use client";

import { useState } from "react";
import { CuttingBack } from "./habit-tracker";
import { RecordHeading } from "./primitives";

type UrgeTab = "masturbation" | "caffeine" | "other";

export function UrgesView(props: Omit<Parameters<typeof CuttingBack>[0], "category">) {
  const [selected, setSelected] = useState<UrgeTab>("masturbation");
  const hasOther = props.state.habits.some(habit => !habit.archived && !habit.caffeine && habit.category !== "masturbation" && !/masturbat/i.test(habit.name));
  const tabs: Array<{ value: UrgeTab; label: string }> = [
    { value: "masturbation", label: "Masturbation" },
    { value: "caffeine", label: "Caffeine" },
    ...(hasOther ? [{ value: "other" as const, label: "Other" }] : []),
  ];
  const active = selected === "other" && !hasOther ? "masturbation" : selected;
  return <div className="page urges-page">
    <RecordHeading title="Urges" />
    <div className="record-tabs" role="tablist" aria-label="Urges">
      {tabs.map((tab, index) => <button key={tab.value} id={`urge-tab-${tab.value}`} type="button" role="tab" aria-selected={active === tab.value} aria-controls={`urge-panel-${tab.value}`} tabIndex={active === tab.value ? 0 : -1} className={active === tab.value ? "active" : ""} onClick={() => setSelected(tab.value)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        setSelected(tabs[next].value);
        document.getElementById(`urge-tab-${tabs[next].value}`)?.focus();
      }}>{tab.label}</button>)}
    </div>
    {tabs.map(tab => <div key={tab.value} id={`urge-panel-${tab.value}`} role="tabpanel" aria-labelledby={`urge-tab-${tab.value}`} hidden={active !== tab.value}>
      <CuttingBack {...props} category={tab.value} />
    </div>)}
  </div>;
}
