export const PHOTO_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

/** Old archive restores sometimes left the Blob's MIME type blank. */
export async function typedPhoto(blob: Blob): Promise<Blob> {
  if (PHOTO_CONTENT_TYPES.has(blob.type)) return blob;
  const bytes = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  const type = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
    : [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte) ? "image/png"
    : /^GIF8[79]a/.test(text) ? "image/gif"
    : text.startsWith("RIFF") && text.slice(8, 12) === "WEBP" ? "image/webp"
    : text.slice(4, 8) === "ftyp" && /avif|avis/.test(text.slice(8)) ? "image/avif" : null;
  if (!type) throw new Error("Choose a JPEG, PNG, WebP, GIF or AVIF photo.");
  return blob.slice(0, blob.size, type);
}
