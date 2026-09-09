import { env } from "cloudflare:workers";
import type { PhotoBucket } from "./photo-api";

export function photoBucket(): PhotoBucket {
  const bucket = (env as unknown as { PHOTOS?: PhotoBucket }).PHOTOS;
  if (!bucket) throw new Error("Photo storage unavailable.");
  return bucket;
}
