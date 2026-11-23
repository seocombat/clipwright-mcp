import { z } from "zod";

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export const UPLOAD_DAILY_CAP = 200;
export const UPLOAD_WINDOW_SECONDS = 86_400;
export const UPLOAD_URL_TTL_SECONDS = 86_400;
export const UPLOAD_OBJECT_RETENTION_DAYS = 365;

export const UPLOAD_MEDIA_TYPES = ["image/png", "image/jpeg"] as const;
export type UploadMediaType = (typeof UPLOAD_MEDIA_TYPES)[number];

export const UPLOADS_PATH = "/v1/uploads";
export const UPLOAD_IMPORT_PATH = "/v1/uploads/import";
export const UPLOAD_INTENTS_PATH = "/v1/uploads/intents";
export const UPLOAD_ITEM_PATH = "/v1/uploads/:id";

export const UPLOAD_PAGES_PATH = "/v1/uploads/pages";
export const UPLOAD_PAGE_DROP_PATH = "/v1/public/upload-pages/:token";
export const UPLOAD_PAGE_WEB_PATH = "/upload";
export const UPLOAD_PAGE_TTL_SECONDS = 1800;
export const UPLOAD_PAGE_DROPS_PER_HOUR = 20;
export const UPLOAD_PAGE_DROP_WINDOW_SECONDS = 3600;
export const uploadPageToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const redactUploadPageToken = (path: string): string => path.replace(/(\/(?:upload-pages|upload)\/)[^/]+/, "$1<token>");

export const UPLOAD_PUT_URL_TTL_SECONDS = 900;
export const UPLOAD_INTENT_FINISH_SECONDS = 86_400;
export const UPLOAD_FINISH_LEASE_SECONDS = 60;
export const UPLOAD_FINISH_IO_DEADLINE_MS = 25_000;
export const IDEMPOTENCY_REPLAY_SECONDS = 86_400;
export const URL_FETCH_PER_HOUR = 30;
export const URL_FETCH_WINDOW_SECONDS = 3600;
export const URL_IMPORT_CONCURRENCY = 4;
export const URL_IMPORT_IMAGE_DEADLINE_MS = 20_000;
export const URL_IMPORT_MAX_REDIRECTS = 3;
export const UPLOAD_MAX_SIDE = 8192;

export const uploadId = z.string().regex(/^upl_[a-f0-9]{32}$/);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const uploadPageRequest = z.strictObject({});
export const uploadPageResponse = z.strictObject({
  upload_id: uploadId,
  page_url: z.string().url(),
  expires_at: z.string().datetime(),
});
export type UploadPageResponse = z.infer<typeof uploadPageResponse>;
export const uploadPageRead = uploadPageResponse.loose();
export type UploadPageRead = z.infer<typeof uploadPageRead>;

export const uploadPageDropResponse = z.strictObject({
  upload_id: uploadId,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const uploadImportRequest = z.strictObject({
  url: z.string().url().startsWith("https://").max(2048),
});
export type UploadImportRequest = z.infer<typeof uploadImportRequest>;

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

export const uploadItemResponse = uploadResponse.extend({ usable_until: z.string().datetime() });
export type UploadItemResponse = z.infer<typeof uploadItemResponse>;
export const uploadItemRead = uploadItemResponse.extend({
  media_type: z.string().min(1), bytes: z.number().int().positive(),
}).loose();
export type UploadItemRead = z.infer<typeof uploadItemRead>;

export const uploadList = z.strictObject({
  uploads: z.array(z.strictObject({
    ...uploadResponse.shape,
    created_at: z.string().datetime(),
    usable_until: z.string().datetime(),
  })),
  contract_version: z.string().min(1),
});
export type UploadList = z.infer<typeof uploadList>;

export const uploadListRead = uploadList.extend({
  uploads: z.array(uploadList.shape.uploads.element.extend({
    media_type: z.string().min(1), bytes: z.number().int().positive(),
  }).loose()),
}).loose();
export type UploadListRead = z.infer<typeof uploadListRead>;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

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
  "server runs on your machine) or a public https `url` the server downloads (up to 20 seconds and 3 redirects). " +
  "Pass the url as `image` to quote_ugc / make_ugc, and the upload_id as a generation reference or frame (quote_image " +
  "says how). The url is signed for 24 hours; the upload_id is usable for " +
  `${UPLOAD_OBJECT_RETENTION_DAYS} days. For ` +
  "workflow assets the upload_id is both asset_id and content_digest: the SHA-256 of the original " +
  "bytes. Set `aspect_ratio` to match the picture. For a file on your disk while this server is remote, " +
  "use create_upload; for a photo attached in chat, create_upload with no arguments gives a page link to drop it on. Free; 200 uploads per day per account, at most 30 url downloads per hour.";

export const CREATE_UPLOAD_DESCRIPTION =
  "With no arguments it returns an upload_id and a page_url, a page where a person drops one photo in a browser (PNG or " +
  "JPEG; other phone photos are converted). It suits a photo you cannot send yourself, such as one attached in chat: " +
  "the user opens the page_url, and get_upload with the upload_id answers upload_not_finished until the photo is " +
  "dropped. The link takes one photo and works for 30 minutes. " +
  "With media_type, bytes and sha256 it uploads a LOCAL PNG or JPEG (up to 10 MB) through a one-time presigned PUT; use it when this server is remote and " +
  "you have a shell. Pass media_type, the exact size in bytes and the file's sha256 (`sha256sum <file>` or " +
  "`shasum -a 256 <file>`). Within 15 minutes run: `curl -X PUT -H 'content-type: <media_type>' --data-binary " +
  "@<file> '<put_url>'` (curl sends the content-length itself; both headers must match what you declared). Once the " +
  "PUT finished, the upload_id works as a generation reference (quote_image says how); before that it answers " +
  "upload_not_finished. Call get_upload to confirm and to " +
  "read content_digest, width and height; other tools that take an upload_id need that call first. Use the " +
  "upload_id within 24 hours. Free; counts toward 200 uploads per day.";

export const GET_UPLOAD_DESCRIPTION =
  "Read one upload by upload_id: a freshly signed https url, content_digest, media_type, bytes, width, height and " +
  "usable_until. After create_upload it also confirms the PUT or the page drop: it answers upload_not_finished until " +
  "the file is there and upload_expired once the PUT window (24 hours) or the page link (30 minutes) has passed. Free.";
