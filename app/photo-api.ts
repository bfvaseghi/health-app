import { PHOTO_CONTENT_TYPES as IMAGE_TYPES } from "./photo-format";

/** Private photo bytes. Metadata continues to live in the owner's health record. */
export interface PhotoBucket {
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; httpMetadata?: { contentType?: string }; size: number } | null>;
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
  list(options: { prefix: string; limit: number; cursor?: string }): Promise<{ objects: Array<{ key: string }>; truncated: boolean; cursor?: string }>;
}

const MAX_BYTES = 10 * 1024 * 1024;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const errorResponse = (message: string, status: number) => Response.json({ error: message }, { status, headers: PRIVATE_HEADERS });

export async function photoPrefix(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId.trim().toLowerCase()));
  return `photos/${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")}/`;
}

export function isSameOriginPhotoRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return (!origin || origin === new URL(request.url).origin) && request.headers.get("sec-fetch-site") !== "cross-site";
}

/** Bounded reads also cover requests without a Content-Length header. */
async function readImage(request: Request): Promise<ArrayBuffer | null> {
  if (!request.body || Number(request.headers.get("content-length")) > MAX_BYTES) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); return null; }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  if (!length) return null;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

export async function handlePhotoRequest(request: Request, id: string, dependencies: {
  userId: () => Promise<string | null>;
  isOwner: (userId: string) => Promise<boolean>;
  bucket: () => PhotoBucket;
}): Promise<Response> {
  try {
    const userId = await dependencies.userId();
    if (!userId) return errorResponse("Sign in to view or save photos.", 401);
    if (!(await dependencies.isOwner(userId))) return errorResponse("Access denied.", 403);
    if (!id || id.length > 240 || /[\u0000-\u001f]/.test(id)) return errorResponse("Invalid photo.", 400);
    if (request.method !== "GET" && !isSameOriginPhotoRequest(request)) return errorResponse("Access denied.", 403);
    const bucket = dependencies.bucket();
    const key = `${await photoPrefix(userId)}${encodeURIComponent(id)}`;

    if (request.method === "GET") {
      const photo = await bucket.get(key);
      if (!photo) return errorResponse("Photo not found.", 404);
      return new Response(photo.body, { headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": IMAGE_TYPES.has(photo.httpMetadata?.contentType ?? "") ? photo.httpMetadata!.contentType! : "application/octet-stream",
        "Content-Length": String(photo.size),
        "Content-Security-Policy": "default-src 'none'; sandbox",
      } });
    }
    if (request.method === "PUT") {
      const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
      if (!IMAGE_TYPES.has(contentType)) return errorResponse("Choose a JPEG, PNG, WebP, GIF or AVIF photo.", 415);
      const bytes = await readImage(request);
      if (!bytes) return errorResponse("Choose a photo smaller than 10 MB.", 413);
      await bucket.put(key, bytes, { httpMetadata: { contentType } });
      return new Response(null, { status: 204, headers: PRIVATE_HEADERS });
    }
    if (request.method === "DELETE") {
      await bucket.delete(key);
      return new Response(null, { status: 204, headers: PRIVATE_HEADERS });
    }
    return errorResponse("Method not allowed.", 405);
  } catch {
    // Do not log the user's identifier, image bytes or request body.
    console.error("photos: storage request failed");
    return errorResponse("Photos are temporarily unavailable. Please try again.", 503);
  }
}

/** Includes orphaned uploads, so full erase removes every owner photo. */
export async function clearOwnerPhotos(bucket: PhotoBucket, userId: string): Promise<void> {
  const prefix = await photoPrefix(userId);
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    if (page.objects.length) await bucket.delete(page.objects.map(object => object.key));
    if (!page.truncated) break;
    if (!page.cursor || page.cursor === cursor) throw new Error("Photo erase could not continue.");
    cursor = page.cursor;
  } while (true);
}
