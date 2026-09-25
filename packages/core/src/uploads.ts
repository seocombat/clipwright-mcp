import { z } from "zod";

/** The same cap as the source probe (`PROBE_MAX_BYTES` in service-core, guarded there). */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Uploads per account over a sliding day; a link lives one day, the object seven (storage lifecycle). */
export const UPLOAD_DAILY_CAP = 20;
export const UPLOAD_WINDOW_SECONDS = 86_400;
export const UPLOAD_URL_TTL_SECONDS = 86_400;
export const UPLOAD_OBJECT_RETENTION_DAYS = 7;

/** No WebP on purpose: the probe cannot read its dimensions, and without them the format cannot be checked. */
export const UPLOAD_MEDIA_TYPES = ["image/png", "image/jpeg"] as const;
export type UploadMediaType = (typeof UPLOAD_MEDIA_TYPES)[number];

export const UPLOADS_PATH = "/v1/uploads";

export const uploadResponse = z.object({
  upload_id: z.string().regex(/^upl_[a-f0-9]{32}$/),
  url: z.string().url().startsWith("https://"),
  media_type: z.enum(UPLOAD_MEDIA_TYPES),
  bytes: z.number().int().positive().max(UPLOAD_MAX_BYTES),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  expires_at: z.string().datetime(),
});
export type UploadResponse = z.infer<typeof uploadResponse>;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Type by the first bytes, not by header or extension: the sender writes those. */
export function sniffUploadMediaType(bytes: Uint8Array): UploadMediaType | null {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

export function uploadExtension(mediaType: UploadMediaType): "png" | "jpg" {
  return mediaType === "image/png" ? "png" : "jpg";
}

export const UPLOAD_IMAGE_DESCRIPTION =
  "Upload a LOCAL image file (PNG or JPEG, up to 10 MB) and get an https url to pass as `image` " +
  "to quote_ugc / make_ugc. The url is signed and expires in 24 hours; upload again after that. " +
  "Use this whenever the user points at a file on disk — `image` itself accepts only public https " +
  "urls. Then set `aspect_ratio` EXPLICITLY to match the picture (a 16:9 photo with no aspect_ratio " +
  "renders vertical 9:16 with a warning). Free: spends no credits; 20 uploads per day per account.";
