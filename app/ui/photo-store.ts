/** Photo bytes are private server records. IndexedDB preserves legacy photos and caches uploads. */
import { typedPhoto } from "../photo-format";

const DB_NAME = "bardia-health-photos";
const STORE = "photos";
const MAX_EDGE = 1_100;
const QUALITY = 0.74;
const operations = new Map<string, Promise<unknown>>();
const loading = new Map<string, Promise<Blob | null>>();
let erasing = false;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Photo storage is unavailable."));
  });
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    // A successful request is not a committed write. Wait for the transaction.
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Photo storage failed.")); };
    transaction.onerror = () => transaction.abort();
  }));
}

function inOrder<T>(id: string, action: () => Promise<T>): Promise<T> {
  const job = (operations.get(id) ?? Promise.resolve()).catch(() => {}).then(() => {
    if (erasing) throw new Error("Photos are being erased.");
    return action();
  });
  operations.set(id, job);
  const cleanup = () => { if (operations.get(id) === job) operations.delete(id); };
  void job.then(cleanup, cleanup);
  return job;
}

async function requestPhoto(id: string, method = "GET", blob?: Blob): Promise<Response> {
  const response = await fetch(`/api/photos/${encodeURIComponent(id)}`, {
    method, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(60_000),
    ...(blob ? { body: blob, headers: { "Content-Type": blob.type } } : {}),
  });
  if (!response.ok && !(method === "GET" && response.status === 404)) {
    throw new Error(response.status === 401 || response.status === 403 ? "Sign in to your Baseline account to access photos." : "Photo storage is unavailable. Please try again.");
  }
  return response;
}

async function cachePhoto(id: string, blob: Blob): Promise<void> {
  // A tagged cache must never be mistaken for a legacy photo and re-uploaded
  // after the authoritative image has been deleted on another device.
  await run("readwrite", store => store.put({ blob, synced: true }, id)).catch(() => {});
}

/** The caller only adds the dated record after its bytes are durably saved. */
export function savePhoto(id: string, blob: Blob): Promise<void> {
  return inOrder(id, async () => {
    const image = await typedPhoto(blob);
    await requestPhoto(id, "PUT", image);
    await cachePhoto(id, image);
  });
}

/** Restore all images before making restored metadata visible. */
export async function savePhotos(photos: Array<{ id: string; blob: Blob }>): Promise<void> {
  for (const photo of photos) await savePhoto(photo.id, photo.blob);
}

export function loadPhoto(id: string): Promise<Blob | null> {
  if (erasing) return Promise.resolve(null);
  const pending = loading.get(id);
  if (pending) return pending;
  const result = inOrder(id, async () => {
    const response = await requestPhoto(id);
    if (response.status !== 404) {
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error("Photo unavailable.");
      return blob;
    }
    const legacy = await run<unknown>("readonly", store => store.get(id)).catch(() => null);
    if (!(legacy instanceof Blob)) return null;
    // Open an old photo on its original device once to carry it forward.
    const image = await typedPhoto(legacy);
    await requestPhoto(id, "PUT", image);
    await cachePhoto(id, image);
    return image;
  });
  loading.set(id, result);
  const cleanup = () => { if (loading.get(id) === result) loading.delete(id); };
  void result.then(cleanup, cleanup);
  return result;
}

export function deletePhoto(id: string): Promise<void> {
  return inOrder(id, async () => {
    await requestPhoto(id, "DELETE");
    await run("readwrite", store => store.delete(id)).catch(() => {});
  });
}

/** Drain uploads and legacy migrations before the server erases the bucket. */
export async function pausePhotoStorage(): Promise<void> {
  erasing = true;
  await Promise.allSettled([...operations.values()]);
}

export function resumePhotoStorage(): void { erasing = false; }

export async function storedPhotoIds(): Promise<string[]> {
  try { return (await run<IDBValidKey[]>("readonly", store => store.getAllKeys())).map(String); }
  catch { return []; }
}

/** Called only after the server has removed the owner's photo objects. */
export async function clearAllPhotos(): Promise<void> {
  await run("readwrite", store => store.clear()).catch(() => {});
}

/**
 * Decodes a photo to something a canvas can draw.
 *
 * `createImageBitmap` is the direct route, but it is not universally available
 * and some builds refuse formats their `<img>` decoder accepts, so an element
 * decode stands behind it. Both are tried before giving up on resizing.
 */
async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the element decoder.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unreadable image."));
      image.src = url;
    });
  } finally {
    // Safe once the image has loaded: the decoded bitmap outlives the URL.
    URL.revokeObjectURL(url);
  }
}

/**
 * Shrinks a photo before it is stored. A phone camera writes several megabytes
 * per shot; at this size a year of weekly photos is a few tens of megabytes.
 * If the browser will not resize it, the original is stored rather than lost.
 */
export async function shrinkImage(file: File): Promise<Blob> {
  const source = await decode(file);
  const close = () => {
    if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) source.close();
  };

  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    close();
    return file;
  }
  context.drawImage(source, 0, 0, width, height);
  close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  return blob ?? file;
}
