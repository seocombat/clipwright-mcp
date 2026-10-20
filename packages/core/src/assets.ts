import { z } from "zod";

import { runId } from "./runs.js";
import { UPLOAD_MEDIA_TYPES, uploadId } from "./uploads.js";

/** Account assets (clipwright#724 F2): pictures kept until the customer deletes them, under a cap per account. */

export const ASSETS_PATH = "/v1/assets";
/** Raw bytes of one picture, for the cabinet; role, name and the rights confirmation travel in the query. */
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

export const ASSET_ROLES = ["character", "location", "style", "prop", "other"] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];
export const ASSET_KINDS = ["image", "video"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
/** WebP is kept only as a generation's own output: its dimensions are not read from customer bytes. */
export const ASSET_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "video/mp4"] as const;
export type AssetMediaType = (typeof ASSET_MEDIA_TYPES)[number];
export const ASSET_SOURCE_TYPES = ["generation", "upload", "url", "base64", "bytes", "put"] as const;
export type AssetSourceType = (typeof ASSET_SOURCE_TYPES)[number];

export const assetId = z.string().regex(/^ast_[a-f0-9]{32}$/);

// biome-ignore lint/suspicious/noControlCharactersInRegex: the class names exactly the characters a name may not hold.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;
export const assetName = z.string().trim().min(1).max(ASSET_NAME_MAX_CHARS)
  .refine((name) => !CONTROL_CHARACTERS.test(name), "a name holds no control characters");

/** Where the asset's bytes come from: an own image generation, an own upload, a public https url, or inline base64. */
export const assetSource = z.union([
  z.strictObject({ run_id: runId }),
  z.strictObject({ upload_id: uploadId }),
  z.strictObject({ url: z.string().url().startsWith("https://").max(2048) }),
  z.strictObject({ base64: z.string().min(1).max(ASSET_BASE64_MAX_CHARS).regex(/^[A-Za-z0-9+/]+={0,2}$/),
    media_type: z.enum(UPLOAD_MEDIA_TYPES) }),
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
  kind: z.enum(ASSET_KINDS),
  role: z.enum(ASSET_ROLES),
  name: z.string().min(1),
  media_type: z.enum(ASSET_MEDIA_TYPES),
  bytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration_frames: z.number().int().positive().nullable(),
  fps: z.number().int().positive().nullable(),
  content_digest: z.string().regex(/^[a-f0-9]{64}$/),
  source_type: z.enum(ASSET_SOURCE_TYPES),
  url: z.string().url().startsWith("https://"),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Asset = z.infer<typeof asset>;

export const assetUsage = z.strictObject({
  count: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  max_count: z.number().int().positive(),
  max_bytes: z.number().int().positive(),
});

export const assetList = z.strictObject({
  assets: z.array(asset),
  next_cursor: z.string().nullable(),
  usage: assetUsage,
  contract_version: z.string().min(1),
});
export type AssetList = z.infer<typeof assetList>;

// What installed clients parse: open strings for the enums, and unknown keys are kept.
export const assetRead = asset.extend({
  kind: z.string().min(1), role: z.string().min(1), media_type: z.string().min(1), source_type: z.string().min(1),
}).loose();
export type AssetRead = z.infer<typeof assetRead>;
export const assetListRead = assetList.extend({ assets: z.array(assetRead), usage: assetUsage.loose() }).loose();
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
  "Save a picture as an asset of this account, kept until you delete it: a character, location, style, prop or " +
  "other, with a name. source is {run_id} of a succeeded generate_image run of this account, {upload_id} of an " +
  "upload from upload_image or create_upload, a public https {url} the server downloads, or {base64, media_type} " +
  `of a PNG or JPEG up to ${ASSET_BASE64_MAX_BYTES} bytes; on a server running on your machine also {path} ` +
  "of a local PNG or JPEG. For your own material (upload_id, url, base64, path) pass rights_confirmed: true, " +
  "which states once that you may use the people and works in it. Use the asset_id as {asset_id} in references, " +
  "first_frame or last_frame of quote_image, generate_image, quote_video and generate_video. " + ASSET_TOOL_TERMS;

export const LIST_ASSETS_DESCRIPTION =
  "List the assets of this account, newest first, each with a freshly signed url, its role, name, size and " +
  "content_digest; filter by role and kind, and pass next_cursor as cursor for the next page. usage says how much " +
  `of the ${ASSET_ACCOUNT_MAX_COUNT} assets and 20 GB is used. Free.`;

export const GET_ASSET_DESCRIPTION =
  "Read one asset by asset_id with a freshly signed url (valid for an hour), its role, name, media_type, bytes, " +
  "width, height and content_digest. A deleted asset answers asset_not_found. Free.";

export const UPDATE_ASSET_DESCRIPTION =
  "Rename an asset or change its role; the picture itself does not change. Free.";

export const DELETE_ASSET_DESCRIPTION =
  "Delete an asset by asset_id. It leaves the list at once and a new generation can no longer use it; its file is " +
  `removed from our storage by a daily cleanup once ${ASSET_DELETE_GRACE_DAYS} days have passed. Runs already made with it ` +
  "stay as they are. Free.";
