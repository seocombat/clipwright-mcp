import { z } from "zod";
import { GENERATION_KINDS } from "./generations-output.js";
import { runId } from "./runs.js";
import { uploadId } from "./uploads.js";

export const GENERATION_MODELS_PATH = "/v1/generations/models";
export const GENERATE_IMAGE_QUOTE_PATH = "/v1/skills/generate_image/quote";
export const GENERATE_IMAGE_RUN_PATH = "/v1/skills/generate_image/run";
export const GENERATE_VIDEO_QUOTE_PATH = "/v1/skills/generate_video/quote";
export const GENERATE_VIDEO_RUN_PATH = "/v1/skills/generate_video/run";

export const GENERATION_IMAGE_MODELS = ["seedream-5.0-flash", "flare"] as const;
export const GENERATION_VIDEO_MODELS = ["seedance-2.0", "seedance-2.0-mini", "seedance-2.0-fast", "seedance-2.5"] as const;
export type GenerationImageModel = (typeof GENERATION_IMAGE_MODELS)[number];
export type GenerationVideoModel = (typeof GENERATION_VIDEO_MODELS)[number];
export type GenerationModel = GenerationImageModel | GenerationVideoModel;

export const GENERATION_IMAGE_ASPECTS = ["9:16", "16:9", "1:1"] as const;
export const GENERATION_VIDEO_ASPECTS = ["9:16", "16:9"] as const;
export const GENERATION_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export const GENERATION_VIDEO_MODES = ["text", "first_frame", "reference"] as const;
export type GenerationImageAspect = (typeof GENERATION_IMAGE_ASPECTS)[number];
export type GenerationVideoAspect = (typeof GENERATION_VIDEO_ASPECTS)[number];
export type GenerationResolution = (typeof GENERATION_RESOLUTIONS)[number];
export type GenerationVideoMode = (typeof GENERATION_VIDEO_MODES)[number];

export const GENERATION_MAX_REFERENCES = 4;
export const GENERATION_VIDEO_FPS = 24;
export const GENERATION_PROMPT_MAX_CHARS = 2000;

export type GenerationVendor = "byteplus" | "fal";

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
  vendor: GenerationVendor;
  vendor_model: string;
  fps: number;
  /** Whether each mode was measured live; an unmeasured mode is refused like an unmeasured row. */
  modes: Readonly<Record<GenerationVideoMode, boolean>>;
  duration_s: { min: number; max: number };
  rows: readonly GenerationVideoRow[];
}

type GenerationCapabilities = {
  readonly [M in GenerationModel]: M extends GenerationVideoModel ? GenerationVideoCapability : GenerationImageCapability;
};

const image = (aspect_ratio: GenerationImageAspect, width: number, height: number, unit_credits: number, measured = false): GenerationImageRow =>
  ({ aspect_ratio, width, height, unit_credits, measured });

const H264 = { codec: "h264", pix_fmt: "yuv420p" } as const;
const UNPROBED = { codec: null, pix_fmt: null } as const;

/** Rows in both aspects of one resolution; `measured` holds the aspects probed live (19.10 paid tests, ffprobe of the clips). */
function video(resolution: GenerationResolution, short: number, long: number, unit_credits: number,
  probed: { codec: string | null; pix_fmt: string | null }, measured: { vertical?: boolean; horizontal?: boolean } = {},
  warning?: string): GenerationVideoRow[] {
  const extra = warning === undefined ? {} : { warning };
  return [
    { aspect_ratio: "9:16", resolution, width: short, height: long, ...probed, unit_credits, measured: measured.vertical ?? false, ...extra },
    { aspect_ratio: "16:9", resolution, width: long, height: short, ...probed, unit_credits, measured: measured.horizontal ?? false, ...extra },
  ];
}

const HEVC10 = { codec: "hevc", pix_fmt: "yuv420p10le" } as const;
const SEEDANCE_2_0_MODES = { text: true, first_frame: true, reference: false } as const;
const DRAFT_480P = "480p draft is 496x864 (2.1% off 9:16), as the vendor renders it; we do not crop it";

/** The one table of models, shapes and prices (D0, D7): schema, quote, admission and the models list read it. */
export const GENERATION_CAPABILITIES: GenerationCapabilities = deepFreeze({
  "seedream-5.0-flash": {
    kind: "image",
    vendor: "byteplus",
    vendor_model: { text: "dola-seedream-5-0-flash-260915", reference: "dola-seedream-5-0-flash-260915" },
    rows: [image("9:16", 1440, 2560, 12, true), image("16:9", 2560, 1440, 12, true), image("1:1", 2048, 2048, 12, true)],
  },
  flare: {
    kind: "image",
    vendor: "fal",
    vendor_model: { text: "openai/gpt-image-2.5/flare/text-to-image", reference: "openai/gpt-image-2.5/flare/edit" },
    rows: [image("9:16", 1008, 1792, 18, true), image("16:9", 1792, 1008, 18), image("1:1", 1024, 1024, 18)],
  },
  "seedance-2.0": {
    kind: "video",
    vendor: "byteplus",
    vendor_model: "dreamina-seedance-2-0-260128",
    fps: GENERATION_VIDEO_FPS,
    modes: SEEDANCE_2_0_MODES,
    duration_s: { min: 4, max: 15 },
    rows: [...video("480p", 480, 854, 45, UNPROBED), ...video("720p", 720, 1280, 100, H264, { vertical: true }),
      ...video("1080p", 1080, 1920, 250, H264, { vertical: true, horizontal: true })],
  },
  "seedance-2.0-mini": {
    kind: "video",
    vendor: "byteplus",
    vendor_model: "dreamina-seedance-2-0-mini-260615",
    fps: GENERATION_VIDEO_FPS,
    modes: { text: true, first_frame: true, reference: true },
    duration_s: { min: 4, max: 15 },
    rows: [...video("480p", 496, 864, 25, H264, { vertical: true }, DRAFT_480P),
      ...video("720p", 720, 1280, 50, H264, { vertical: true, horizontal: true })],
  },
  "seedance-2.0-fast": {
    kind: "video",
    vendor: "byteplus",
    vendor_model: "dreamina-seedance-2-0-fast-260128",
    fps: GENERATION_VIDEO_FPS,
    modes: SEEDANCE_2_0_MODES,
    duration_s: { min: 4, max: 15 },
    rows: [...video("480p", 480, 854, 35, UNPROBED), ...video("720p", 720, 1280, 80, H264, { vertical: true })],
  },
  "seedance-2.5": {
    kind: "video",
    vendor: "byteplus",
    vendor_model: "dreamina-seedance-2-5-260628",
    fps: GENERATION_VIDEO_FPS,
    modes: { text: false, first_frame: true, reference: false },
    duration_s: { min: 4, max: 30 },
    rows: [...video("480p", 480, 854, 70, UNPROBED), ...video("720p", 720, 1280, 150, H264, { vertical: true }),
      ...video("1080p", 1080, 1920, 380, HEVC10, { vertical: true },
        "seedance-2.5 at 1080p is HEVC 10-bit (yuv420p10le); some browsers and editors do not play it")],
  },
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/** A reference: an own upload with its rights confirmed, or a prior image generation of the same account. */
export const generationReference = z.union([
  z.strictObject({ upload_id: uploadId, rights_confirmed: z.literal(true) }),
  z.strictObject({ run_id: runId }),
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
}).superRefine((request, context) => {
  const issue = (path: string, message: string) => context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  const { min, max } = GENERATION_CAPABILITIES[request.model].duration_s;
  if (request.duration_s < min || request.duration_s > max) {
    issue("duration_s", `${request.model} takes ${min} to ${max} seconds`);
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
      duration_s: { ...capability.duration_s }, max_references: modes.includes("reference") ? GENERATION_MAX_REFERENCES : 0, rows }];
  });
}
