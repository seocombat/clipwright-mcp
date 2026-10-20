import { z } from "zod";

/** The same cap as the source probe (`PROBE_MAX_BYTES` in service-core, guarded there). */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Uploads per account over a sliding day; a link lives one day. */
export const UPLOAD_DAILY_CAP = 20;
export const UPLOAD_WINDOW_SECONDS = 86_400;
export const UPLOAD_URL_TTL_SECONDS = 86_400;
/** As long as a run's media (`RENDER_RETENTION_DAYS`): a draft may name an upload on the run's first day. Storage lifecycle, docs/10 §4. */
export const UPLOAD_OBJECT_RETENTION_DAYS = 30;

/** No WebP on purpose: the probe cannot read its dimensions, and without them the format cannot be checked. */
export const UPLOAD_MEDIA_TYPES = ["image/png", "image/jpeg"] as const;
export type UploadMediaType = (typeof UPLOAD_MEDIA_TYPES)[number];

export const UPLOADS_PATH = "/v1/uploads";
/** Remote uploads (clipwright#758): a server-side download, a presigned PUT, and the read that confirms one. */
export const UPLOAD_IMPORT_PATH = "/v1/uploads/import";
export const UPLOAD_INTENTS_PATH = "/v1/uploads/intents";
export const UPLOAD_ITEM_PATH = "/v1/uploads/:id";

/** A presigned PUT url lives 15 minutes; the intent it serves can be finished for a day. */
export const UPLOAD_PUT_URL_TTL_SECONDS = 900;
export const UPLOAD_INTENT_FINISH_SECONDS = 86_400;
/** The finisher's lease outlives its storage calls by 35 s, and those stay under the SDK's 30 s per request plus margin. */
export const UPLOAD_FINISH_LEASE_SECONDS = 60;
export const UPLOAD_FINISH_IO_DEADLINE_MS = 25_000;
/** A repeated key answers the earlier result only within a day and only while that result is still usable. */
export const IDEMPOTENCY_REPLAY_SECONDS = 86_400;
/** Outbound downloads: attempts per account per hour, imports at once per `api` instance, and one import's deadline. */
export const URL_FETCH_PER_HOUR = 30;
export const URL_FETCH_WINDOW_SECONDS = 3600;
export const URL_IMPORT_CONCURRENCY = 4;
export const URL_IMPORT_IMAGE_DEADLINE_MS = 20_000;
export const URL_IMPORT_MAX_REDIRECTS = 3;
/** The longest side a customer picture may have. */
export const UPLOAD_MAX_SIDE = 8192;

export const uploadId = z.string().regex(/^upl_[a-f0-9]{32}$/);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const uploadImportRequest = z.strictObject({
  url: z.string().url().startsWith("https://").max(2048),
});
export type UploadImportRequest = z.infer<typeof uploadImportRequest>;

/** `filename` is a hint for people and is not part of the request's identity. */
export const uploadIntentRequest = z.strictObject({
  media_type: z.enum(UPLOAD_MEDIA_TYPES),
  bytes: z.number().int().positive().max(UPLOAD_MAX_BYTES),
  sha256: sha256Hex,
  filename: z.string().min(1).max(200).optional(),
});
export type UploadIntentRequest = z.infer<typeof uploadIntentRequest>;

export const uploadIntentResponse = z.strictObject({
  upload_id: uploadId,
  put_url: z.string().url().startsWith("https://"),
  put_headers: z.strictObject({
    "content-type": z.enum(UPLOAD_MEDIA_TYPES),
    "content-length": z.string().regex(/^\d+$/),
  }),
  expires_at: z.string().datetime(),
  finish_by: z.string().datetime(),
});
export type UploadIntentResponse = z.infer<typeof uploadIntentResponse>;

export const uploadResponse = z.object({
  upload_id: uploadId,
  content_digest: z.string().regex(/^[a-f0-9]{64}$/).describe("SHA-256 of the original uploaded bytes; use it as the workflow asset content_digest."),
  url: z.string().url().startsWith("https://"),
  media_type: z.enum(UPLOAD_MEDIA_TYPES),
  bytes: z.number().int().positive().max(UPLOAD_MAX_BYTES),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  expires_at: z.string().datetime(),
});
export type UploadResponse = z.infer<typeof uploadResponse>;

/** `GET /v1/uploads/{id}`: one upload with a link signed now, and when a generation or revision stops taking it. */
export const uploadItemResponse = uploadResponse.extend({ usable_until: z.string().datetime() });
export type UploadItemResponse = z.infer<typeof uploadItemResponse>;
export const uploadItemRead = uploadItemResponse.extend({
  media_type: z.string().min(1), bytes: z.number().int().positive(),
}).loose();
export type UploadItemRead = z.infer<typeof uploadItemRead>;

/** `GET /v1/uploads`: the account's uploads a revision still takes, newest first, one per picture, each with a link signed now. */
export const uploadList = z.strictObject({
  uploads: z.array(z.strictObject({
    ...uploadResponse.shape,
    created_at: z.string().datetime(),
    /** When a revision stops taking it: the stored object's retention less the admission margin, rounded down to the ms. */
    usable_until: z.string().datetime(),
  })),
  contract_version: z.string().min(1),
});
export type UploadList = z.infer<typeof uploadList>;

// What installed clients parse: the media type is an open string, the size has no cap, and unknown keys are kept.
export const uploadListRead = uploadList.extend({
  uploads: z.array(uploadList.shape.uploads.element.extend({
    media_type: z.string().min(1), bytes: z.number().int().positive(),
  }).loose()),
}).loose();
export type UploadListRead = z.infer<typeof uploadListRead>;

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
  "Get an upload_id and a signed https url for a PNG or JPEG up to 10 MB: from a LOCAL file (`path`, only when this " +
  "server runs on your machine) or from a public https `url` that the server downloads (up to 20 seconds; redirects " +
  "are followed up to 3 times). Pass the url as `image` to quote_ugc / make_ugc, and the upload_id as " +
  "{upload_id, rights_confirmed: true} in references, first_frame or last_frame of quote_image, generate_image, " +
  "quote_video and generate_video. The url is signed for 24 hours; the upload_id stays usable for 30 days. For " +
  "workflow assets, use the upload_id as asset_id and content_digest directly: it is the SHA-256 of the original " +
  "bytes. Set `aspect_ratio` EXPLICITLY to match the picture. For a file on your disk while this server is remote, " +
  "use create_upload. Free: spends no credits; 20 uploads per day per account, and at most 30 url downloads per hour.";

export const CREATE_UPLOAD_DESCRIPTION =
  "Upload a LOCAL PNG or JPEG (up to 10 MB) through a one-time presigned PUT; use it when this server is remote and " +
  "you have a shell. Pass media_type, the exact size in bytes and the file's sha256 (`sha256sum <file>` or " +
  "`shasum -a 256 <file>`). Within 15 minutes run: `curl -X PUT -H 'content-type: <media_type>' --data-binary " +
  "@<file> '<put_url>'` (curl sends the content-length itself; both headers must match what you declared). Once the " +
  "PUT finished, the upload_id works as {upload_id, rights_confirmed: true} in quote_image, generate_image, " +
  "quote_video and generate_video; before that they answer upload_not_finished. Call get_upload to confirm and to " +
  "read content_digest, width and height; other tools that take an upload_id need that call first. Use the " +
  "upload_id within 24 hours. Free; counts toward 20 uploads per day.";

export const GET_UPLOAD_DESCRIPTION =
  "Read one upload by upload_id: a freshly signed https url, content_digest, media_type, bytes, width, height and " +
  "usable_until. After create_upload it also confirms the PUT: it answers upload_not_finished until the file is " +
  "there and upload_expired after 24 hours. Free.";
