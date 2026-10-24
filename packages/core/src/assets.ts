import { z } from "zod";

import { ASSET_KINDS, ASSET_MEDIA_TYPES, assetId } from "./asset-identity.js";
import { runId } from "./runs.js";
import { UPLOAD_MAX_BYTES, UPLOAD_MEDIA_TYPES, uploadId } from "./uploads.js";

/** Account assets (clipwright#724 F2): pictures and clips kept until the customer deletes them, under a cap per account. */

export const ASSETS_PATH = "/v1/assets";
/** Raw bytes of one picture or clip, for the cabinet; role, name and the rights confirmation travel in the query. */
export const ASSET_BYTES_PATH = "/v1/assets/bytes";
export const ASSET_ITEM_PATH = "/v1/assets/:id";

export const ASSET_ACCOUNT_MAX_COUNT = 2000;
export const ASSET_ACCOUNT_MAX_BYTES = 20_000_000_000;
/** New assets per account over a sliding day, deleted ones included: a delete does not give the slot back. */
export const ASSET_INGEST_DAILY_CAP = 100;
export const ASSET_INGEST_WINDOW_SECONDS = 86_400;
/** Raw bytes of a picture passed inline; its base64 still fits the 1 MiB JSON body of the API and of MCP. */
export const ASSET_BASE64_MAX_BYTES = 700_000;
export const ASSET_BASE64_MAX_CHARS = Math.ceil(ASSET_BASE64_MAX_BYTES / 3) * 4;
export const ASSET_URL_TTL_SECONDS = 3600;
/** A deleted asset's object stays this long, so a generation admitted just before the delete still reads it. */
export const ASSET_DELETE_GRACE_DAYS = 7;
export const ASSET_NAME_MAX_CHARS = 80;
export const ASSET_LIST_MAX_LIMIT = 100;

/** A customer clip (owner, 2026-10-20): up to 100 MiB and 120 s, a non-fragmented MP4 in h264 or hevc. */
export const ASSET_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const ASSET_VIDEO_MAX_SECONDS = 120;
export const ASSET_VIDEO_CODECS = ["h264", "hevc"] as const;
/** A clip sent as the body of `POST /v1/assets/bytes`: the API holds the body in memory before staging it. */
export const ASSET_BYTES_ROUTE_VIDEO_MAX_BYTES = 32 * 1024 * 1024;
/** How long a clip in processing may take before reads call it failed: a 90 s download inside a 5 minute task. */
export const ASSET_PROCESSING_SECONDS = 600;
export const ASSET_VIDEO_DOWNLOAD_DEADLINE_MS = 90_000;
export const ASSET_INGEST_TASK_MAX_DURATION_SECONDS = 300;
export const ASSET_PUT_MEDIA_TYPES = ["image/png", "image/jpeg", "video/mp4"] as const;
export type AssetPutMediaType = (typeof ASSET_PUT_MEDIA_TYPES)[number];
/** The worker task that downloads or reads a staged file, checks it and publishes the asset. */
export const INGEST_ASSET_MEDIA_TASK = "ingest-asset-media";

/** The cabinet's preview of an asset (S4a): a WebP at `assets/<account>/<id>/preview.webp`, long side at most 512, no upscale. */
export const ASSET_PREVIEW_TASK = "make-asset-preview";
export const ASSET_PREVIEW_MAX_SIDE = 512;
export const ASSET_PREVIEW_QUALITY = 75;
export const ASSET_PREVIEW_SWEEP_BATCH = 200;
/** Past this many attempts a row leaves the queue as `gave_up`: an OOM or a hung R2 never loops for ever. */
export const ASSET_PREVIEW_MAX_ATTEMPTS = 6;
/** How long creating an asset waits to queue its preview; past it the hourly sweep picks the row up. */
export const ASSET_PREVIEW_ENQUEUE_TIMEOUT_MS = 2000;
/** Terminal codes only; a passing failure throws, and the next attempt or the sweep repeats it. */
export const ASSET_PREVIEW_ERRORS = ["decode_failed", "size_mismatch", "empty_output", "gave_up"] as const;
export type AssetPreviewError = (typeof ASSET_PREVIEW_ERRORS)[number];

export const ASSET_ROLES = ["character", "location", "style", "prop", "other"] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];
export { ASSET_KINDS, ASSET_MEDIA_TYPES, assetId };
export type AssetKind = (typeof ASSET_KINDS)[number];
export type AssetMediaType = (typeof ASSET_MEDIA_TYPES)[number];
export const ASSET_SOURCE_TYPES = ["generation", "upload", "url", "base64", "bytes", "put"] as const;
export type AssetSourceType = (typeof ASSET_SOURCE_TYPES)[number];


// biome-ignore lint/suspicious/noControlCharactersInRegex: the class names exactly the characters a name may not hold.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;
export const assetName = z.string().trim().min(1).max(ASSET_NAME_MAX_CHARS)
  .refine((name) => !CONTROL_CHARACTERS.test(name), "a name holds no control characters");

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

/** A file the client PUTs itself: its type, exact size and sha256, checked against the bytes before the asset exists. */
export const assetPutSource = z.strictObject({
  media_type: z.enum(ASSET_PUT_MEDIA_TYPES),
  bytes: z.number().int().positive().max(ASSET_VIDEO_MAX_BYTES),
  sha256: sha256Hex,
}).refine((put) => put.media_type === "video/mp4" || put.bytes <= UPLOAD_MAX_BYTES, `a picture is at most ${UPLOAD_MAX_BYTES} bytes`);

/** Where the asset's bytes come from: an own generation, an own upload, a public https url (`kind: "video"` for a clip), */
/** inline base64, or a presigned PUT. */
export const assetSource = z.union([
  z.strictObject({ run_id: runId }),
  z.strictObject({ upload_id: uploadId }),
  z.strictObject({ url: z.string().url().startsWith("https://").max(2048), kind: z.enum(ASSET_KINDS).optional() }),
  z.strictObject({ base64: z.string().min(1).max(ASSET_BASE64_MAX_CHARS).regex(/^[A-Za-z0-9+/]+={0,2}$/),
    media_type: z.enum(UPLOAD_MEDIA_TYPES) }),
  z.strictObject({ put: assetPutSource }),
]);
export type AssetSource = z.infer<typeof assetSource>;

/** `rights_confirmed` is required for the customer's own material and states once, at creation, that it may be used. */
export const createAssetRequest = z.strictObject({
  source: assetSource,
  role: z.enum(ASSET_ROLES),
  name: assetName,
  rights_confirmed: z.literal(true).optional(),
});
export type CreateAssetRequest = z.infer<typeof createAssetRequest>;

/** The query of `POST /v1/assets/bytes`. */
export const assetBytesQuery = z.strictObject({
  role: z.enum(ASSET_ROLES),
  name: assetName,
  rights_confirmed: z.literal("true").optional(),
});

export const updateAssetRequest = z.strictObject({
  name: assetName.optional(),
  role: z.enum(ASSET_ROLES).optional(),
}).refine((patch) => patch.name !== undefined || patch.role !== undefined, "pass name, role or both");
export type UpdateAssetRequest = z.infer<typeof updateAssetRequest>;

export const assetListQuery = z.strictObject({
  role: z.enum(ASSET_ROLES).optional(),
  kind: z.enum(ASSET_KINDS).optional(),
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
  url: z.string().url().startsWith("https://"),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Asset = z.infer<typeof asset>;

/** Where a PUT goes: signed for 15 minutes with exactly these two headers, and finished within a day. */
export const assetPutUpload = z.strictObject({
  put_url: z.string().url().startsWith("https://"),
  put_headers: z.strictObject({ "content-type": z.enum(ASSET_PUT_MEDIA_TYPES), "content-length": z.string().regex(/^\d+$/) }),
  expires_at: z.string().datetime(),
  finish_by: z.string().datetime(),
});

/** An asset before it exists: waiting for its PUT, being checked by the worker, or refused with the reason. */
export const ASSET_PENDING_STATES = ["awaiting_upload", "processing", "failed"] as const;
export const pendingAsset = z.strictObject({
  asset_id: assetId,
  state: z.enum(ASSET_PENDING_STATES),
  kind: z.enum(ASSET_KINDS),
  role: z.enum(ASSET_ROLES),
  name: z.string().min(1),
  source_type: z.enum(ASSET_SOURCE_TYPES),
  error: z.strictObject({ code: z.string().min(1), message: z.string().min(1) }).nullable(),
  processing_deadline: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  /** Only in the answer that created the asset, or its repeat. */
  upload: assetPutUpload.optional(),
});
export type PendingAsset = z.infer<typeof pendingAsset>;

export const assetItem = z.union([asset, pendingAsset]);
export type AssetItem = z.infer<typeof assetItem>;

/** Why a pending asset failed, as `error.code`; these never come as an HTTP error of their own. */
export const ASSET_INGEST_FAILURE_CODES = [
  "upload_expired", "upload_size_mismatch", "upload_digest_mismatch", "unsupported_media_type", "invalid_image", "invalid_video",
  "payload_too_large", "url_fetch_refused", "url_fetch_failed", "asset_cap_exceeded", "asset_ingest_cap_exceeded",
  "url_import_disabled", "ingest_timed_out", "ingest_enqueue_failed", "ingest_failed",
] as const;
export type AssetIngestFailureCode = (typeof ASSET_INGEST_FAILURE_CODES)[number];

/** What the API hands the worker: which pending asset, and whether its bytes are at a url or already staged. */
export const ingestAssetMediaPayload = z.strictObject({
  assetId,
  accountId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  source: z.enum(["url", "staging"]),
});
export type IngestAssetMediaPayload = z.infer<typeof ingestAssetMediaPayload>;

/** The preview task takes the id only; it reads the account from the row. */
export const assetPreviewPayload = z.strictObject({ assetId });
export type AssetPreviewPayload = z.infer<typeof assetPreviewPayload>;
/** One run per asset across every caller: created with `scope: "global"`, since a raw string inside a task is per run. */
export const assetPreviewIdempotencyKey = (id: string): string => `asset-preview:${id}`;
export const assetPreviewKey = (accountId: string, id: string): string => `assets/${accountId}/${id}/preview.webp`;

export const assetUsage = z.strictObject({
  count: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  max_count: z.number().int().positive(),
  max_bytes: z.number().int().positive(),
});

/** `pending` holds the account's assets still in progress and those refused within the day; the first page only. */
export const assetList = z.strictObject({
  assets: z.array(asset),
  pending: z.array(pendingAsset),
  next_cursor: z.string().nullable(),
  usage: assetUsage,
  contract_version: z.string().min(1),
});
export type AssetList = z.infer<typeof assetList>;

// What installed clients parse: open strings for the enums, and unknown keys are kept.
export const assetRead = asset.extend({
  state: z.literal("ready"), kind: z.string().min(1), role: z.string().min(1), media_type: z.string().min(1), source_type: z.string().min(1),
}).loose();
export type AssetRead = z.infer<typeof assetRead>;
export const pendingAssetRead = pendingAsset.extend({
  state: z.string().min(1), kind: z.string().min(1), role: z.string().min(1), source_type: z.string().min(1),
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

/** The asset's own object: a new id per asset, so a copy never overwrites another asset. */
export function assetKey(accountId: string, id: string, sha256: string, mediaType: AssetMediaType): string {
  const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4" }[mediaType];
  return `assets/${accountId}/${id}/${sha256}.${extension}`;
}

export const ASSET_TOOL_TERMS =
  "Assets are free: creating, storing and using one spends no credits. An account keeps up to " +
  `${ASSET_ACCOUNT_MAX_COUNT} assets and 20 GB, and makes up to ${ASSET_INGEST_DAILY_CAP} new ones per day.`;

export const CREATE_ASSET_DESCRIPTION =
  "Save a picture or a clip as an asset of this account, kept until you delete it: a character, location, style, prop " +
  "or other, with a name. source is {run_id} of a succeeded generate_image or generate_video run of this account, " +
  "{upload_id} of an upload from upload_image or create_upload, a public https {url} the server downloads (add " +
  `kind: "video" for an MP4), {base64, media_type} of a PNG or JPEG up to ${ASSET_BASE64_MAX_BYTES} bytes, or ` +
  "{put: {media_type, bytes, sha256}} to PUT a local file yourself: the answer carries upload.put_url and put_headers; " +
  "run `curl -X PUT -H 'content-type: <media_type>' --data-binary @<file> '<put_url>'` within 15 minutes, then call " +
  "get_asset. On a server running on your machine also {path} of a local PNG, JPEG or MP4. A clip is an MP4 in h264 " +
  `or hevc, up to ${ASSET_VIDEO_MAX_SECONDS} seconds and 100 MB; a url clip or a PUT is checked in the background, ` +
  "so the answer says state: \"processing\" (or \"awaiting_upload\") and get_asset says ready or failed within " +
  "minutes. For your own material (upload_id, url, base64, put, path) pass rights_confirmed: true, which states once " +
  "that you may use the people and works in it. Use a picture's asset_id as {asset_id} in references, first_frame or " +
  "last_frame of quote_image, generate_image, quote_video and generate_video; clips are kept for assembly and are " +
  "no generation reference yet. " + ASSET_TOOL_TERMS;

export const LIST_ASSETS_DESCRIPTION =
  "List the assets of this account, newest first, each with a freshly signed url, its role, name, size and " +
  "content_digest; filter by role and kind, and pass next_cursor as cursor for the next page. pending lists assets " +
  "still awaiting their upload or processing, and those that failed today with the reason. usage says how much " +
  `of the ${ASSET_ACCOUNT_MAX_COUNT} assets and 20 GB is used. Free.`;

export const GET_ASSET_DESCRIPTION =
  "Read one asset by asset_id with a freshly signed url (valid for an hour), its role, name, media_type, bytes, " +
  "width, height, content_digest and, for a clip, duration_frames, fps, codec and pix_fmt. An asset still in " +
  "progress answers state awaiting_upload (PUT the file, then read again) or processing (read again in a few " +
  "seconds); a refused one answers state failed with error.code. A deleted asset answers asset_not_found. Free.";

export const UPDATE_ASSET_DESCRIPTION =
  "Rename an asset or change its role; the picture itself does not change. Free.";

export const DELETE_ASSET_DESCRIPTION =
  "Delete an asset by asset_id. It leaves the list at once and a new generation can no longer use it; its file is " +
  `removed from our storage by a daily cleanup once ${ASSET_DELETE_GRACE_DAYS} days have passed. Runs already made with it ` +
  "stay as they are. Free.";
