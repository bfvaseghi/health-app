"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { dateLabel } from "../health-model";
import type { ImportItem, ImportPreview } from "../import";
import { combineRecords, inspectFile, itemRecords, previewRecords } from "../import";
import type { ColumnMapping, ImportField } from "../import/mapping";
import { fieldDefinition, importFields } from "../import/mapping";
import { Icon } from "./icons";
import { ModalFrame, Note } from "./primitives";

const ACCEPT = ".zip,.csv,.tsv,.txt,.json,.xml,application/zip,text/csv,application/json,text/xml";

const guides: Array<{ name: string; steps: string }> = [
  { name: "Oura", steps: "Sign in at cloud.ouraring.com and download your data as CSV." },
  { name: "Whoop", steps: "Ask for your data in the app's account settings. Whoop emails a zip — drop it here whole." },
  {
    name: "Apple Health",
    steps: "Health app → your picture → Export All Health Data. Drop the export.zip here whole.",
  },
];

function summarise(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

/** Names only what a file actually holds, so a Strong export does not read "0 nights". */
function describe(preview: ImportPreview): string {
  const parts = [
    preview.nights ? summarise(preview.nights, "night", "nights") : "",
    preview.days ? summarise(preview.days, "day", "days") : "",
    preview.workouts ? summarise(preview.workouts, "workout", "workouts") : "",
    preview.sets ? summarise(preview.sets, "set", "sets") : "",
    preview.labs ? summarise(preview.labs, "lab result", "lab results") : "",
  ].filter(Boolean);
  return parts.join(", ");
}

export function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (items: ImportItem[]) => void;
}) {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [busy, setBusy] = useState("");
  const [pendingBatches, setPendingBatches] = useState(0);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const batchQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);

  function addFiles(files: File[]) {
    pendingRef.current += 1;
    setPendingBatches(pendingRef.current);
    const run = async () => {
      try {
        for (const file of files) {
          setBusy(file.name);
          setProgress(0);
          // Yield first so the file name paints before a large export blocks the thread.
          await new Promise((resolve) => window.setTimeout(resolve, 0));
          const found = await inspectFile(file, setProgress);
          setItems((current) => [...current, ...found]);
        }
      } finally {
        pendingRef.current -= 1;
        setPendingBatches(pendingRef.current);
        if (pendingRef.current === 0) {
          setBusy("");
          setProgress(0);
        }
      }
    };
    batchQueue.current = batchQueue.current.then(run, run);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files];
    if (files.length) addFiles(files);
  }

  function onChoose(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length) addFiles(files);
  }

  function updateMapping(id: string, index: number, change: Partial<ColumnMapping>) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id || item.kind !== "table") return item;
        const mapping = item.mapping.map((column, position) =>
          position === index ? { ...column, ...change } : column,
        );
        // A field can only come from one column, so taking it releases the old one.
        if (change.field) {
          for (let position = 0; position < mapping.length; position += 1) {
            if (position !== index && mapping[position].field === change.field) mapping[position] = { ...mapping[position], field: "" };
          }
        }
        return { ...item, mapping };
      }),
    );
  }

  const previews = useMemo(
    () => new Map(items.map((item) => [item.id, previewRecords(itemRecords(item))])),
    [items],
  );
  const total = useMemo(() => previewRecords(combineRecords(items)), [items]);
  const ready =
    items.some((item) => item.include && item.kind !== "error") &&
    (total.nights > 0 || total.days > 0 || total.sets > 0 || total.labs > 0);

  return (
    <ModalFrame
      title="Import health data"
      subtitle="Read in this browser. Nothing is saved until you press Import."
      onClose={onClose}
    >
      <div
        className={dragging ? "dropzone dragging" : "dropzone"}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span>
          <Icon name="upload" />
        </span>
        <b>Drop a file, or</b>
        <button type="button" className="button primary" onClick={() => input.current?.click()} disabled={pendingBatches > 0}>
          Choose files
        </button>
        <small>Oura, Whoop, and Apple Health — zip, CSV, or JSON. Several files at once is fine.</small>
        <input ref={input} hidden type="file" multiple accept={ACCEPT} onChange={onChoose} />
      </div>

      {busy ? (
        <div className="import-progress" role="status">
          <span>{`Reading ${busy}…`}</span>
          <div className="meter">
            <span style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }} />
          </div>
        </div>
      ) : null}

      <div className="guides">
        <button type="button" className="text-button" aria-expanded={showGuides} onClick={() => setShowGuides((value) => !value)}>
          <Icon name="info" />
          Where do I find my export?
        </button>
        {showGuides ? (
          <dl className="guide-list">
            {guides.map((guide) => (
              <div key={guide.name}>
                <dt>{guide.name}</dt>
                <dd>{guide.steps}</dd>
              </div>
            ))}
            <div>
              <dt>Anything else</dt>
              <dd>Any CSV or JSON with one row per day. Set the columns yourself if they are not matched.</dd>
            </div>
          </dl>
        ) : null}
      </div>

      {items.length ? (
        <ul className="import-list">
          {items.map((item) => {
            const preview = previews.get(item.id);
            const isOpen = expanded === item.id;
            return (
              <li key={item.id} className={item.kind === "error" ? "import-item error" : "import-item"}>
                <div className="import-head">
                  {item.kind === "error" ? (
                    <span className="import-mark alert">
                      <Icon name="alert" />
                    </span>
                  ) : (
                    <label className="import-mark">
                      <input
                        type="checkbox"
                        checked={item.include}
                        aria-label={`Include ${item.entryName ?? item.fileName}`}
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((entry) => (entry.id === item.id ? { ...entry, include: event.target.checked } : entry)),
                          )
                        }
                      />
                      <Icon name="check" />
                    </label>
                  )}
                  <div className="import-copy">
                    <b>{item.entryName ?? item.fileName}</b>
                    {item.kind === "error" ? (
                      <small>{item.message}</small>
                    ) : (
                      <small>
                        {item.label} ·{" "}
                        {(preview && describe(preview)) || "nothing recognized yet"}
                        {preview?.firstDate && preview.lastDate
                          ? ` · ${dateLabel(preview.firstDate, { month: "short", day: "numeric", year: "numeric" })} – ${dateLabel(preview.lastDate, { month: "short", day: "numeric", year: "numeric" })}`
                          : ""}
                      </small>
                    )}
                  </div>
                  {item.kind === "table" ? (
                    <button
                      type="button"
                      className="row-action"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded((current) => (current === item.id ? null : item.id))}
                    >
                      <Icon name="table" />
                      <span>{isOpen ? "Hide columns" : "Columns"}</span>
                    </button>
                  ) : null}
                </div>

                {preview?.warnings.length || preview?.skipped ? (
                  <p className="import-warning">
                    {[
                      ...(preview.warnings ?? []),
                      preview.skipped ? `${summarise(preview.skipped, "row", "rows")} had no readable date and were left out.` : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                ) : null}

                {item.kind === "table" && isOpen ? (
                  <div className="column-map">
                    {item.mapping.map((column, index) => {
                      const sample = item.table.rows.find((row) => (row[index] ?? "").trim() !== "")?.[index] ?? "";
                      const definition = column.field ? fieldDefinition(column.field) : null;
                      return (
                        <div key={column.column}>
                          <div className="column-name">
                            <b>{column.column}</b>
                            <small>{sample ? `e.g. ${sample}` : "empty"}</small>
                          </div>
                          <select
                            value={column.field}
                            aria-label={`What is in the ${column.column} column`}
                            onChange={(event) => updateMapping(item.id, index, { field: event.target.value as ImportField | "" })}
                          >
                            <option value="">Ignore</option>
                            {importFields.map((field) => (
                              <option key={field.field} value={field.field}>
                                {field.label}
                              </option>
                            ))}
                          </select>
                          {definition?.kind === "duration" ? (
                            <select
                              value={column.unit ?? "hours"}
                              aria-label={`Unit for ${column.column}`}
                              onChange={(event) => updateMapping(item.id, index, { unit: event.target.value })}
                            >
                              <option value="hours">hours</option>
                              <option value="minutes">minutes</option>
                              <option value="seconds">seconds</option>
                            </select>
                          ) : definition?.kind === "weight" ? (
                            <select
                              value={column.unit ?? "lb"}
                              aria-label={`Unit for ${column.column}`}
                              onChange={(event) => updateMapping(item.id, index, { unit: event.target.value })}
                            >
                              <option value="lb">pounds</option>
                              <option value="kg">kilograms</option>
                            </select>
                          ) : (
                            <span />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {items.length ? (
        <Note icon="shield">
          Health records merge field by field. A complete Strong export replaces prior lifting history so deleted or
          renamed sets do not remain behind; the preview above shows that scope before you continue.
        </Note>
      ) : null}

      <div className="modal-actions">
        <span className="import-total">
          {ready
            ? `Ready to import ${describe(total)}.`
            : ""}
        </span>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button primary" disabled={!ready || pendingBatches > 0} onClick={() => onImport(items)}>
          <Icon name="upload" />
          Import
        </button>
      </div>
    </ModalFrame>
  );
}
