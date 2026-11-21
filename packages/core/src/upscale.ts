import { z } from "zod";
import { assetId } from "./asset-identity.js";
import { GENERATION_KINDS } from "./generations-output.js";
import { maxCreditsField } from "./max-credits.js";
import { runId } from "./runs.js";
import { uploadId } from "./uploads.js";

/** An upscale (#1774): a delivered take or picture made larger. The run stays a `generate_video` or `generate_image` run in mode */
/** `upscale`; this table holds only shapes and prices, and a shape not in it is refused before the money (rule 4). */

export const UPSCALE_QUOTE_PATH = "/v1/skills/upscale/quote";
export const UPSCALE_RUN_PATH = "/v1/skills/upscale/run";

export const UPSCALE_VIDEO_MODEL = "upscale-video";
export const UPSCALE_IMAGE_MODEL = "upscale-image";
export const UPSCALE_MODELS = [UPSCALE_VIDEO_MODEL, UPSCALE_IMAGE_MODEL] as const;
export type UpscaleModel = (typeof UPSCALE_MODELS)[number];
export const isUpscaleModel = (model: string): model is UpscaleModel => (UPSCALE_MODELS as readonly string[]).includes(model);

/** A clip source's size and the output it is lifted to, measured live; the output keeps the source's own shape. */
export interface UpscaleVideoRow {
  source: { width: number; height: number };
  width: number;
  height: number;
  /** Credits per second of the source. */
  unit_credits: number;
  measured: boolean;
  /** Told in `warnings[]` on every request that lands here (rule 3). */
  warning?: string;
}

export interface UpscaleVideoCapability {
  fps: number;
  /** The longest source, in frames: 30 s at 24 fps and the one frame a take carries past its length. */
  max_frames: number;
  rows: readonly UpscaleVideoRow[];
}

/** A picture is doubled on each side, whatever its shape, within these limits. */
export interface UpscaleImageCapability {
  factor: 2;
  media_types: readonly ("image/png" | "image/jpeg")[];
  min_short_side: number;
  max_long_side: number;
  max_output_pixels: number;
  unit_credits: number;
  measured: boolean;
}

const row = (source: [number, number], output: [number, number], warning?: string): UpscaleVideoRow =>
  ({ source: { width: source[0], height: source[1] }, width: output[0], height: output[1], unit_credits: 2, measured: true,
    ...(warning === undefined ? {} : { warning }) });

/** The one table of upscale shapes and prices: each video row and the picture rule measured live. */
export const UPSCALE_CAPABILITIES: { readonly video: UpscaleVideoCapability; readonly image: UpscaleImageCapability } = deepFreeze({
  video: {
    fps: 24,
    max_frames: 721,
    rows: [
      row([480, 854], [720, 1280]),
      row([854, 480], [1280, 720]),
      row([496, 864], [736, 1280], "the source is 2.1% off 9:16 and keeps its own shape at 736x1280; nothing is cropped"),
      row([360, 640], [720, 1280]),
    ],
  },
  image: {
    factor: 2,
    media_types: ["image/png", "image/jpeg"],
    min_short_side: 384,
    max_long_side: 2048,
    max_output_pixels: 16_000_000,
    unit_credits: 4,
    measured: true,
  },
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/** The measured row a clip source of this size falls on, or `null`. */
export function findUpscaleVideoRow(width: number, height: number): UpscaleVideoRow | null {
  return UPSCALE_CAPABILITIES.video.rows.find((one) => one.measured && one.source.width === width && one.source.height === height) ?? null;
}

/** Why a picture of this size is no upscale source, or `null` when the rule takes it. */
export function upscaleImageRefusal(width: number, height: number): string | null {
  const rule = UPSCALE_CAPABILITIES.image;
  if (Math.min(width, height) < rule.min_short_side) return `its short side is under ${rule.min_short_side} px`;
  if (Math.max(width, height) > rule.max_long_side) return `its long side is over ${rule.max_long_side} px`;
  if (width * rule.factor * height * rule.factor > rule.max_output_pixels) return `doubled it would be over ${rule.max_output_pixels / 1_000_000} MP`;
  return null;
}

/** The units a clip source is charged: whole seconds of its length, a take's one extra frame not counted as a second. */
export const upscaleVideoUnits = (frames: number, fps: number): number => Math.max(1, Math.ceil((frames - 1) / fps));

/** The warning every upscale carries: it names the source size and what an upscale does not fix. */
export function upscaledFromWarning(kind: "image" | "video", width: number, height: number): string {
  const lead = "upscaled from";
  return `${lead} ${width}x${height}; the same ${kind === "video" ? "take" : "picture"}, larger — lettering the draft drew wrong stays wrong`;
}

const SOURCE_DESCRIPTION = "{run_id} of a delivered clip or picture, {asset_id} of a picture asset, or {upload_id, rights_confirmed: true}.";

export const upscaleSource = z.union([
  z.strictObject({ run_id: runId }),
  z.strictObject({ asset_id: assetId }),
  z.strictObject({ upload_id: uploadId, rights_confirmed: z.literal(true) }),
]);
export type UpscaleSource = z.infer<typeof upscaleSource>;

export const upscaleRequest = z.strictObject({
  source: upscaleSource.describe(SOURCE_DESCRIPTION),
  max_credits: maxCreditsField,
});
export type UpscaleRequest = z.infer<typeof upscaleRequest>;

const size = z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() });

export const upscaleQuote = z.strictObject({
  skill: z.enum(["generate_image", "generate_video"]),
  kind: z.enum(GENERATION_KINDS),
  model: z.enum(UPSCALE_MODELS),
  unit: z.enum(["image", "second"]),
  unit_credits: z.number().int().positive(),
  units: z.number().int().positive(),
  credits: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration_s: z.number().int().positive().nullable(),
  upscaled_from: size,
  warnings: z.array(z.string()),
  contract_version: z.string().min(1),
});
export type UpscaleQuote = z.infer<typeof upscaleQuote>;

/** The upscale entry of `GET /v1/generations/models`: the measured clip sizes and the picture rule. */
export const listedUpscale = z.strictObject({
  video: z.strictObject({
    fps: z.number().int().positive(),
    max_frames: z.number().int().positive(),
    unit: z.literal("second"),
    rows: z.array(z.strictObject({ from: size, width: z.number().int().positive(), height: z.number().int().positive(),
      unit_credits: z.number().int().positive() })),
  }),
  image: z.strictObject({
    unit: z.literal("image"),
    factor: z.number().int().positive(),
    media_types: z.array(z.string().min(1)),
    min_short_side: z.number().int().positive(),
    max_long_side: z.number().int().positive(),
    max_output_pixels: z.number().int().positive(),
    unit_credits: z.number().int().positive(),
  }).nullable(),
}).describe("What upscale takes: each measured clip size with the size it is lifted to, and the picture rule; each priced per second " +
  "of the source or per picture.");
export type ListedUpscale = z.infer<typeof listedUpscale>;

/** The upscale entry from the table: measured rows only. */
export function listUpscale(): ListedUpscale {
  const { video, image } = UPSCALE_CAPABILITIES;
  return {
    video: { fps: video.fps, max_frames: video.max_frames, unit: "second",
      rows: video.rows.filter((one) => one.measured).map((one) => ({ from: { ...one.source }, width: one.width, height: one.height,
        unit_credits: one.unit_credits })) },
    image: image.measured ? { unit: "image", factor: image.factor, media_types: [...image.media_types], min_short_side: image.min_short_side,
      max_long_side: image.max_long_side, max_output_pixels: image.max_output_pixels, unit_credits: image.unit_credits } : null,
  };
}
