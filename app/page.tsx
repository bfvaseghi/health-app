"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DailyEntry,
  GoalSettings,
  HealthState,
  LabResult,
  SleepEntry,
  STORAGE_KEY,
  addDays,
  buildGoalSummaries,
  buildHealthSyncPrompt,
  buildInsights,
  compareDailyMetric,
  dateLabel,
  emptyDailyEntry,
  emptyHealthState,
  emptySleepEntry,
  entriesInWindow,
  labRangeStatus,
  mergeHealthSyncPacket,
  normalizeHealthState,
  preferredSleepEntries,
  sleepConsistencyRange,
  todayLocal,
  upsertDailyEntry,
  upsertLabResult,
  upsertSleepEntry,
} from "./health-model";

type View = "overview" | "sleep" | "trends" | "records" | "settings";
type Modal = "checkin" | "sleep" | "sync" | "lab" | null;
type Period = 14 | 30 | 90;
type TrendMetric = "sleep" | "steps" | "mood" | "anxiety" | "energy" | "weight";
type SaveStatus = "loading" | "saved" | "saving" | "local" | "error";

const viewLabels: Record<View, string> = {
  overview: "Today",
  sleep: "Sleep",
  trends: "Trends",
  records: "Records",
  settings: "Goals & data",
};

const metricLabels: Record<TrendMetric, string> = {
  sleep: "Sleep",
  steps: "Steps",
  mood: "Mood",
  anxiety: "Anxiety",
  energy: "Energy",
  weight: "Weight",
};

const initialState = emptyHealthState();

function n(value: FormDataEntryValue | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: FormDataEntryValue | null): boolean {
  return value === "on";
}

function formatTime(value: string): string {
  if (!value) return "Unknown";
  const [hour, minute] = value.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${String(minute).padStart(2, "0")} ${period}`;
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function completion(entry: DailyEntry | undefined): number {
  if (!entry) return 0;
  const parts = [
    entry.medicationTaken === true,
    entry.journaled,
    entry.steps !== null,
    entry.mood !== null,
  ];
  return parts.filter(Boolean).length / parts.length;
}

function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [modal, setModal] = useState<Modal>(null);
  const [state, setState] = useState<HealthState>(initialState);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [notice, setNotice] = useState("");
  const hydrated = useRef(false);
  const today = todayLocal();

  useEffect(() => {
    let active = true;
    async function load() {
      let local: HealthState | null = null;
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) local = normalizeHealthState(JSON.parse(stored));
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }

      if (local && active) setState(local);

      try {
        const response = await fetch("/api/health-state", { cache: "no-store" });
        if (!response.ok) throw new Error("Private sync unavailable");
        const data = (await response.json()) as { state?: unknown };
        if (data.state && active) {
          const remote = normalizeHealthState(data.state);
          setState(remote);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
        }
        if (active) setSaveStatus("saved");
      } catch {
        if (active) setSaveStatus("local");
      } finally {
        hydrated.current = true;
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setSaveStatus("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/health-state", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(state),
        });
        if (!response.ok) throw new Error("Save failed");
        setSaveStatus("saved");
      } catch {
        setSaveStatus("local");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3_500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const updateDaily = (entry: DailyEntry) => setState((current) => upsertDailyEntry(current, entry));
  const updateSleep = (entry: SleepEntry) => setState((current) => upsertSleepEntry(current, entry));
  const updateLab = (result: LabResult) => setState((current) => upsertLabResult(current, result));

  const go = (next: View) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <button className="brand" onClick={() => go("overview")} aria-label="Bardia Health home">
          <span className="brand-mark"><Icon name="pulse" /></span>
          <span><strong>Bardia Health</strong><small>Private dashboard</small></span>
        </button>
        <nav className="nav-list">
          {(Object.keys(viewLabels) as View[]).map((item) => (
            <button key={item} className={view === item ? "nav-item active" : "nav-item"} onClick={() => go(item)}>
              <Icon name={item} />
              <span>{viewLabels[item]}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className={`sync-dot ${saveStatus}`} />
          <span>{saveStatus === "saved" ? "Private sync on" : saveStatus === "saving" ? "Saving" : saveStatus === "loading" ? "Loading" : "Saved on this device"}</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="mobile-head">
          <div className="brand compact"><span className="brand-mark"><Icon name="pulse" /></span><strong>Bardia Health</strong></div>
          <button className="icon-button" onClick={() => setModal("checkin")} aria-label="Add check-in"><Icon name="plus" /></button>
        </header>

        {view === "overview" && (
          <Overview state={state} today={today} go={go} open={setModal} updateDaily={updateDaily} />
        )}
        {view === "sleep" && <SleepView state={state} today={today} open={setModal} />}
        {view === "trends" && <TrendsView state={state} today={today} />}
        {view === "records" && <RecordsView state={state} open={setModal} />}
        {view === "settings" && (
          <SettingsView
            state={state}
            onGoals={(goals) => setState((current) => normalizeHealthState({ ...current, updatedAt: new Date().toISOString(), goals }))}
            open={setModal}
            onBackup={() => downloadJson(`bardia-health-backup-${today}.json`, state)}
            onRestore={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              try {
                const restored = normalizeHealthState(JSON.parse(await file.text()));
                setState(restored);
                setNotice("Backup restored.");
              } catch {
                setNotice("That backup could not be read.");
              }
            }}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {(["overview", "sleep", "trends", "records"] as View[]).map((item) => (
          <button key={item} className={view === item ? "active" : ""} onClick={() => go(item)}>
            <Icon name={item} /><span>{viewLabels[item]}</span>
          </button>
        ))}
      </nav>

      {modal === "checkin" && <CheckInModal state={state} date={today} onClose={() => setModal(null)} onSave={(entry, sleep) => { updateDaily(entry); if (sleep) updateSleep(sleep); setModal(null); setNotice("Today’s check-in is saved."); }} />}
      {modal === "sleep" && <SleepModal date={today} state={state} onClose={() => setModal(null)} onSave={(entry) => { updateSleep(entry); setModal(null); setNotice("Sleep is saved."); }} />}
      {modal === "sync" && <SyncModal state={state} onClose={() => setModal(null)} onImport={(value) => { try { setState((current) => mergeHealthSyncPacket(current, value)); setModal(null); setNotice("Health data imported."); } catch (error) { setNotice(error instanceof Error ? error.message : "Import failed."); } }} />}
      {modal === "lab" && <LabModal onClose={() => setModal(null)} onSave={(lab) => { updateLab(lab); setModal(null); setNotice("Result saved."); }} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

function PageHeading({ eyebrow, title, body, action }: { eyebrow: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lede">{body}</p></div>
      {action}
    </div>
  );
}

function Overview({ state, today, go, open, updateDaily }: { state: HealthState; today: string; go: (view: View) => void; open: (modal: Modal) => void; updateDaily: (entry: DailyEntry) => void }) {
  const summaries = buildGoalSummaries(state, today);
  const insights = buildInsights(state, today);
  const todayEntry = state.dailyEntries.find((entry) => entry.date === today);
  const todaySleep = preferredSleepEntries(state.sleepEntries).find((entry) => entry.date === today);
  const week = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const complete = Math.round(completion(todayEntry) * 100);
  const [chartMetric, setChartMetric] = useState<"sleep" | "mood" | "steps">("sleep");
  const chart = useMemo(() => metricSeries(state, chartMetric, today, 14), [state, chartMetric, today]);

  const toggleToday = (field: "medicationTaken" | "journaled") => {
    const base = todayEntry ?? emptyDailyEntry(today);
    const next = field === "medicationTaken" ? { ...base, medicationTaken: base.medicationTaken !== true } : { ...base, journaled: !base.journaled };
    updateDaily(next);
  };

  return (
    <div className="page">
      <PageHeading
        eyebrow={dateLabel(today, { weekday: "long", month: "long", day: "numeric" })}
        title="How are you doing today?"
        body="Log the few things that keep the rest of your health on track."
        action={<div className="heading-actions"><button className="button secondary" onClick={() => open("sync")}><Icon name="sync" />Sync Health</button><button className="button primary" onClick={() => open("checkin")}><Icon name="plus" />Check in</button></div>}
      />

      <section className="today-card">
        <div className="today-main">
          <div className="progress-ring" style={{ "--progress": `${complete * 3.6}deg` } as React.CSSProperties}><span>{complete}%</span></div>
          <div><p className="overline">Today</p><h2>{complete ? "Keep the streak simple." : "Start with one minute."}</h2><p>{todayEntry?.mood ? `Mood ${todayEntry.mood}/5` : "Mood not logged"} · {todaySleep?.durationHours ? `${todaySleep.durationHours.toFixed(1)} hours slept` : "Sleep not logged"}</p></div>
        </div>
        <div className="quick-actions">
          <button className={todayEntry?.medicationTaken ? "quick-check done" : "quick-check"} onClick={() => toggleToday("medicationTaken")}><span><Icon name="medication" /></span><b>{todayEntry?.medicationTaken ? "Medication taken" : "Medication"}</b><small>{todayEntry?.medicationTaken ? "Recorded today" : "Tap when taken"}</small></button>
          <button className={todayEntry?.journaled ? "quick-check done" : "quick-check"} onClick={() => toggleToday("journaled")}><span><Icon name="journal" /></span><b>{todayEntry?.journaled ? "Journal complete" : "Journal"}</b><small>{todayEntry?.journaled ? "Recorded today" : "Two sentences count"}</small></button>
          <button className={todaySleep ? "quick-check done" : "quick-check"} onClick={() => open("sleep")}><span><Icon name="moon" /></span><b>{todaySleep ? "Sleep recorded" : "Add sleep"}</b><small>{todaySleep?.durationHours ? `${todaySleep.durationHours.toFixed(1)} hours` : "Manual or wearable"}</small></button>
        </div>
      </section>

      <section className="week-strip" aria-label="Last seven days">
        {week.map((date) => {
          const entry = state.dailyEntries.find((item) => item.date === date);
          const score = completion(entry);
          return <button key={date} onClick={() => open("checkin")} className={date === today ? "current" : ""}><small>{dateLabel(date, { weekday: "short" })}</small><span className={score >= .75 ? "day-dot strong" : score > 0 ? "day-dot partial" : "day-dot"}>{date.slice(-2)}</span></button>;
        })}
      </section>

      <section className="section-block">
        <div className="section-head"><div><p className="overline">Your commitments</p><h2>The goals that matter</h2></div><button className="text-button" onClick={() => go("settings")}>Edit goals <Icon name="arrow" /></button></div>
        <div className="goal-grid">
          {summaries.map((summary) => (
            <button key={summary.id} className={`goal-card ${summary.status}`} onClick={() => go(summary.id === "sleep" ? "sleep" : summary.id === "weight" ? "trends" : "overview")}>
              <div className="goal-icon"><Icon name={summary.id} /></div>
              <div className="goal-copy"><span>{summary.label}</span><strong>{summary.value}</strong><small>{summary.detail}</small></div>
              <div className="goal-track"><span style={{ width: `${Math.round((summary.progress ?? 0) * 100)}%` }} /></div>
            </button>
          ))}
        </div>
      </section>

      <div className="content-grid">
        <section className="panel chart-panel">
          <div className="panel-head"><div><p className="overline">Recent signals</p><h2>Last 14 days</h2></div><Segmented value={chartMetric} options={[{ value: "sleep", label: "Sleep" }, { value: "mood", label: "Mood" }, { value: "steps", label: "Steps" }]} onChange={(value) => setChartMetric(value as typeof chartMetric)} /></div>
          <LineChart data={chart} label={metricLabels[chartMetric]} empty="Sync Health or add check-ins to see a trend." />
        </section>
        <section className="panel insight-panel">
          <div className="panel-head"><div><p className="overline">This week</p><h2>What deserves attention</h2></div></div>
          <div className="insight-list">
            {insights.map((insight) => <button key={insight.id} onClick={() => go(insight.destination)}><span className={`insight-mark ${insight.tone}`}><Icon name={insight.tone === "positive" ? "check" : insight.tone === "attention" ? "alert" : "spark"} /></span><span><b>{insight.title}</b><small>{insight.body}</small></span><Icon name="arrow" /></button>)}
          </div>
        </section>
      </div>
    </div>
  );
}

function SleepView({ state, today, open }: { state: HealthState; today: string; open: (modal: Modal) => void }) {
  const [period, setPeriod] = useState<Period>(30);
  const sleep = useMemo(() => entriesInWindow(preferredSleepEntries(state.sleepEntries), today, period), [state.sleepEntries, today, period]);
  const recent = entriesInWindow(preferredSleepEntries(state.sleepEntries), today, 7);
  const avg = average(recent.map((entry) => entry.durationHours));
  const atGoal = recent.filter((entry) => entry.durationHours !== null && entry.durationHours >= state.goals.sleepHours).length;
  const regularity = sleepConsistencyRange(recent);
  const source = recent[0]?.source;
  const series = metricSeries(state, "sleep", today, period);

  return (
    <div className="page">
      <PageHeading eyebrow="Dedicated tracker" title="Sleep" body="Duration, timing, consistency, and the signals that help explain how you feel." action={<div className="heading-actions"><button className="button secondary" onClick={() => open("sync")}><Icon name="sync" />Sync wearable</button><button className="button primary" onClick={() => open("sleep")}><Icon name="plus" />Add sleep</button></div>} />
      <section className="sleep-hero">
        <div className="sleep-score"><span className="moon-orb"><Icon name="moon" /></span><div><p className="overline">7-day average</p><strong>{avg === null ? "—" : `${avg.toFixed(1)} h`}</strong><small>Goal {state.goals.sleepHours} hours</small></div></div>
        <div className="stat-row"><Stat label="Nights at goal" value={recent.length ? `${atGoal} / ${recent.length}` : "—"} detail="last 7 recorded" /><Stat label="Bedtime range" value={regularity === null ? "—" : `${Math.round(regularity)} min`} detail={`guide ≤ ${state.goals.sleepConsistencyMinutes} min`} /><Stat label="Primary source" value={source ? source[0].toUpperCase() + source.slice(1) : "None"} detail="highest priority source" /></div>
      </section>
      <section className="panel wide-panel">
        <div className="panel-head"><div><p className="overline">Sleep duration</p><h2>Your nightly pattern</h2></div><PeriodPicker value={period} onChange={setPeriod} /></div>
        <SleepChart data={series} goal={state.goals.sleepHours} />
        <p className="chart-note">Tap any bar for the exact date and duration. Your goal line is shown in green.</p>
      </section>
      <section className="panel wide-panel">
        <div className="panel-head"><div><p className="overline">Sleep log</p><h2>Recent nights</h2></div><button className="text-button" onClick={() => open("sync")}>Bring in Apple or Oura <Icon name="arrow" /></button></div>
        {sleep.length ? <div className="sleep-list">{sleep.slice(0, 14).map((entry) => <div className="sleep-row" key={`${entry.date}:${entry.source}`}><div className="date-tile"><b>{dateLabel(entry.date, { weekday: "short" })}</b><small>{dateLabel(entry.date)}</small></div><div><small>Duration</small><b>{entry.durationHours === null ? "Unknown" : `${entry.durationHours.toFixed(1)} h`}</b></div><div><small>Window</small><b>{entry.bedtime && entry.wakeTime ? `${formatTime(entry.bedtime)} – ${formatTime(entry.wakeTime)}` : "Not provided"}</b></div><div><small>Quality</small><b>{entry.quality ? `${entry.quality} / 5` : "Not rated"}</b></div><span className={`source-badge ${entry.source}`}>{entry.source}</span></div>)}</div> : <Empty icon="moon" title="No sleep recorded yet" body="Import a Health file or add last night manually. Missing data stays missing. We never invent it." action={<button className="button primary" onClick={() => open("sleep")}>Add last night</button>} />}
      </section>
    </div>
  );
}

function TrendsView({ state, today }: { state: HealthState; today: string }) {
  const [metric, setMetric] = useState<TrendMetric>("sleep");
  const [period, setPeriod] = useState<Period>(30);
  const series = useMemo(() => metricSeries(state, metric, today, period), [state, metric, today, period]);
  const mood = compareDailyMetric(state.dailyEntries, "mood", today);
  const anxiety = compareDailyMetric(state.dailyEntries, "anxiety", today);
  const energy = compareDailyMetric(state.dailyEntries, "energy", today);
  const stats = [
    { label: "Mood", ...mood, reverse: false },
    { label: "Anxiety", ...anxiety, reverse: true },
    { label: "Energy", ...energy, reverse: false },
  ];
  return (
    <div className="page">
      <PageHeading eyebrow="Patterns, not grades" title="Trends" body="See what is changing. Use the pattern as a question to explore, not a diagnosis." />
      <section className="panel wide-panel">
        <div className="panel-head wrap"><div className="metric-tabs">{(Object.keys(metricLabels) as TrendMetric[]).map((item) => <button key={item} className={metric === item ? "active" : ""} onClick={() => setMetric(item)}>{metricLabels[item]}</button>)}</div><PeriodPicker value={period} onChange={setPeriod} /></div>
        <div className="trend-title"><div><p className="overline">{metricLabels[metric]}</p><h2>{series.filter((point) => point.value !== null).length ? `${period}-day view` : "Build your baseline"}</h2></div></div>
        <LineChart data={series} label={metricLabels[metric]} empty={`No ${metricLabels[metric].toLowerCase()} data in this period.`} />
      </section>
      <section className="section-block">
        <div className="section-head"><div><p className="overline">Mental health</p><h2>This week against last week</h2></div></div>
        <div className="comparison-grid">{stats.map((stat) => { const favorable = stat.change !== null && (stat.reverse ? stat.change < 0 : stat.change > 0); return <article key={stat.label} className="comparison-card"><span>{stat.label}</span><strong>{stat.current === null ? "—" : stat.current.toFixed(1)}</strong><small>{stat.change === null ? "Not enough check-ins" : <><span className={favorable ? "change good" : stat.change === 0 ? "change" : "change watch"}>{stat.change > 0 ? "+" : ""}{stat.change.toFixed(1)}</span> from prior week</>}</small></article>; })}</div>
        <div className="context-note"><Icon name="info" /><p><b>Correlation is a clue.</b> Sleep, mood, medication, and movement can move together for many reasons. Bring meaningful patterns to your clinician instead of treating them as proof.</p></div>
      </section>
    </div>
  );
}

function RecordsView({ state, open }: { state: HealthState; open: (modal: Modal) => void }) {
  return (
    <div className="page">
      <PageHeading eyebrow="Details when you need them" title="Records" body="Your lab history and daily check-ins, without crowding the main dashboard." action={<button className="button primary" onClick={() => open("lab")}><Icon name="plus" />Add result</button>} />
      <section className="panel wide-panel">
        <div className="panel-head"><div><p className="overline">Health indicators</p><h2>Lab results</h2></div></div>
        {state.labResults.length ? <div className="table-wrap"><table><thead><tr><th>Test</th><th>Result</th><th>Reference</th><th>Date</th><th>Status</th></tr></thead><tbody>{state.labResults.map((result) => { const status = labRangeStatus(result); return <tr key={result.id}><td><b>{result.name}</b>{result.note && <small>{result.note}</small>}</td><td>{result.value === null ? "—" : `${result.value} ${result.unit}`}</td><td>{result.referenceLow === null && result.referenceHigh === null ? "Not entered" : `${result.referenceLow ?? "—"} – ${result.referenceHigh ?? "—"} ${result.unit}`}</td><td>{dateLabel(result.date, { month: "short", day: "numeric", year: "numeric" })}</td><td><span className={`range-badge ${status}`}>{status}</span></td></tr>; })}</tbody></table></div> : <Empty icon="records" title="No lab results yet" body="Add a result with the reference range printed by the lab. Ranges vary by lab and context." action={<button className="button secondary" onClick={() => open("lab")}>Add a result</button>} />}
      </section>
      <section className="panel wide-panel">
        <div className="panel-head"><div><p className="overline">Check-in history</p><h2>Recent days</h2></div></div>
        {state.dailyEntries.length ? <div className="daily-list">{state.dailyEntries.slice(0, 20).map((entry) => <div className="daily-row" key={entry.date}><div className="date-tile"><b>{dateLabel(entry.date, { weekday: "short" })}</b><small>{dateLabel(entry.date)}</small></div><RecordPill label="Mood" value={entry.mood ? `${entry.mood}/5` : "—"} /><RecordPill label="Anxiety" value={entry.anxiety ? `${entry.anxiety}/5` : "—"} /><RecordPill label="Steps" value={entry.steps === null ? "—" : Math.round(entry.steps).toLocaleString()} /><RecordPill label="Medication" value={entry.medicationTaken === null ? "—" : entry.medicationTaken ? "Taken" : "Missed"} /><RecordPill label="Journal" value={entry.journaled ? "Done" : "—"} /></div>)}</div> : <Empty icon="journal" title="No check-ins yet" body="Your daily history will appear after the first check-in." />}
      </section>
    </div>
  );
}

function SettingsView({ state, onGoals, open, onBackup, onRestore }: { state: HealthState; onGoals: (goals: GoalSettings) => void; open: (modal: Modal) => void; onBackup: () => void; onRestore: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const [draft, setDraft] = useState(state.goals);
  const set = (key: keyof GoalSettings, value: number | string | null) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <div className="page">
      <PageHeading eyebrow="Make the app yours" title="Goals & data" body="Targets should guide your attention. They should not turn a hard week into a failing grade." />
      <section className="panel wide-panel settings-panel">
        <div className="panel-head"><div><p className="overline">Targets</p><h2>Your weekly commitments</h2></div><button className="button primary small" onClick={() => onGoals(draft)}>Save goals</button></div>
        <div className="settings-grid">
          <NumberSetting label="Sleep" detail="hours per night" value={draft.sleepHours} min={4} max={14} step={0.25} onChange={(value) => set("sleepHours", value)} />
          <NumberSetting label="Bedtime consistency" detail="minutes of range" value={draft.sleepConsistencyMinutes} min={15} max={360} step={15} onChange={(value) => set("sleepConsistencyMinutes", value)} />
          <NumberSetting label="Steps" detail="daily average" value={draft.stepGoal} min={0} max={100000} step={500} onChange={(value) => set("stepGoal", value)} />
          <NumberSetting label="Medication" detail="days per week" value={draft.medicationDaysPerWeek} min={0} max={7} step={1} onChange={(value) => set("medicationDaysPerWeek", value)} />
          <NumberSetting label="Journaling" detail="days per week" value={draft.journalDaysPerWeek} min={0} max={7} step={1} onChange={(value) => set("journalDaysPerWeek", value)} />
          <NumberSetting label="Therapy" detail="sessions per month" value={draft.therapySessionsPerMonth} min={0} max={31} step={1} onChange={(value) => set("therapySessionsPerMonth", value)} />
          <NumberSetting label="Exercise" detail="days per week" value={draft.exerciseDaysPerWeek} min={0} max={7} step={1} onChange={(value) => set("exerciseDaysPerWeek", value)} />
          <NumberSetting label="Weight goal" detail="optional, pounds" value={draft.weightGoalLb ?? ""} min={40} max={1000} step={0.5} optional onChange={(value) => set("weightGoalLb", value === "" ? null : value)} />
        </div>
      </section>
      <section className="panel wide-panel connection-panel">
        <div className="connection-icon"><Icon name="health" /></div><div><p className="overline">Health in ChatGPT</p><h2>Bring your connected data here</h2><p>Ask Health in ChatGPT for a structured sync file. It can include available Apple Health, Oura, Whoop, sleep, steps, weight, and heart metrics. Then import that file here.</p><div className="connection-actions"><button className="button primary" onClick={() => open("sync")}><Icon name="sync" />Start Health sync</button></div></div>
      </section>
      <section className="panel wide-panel">
        <div className="panel-head"><div><p className="overline">Your copy</p><h2>Backup and restore</h2></div></div>
        <div className="data-actions"><button className="data-action" onClick={onBackup}><span><Icon name="download" /></span><b>Export full backup</b><small>Download every entry and goal as JSON.</small></button><label className="data-action"><span><Icon name="upload" /></span><b>Restore a backup</b><small>Replace this dashboard with a prior export.</small><input type="file" accept="application/json,.json" onChange={onRestore} /></label></div>
        <div className="privacy-note"><Icon name="lock" /><p><b>Private by design.</b> Your personal records are stored in your private Site database and in this browser as a fallback. The public GitHub repository contains source code only.</p></div>
      </section>
    </div>
  );
}

function CheckInModal({ state, date, onClose, onSave }: { state: HealthState; date: string; onClose: () => void; onSave: (entry: DailyEntry, sleep: SleepEntry | null) => void }) {
  const existing = state.dailyEntries.find((entry) => entry.date === date) ?? emptyDailyEntry(date);
  const sleep = preferredSleepEntries(state.sleepEntries).find((entry) => entry.date === date);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const entry: DailyEntry = { ...existing, date: String(data.get("date")), mood: n(data.get("mood")) as DailyEntry["mood"], anxiety: n(data.get("anxiety")) as DailyEntry["anxiety"], energy: n(data.get("energy")) as DailyEntry["energy"], stress: n(data.get("stress")) as DailyEntry["stress"], weightLb: n(data.get("weight")), steps: n(data.get("steps")), medicationTaken: data.get("medication") === "yes" ? true : data.get("medication") === "no" ? false : null, journaled: bool(data.get("journaled")), therapy: bool(data.get("therapy")), exerciseMinutes: n(data.get("exercise")), outdoorMinutes: n(data.get("outdoors")), caffeineMg: n(data.get("caffeine")), alcoholDrinks: n(data.get("alcohol")), note: String(data.get("note") ?? "") };
    const hours = n(data.get("sleepHours"));
    const sleepEntry = hours === null ? null : { ...(sleep ?? emptySleepEntry(entry.date)), date: entry.date, durationHours: hours, quality: n(data.get("sleepQuality")) as SleepEntry["quality"] };
    onSave(entry, sleepEntry);
  }
  return <ModalFrame title="Daily check-in" subtitle="About one minute. Leave anything unknown blank." onClose={onClose}><form onSubmit={submit} className="form-stack"><label className="field"><span>Date</span><input type="date" name="date" defaultValue={date} required /></label><div className="scale-grid"><ScaleField name="mood" label="Mood" low="Low" high="Good" value={existing.mood} /><ScaleField name="anxiety" label="Anxiety" low="Calm" high="High" value={existing.anxiety} /><ScaleField name="energy" label="Energy" low="Low" high="High" value={existing.energy} /><ScaleField name="stress" label="Stress" low="Low" high="High" value={existing.stress} /></div><div className="form-section"><span className="form-label">Core commitments</span><div className="check-grid"><ToggleField name="journaled" label="Journaled" icon="journal" checked={existing.journaled} /><ToggleField name="therapy" label="Therapy" icon="therapy" checked={existing.therapy} /></div><fieldset className="radio-card"><legend>Medication</legend><label><input type="radio" name="medication" value="yes" defaultChecked={existing.medicationTaken === true} /> Taken</label><label><input type="radio" name="medication" value="no" defaultChecked={existing.medicationTaken === false} /> Missed</label><label><input type="radio" name="medication" value="unknown" defaultChecked={existing.medicationTaken === null} /> Not recorded</label></fieldset></div><div className="form-section"><span className="form-label">Useful numbers</span><div className="input-grid"><Field name="sleepHours" label="Sleep" suffix="hours" step="0.1" value={sleep?.durationHours} /><Field name="sleepQuality" label="Sleep quality" suffix="1–5" min="1" max="5" step="1" value={sleep?.quality} /><Field name="steps" label="Steps" value={existing.steps} /><Field name="weight" label="Weight" suffix="lb" step="0.1" value={existing.weightLb} /><Field name="exercise" label="Exercise" suffix="min" value={existing.exerciseMinutes} /><Field name="outdoors" label="Outdoors" suffix="min" value={existing.outdoorMinutes} /><Field name="caffeine" label="Caffeine" suffix="mg" value={existing.caffeineMg} /><Field name="alcohol" label="Alcohol" suffix="drinks" step="0.5" value={existing.alcoholDrinks} /></div></div><label className="field"><span>Optional note</span><textarea name="note" defaultValue={existing.note} placeholder="What affected today?" rows={3} /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" type="submit">Save check-in</button></div></form></ModalFrame>;
}

function SleepModal({ date, state, onClose, onSave }: { date: string; state: HealthState; onClose: () => void; onSave: (entry: SleepEntry) => void }) {
  const existing = state.sleepEntries.find((entry) => entry.date === date && entry.source === "manual") ?? emptySleepEntry(date);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ ...existing, date: String(data.get("date")), source: "manual", bedtime: String(data.get("bedtime") ?? ""), wakeTime: String(data.get("wakeTime") ?? ""), durationHours: n(data.get("duration")), quality: n(data.get("quality")) as SleepEntry["quality"], efficiencyPercent: n(data.get("efficiency")), deepHours: n(data.get("deep")), remHours: n(data.get("rem")), restingHeartRate: n(data.get("rhr")), hrvMs: n(data.get("hrv")), note: String(data.get("note") ?? "") }); }
  return <ModalFrame title="Add sleep" subtitle="Use the date you woke up. Wearable imports stay separate." onClose={onClose}><form onSubmit={submit} className="form-stack"><label className="field"><span>Wake-up date</span><input type="date" name="date" defaultValue={existing.date} required /></label><div className="input-grid"><label className="field"><span>Bedtime</span><input type="time" name="bedtime" defaultValue={existing.bedtime} /></label><label className="field"><span>Wake time</span><input type="time" name="wakeTime" defaultValue={existing.wakeTime} /></label><Field name="duration" label="Duration" suffix="hours" step="0.1" value={existing.durationHours} /><Field name="quality" label="Quality" suffix="1–5" min="1" max="5" step="1" value={existing.quality} /><Field name="efficiency" label="Efficiency" suffix="%" min="0" max="100" value={existing.efficiencyPercent} /><Field name="deep" label="Deep sleep" suffix="hours" step="0.1" value={existing.deepHours} /><Field name="rem" label="REM sleep" suffix="hours" step="0.1" value={existing.remHours} /><Field name="rhr" label="Resting heart rate" suffix="bpm" value={existing.restingHeartRate} /><Field name="hrv" label="HRV" suffix="ms" value={existing.hrvMs} /></div><label className="field"><span>Optional note</span><textarea name="note" rows={3} defaultValue={existing.note} /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Save sleep</button></div></form></ModalFrame>;
}

function SyncModal({ state, onClose, onImport }: { state: HealthState; onClose: () => void; onImport: (value: unknown) => void }) {
  const [copied, setCopied] = useState(false);
  const prompt = buildHealthSyncPrompt(30);
  const input = useRef<HTMLInputElement>(null);
  async function copyPrompt() { try { await navigator.clipboard.writeText(prompt); setCopied(true); } catch { setCopied(false); } }
  async function importFile(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; try { onImport(JSON.parse(await file.text())); } catch { onImport({}); } }
  return <ModalFrame title="Sync Health" subtitle="Apple Health and Oura stay in control. You choose what enters this dashboard." onClose={onClose}><div className="sync-steps"><div className="sync-step"><span>1</span><div><b>Ask Health in ChatGPT</b><p>Copy the prepared request. Paste it into a chat with the Health app connected.</p><button className="button secondary" onClick={copyPrompt}><Icon name="copy" />{copied ? "Copied" : "Copy Health request"}</button></div></div><div className="sync-step"><span>2</span><div><b>Download the file it creates</b><p>Health should return <code>bardia-health-sync.json</code>. Review the chat before downloading.</p></div></div><div className="sync-step"><span>3</span><div><b>Import it here</b><p>New dates merge into your private record. Existing manual entries stay available.</p><button className="button primary" onClick={() => input.current?.click()}><Icon name="upload" />Choose sync file</button><input ref={input} hidden type="file" accept="application/json,.json" onChange={importFile} /></div></div></div><div className="sync-summary"><Icon name="shield" /><p><b>No silent connection.</b> ChatGPT does not currently expose a direct app-to-app Health feed for this Site. This explicit file bridge keeps the transfer visible and avoids giving an unauthenticated endpoint access to your health records.</p></div><div className="modal-actions"><button className="button secondary" onClick={() => downloadJson(`bardia-health-backup-${todayLocal()}.json`, state)}>Export current backup</button><button className="button ghost" onClick={onClose}>Close</button></div></ModalFrame>;
}

function LabModal({ onClose, onSave }: { onClose: () => void; onSave: (result: LabResult) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get("name") ?? "").trim(); const date = String(data.get("date")); onSave({ id: `${date}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`, name, date, value: n(data.get("value")), unit: String(data.get("unit") ?? ""), referenceLow: n(data.get("low")), referenceHigh: n(data.get("high")), note: String(data.get("note") ?? "") }); }
  return <ModalFrame title="Add lab result" subtitle="Use the exact units and reference range printed by the lab." onClose={onClose}><form onSubmit={submit} className="form-stack"><label className="field"><span>Test name</span><input name="name" required placeholder="Example: Ferritin" /></label><label className="field"><span>Date</span><input type="date" name="date" defaultValue={todayLocal()} required /></label><div className="input-grid"><Field name="value" label="Result" step="any" /><label className="field"><span>Unit</span><input name="unit" placeholder="mg/dL" /></label><Field name="low" label="Reference low" step="any" /><Field name="high" label="Reference high" step="any" /></div><label className="field"><span>Optional note</span><textarea name="note" rows={3} /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Save result</button></div></form></ModalFrame>;
}

function ModalFrame({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { const prior = document.body.style.overflow; document.body.style.overflow = "hidden"; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", escape); panel.current?.focus(); return () => { document.body.style.overflow = prior; document.removeEventListener("keydown", escape); }; }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-panel" role="dialog" aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}><div className="modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>{children}</div></div>;
}

function Field({ name, label, suffix, value, min, max, step = "1" }: { name: string; label: string; suffix?: string; value?: number | null; min?: string; max?: string; step?: string }) { return <label className="field"><span>{label}</span><div className="input-suffix"><input type="number" name={name} defaultValue={value ?? ""} min={min} max={max} step={step} /><small>{suffix}</small></div></label>; }
function ScaleField({ name, label, low, high, value }: { name: string; label: string; low: string; high: string; value: number | null }) { return <fieldset className="scale-field"><legend>{label}</legend><div>{[1, 2, 3, 4, 5].map((number) => <label key={number}><input type="radio" name={name} value={number} defaultChecked={value === number} /><span>{number}</span></label>)}</div><small><span>{low}</span><span>{high}</span></small></fieldset>; }
function ToggleField({ name, label, icon, checked }: { name: string; label: string; icon: string; checked: boolean }) { return <label className="toggle-field"><input type="checkbox" name={name} defaultChecked={checked} /><span><Icon name={icon} /></span><b>{label}</b><i><Icon name="check" /></i></label>; }
function NumberSetting({ label, detail, value, min, max, step, optional, onChange }: { label: string; detail: string; value: number | string; min: number; max: number; step: number; optional?: boolean; onChange: (value: number | "") => void }) { return <label className="number-setting"><span><b>{label}</b><small>{detail}{optional ? " · optional" : ""}</small></span><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} /></label>; }
function RecordPill({ label, value }: { label: string; value: string }) { return <div className="record-pill"><small>{label}</small><b>{value}</b></div>; }
function Stat({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="stat"><small>{label}</small><strong>{value}</strong><span>{detail}</span></div>; }
function Empty({ icon, title, body, action }: { icon: string; title: string; body: string; action?: ReactNode }) { return <div className="empty"><span><Icon name={icon} /></span><h3>{title}</h3><p>{body}</p>{action}</div>; }
function Segmented({ value, options, onChange }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) { return <div className="segmented">{options.map((option) => <button key={option.value} className={value === option.value ? "active" : ""} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>; }
function PeriodPicker({ value, onChange }: { value: Period; onChange: (period: Period) => void }) { return <Segmented value={String(value)} options={[{ value: "14", label: "2W" }, { value: "30", label: "1M" }, { value: "90", label: "3M" }]} onChange={(next) => onChange(Number(next) as Period)} />; }

type DataPoint = { date: string; value: number | null };
function metricSeries(state: HealthState, metric: TrendMetric | "mood" | "steps", end: string, days: number): DataPoint[] {
  const dates = Array.from({ length: days }, (_, index) => addDays(end, index - days + 1));
  const sleep = new Map(preferredSleepEntries(state.sleepEntries).map((entry) => [entry.date, entry]));
  const daily = new Map(state.dailyEntries.map((entry) => [entry.date, entry]));
  return dates.map((date) => {
    if (metric === "sleep") return { date, value: sleep.get(date)?.durationHours ?? null };
    const entry = daily.get(date);
    if (!entry) return { date, value: null };
    if (metric === "weight") return { date, value: entry.weightLb };
    if (metric === "steps") return { date, value: entry.steps };
    if (metric === "mood") return { date, value: entry.mood };
    if (metric === "anxiety") return { date, value: entry.anxiety };
    return { date, value: entry.energy };
  });
}

function LineChart({ data, label, empty }: { data: DataPoint[]; label: string; empty: string }) {
  const valid = data.map((point, index) => ({ ...point, index })).filter((point): point is DataPoint & { value: number; index: number } => point.value !== null);
  const [selected, setSelected] = useState<number | null>(null);
  if (!valid.length) return <div className="chart-empty"><Icon name="chart" /><p>{empty}</p></div>;
  const width = 760, height = 250, left = 40, right = 18, top = 22, bottom = 38;
  const values = valid.map((point) => point.value);
  const minValue = Math.min(...values), maxValue = Math.max(...values);
  const pad = Math.max((maxValue - minValue) * .22, maxValue * .06, 1);
  const min = Math.max(0, minValue - pad), max = maxValue + pad;
  const x = (index: number) => left + (index / Math.max(1, data.length - 1)) * (width - left - right);
  const y = (value: number) => top + ((max - value) / Math.max(.001, max - min)) * (height - top - bottom);
  const path = valid.map((point, index) => `${index ? "L" : "M"} ${x(point.index)} ${y(point.value)}`).join(" ");
  const activeIndex = selected !== null && valid.some((point) => point.index === selected) ? selected : valid.at(-1)!.index;
  const selectedPoint = valid.find((point) => point.index === activeIndex) ?? valid.at(-1)!;
  return <div className="line-chart"><div className="chart-readout"><b>{formatMetric(label, selectedPoint.value)}</b><span>{dateLabel(selectedPoint.date, { weekday: "short", month: "short", day: "numeric" })}</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} trend`}><defs><linearGradient id={`fill-${label}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#61796f" stopOpacity=".22"/><stop offset="100%" stopColor="#61796f" stopOpacity="0"/></linearGradient></defs>{[0, .5, 1].map((portion) => <line key={portion} x1={left} x2={width-right} y1={top + portion * (height-top-bottom)} y2={top + portion * (height-top-bottom)} className="grid-line" />)}<path d={`${path} L ${x(valid.at(-1)!.index)} ${height-bottom} L ${x(valid[0].index)} ${height-bottom} Z`} fill={`url(#fill-${label})`} /><path d={path} className="line-path" />{valid.map((point) => <circle key={point.date} cx={x(point.index)} cy={y(point.value)} r={activeIndex === point.index ? 6 : 4} className={activeIndex === point.index ? "point selected" : "point"} onClick={() => setSelected(point.index)}><title>{dateLabel(point.date)}: {formatMetric(label, point.value)}</title></circle>)}<text x={left} y={height-12} className="axis-label">{dateLabel(data[0].date)}</text><text x={width-right} y={height-12} textAnchor="end" className="axis-label">{dateLabel(data.at(-1)!.date)}</text></svg></div>;
}

function SleepChart({ data, goal }: { data: DataPoint[]; goal: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const width = 760, height = 250, left = 38, right = 18, top = 22, bottom = 38;
  const max = Math.max(12, goal + 1, ...data.map((point) => point.value ?? 0));
  const xSpace = (width-left-right) / Math.max(1, data.length);
  const barWidth = Math.max(3, Math.min(22, xSpace * .62));
  const y = (value: number) => top + ((max-value)/max) * (height-top-bottom);
  const goalY = y(goal);
  const available = data.some((point) => point.value !== null);
  if (!available) return <div className="chart-empty"><Icon name="moon" /><p>No sleep data in this period.</p></div>;
  const selectedPoint = selected === null ? data.filter((point) => point.value !== null).at(-1) : data[selected];
  return <div className="sleep-chart"><div className="chart-readout"><b>{selectedPoint?.value === null || !selectedPoint ? "—" : `${selectedPoint.value.toFixed(1)} h`}</b><span>{selectedPoint ? dateLabel(selectedPoint.date, { weekday: "short", month: "short", day: "numeric" }) : "Select a night"}</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sleep duration chart"><line x1={left} x2={width-right} y1={goalY} y2={goalY} className="goal-line"/><text x={width-right} y={goalY-7} textAnchor="end" className="goal-label">{goal}h goal</text>{data.map((point, index) => { const x = left + index*xSpace + xSpace/2 - barWidth/2; const value = point.value ?? 0; return <rect key={point.date} x={x} y={point.value === null ? height-bottom-2 : y(value)} width={barWidth} height={point.value === null ? 2 : height-bottom-y(value)} rx={barWidth/2} className={`${point.value === null ? "sleep-bar missing" : value >= goal ? "sleep-bar goal" : "sleep-bar"} ${selected === index ? "selected" : ""}`} onClick={() => point.value !== null && setSelected(index)}><title>{dateLabel(point.date)}: {point.value === null ? "No data" : `${point.value.toFixed(1)} hours`}</title></rect>; })}<text x={left} y={height-12} className="axis-label">{dateLabel(data[0].date)}</text><text x={width-right} y={height-12} textAnchor="end" className="axis-label">{dateLabel(data.at(-1)!.date)}</text></svg></div>;
}

function formatMetric(label: string, value: number): string { if (label === "Steps") return Math.round(value).toLocaleString(); if (label === "Weight") return `${value.toFixed(1)} lb`; if (label === "Sleep") return `${value.toFixed(1)} h`; if (["Mood", "Anxiety", "Energy"].includes(label)) return `${value.toFixed(1)} / 5`; return value.toFixed(1); }

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    pulse: <><path d="M3 12h4l2-6 4 12 2-6h6" /></>, overview: <><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></>, sleep: <><path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z"/></>, moon: <><path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z"/></>, trends: <><path d="M4 18V6M4 18h16"/><path d="m7 14 4-4 3 2 5-6"/></>, records: <><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 11h6M9 15h6"/></>, settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5L9 6.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5 11a7 7 0 0 0 0 2l-2.1 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.5 3.1h5l.5-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4L19 13a7 7 0 0 0 .1-1Z"/></>, plus: <><path d="M12 5v14M5 12h14"/></>, sync: <><path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M18.5 10a7 7 0 0 0-11.8-4L4 7M5.5 14a7 7 0 0 0 11.8 4L20 17"/></>, medication: <><path d="m7 17 10-10a3 3 0 1 0-4-4L3 13a3 3 0 0 0 4 4Z"/><path d="m9 7 8 8"/></>, journal: <><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>, therapy: <><path d="M6 18h12M8 18v-4h8v4"/><path d="M7 8a5 5 0 0 1 10 0c0 3-2 4-3 5h-4c-1-1-3-2-3-5Z"/></>, steps: <><path d="M8 4c2 0 3 2 2 4l-2 4-3-1 1-5c.3-1.2 1-2 2-2ZM15 11c2 0 3 2 2 4l-2 5-3-1 1-6c.3-1.2 1-2 2-2Z"/></>, weight: <><path d="M5 5h14l2 16H3L5 5Z"/><path d="M9 9a3 3 0 0 1 6 0"/></>, check: <><path d="m5 12 4 4L19 6"/></>, alert: <><path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v4M12 17h.01"/></>, spark: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/></>, arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>, info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>, health: <><path d="M12 21S4 16 4 9a4 4 0 0 1 7-2.6L12 8l1-1.6A4 4 0 0 1 20 9c0 7-8 12-8 12Z"/><path d="M7 12h3l1-3 2 6 1-3h3"/></>, download: <><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></>, upload: <><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></>, lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>, close: <><path d="m6 6 12 12M18 6 6 18"/></>, copy: <><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/></>, shield: <><path d="M12 3 4 6v6c0 5 3 8 8 10 5-2 8-5 8-10V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></>, chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name] ?? paths.spark}</svg>;
}
