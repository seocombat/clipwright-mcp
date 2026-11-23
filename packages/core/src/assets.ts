import { z } from "zod";

import { ASSET_KINDS, ASSET_MEDIA_TYPES, assetId } from "./asset-identity.js";
import { mascotSummary } from "./mascots.js";
import { runId } from "./runs.js";
import { UPLOAD_MAX_BYTES, UPLOAD_MEDIA_TYPES, uploadId } from "./uploads.js";


export const ASSETS_PATH = "/v1/assets";
export const ASSET_BYTES_PATH = "/v1/assets/bytes";
export const ASSET_ITEM_PATH = "/v1/assets/:id";

export const ASSET_ACCOUNT_MAX_COUNT = 2000;
export const ASSET_TRIAL_MAX_BYTES = 1_000_000_000;
export const ASSET_ACCOUNT_MAX_BYTES = 20_000_000_000;
export const ASSET_INGEST_DAILY_CAP = 100;
export const ASSET_INGEST_WINDOW_SECONDS = 86_400;
export const ASSET_BASE64_MAX_BYTES = 700_000;
export const ASSET_BASE64_MAX_CHARS = Math.ceil(ASSET_BASE64_MAX_BYTES / 3) * 4;
export const ASSET_URL_TTL_SECONDS = 3600;
export const ASSET_DELETE_GRACE_DAYS = 7;
export const ASSET_NAME_MAX_CHARS = 80;
export const ASSET_LIST_MAX_LIMIT = 100;
export const ASSET_TOOL_PAGE = 8;
export const ASSET_TOOL_ANSWER_CHARS = 12_000;

export const ASSET_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const ASSET_VIDEO_MAX_SECONDS = 120;
export const ANALYSIS_VIDEO_MAX_SECONDS = 180;
export const assetVideoMaxSeconds = (analysisOnly: boolean): number => (analysisOnly ? ANALYSIS_VIDEO_MAX_SECONDS : ASSET_VIDEO_MAX_SECONDS);
export const ASSET_VIDEO_CODECS = ["h264", "hevc"] as const;
export const ASSET_BYTES_ROUTE_VIDEO_MAX_BYTES = 32 * 1024 * 1024;
export const ASSET_PROCESSING_SECONDS = 600;
export const ASSET_VIDEO_DOWNLOAD_DEADLINE_MS = 90_000;
export const ASSET_INGEST_TASK_MAX_DURATION_SECONDS = 300;
export const ASSET_PUT_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export const ASSET_PUT_MEDIA_TYPES = ["image/png", "image/jpeg", ...ASSET_PUT_VIDEO_TYPES] as const;
export type AssetPutMediaType = (typeof ASSET_PUT_MEDIA_TYPES)[number];
export const isAssetPutVideoType = (mediaType: string): boolean => (ASSET_PUT_VIDEO_TYPES as readonly string[]).includes(mediaType);
export const assetPutStoredType = (mediaType: AssetPutMediaType): "image/png" | "image/jpeg" | "video/mp4" =>
  mediaType === "image/png" || mediaType === "image/jpeg" ? mediaType : "video/mp4";
export const INGEST_ASSET_MEDIA_TASK = "ingest-asset-media";

export const ASSET_PREVIEW_TASK = "make-asset-preview";
export const ASSET_PREVIEW_MAX_SIDE = 512;
export const ASSET_PREVIEW_QUALITY = 75;
export const ASSET_PREVIEW_SWEEP_BATCH = 200;
export const ASSET_PREVIEW_MAX_ATTEMPTS = 6;
export const ASSET_PREVIEW_ENQUEUE_TIMEOUT_MS = 2000;
export const ASSET_PREVIEW_ERRORS = ["decode_failed", "size_mismatch", "empty_output", "gave_up"] as const;
export type AssetPreviewError = (typeof ASSET_PREVIEW_ERRORS)[number];

export const ASSET_ROLES = ["character", "location", "style", "prop", "other"] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];
export { ASSET_KINDS, ASSET_MEDIA_TYPES, assetId };
export type AssetKind = (typeof ASSET_KINDS)[number];
export type AssetMediaType = (typeof ASSET_MEDIA_TYPES)[number];
export const ASSET_SOURCE_TYPES = ["generation", "upload", "url", "base64", "bytes", "put", "post"] as const;
export type AssetSourceType = (typeof ASSET_SOURCE_TYPES)[number];


// biome-ignore lint/suspicious/noControlCharactersInRegex: the class names exactly the characters a name may not hold.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;
export const assetName = z.string().trim().min(1).max(ASSET_NAME_MAX_CHARS)
  .refine((name) => !CONTROL_CHARACTERS.test(name), "a name holds no control characters");

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const assetPutSource = z.strictObject({
  media_type: z.enum(ASSET_PUT_MEDIA_TYPES),
  bytes: z.number().int().positive().max(ASSET_VIDEO_MAX_BYTES),
  sha256: sha256Hex,
}).refine((put) => isAssetPutVideoType(put.media_type) || put.bytes <= UPLOAD_MAX_BYTES, `a picture is at most ${UPLOAD_MAX_BYTES} bytes`);

export const assetSource = z.union([
  z.strictObject({ run_id: runId }),
  z.strictObject({ upload_id: uploadId }),
  z.strictObject({ url: z.string().url().startsWith("https://").max(2048), kind: z.enum(ASSET_KINDS).optional() }),
  z.strictObject({ base64: z.string().min(1).max(ASSET_BASE64_MAX_CHARS).regex(/^[A-Za-z0-9+/]+={0,2}$/),
    media_type: z.enum(UPLOAD_MEDIA_TYPES) }),
  z.strictObject({ put: assetPutSource }),
]);
export type AssetSource = z.infer<typeof assetSource>;

export const ANALYSIS_ONLY_ASSET_REFUSAL = "is an analysis-only asset: analyze_reference reads it, but it never reaches a render or a " +
  "generation; to use the material, create it again with rights_confirmed: true";

export const createAssetRequest = z.strictObject({
  source: assetSource,
  role: z.enum(ASSET_ROLES),
  name: assetName,
  rights_confirmed: z.literal(true).optional(),
  analysis_only: z.literal(true).optional()
    .describe("Keep it for analyze_reference only, without rights_confirmed: it never reaches a render or a generation."),
}).refine((request) => !(request.rights_confirmed && request.analysis_only), {
  path: ["analysis_only"], message: "pass rights_confirmed or analysis_only, not both",
}).refine((request) => !(request.analysis_only && "run_id" in request.source), {
  path: ["analysis_only"], message: "a generation of this account is already yours to use; analysis_only is for your own material",
});
export type CreateAssetRequest = z.infer<typeof createAssetRequest>;

export const assetBytesQuery = z.strictObject({
  role: z.enum(ASSET_ROLES),
  name: assetName,
  rights_confirmed: z.literal("true").optional(),
  analysis_only: z.literal("true").optional(),
});

export const updateAssetRequest = z.strictObject({
  name: assetName.optional(),
  role: z.enum(ASSET_ROLES).optional(),
}).refine((patch) => patch.name !== undefined || patch.role !== undefined, "pass name, role or both");
export type UpdateAssetRequest = z.infer<typeof updateAssetRequest>;

export const assetListQuery = z.strictObject({
  role: z.enum(ASSET_ROLES).optional(),
  kind: z.enum(ASSET_KINDS).optional(),
  mascot: z.literal("true").optional(),
  limit: z.coerce.number().int().min(1).max(ASSET_LIST_MAX_LIMIT).optional(),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).optional(),
});
export type AssetListQuery = z.infer<typeof assetListQuery>;

export const asset = z.strictObject({
  asset_id: assetId,
  state: z.literal("ready"),
  kind: z.enum(ASSET_KINDS),
  role: z.enum(ASSET_ROLES),
  name: z.string().min(1),
  media_type: z.enum(ASSET_MEDIA_TYPES),
  bytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration_frames: z.number().int().positive().nullable(),
  fps: z.number().int().positive().nullable(),
  codec: z.string().min(1).nullable(),
  pix_fmt: z.string().min(1).nullable(),
  content_digest: sha256Hex,
  source_type: z.enum(ASSET_SOURCE_TYPES),
  analysis_only: z.boolean(),
  mascot: mascotSummary.optional(),
  url: z.string().url().startsWith("https://"),
  preview_url: z.string().url().startsWith("https://").optional(),
  warnings: z.array(z.string().min(1)).optional(),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Asset = z.infer<typeof asset>;

export const assetPutUpload = z.strictObject({
  put_url: z.string().url().startsWith("https://"),
  put_headers: z.strictObject({ "content-type": z.enum(ASSET_PUT_MEDIA_TYPES), "content-length": z.string().regex(/^\d+$/) }),
  expires_at: z.string().datetime(),
  finish_by: z.string().datetime(),
});

export const ASSET_PENDING_STATES = ["awaiting_upload", "processing", "failed"] as const;
export const pendingAsset = z.strictObject({
  asset_id: assetId,
  state: z.enum(ASSET_PENDING_STATES),
  kind: z.enum(ASSET_KINDS),
  role: z.enum(ASSET_ROLES),
  name: z.string().min(1),
  source_type: z.enum(ASSET_SOURCE_TYPES),
  analysis_only: z.boolean(),
  error: z.strictObject({ code: z.string().min(1), message: z.string().min(1) }).nullable(),
  processing_deadline: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  upload: assetPutUpload.optional(),
});
export type PendingAsset = z.infer<typeof pendingAsset>;

export const assetItem = z.union([asset, pendingAsset]);
export type AssetItem = z.infer<typeof assetItem>;

export const ASSET_INGEST_FAILURE_CODES = [
  "upload_expired", "upload_size_mismatch", "upload_digest_mismatch", "unsupported_media_type", "invalid_image", "invalid_video",
  "payload_too_large", "url_fetch_refused", "url_fetch_failed", "asset_cap_exceeded", "asset_ingest_cap_exceeded",
  "url_import_disabled", "ingest_timed_out", "ingest_enqueue_failed", "ingest_failed",
] as const;
export type AssetIngestFailureCode = (typeof ASSET_INGEST_FAILURE_CODES)[number];

export const ingestAssetMediaPayload = z.strictObject({
  assetId,
  accountId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  source: z.enum(["url", "staging", "post"]),
});
export type IngestAssetMediaPayload = z.infer<typeof ingestAssetMediaPayload>;

export const assetPreviewPayload = z.strictObject({ assetId });
export type AssetPreviewPayload = z.infer<typeof assetPreviewPayload>;
export const assetPreviewIdempotencyKey = (id: string): string => `asset-preview:${id}`;
export const assetPreviewKey = (accountId: string, id: string): string => `assets/${accountId}/${id}/preview.webp`;

export const assetUsage = z.strictObject({
  count: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  max_count: z.number().int().positive(),
  max_bytes: z.number().int().positive(),
});

export const assetList = z.strictObject({
  assets: z.array(asset),
  pending: z.array(pendingAsset),
  next_cursor: z.string().nullable(),
  usage: assetUsage,
  contract_version: z.string().min(1),
});
export type AssetList = z.infer<typeof assetList>;

export const assetRead = asset.extend({
  state: z.literal("ready"), kind: z.string().min(1), role: z.string().min(1), media_type: z.string().min(1), source_type: z.string().min(1),
  analysis_only: z.boolean().optional(),
}).loose();
export type AssetRead = z.infer<typeof assetRead>;
export const pendingAssetRead = pendingAsset.extend({
  state: z.string().min(1), kind: z.string().min(1), role: z.string().min(1), source_type: z.string().min(1),
  analysis_only: z.boolean().optional(),
  error: z.object({ code: z.string().min(1), message: z.string() }).loose().nullable(),
  upload: assetPutUpload.extend({ put_headers: z.record(z.string(), z.string()) }).loose().optional(),
}).loose();
export type PendingAssetRead = z.infer<typeof pendingAssetRead>;
export const assetItemRead = z.union([assetRead, pendingAssetRead]);
export type AssetItemRead = z.infer<typeof assetItemRead>;
export const assetListRead = assetList.extend({
  assets: z.array(assetRead), pending: z.array(pendingAssetRead).optional(), usage: assetUsage.loose(),
}).loose();
export type AssetListRead = z.infer<typeof assetListRead>;

export function transcodedClipWarning(from: string): string {
  const sdr = from.startsWith("HDR ") ? ", tone-mapped from HDR to SDR BT.709" : "";
  return `the clip was ${from}; it was re-encoded to an 8-bit H.264 MP4 (yuv420p${sdr}) when it was saved, at its own size and frame ` +
    "rate, so its bytes, content_digest, codec and pix_fmt are those of the re-encoded file";
}

export function assetKey(accountId: string, id: string, sha256: string, mediaType: AssetMediaType): string {
  const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4" }[mediaType];
  return `assets/${accountId}/${id}/${sha256}.${extension}`;
}

const gigabytes = (bytes: number): string => `${bytes / 1e9} GB`;
const STORAGE_TERMS = `${gigabytes(ASSET_TRIAL_MAX_BYTES)}, or ${gigabytes(ASSET_ACCOUNT_MAX_BYTES)} once it has bought credits, as a pack or a plan`;

export function assetCapMessage(cap: "count" | "bytes", usage: { count: number; bytes: number }, maxBytes: number): string {
  const raise = cap === "bytes" && maxBytes < ASSET_ACCOUNT_MAX_BYTES
    ? ` Buying credits once, as a pack or a plan, raises this account's storage ceiling to ${gigabytes(ASSET_ACCOUNT_MAX_BYTES)}.` : "";
  return `This account keeps ${usage.count} assets and ${usage.bytes} bytes; its ceiling is ${ASSET_ACCOUNT_MAX_COUNT} assets and ` +
    `${gigabytes(maxBytes)} (${maxBytes} bytes).${raise}`;
}

export const ASSET_TOOL_TERMS =
  "Assets are free: creating, storing and using one spends no credits. An account keeps up to " +
  `${ASSET_ACCOUNT_MAX_COUNT} assets and ${STORAGE_TERMS}, and makes up to ${ASSET_INGEST_DAILY_CAP} new ones per day.`;

export const CREATE_ASSET_DESCRIPTION =
  "Save a picture or a clip as an asset of this account, kept until you delete it: a character, location, style, prop " +
  "or other, with a name. source is {run_id} of a succeeded generate_image or generate_video run of this account, " +
  "{upload_id} from upload_image or create_upload, a public https {url} the server downloads (add " +
  `kind: "video" for a clip), {base64, media_type} of a PNG or JPEG up to ${ASSET_BASE64_MAX_BYTES} bytes, or ` +
  "{put: {media_type, bytes, sha256}} to PUT a local file: the answer carries upload.put_url and put_headers; " +
  "run `curl -X PUT -H 'content-type: <put_headers content-type>' --data-binary @<file> '<put_url>'` within 15 minutes, then call " +
  "get_asset. On a server running on your machine also {path} of a local PNG, JPEG or MP4. A clip is an MP4, MOV or WebM " +
  `up to ${ASSET_VIDEO_MAX_SECONDS} seconds and 100 MB; one in another codec than H.264 or HEVC (such as AV1 or VP9), or a ` +
  "fragmented MP4, is re-encoded to an H.264 MP4 when it is saved, and so is 10-bit or HDR video, tone-mapped to SDR; get_asset " +
  "says so in warnings. A url clip or a PUT is checked in the background " +
  "(state \"processing\" or \"awaiting_upload\"; get_asset says ready or failed within minutes). For your own material " +
  "pass rights_confirmed: true, stating once that you may use the people and works in it. A reference only to analyse, " +
  "such as someone else's ad for analyze_reference, takes analysis_only: true instead: no rights claim, and no render " +
  `or generation ever takes it; such a clip may run up to ${ANALYSIS_VIDEO_MAX_SECONDS} seconds. A picture's {asset_id} is a generation reference or frame (quote_image says how); a clip ` +
  "is not one yet. " + ASSET_TOOL_TERMS;

export const LIST_ASSETS_DESCRIPTION =
  "List the assets of this account, newest first, each with a freshly signed url, its role, name, size and " +
  `content_digest; ${ASSET_TOOL_PAGE} a page unless you pass limit (up to ${ASSET_LIST_MAX_LIMIT}), and fewer when the page would not fit ` +
  "your tool output. Filter by role and kind (mascot true: saved mascots with their poses) rather than reading the whole library, " +
  "and pass next_cursor as cursor for the next page. pending lists assets " +
  "still awaiting their upload or processing, and those that failed today with the reason. usage says how much " +
  `of the ${ASSET_ACCOUNT_MAX_COUNT} assets and of the storage (${STORAGE_TERMS}) is used. Free.`;

export const GET_ASSET_DESCRIPTION =
  "Read one asset by asset_id with a freshly signed url (valid for an hour), its role, name, media_type, bytes, " +
  "width, height, content_digest and, for a clip, duration_frames, fps, codec and pix_fmt (warnings says when it was re-encoded), " +
  "plus a small preview " +
  "picture of it to look at when one is ready. An asset still in " +
  "progress answers state awaiting_upload (PUT the file, then read again) or processing (read again in a few " +
  "seconds); a refused one answers state failed with error.code. A deleted asset answers asset_not_found. Free.";

export const UPDATE_ASSET_DESCRIPTION =
  "Rename an asset or change its role; the picture itself does not change. Free.";

export const DELETE_ASSET_DESCRIPTION =
  "Delete an asset by asset_id. It leaves the list at once and a new generation can no longer use it; its file is " +
  `removed from our storage by a daily cleanup once ${ASSET_DELETE_GRACE_DAYS} days have passed. Runs already made with it ` +
  "stay as they are. Free.";
