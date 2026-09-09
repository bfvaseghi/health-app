/** Bundled, generated examples. These IDs never resolve through private photo storage. */
export const DEMO_PHOTO_ASSETS = new Map([
  ["demo-progress-earlier", "/demo/progress-earlier.png"],
  ["demo-progress-middle", "/demo/progress-middle.png"],
  ["demo-progress-recent", "/demo/progress-recent.png"],
]);

/** Null entries mark removed or replaced examples, so they cannot reappear. */
export async function readDemoPhoto(
  id: string,
  photos: Map<string, Blob | null>,
  fetchAsset: typeof fetch = fetch,
): Promise<Blob | null> {
  if (photos.has(id)) return photos.get(id) ?? null;
  const path = DEMO_PHOTO_ASSETS.get(id);
  if (!path) return null;
  try {
    // The static asset may sit behind the Site's own sign-in gate.
    const response = await fetchAsset(path, { credentials: "same-origin" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    // A deletion made while loading wins over the incoming example.
    if (!photos.has(id)) photos.set(id, blob);
    return photos.get(id) ?? null;
  } catch {
    return null;
  }
}
