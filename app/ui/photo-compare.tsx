"use client";

import { ChangeEvent, useEffect, useState } from "react";
import type { HealthState, ProgressPhoto } from "../health-model";
import { dateLabel } from "../health-model";
import { Icon } from "./icons";
import { loadPhoto, shrinkImage } from "./photo-store";
import { ConfirmButton, Empty } from "./primitives";

/**
 * Two photographs, side by side, either end selectable.
 *
 * This sits with body composition rather than with the lifts: a photo answers
 * the same question a scale and a caliper do, and answers it better.
 */
export function PhotoCompare({
  state,
  today,
  onAddPhoto,
  onDeletePhoto,
  onNotice,
}: {
  state: HealthState;
  today: string;
  onAddPhoto: (photo: ProgressPhoto, blob: Blob) => void;
  onDeletePhoto: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<{ left: string | null; right: string | null }>({ left: null, right: null });

  // Newest first, which is the order a comparison is usually built from.
  const photos = state.progressPhotos.slice().sort((a, b) => b.date.localeCompare(a.date));
  const oldest = photos.at(-1) ?? null;
  const newest = photos[0] ?? null;
  const byId = (id: string | null) => photos.find((photo) => photo.id === id) ?? null;
  const left = byId(pick.left) ?? oldest;
  const right = byId(pick.right) ?? (newest?.id === oldest?.id ? null : newest);

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length) return;

    setBusy(true);
    const entry = state.dailyEntries.find((item) => item.date === today);
    for (const file of files) {
      try {
        const blob = await shrinkImage(file);
        onAddPhoto(
          {
            id: `photo-${crypto.randomUUID()}`,
            date: today,
            weightLb: entry?.weightLb ?? null,
            bodyFatPercent: entry?.bodyFatPercent ?? null,
            note: "",
          },
          blob,
        );
      } catch {
        onNotice(`${file.name} could not be read as an image.`);
      }
    }
    setBusy(false);
  }

  return (
    <section className="panel wide-panel">
      <div className="panel-head wrap">
        <h2>Then and now</h2>
        <label className={busy ? "button primary disabled" : "button primary"}>
          <Icon name="camera" />
          {busy ? "Adding…" : "Add photos"}
          <input hidden type="file" accept="image/*" multiple onChange={addFiles} />
        </label>
      </div>

      {photos.length ? (
        <div className="compare-grid">
          <Slot
            photo={left}
            photos={photos}
            side="Then"
            onPick={(id) => setPick((current) => ({ ...current, left: id }))}
            onDelete={onDeletePhoto}
          />
          <Slot
            photo={right}
            photos={photos}
            side="Now"
            onPick={(id) => setPick((current) => ({ ...current, right: id }))}
            onDelete={onDeletePhoto}
          />
        </div>
      ) : (
        <Empty
          icon="camera"
          title="No photos yet"
          body="Same spot, same light, same time of day. A photo every week or two is what the numbers get checked against."
        />
      )}
    </section>
  );
}

function Slot({
  photo,
  photos,
  side,
  onPick,
  onDelete,
}: {
  photo: ProgressPhoto | null;
  photos: ProgressPhoto[];
  side: string;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!photo) {
    return (
      <figure className="compare-slot empty-slot">
        <div className="photo-missing">
          <Icon name="camera" />
          <span>{`No ${side.toLowerCase()} photo`}</span>
        </div>
      </figure>
    );
  }

  const measurements =
    [
      photo.weightLb === null ? "" : `${photo.weightLb.toFixed(1)} lb`,
      photo.bodyFatPercent === null ? "" : `${photo.bodyFatPercent}%`,
    ]
      .filter(Boolean)
      .join(" · ") || "No measurements";

  return (
    <figure className="compare-slot">
      {/* Keyed, so choosing another date starts a fresh load rather than
          clearing state inside an effect. */}
      <PhotoImage key={photo.id} photo={photo} />
      <figcaption>
        <div>
          <span className="compare-side">{side}</span>
          <b>{measurements}</b>
        </div>
        <div className="compare-actions">
          <label>
            <span className="visually-hidden">{`${side} photo`}</span>
            <select value={photo.id} onChange={(event) => onPick(event.target.value)}>
              {photos.map((option) => (
                <option key={option.id} value={option.id}>
                  {dateLabel(option.date, { month: "short", day: "numeric", year: "numeric" })}
                </option>
              ))}
            </select>
          </label>
          <ConfirmButton
            label={`Delete the photo from ${dateLabel(photo.date)}`}
            onConfirm={() => onDelete(photo.id)}
          />
        </div>
      </figcaption>
    </figure>
  );
}

function PhotoImage({ photo }: { photo: ProgressPhoto }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let revoke: string | null = null;
    let active = true;
    void loadPhoto(photo.id).then((blob) => {
      if (!active) return;
      if (!blob) {
        setMissing(true);
        return;
      }
      revoke = URL.createObjectURL(blob);
      setUrl(revoke);
    });
    return () => {
      active = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [photo.id]);

  if (!url) {
    return (
      <div className="photo-missing">
        <Icon name={missing ? "alert" : "camera"} />
        <span>{missing ? "Not on this device" : "Loading"}</span>
      </div>
    );
  }
  return (
    // A blob: URL from this device's IndexedDB — there is no remote asset for
    // next/image to fetch, size, or optimize.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`Progress photo from ${dateLabel(photo.date, { month: "long", day: "numeric", year: "numeric" })}`}
    />
  );
}
