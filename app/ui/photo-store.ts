/**
 * Progress photos live in this device's own IndexedDB, not in the synced record.
 *
 * A synced payload is capped at about 1.5 MB, which a handful of photos would
 * blow through immediately. So the record keeps only what describes a photo —
 * its date, weight, body fat, note — and the image itself stays here. That means
 * photos do not follow you to another device and do not survive clearing site
 * data, which the Lifting page says plainly rather than hiding.
 */

const DB_NAME = "bardia-health-photos";
const STORE = "photos";
const MAX_EDGE = 1_100;
const QUALITY = 0.74;

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
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Photo storage failed."));
        transaction.oncomplete = () => db.close();
      }),
  );
}

export async function savePhoto(id: string, blob: Blob): Promise<void> {
  await run("readwrite", (store) => store.put(blob, id));
}

export async function loadPhoto(id: string): Promise<Blob | null> {
  try {
    return (await run<Blob | undefined>("readonly", (store) => store.get(id))) ?? null;
  } catch {
    return null;
  }
}

export async function deletePhoto(id: string): Promise<void> {
  try {
    await run("readwrite", (store) => store.delete(id));
  } catch {
    // A photo that cannot be deleted from storage is not worth blocking the
    // record's removal; the record is what the app reads.
  }
}

export async function storedPhotoIds(): Promise<string[]> {
  try {
    const keys = await run<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
    return keys.map(String);
  } catch {
    return [];
  }
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
      image.onerror = () => reject(new Error("That file could not be read as an image."));
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
