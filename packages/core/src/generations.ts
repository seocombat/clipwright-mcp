import { z } from "zod";
import { assetId } from "./assets.js";
import { GENERATION_KINDS } from "./generations-output.js";
import { runId } from "./runs.js";
import { uploadId } from "./uploads.js";

export const GENERATION_MODELS_PATH = "/v1/generations/models";
export const GENERATE_IMAGE_QUOTE_PATH = "/v1/skills/generate_image/quote";
export const GENERATE_IMAGE_RUN_PATH = "/v1/skills/generate_image/run";
export const GENERATE_VIDEO_QUOTE_PATH = "/v1/skills/generate_video/quote";
export const GENERATE_VIDEO_RUN_PATH = "/v1/skills/generate_video/run";

export const GENERATION_IMAGE_MODELS = ["seedream-5.0-flash", "flare"] as const;
export const GENERATION_VIDEO_MODELS = [
  "seedance-2.0", "seedance-2.0-mini", "seedance-2.0-fast", "seedance-2.5", "kling-3.0", "gemini-omni-flash-1.1",
] as const;
export type GenerationImageModel = (typeof GENERATION_IMAGE_MODELS)[number];
export type GenerationVideoModel = (typeof GENERATION_VIDEO_MODELS)[number];
export type GenerationModel = GenerationImageModel | GenerationVideoModel;

export const GENERATION_IMAGE_ASPECTS = ["9:16", "16:9", "1:1"] as const;
export const GENERATION_VIDEO_ASPECTS = ["9:16", "16:9"] as const;
export const GENERATION_RESOLUTIONS = ["360p", "480p", "720p", "1080p"] as const;
export const GENERATION_VIDEO_MODES = ["text", "first_frame", "reference"] as const;
/** No model takes a camera parameter, so the worker writes it as the prompt's first line (#761). */
export const GENERATION_CAMERAS = ["static", "push_in", "pull_back", "pan"] as const;
export type GenerationCamera = (typeof GENERATION_CAMERAS)[number];
export type GenerationImageAspect = (typeof GENERATION_IMAGE_ASPECTS)[number];
export type GenerationVideoAspect = (typeof GENERATION_VIDEO_ASPECTS)[number];
export type GenerationResolution = (typeof GENERATION_RESOLUTIONS)[number];
export type GenerationVideoMode = (typeof GENERATION_VIDEO_MODES)[number];

export const GENERATION_MAX_REFERENCES = 4;
export const GENERATION_VIDEO_FPS = 24;
export const GENERATION_PROMPT_MAX_CHARS = 2000;

export type GenerationVendor = "byteplus" | "fal" | "kie";

/** One vendor endpoint that makes a model's clip; the client never sees it, and the price does not depend on it. */
export interface GenerationVideoRoute {
  vendor: GenerationVendor;
  vendor_model: string;
}

/** One output shape. `measured: false` is refused by the API and never listed (D7). */
export interface GenerationImageRow {
  aspect_ratio: GenerationImageAspect;
  width: number;
  height: number;
  unit_credits: number;
  measured: boolean;
}

export interface GenerationVideoRow {
  aspect_ratio: GenerationVideoAspect;
  resolution: GenerationResolution;
  width: number;
  height: number;
  codec: string | null;
  pix_fmt: string | null;
  /** Credits per second of the requested duration. */
  unit_credits: number;
  measured: boolean;
  /** The routes measured for this row (rule 4): a route serves the row only if its vendor is listed here. */
  vendors: readonly GenerationVendor[];
  /** Told in `warnings[]` on every request that lands here (rule 3): what the measured output differs in. */
  warning?: string;
}

export interface GenerationImageCapability {
  kind: "image";
  vendor: GenerationVendor;
  /** The vendor endpoint without references and with them; Seedream takes both on one id. */
  vendor_model: { text: string; reference: string };
  rows: readonly GenerationImageRow[];
}

export interface GenerationVideoCapability {
  kind: "video";
  /** Tried in this order (owner, 21.10): the next one only after a real-face refusal or an unavailable submit. */
  routes: readonly GenerationVideoRoute[];
  fps: number;
  /** Whether each mode was measured live; an unmeasured mode is refused like an unmeasured row. */
  modes: Readonly<Record<GenerationVideoMode, boolean>>;
  duration_s: { min: number; max: number };
  /** The only lengths a model takes when it is not every whole second of the range. */
  duration_values?: readonly number[];
  rows: readonly GenerationVideoRow[];
}

type GenerationCapabilities = {
  readonly [M in GenerationModel]: M extends GenerationVideoModel ? GenerationVideoCapability : GenerationImageCapability;
};

const image = (aspect_ratio: GenerationImageAspect, width: number, height: number, unit_credits: number, measured = false): GenerationImageRow =>
  ({ aspect_ratio, width, height, unit_credits, measured });

const H264 = { codec: "h264", pix_fmt: "yuv420p" } as const;

/** Rows in both aspects of one resolution; `measured` holds the aspects probed live (19.10 paid tests, ffprobe of the clips). */
function video(vendors: readonly GenerationVendor[], resolution: GenerationResolution, short: number, long: number,
  unit_credits: number, probed: { codec: string | null; pix_fmt: string | null },
  measured: { vertical?: boolean; horizontal?: boolean } = {}, warning?: string): GenerationVideoRow[] {
  const extra = warning === undefined ? {} : { warning };
  return [
    { aspect_ratio: "9:16", resolution, width: short, height: long, ...probed, unit_credits, measured: measured.vertical ?? false,
      vendors, ...extra },
    { aspect_ratio: "16:9", resolution, width: long, height: short, ...probed, unit_credits, measured: measured.horizontal ?? false,
      vendors, ...extra },
  ];
}

const HEVC10 = { codec: "hevc", pix_fmt: "yuv420p10le" } as const;
const SEEDANCE_2_0_MODES = { text: true, first_frame: true, reference: false } as const;
const DRAFT_480P = {
  "9:16": "480p draft is 496x864 (2.1% off 9:16), as the vendor renders it; we do not crop it",
  "16:9": "480p draft is 864x496 (2.0% off 16:9), as the vendor renders it; we do not crop it",
} as const;
/** A route serves a row once a live measure of it adds that route (rule 4; measures of 19.10 and 21.10). */
const BYTEPLUS = ["byteplus"] as const;
const KIE = ["kie"] as const;
const KIE_THEN_BYTEPLUS = ["kie", "byteplus"] as const;
const BYTEPLUS_THEN_KIE = ["byteplus", "kie"] as const;
const UNSERVED = [] as const;

/** Seedance 2.0 renders 480p as 496x864 in both aspects (measured 19.10 and 21.10). */
function draft480p(vendors: readonly GenerationVendor[], unit_credits: number): GenerationVideoRow[] {
  return video(vendors, "480p", 496, 864, unit_credits, H264, { vertical: true, horizontal: true })
    .map((row) => ({ ...row, warning: DRAFT_480P[row.aspect_ratio] }));
}

/** One aspect of a pair changed: a measure that saw only that aspect, or saw it at another vendor. */
function only(rows: GenerationVideoRow[], aspect: GenerationVideoAspect, change: Partial<GenerationVideoRow>): GenerationVideoRow[] {
  return rows.map((row) => (row.aspect_ratio === aspect ? { ...row, ...change } : row));
}

/** The one table of models, shapes and prices (D7); prices are derived in service-core and pinned by its test. */
/** Measures: `docs/assets/measurements/kie-generations-2026-10-21.json`, `byteplus-seedance-720p-480p-2026-10-21.json`. */
export const GENERATION_CAPABILITIES: GenerationCapabilities = deepFreeze({
  "seedream-5.0-flash": {
    kind: "image",
    vendor: "byteplus",
    vendor_model: { text: "dola-seedream-5-0-flash-260915", reference: "dola-seedream-5-0-flash-260915" },
    rows: [image("9:16", 1440, 2560, 5, true), image("16:9", 2560, 1440, 5, true), image("1:1", 2048, 2048, 5, true)],
  },
  flare: {
    kind: "image",
    vendor: "fal",
    vendor_model: { text: "openai/gpt-image-2.5/flare/text-to-image", reference: "openai/gpt-image-2.5/flare/edit" },
    rows: [image("9:16", 1008, 1792, 6, true), image("16:9", 1792, 1008, 6), image("1:1", 1024, 1024, 6)],
  },
  "seedance-2.0": {
    kind: "video",
    routes: [{ vendor: "byteplus", vendor_model: "dreamina-seedance-2-0-260128" }, { vendor: "kie", vendor_model: "bytedance/seedance-2" }],
    fps: GENERATION_VIDEO_FPS,
    modes: SEEDANCE_2_0_MODES,
    duration_s: { min: 4, max: 15 },
    // The second route measured only the 720p 9:16 row of 2.0 (21.10).
    rows: [...draft480p(BYTEPLUS, 18),
      ...only(video(BYTEPLUS, "720p", 720, 1280, 36, H264, { vertical: true, horizontal: true }), "9:16", { vendors: BYTEPLUS_THEN_KIE }),
      ...video(BYTEPLUS, "1080p", 1080, 1920, 91, H264, { vertical: true, horizontal: true })],
  },
  "seedance-2.0-mini": {
    kind: "video",
    // kie first (owner, 21.10).
    routes: [{ vendor: "kie", vendor_model: "bytedance/seedance-2-mini" }, { vendor: "byteplus", vendor_model: "dreamina-seedance-2-0-mini-260615" }],
    fps: GENERATION_VIDEO_FPS,
    modes: { text: true, first_frame: true, reference: true },
    duration_s: { min: 4, max: 15 },
    rows: [...draft480p(KIE_THEN_BYTEPLUS, 5),
      ...video(KIE_THEN_BYTEPLUS, "720p", 720, 1280, 10, H264, { vertical: true, horizontal: true })],
  },
  "seedance-2.0-fast": {
    kind: "video",
    routes: [{ vendor: "byteplus", vendor_model: "dreamina-seedance-2-0-fast-260128" }],
    fps: GENERATION_VIDEO_FPS,
    modes: SEEDANCE_2_0_MODES,
    duration_s: { min: 4, max: 15 },
    rows: [...draft480p(BYTEPLUS, 14), ...video(BYTEPLUS, "720p", 720, 1280, 30, H264, { vertical: true, horizontal: true })],
  },
  "seedance-2.5": {
    kind: "video",
    routes: [{ vendor: "byteplus", vendor_model: "dreamina-seedance-2-5-260628" }, { vendor: "kie", vendor_model: "bytedance/seedance-2-5" }],
    fps: GENERATION_VIDEO_FPS,
    modes: { text: false, first_frame: true, reference: false },
    duration_s: { min: 4, max: 30 },
    // 2.5 renders a true 480x854. The second route made its 480p 9:16 and 720p 16:9 (21.10); the first made every row.
    rows: [...only(video(BYTEPLUS, "480p", 480, 854, 25, H264, { vertical: true, horizontal: true }), "9:16", { vendors: BYTEPLUS_THEN_KIE }),
      ...only(video(BYTEPLUS, "720p", 720, 1280, 56, H264, { vertical: true, horizontal: true }), "16:9", { vendors: BYTEPLUS_THEN_KIE }),
      ...video(BYTEPLUS, "1080p", 1080, 1920, 138, HEVC10, { vertical: true },
        "seedance-2.5 at 1080p is HEVC 10-bit (yuv420p10le); some browsers and editors do not play it")],
  },
  "kling-3.0": {
    kind: "video",
    routes: [{ vendor: "kie", vendor_model: "kling-3.0/video" }],
    fps: GENERATION_VIDEO_FPS,
    modes: { text: true, first_frame: true, reference: false },
    duration_s: { min: 3, max: 15 },
    rows: video(KIE, "720p", 720, 1280, 17, H264, { vertical: true, horizontal: true }),
  },
  // 360p 9:16 is not yet seen (live, 21.10).
  "gemini-omni-flash-1.1": {
    kind: "video",
    routes: [{ vendor: "kie", vendor_model: "google/gemini-omni-flash-1-1" }],
    fps: GENERATION_VIDEO_FPS,
    modes: { text: true, first_frame: true, reference: false },
    duration_s: { min: 4, max: 10 },
    duration_values: [4, 6, 8, 10],
    rows: [...only(video(UNSERVED, "360p", 360, 640, 19, H264), "16:9", { measured: true, vendors: KIE }),
      ...video(KIE, "720p", 720, 1280, 19, H264, { vertical: true, horizontal: true })],
  },
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/** A reference: an own upload with its rights confirmed, a prior image generation, or an own asset (rights given at its creation). */
export const generationReference = z.union([
  z.strictObject({ upload_id: uploadId, rights_confirmed: z.literal(true) }),
  z.strictObject({ run_id: runId }),
  z.strictObject({ asset_id: assetId, rights_confirmed: z.literal(true).optional() }),
]);
export type GenerationReference = z.infer<typeof generationReference>;

const prompt = z.string().trim().min(1).max(GENERATION_PROMPT_MAX_CHARS);

/** No `visible_ai_label`: an unknown key is refused, never passed to the provenance policy (D12). */
export const generateImageRequest = z.strictObject({
  prompt,
  model: z.enum(GENERATION_IMAGE_MODELS),
  aspect_ratio: z.enum(GENERATION_IMAGE_ASPECTS),
  references: z.array(generationReference).max(GENERATION_MAX_REFERENCES).optional(),
});
export type GenerateImageRequest = z.infer<typeof generateImageRequest>;

/** No audio field: the vendor is always asked for a silent clip. */
export const generateVideoRequest = z.strictObject({
  prompt,
  model: z.enum(GENERATION_VIDEO_MODELS),
  mode: z.enum(GENERATION_VIDEO_MODES),
  aspect_ratio: z.enum(GENERATION_VIDEO_ASPECTS),
  resolution: z.enum(GENERATION_RESOLUTIONS),
  duration_s: z.number().int().positive().safe(),
  first_frame: generationReference.optional(),
  last_frame: generationReference.optional(),
  references: z.array(generationReference).min(1).max(GENERATION_MAX_REFERENCES).optional(),
  /** Compiled into the prompt's first line; the price does not depend on it. */
  camera: z.enum(GENERATION_CAMERAS).optional(),
}).superRefine((request, context) => {
  const issue = (path: string, message: string) => context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  const capability = GENERATION_CAPABILITIES[request.model];
  const { min, max } = capability.duration_s;
  if (request.duration_s < min || request.duration_s > max) {
    issue("duration_s", `${request.model} takes ${min} to ${max} seconds`);
  } else if (capability.duration_values && !capability.duration_values.includes(request.duration_s)) {
    issue("duration_s", `${request.model} takes ${capability.duration_values.join(", ")} seconds`);
  }
  if (request.mode === "first_frame" && request.first_frame === undefined) issue("first_frame", "first_frame mode requires first_frame");
  if (request.mode !== "first_frame") {
    if (request.first_frame !== undefined) issue("first_frame", "first_frame is only accepted in first_frame mode");
    if (request.last_frame !== undefined) issue("last_frame", "last_frame is only accepted in first_frame mode");
  }
  if (request.mode === "reference" && request.references === undefined) issue("references", "reference mode requires 1 to 4 references");
  if (request.mode !== "reference" && request.references !== undefined) issue("references", "references are only accepted in reference mode");
});
export type GenerateVideoRequest = z.infer<typeof generateVideoRequest>;

export type GenerationRequest = GenerateImageRequest | GenerateVideoRequest;

export type GenerationMatch =
  | { kind: "image"; model: GenerationImageModel; capability: GenerationImageCapability; row: GenerationImageRow }
  | { kind: "video"; model: GenerationVideoModel; capability: GenerationVideoCapability; row: GenerationVideoRow };

function isVideoRequest(request: GenerationRequest): request is GenerateVideoRequest {
  return (GENERATION_VIDEO_MODELS as readonly string[]).includes(request.model);
}

/** The measured row a request falls on, or `null` for a combination we do not offer or have not measured. */
export function findCapabilityRow(request: GenerationRequest): GenerationMatch | null {
  if (isVideoRequest(request)) {
    const capability = GENERATION_CAPABILITIES[request.model];
    const { min, max } = capability.duration_s;
    if (!capability.modes[request.mode] || request.duration_s < min || request.duration_s > max) return null;
    if (capability.duration_values && !capability.duration_values.includes(request.duration_s)) return null;
    const row = capability.rows.find((one) => one.aspect_ratio === request.aspect_ratio && one.resolution === request.resolution);
    return row?.measured ? { kind: "video", model: request.model, capability, row } : null;
  }
  const capability = GENERATION_CAPABILITIES[request.model];
  const row = capability.rows.find((one) => one.aspect_ratio === request.aspect_ratio);
  return row?.measured ? { kind: "image", model: request.model, capability, row } : null;
}

export interface GenerationPrice {
  unit_credits: number;
  units: number;
  credits: number;
}

/** The price from the same table: an image is one unit, a clip one unit per requested second. `null` where no row is offered. */
export function priceGeneration(request: GenerationRequest): GenerationPrice | null {
  const match = findCapabilityRow(request);
  if (match === null) return null;
  const units = match.kind === "video" && isVideoRequest(request) ? request.duration_s : 1;
  return { unit_credits: match.row.unit_credits, units, credits: match.row.unit_credits * units };
}

export const generationQuote = z.strictObject({
  skill: z.enum(["generate_image", "generate_video"]),
  kind: z.enum(GENERATION_KINDS),
  model: z.string().min(1),
  unit: z.enum(["image", "second"]),
  unit_credits: z.number().int().positive(),
  units: z.number().int().positive(),
  credits: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration_s: z.number().int().positive().nullable(),
  warnings: z.array(z.string()),
  contract_version: z.string().min(1),
});
export type GenerationQuote = z.infer<typeof generationQuote>;

const listedRow = z.strictObject({
  aspect_ratio: z.string().min(1),
  resolution: z.enum(GENERATION_RESOLUTIONS).nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  unit_credits: z.number().int().positive(),
});

/** One offered model: vendors are not named, and only measured modes and rows are shown. */
const listedModel = z.strictObject({
  model: z.string().min(1),
  kind: z.enum(GENERATION_KINDS),
  unit: z.enum(["image", "second"]),
  modes: z.array(z.enum(GENERATION_VIDEO_MODES)).nullable(),
  duration_s: z.strictObject({ min: z.number().int().positive(), max: z.number().int().positive() }).nullable(),
  /** Present when the model takes only these lengths inside `duration_s`. */
  duration_values: z.array(z.number().int().positive()).min(1).optional(),
  max_references: z.number().int().nonnegative(),
  rows: z.array(listedRow).min(1),
});

export const generationModels = z.strictObject({
  models: z.array(listedModel),
  contract_version: z.string().min(1),
});
export type GenerationModels = z.infer<typeof generationModels>;
export type ListedGenerationModel = z.infer<typeof listedModel>;

/** The models list from the table: a model with no measured row, or a video model with no measured mode, is left out. */
export function listGenerationModels(): ListedGenerationModel[] {
  return (Object.keys(GENERATION_CAPABILITIES) as GenerationModel[]).flatMap((model): ListedGenerationModel[] => {
    const capability: GenerationImageCapability | GenerationVideoCapability = GENERATION_CAPABILITIES[model];
    if (capability.kind === "image") {
      const rows = capability.rows.filter((row) => row.measured)
        .map(({ aspect_ratio, width, height, unit_credits }) => ({ aspect_ratio, resolution: null, width, height, unit_credits }));
      return rows.length === 0 ? [] : [{ model, kind: "image", unit: "image", modes: null, duration_s: null,
        max_references: GENERATION_MAX_REFERENCES, rows }];
    }
    const modes = GENERATION_VIDEO_MODES.filter((mode) => capability.modes[mode]);
    const rows = capability.rows.filter((row) => row.measured)
      .map(({ aspect_ratio, resolution, width, height, unit_credits }) => ({ aspect_ratio, resolution, width, height, unit_credits }));
    return rows.length === 0 || modes.length === 0 ? [] : [{ model, kind: "video", unit: "second", modes,
      duration_s: { ...capability.duration_s },
      ...(capability.duration_values ? { duration_values: [...capability.duration_values] } : {}),
      max_references: modes.includes("reference") ? GENERATION_MAX_REFERENCES : 0, rows }];
  });
}
