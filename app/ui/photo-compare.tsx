"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import type { HealthState, ProgressPhoto } from "../health-model";
import { dateLabel } from "../health-model";
import { photoDateOption, photoInterval, photoSelection, photoTimeline } from "../photo-timeline";
import { recordId } from "../record-id";
import { Icon } from "./icons";
import { loadPhoto, shrinkImage } from "./photo-store";
import { ConfirmButton, ModalFrame, Segmented } from "./primitives";

export function PhotoCompare({ state, today, onAddPhoto, onUpdatePhoto, onDeletePhoto, onNotice, loadImage = loadPhoto }: {
  state: HealthState;
  today: string;
  onAddPhoto: (photo: ProgressPhoto, blob: Blob) => Promise<void>;
  onUpdatePhoto: (photo: ProgressPhoto) => void;
  onDeletePhoto: (id: string) => void;
  onNotice: (message: string) => void;
  loadImage?: (id: string) => Promise<Blob | null>;
}) {
  const [mode, setMode] = useState("timeline");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pair, setPair] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoDate, setPhotoDate] = useState(today);
  const [editing, setEditing] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const photos = useMemo(() => photoTimeline(state.progressPhotos, today), [state.progressPhotos, today]);
  const { selected, index, from, to, days } = photoSelection(photos, selectedId, pair.from, pair.to);
  const compare = mode === "compare" && from && to;
  const editPhoto = photos.find(photo => photo.id === editing);
  const largePhoto = photos.find(photo => photo.id === enlarged);
  const select = (id: string) => { setSelectedId(id); setEditing(null); };
  const shown = photos.slice(Math.max(0, Math.min(index - 2, photos.length - 5)), Math.max(5, index + 3));

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    const entry = state.dailyEntries.find(item => item.date === photoDate);
    let saved = 0;
    const failed: string[] = [];
    let lastId: string | null = null;
    for (const file of files) {
      try {
        const blob = await shrinkImage(file);
        const photo = { id: recordId("photo"), date: photoDate, weightLb: entry?.weightLb ?? null, bodyFatPercent: entry?.bodyFatPercent ?? null, note: "" };
        await onAddPhoto(photo, blob);
        saved += 1;
        lastId = photo.id;
      } catch { failed.push(file.name); }
    }
    setBusy(false);
    if (lastId) { setSelectedId(lastId); setMode("timeline"); }
    if (!failed.length) setAdding(false);
    onNotice(failed.length ? `${saved ? `${saved} saved. ` : ""}Could not save ${failed.join(", ")}. Please try again.` : `${saved} ${saved === 1 ? "photo" : "photos"} added.`);
  }

  const controls = (photo: ProgressPhoto) => <div className="photo-record-actions"><button type="button" className="text-button" onClick={() => setEditing(photo.id)}><Icon name="pencil" />Edit details</button><ConfirmButton label={`Delete photo from ${dateLabel(photo.date)}`} onConfirm={() => onDeletePhoto(photo.id)} /></div>;
  const image = (photo: ProgressPhoto, thumbnail = false) => <PhotoImage key={photo.id} photo={photo} loadImage={loadImage} thumbnail={thumbnail} />;
  const option = (photo: ProgressPhoto) => <option key={photo.id} value={photo.id}>{dateLabel(photo.date, { month: "short", day: "numeric", year: "numeric" })}{photoDateOption(photo, photos)}</option>;

  return <section className="photo-journal" aria-label="Progress photos">
    <div className="photo-journal-heading"><div><h2>Progress photos</h2>{photos.length ? <p>{photos.length} {photos.length === 1 ? "photo" : "photos"}{photos.length > 1 ? ` · ${dateLabel(photos[0].date, { month: "short", day: "numeric", year: photos[0].date.slice(0, 4) !== photos.at(-1)!.date.slice(0, 4) ? "numeric" : undefined })}–${dateLabel(photos.at(-1)!.date, { month: "short", day: "numeric", year: "numeric" })}` : ""}</p> : null}</div><button type="button" className="button primary small" onClick={() => { setPhotoDate(today); setAdding(true); }} disabled={busy}><Icon name="camera" />Add photos</button></div>

    {adding ? <div className="photo-add-form"><label className="photo-date"><span>Date taken</span><input type="date" aria-label="Date taken" disabled={busy} value={photoDate} max={today} onChange={event => setPhotoDate(event.target.value)} /></label><div className="tl-actions"><label className={`button primary${busy || !photoDate || photoDate > today ? " disabled" : ""}`}><Icon name="upload" />{busy ? "Saving…" : "Choose photos"}<input aria-label="Choose progress photos" className="visually-hidden" disabled={busy || !photoDate || photoDate > today} type="file" accept="image/*" multiple onChange={addFiles} /></label><button type="button" className="text-button" disabled={busy} onClick={() => setAdding(false)}>Cancel</button></div><p>Selected photos use this date. You can edit each one afterward.</p></div> : null}

    {!photos.length ? <div className="photo-timeline-empty"><Icon name="camera" /><h3>Add your first progress photo</h3><p>Each photo keeps its date. Add another later to compare.</p></div> : <>
      {photos.length > 1 ? <div className="photo-mode"><Segmented label="Photo view" value={compare ? "compare" : "timeline"} onChange={value => { setMode(value); setEditing(null); }} options={[{ value: "timeline", label: "Timeline" }, { value: "compare", label: "Compare dates" }]} /></div> : null}

      {compare ? <div className="photo-date-comparison">
        <div className="photo-comparison-summary"><b>{photoInterval(days!)}</b>{from.weightLb !== null && to.weightLb !== null ? <span>{to.weightLb - from.weightLb > 0 ? "+" : ""}{(to.weightLb - from.weightLb).toFixed(1)} lb</span> : null}</div>
        <div className="photo-pair-grid">{([['from', from], ['to', to]] as const).map(([side, photo]) => <figure key={side} className="photo-pair-card"><label><span>{side === "from" ? "From" : "To"}</span><select aria-label={side === "from" ? "Earlier comparison photo" : "Later comparison photo"} value={photo.id} onChange={event => setPair(current => ({ ...current, [side]: event.target.value, [side === "from" ? "to" : "from"]: side === "from" ? to.id : from.id }))}>{photos.filter(item => side === "from" ? photos.indexOf(item) < photos.indexOf(to) : photos.indexOf(item) > photos.indexOf(from)).map(option)}</select></label><button type="button" className="photo-enlarge" aria-label={`Enlarge photo from ${dateLabel(photo.date)}`} onClick={() => setEnlarged(photo.id)}>{image(photo)}<span className="photo-enlarge-hint"><Icon name="expand" /><span>Enlarge</span></span></button><figcaption><PhotoFacts photo={photo} />{controls(photo)}</figcaption></figure>)}</div>
      </div> : selected ? <>
        <figure className="photo-timeline-viewer"><button type="button" className="photo-enlarge" aria-label={`Enlarge photo from ${dateLabel(selected.date)}`} onClick={() => setEnlarged(selected.id)}>{image(selected)}<span className="photo-enlarge-hint"><Icon name="expand" /><span>Enlarge</span></span></button><figcaption>
          {photos.length > 1 ? <div className="photo-step-controls"><button type="button" className="icon-button" aria-label="Previous photo" disabled={index <= 0} onClick={() => select(photos[index - 1].id)}><Icon name="arrow" /></button><label><span className="visually-hidden">Photo date</span><select aria-label="Photo date" value={selected.id} onChange={event => select(event.target.value)}>{photos.map(option)}</select><small>{index + 1} of {photos.length}</small></label><button type="button" className="icon-button" aria-label="Next photo" disabled={index >= photos.length - 1} onClick={() => select(photos[index + 1].id)}><Icon name="arrow" /></button></div> : <b>{dateLabel(selected.date, { month: "long", day: "numeric", year: "numeric" })}</b>}
          <PhotoFacts photo={selected} />{controls(selected)}
        </figcaption></figure>
        {photos.length > 1 ? <div className="photo-filmstrip" role="group" aria-label="Photos by date">{shown.map(photo => <button type="button" key={photo.id} aria-label={`View photo from ${dateLabel(photo.date)}${photoDateOption(photo, photos)}`} aria-pressed={photo.id === selected.id} onClick={() => select(photo.id)}>{image(photo, true)}<span>{dateLabel(photo.date, { month: "short", day: "numeric" })}</span></button>)}</div> : <p className="photo-next-note">Add another date to compare changes over time.</p>}
      </> : null}
    </>}

    {editPhoto ? <ModalFrame title="Photo details" subtitle="" onClose={() => setEditing(null)}><form className="photo-details-form" key={editPhoto.id} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const number = (name: string) => data.get(name) === "" ? null : Number(data.get(name));
      const photo = { ...editPhoto, date: String(data.get("date")), weightLb: number("weight"), bodyFatPercent: number("fat"), note: String(data.get("note") ?? "").trim() };
      onUpdatePhoto(photo);
      setSelectedId(photo.id);
      setEditing(null);
    }}><label>Date taken<input name="date" type="date" required max={today} defaultValue={editPhoto.date} /></label><label>Weight (lb)<input name="weight" type="number" min="40" max="1000" step="0.1" defaultValue={editPhoto.weightLb ?? ""} /></label><label>Body fat (%)<input name="fat" type="number" min="1" max="70" step="0.1" defaultValue={editPhoto.bodyFatPercent ?? ""} /></label><label>Note<textarea name="note" maxLength={500} rows={2} defaultValue={editPhoto.note} placeholder="Optional" /></label><button type="submit" className="button primary">Save details</button></form></ModalFrame> : null}
    {largePhoto ? <ModalFrame title={dateLabel(largePhoto.date, { month: "long", day: "numeric", year: "numeric" })} subtitle="" onClose={() => setEnlarged(null)}><div className="photo-lightbox">{image(largePhoto)}</div><PhotoFacts photo={largePhoto} /></ModalFrame> : null}
  </section>;
}

function PhotoFacts({ photo }: { photo: ProgressPhoto }) {
  return <div className="photo-facts">{photo.weightLb !== null || photo.bodyFatPercent !== null ? <p>{[photo.weightLb !== null ? `${photo.weightLb.toFixed(1)} lb` : null, photo.bodyFatPercent !== null ? `${photo.bodyFatPercent}% body fat` : null].filter(Boolean).join(" · ")}</p> : null}{photo.note ? <p className="photo-note">{photo.note}</p> : null}</div>;
}

function PhotoImage({ photo, loadImage, thumbnail = false }: { photo: ProgressPhoto; loadImage: (id: string) => Promise<Blob | null>; thumbnail?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let revoke: string | null = null;
    let active = true;
    setMissing(false);
    setUrl(null);
    void loadImage(photo.id).then(blob => {
      if (!active) return;
      if (!blob) { setMissing(true); return; }
      revoke = URL.createObjectURL(blob);
      setUrl(revoke);
    }).catch(() => { if (active) setMissing(true); });
    return () => { active = false; if (revoke) URL.revokeObjectURL(revoke); };
  }, [photo.id, loadImage]);
  return <span className={`photo-image${thumbnail ? " thumbnail" : ""}`}>{url && !missing ?
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={`Progress photo from ${dateLabel(photo.date, { month: "long", day: "numeric", year: "numeric" })}`} onError={() => setMissing(true)} />
    : <span className="photo-image-status"><Icon name={missing ? "alert" : "camera"} /><span>{missing ? "Photo unavailable" : "Loading photo…"}</span>{!thumbnail && missing ? <span>Try opening it again.</span> : null}</span>}</span>;
}
