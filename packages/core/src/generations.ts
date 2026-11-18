import { z } from "zod";
import { assetId } from "./assets.js";
import { generationShot, shotIssues } from "./generation-shot.js";
import { GENERATION_KINDS } from "./generations-output.js";
import { maxCreditsField } from "./max-credits.js";
import { runId } from "./runs.js";
import { uploadId } from "./uploads.js";

export const GENERATION_MODELS_PATH = "/v1/generations/models";
export const GENERATE_IMAGE_QUOTE_PATH = "/v1/skills/generate_image/quote";
export const GENERATE_IMAGE_RUN_PATH = "/v1/skills/generate_image/run";
export const GENERATE_VIDEO_QUOTE_PATH = "/v1/skills/generate_video/quote";
export const GENERATE_VIDEO_RUN_PATH = "/v1/skills/generate_video/run";

export const GENERATION_IMAGE_MODELS = ["seedream-5.0-flash", "seedream-5.5", "flare", "gemini-3-pro-image", "gemini-nano-banana-2.1"] as const;
export const GENERATION_VIDEO_MODELS = [
  "seedance-2.0", "seedance-2.0-mini", "seedance-2.0-fast", "seedance-2.5", "seedance-2.5-flash", "kling-3.0", "kling-4.0", "kling-4.0-flash",
  "gemini-omni-flash-1.1", "gemini-omni-flash-1.2",
] as const;
export type GenerationImageModel = (typeof GENERATION_IMAGE_MODELS)[number];
export type GenerationVideoModel = (typeof GENERATION_VIDEO_MODELS)[number];
export type GenerationModel = GenerationImageModel | GenerationVideoModel;

/** 21:9 is a storyboard strip of four 9:16 slots in one row (#1686). */
export const GENERATION_IMAGE_ASPECTS = ["9:16", "16:9", "1:1", "21:9"] as const;
export const GENERATION_VIDEO_ASPECTS = ["9:16", "16:9"] as const;
export const GENERATION_RESOLUTIONS = ["360p", "480p", "720p", "1080p"] as const;
export const GENERATION_VIDEO_MODES = ["text", "first_frame", "reference"] as const;
/** No model takes a camera parameter, so the run writes it as the prompt's first line (#761). */
export const GENERATION_CAMERAS = ["static", "push_in", "pull_back", "pan", "turntable"] as const;
const GENERATION_CAMERA_DESCRIPTION ="The camera, written as the prompt's first line: static, push_in, pull_back, pan, or turntable " +
  "(the camera stays still while the subject turns in place, for a product shot). For a product turntable pass the product's " +
  "picture as first_frame and again as last_frame, so the clip ends where it began and loops; seedance-2.0-mini makes the " +
  "full turn, while kling-3.0 given the same last frame barely turns. The price does not depend on it.";
export type GenerationCamera = (typeof GENERATION_CAMERAS)[number];
export type GenerationImageAspect = (typeof GENERATION_IMAGE_ASPECTS)[number];
export type GenerationVideoAspect = (typeof GENERATION_VIDEO_ASPECTS)[number];
export type GenerationResolution = (typeof GENERATION_RESOLUTIONS)[number];
export type GenerationVideoMode = (typeof GENERATION_VIDEO_MODES)[number];

/** The references a model takes unless its capability names more. */
export const GENERATION_MAX_REFERENCES = 4;
export const GENERATION_VIDEO_FPS = 24;
export const GENERATION_PROMPT_MAX_CHARS = 5000;

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
  /** A live take with references passed on this row (rule 4); reference mode is offered on such rows only. */
  reference?: true;
  /** Told in `warnings[]` on every request that lands here (rule 3): what the measured output differs in. */
  warning?: string;
}

export interface GenerationImageCapability {
  kind: "image";
  /** The references a request may carry, measured live; absent means `GENERATION_MAX_REFERENCES`. */
  max_references?: number;
  /** The fewest references a request needs, where the model only edits a picture it is given; absent means none. */
  min_references?: number;
  rows: readonly GenerationImageRow[];
}

export interface GenerationVideoCapability {
  kind: "video";
  fps: number;
  /** Whether each mode was measured live; an unmeasured mode is refused like an unmeasured row. `reference` is set when at least */
  /** one row is marked `reference`, and a reference request is refused on every other row. */
  modes: Readonly<Record<GenerationVideoMode, boolean>>;
  duration_s: { min: number; max: number };
  /** The only lengths a model takes when it is not every whole second of the range. */
  duration_values?: readonly number[];
  /** `false` where first_frame mode takes no last_frame; absent, it takes one. */
  last_frame?: false;
  /** The longest clip that takes a last_frame, where it is shorter than `duration_s.max`. */
  last_frame_max_s?: number;
  /** The model's own sound is kept on request (`audio: true`), at the row's price. */
  audio?: true;
  rows: readonly GenerationVideoRow[];
}

type GenerationCapabilities = {
  readonly [M in GenerationModel]: M extends GenerationVideoModel ? GenerationVideoCapability : GenerationImageCapability;
};

const image = (aspect_ratio: GenerationImageAspect, width: number, height: number, unit_credits: number, measured = false): GenerationImageRow =>
  ({ aspect_ratio, width, height, unit_credits, measured });

const H264 = { codec: "h264", pix_fmt: "yuv420p" } as const;

/** Rows in both aspects of one resolution; `measured` holds the aspects probed live on rendered clips. */
function video(resolution: GenerationResolution, short: number, long: number,
  unit_credits: number, probed: { codec: string | null; pix_fmt: string | null },
  measured: { vertical?: boolean; horizontal?: boolean } = {}, warning?: string): GenerationVideoRow[] {
  const extra = warning === undefined ? {} : { warning };
  return [
    { aspect_ratio: "9:16", resolution, width: short, height: long, ...probed, unit_credits, measured: measured.vertical ?? false, ...extra },
    { aspect_ratio: "16:9", resolution, width: long, height: short, ...probed, unit_credits, measured: measured.horizontal ?? false, ...extra },
  ];
}

const HEVC10 = { codec: "hevc", pix_fmt: "yuv420p10le" } as const;
const SEEDANCE_2_0_MODES = { text: true, first_frame: true, reference: true } as const;
const DRAFT_480P = {
  "9:16": "480p draft is 496x864 (2.1% off 9:16), as the model renders it; we do not crop it",
  "16:9": "480p draft is 864x496 (2.0% off 16:9), as the model renders it; we do not crop it",
} as const;

/** Seedance 2.0 renders 480p as 496x864 vertical and 864x496 horizontal, as measured. */
function draft480p(unit_credits: number): GenerationVideoRow[] {
  return video("480p", 496, 864, unit_credits, H264, { vertical: true, horizontal: true })
    .map((row) => ({ ...row, warning: DRAFT_480P[row.aspect_ratio] }));
}

const OMNI_DRAFT_360P = "360p is a draft: softer than 720p, for trying a move cheaply; make the final take at 720p";

/** One aspect of a pair changed: a measure that saw only that aspect. */
function only(rows: GenerationVideoRow[], aspect: GenerationVideoAspect, change: Partial<GenerationVideoRow>): GenerationVideoRow[] {
  return rows.map((row) => (row.aspect_ratio === aspect ? { ...row, ...change } : row));
}

/** The vertical row of a pair, where the live take with references was made. */
const referenceVertical = (rows: GenerationVideoRow[]): GenerationVideoRow[] => only(rows, "9:16", { reference: true });

/** The one table of models, shapes and prices. */
export const GENERATION_CAPABILITIES: GenerationCapabilities = deepFreeze({
  "seedream-5.0-flash": {
    kind: "image",
    rows: [image("9:16", 1440, 2560, 5, true), image("16:9", 2560, 1440, 5, true), image("1:1", 2048, 2048, 5, true)],
  },
  // A cleanup pass over a board or picture (#1686), measured live 17.11: it edits the pictures it is given.
  "seedream-5.5": {
    kind: "image",
    min_references: 1,
    rows: [image("9:16", 1440, 2560, 17, true), image("21:9", 3024, 1296, 17, true)],
  },
  flare: {
    kind: "image",
    // 21:9 measured live 17.11 (#1686) with four references: a storyboard strip, priced on its own cost.
    rows: [image("9:16", 1008, 1792, 7, true), image("16:9", 1792, 1008, 7), image("1:1", 1024, 1024, 7), image("21:9", 2352, 1008, 16, true)],
  },
  // An editor of up to 14 pictures (product, person, place, prop); 9:16 is 0.8% off, inside the 2% match.
  "gemini-3-pro-image": {
    kind: "image",
    max_references: 14,
    rows: [image("9:16", 1536, 2752, 38, true), image("16:9", 2752, 1536, 38, true), image("1:1", 2048, 2048, 38, true)],
  },
  "gemini-nano-banana-2.1": {
    kind: "image",
    max_references: 14,
    rows: [image("9:16", 768, 1376, 21, true), image("16:9", 1376, 768, 21, true), image("1:1", 1024, 1024, 21, true)],
  },
  "seedance-2.0": {
    kind: "video",
    fps: GENERATION_VIDEO_FPS,
    modes: SEEDANCE_2_0_MODES,
    duration_s: { min: 4, max: 15 },
    rows: [...referenceVertical(draft480p(18)),
      ...referenceVertical(video("720p", 720, 1280, 38, H264, { vertical: true, horizontal: true })),
      ...video("1080p", 1080, 1920, 94, H264, { vertical: true, horizontal: true })],
  },
  "seedance-2.0-mini": {
    kind: "video",
    fps: GENERATION_VIDEO_FPS,
    modes: SEEDANCE_2_0_MODES,
    duration_s: { min: 4, max: 15 },
    rows: [...referenceVertical(draft480p(5)),
      ...referenceVertical(video("720p", 720, 1280, 11, H264, { vertical: true, horizontal: true }))],
  },
  "seedance-2.0-fast": {
    kind: "video",
    fps: GENERATION_VIDEO_FPS,
    modes: SEEDANCE_2_0_MODES,
    duration_s: { min: 4, max: 15 },
    rows: [...referenceVertical(draft480p(15)),
      ...referenceVertical(video("720p", 720, 1280, 31, H264, { vertical: true, horizontal: true }))],
  },
  "seedance-2.5": {
    kind: "video",
    fps: GENERATION_VIDEO_FPS,
    modes: { text: false, first_frame: true, reference: true },
    duration_s: { min: 4, max: 30 },
    audio: true,
    // 2.5 renders a true 480x854.
    rows: [...referenceVertical(video("480p", 480, 854, 26, H264, { vertical: true, horizontal: true })),
      ...referenceVertical(video("720p", 720, 1280, 59, H264, { vertical: true, horizontal: true })),
      ...video("1080p", 1080, 1920, 143, HEVC10, { vertical: true },
        "seedance-2.5 at 1080p is HEVC 10-bit (yuv420p10le); some browsers and editors do not play it")],
  },
  // Measured live 17.11: a true 480x854 and 720x1280 in both formats; no 1080p.
  "seedance-2.5-flash": {
    kind: "video",
    fps: GENERATION_VIDEO_FPS,
    modes: { text: false, first_frame: true, reference: true },
    duration_s: { min: 4, max: 30 },
    audio: true,
    rows: [...referenceVertical(video("480p", 480, 854, 17, H264, { vertical: true, horizontal: true })),
      ...referenceVertical(video("720p", 720, 1280, 38, H264, { vertical: true, horizontal: true }))],
  },
  "kling-3.0": {
    kind: "video",
    fps: GENERATION_VIDEO_FPS,
    modes: { text: true, first_frame: true, reference: true },
    duration_s: { min: 3, max: 15 },
    rows: referenceVertical(video("720p", 720, 1280, 19, H264, { vertical: true, horizontal: true })),
  },
  "kling-4.0": {
    kind: "video",
    fps: GENERATION_VIDEO_FPS,
    modes: { text: true, first_frame: true, reference: true },
    duration_s: { min: 3, max: 30 },
    rows: [...referenceVertical(video("720p", 720, 1280, 36, H264, { vertical: true, horizontal: true })),
      ...video("1080p", 1080, 1920, 53, H264, { vertical: true, horizontal: true })],
  },
  "kling-4.0-flash": {
    kind: "video",
    fps: GENERATION_VIDEO_FPS,
    modes: { text: true, first_frame: true, reference: true },
    duration_s: { min: 3, max: 20 },
    last_frame: false,
    rows: referenceVertical(video("720p", 720, 1280, 22, H264, { vertical: true, horizontal: true })),
  },
  // 360p 9:16 is not yet seen live.
  "gemini-omni-flash-1.1": {
    kind: "video",
    fps: GENERATION_VIDEO_FPS,
    modes: { text: true, first_frame: true, reference: true },
    duration_s: { min: 4, max: 10 },
    duration_values: [4, 6, 8, 10],
    rows: [...only(video("360p", 360, 640, 20, H264), "16:9", { measured: true }),
      ...referenceVertical(video("720p", 720, 1280, 20, H264, { vertical: true, horizontal: true }))],
  },
  // 360p measured live 17.11 in 9:16 only, in every mode; a draft tier for trying a move.
  "gemini-omni-flash-1.2": {
    kind: "video",
    fps: GENERATION_VIDEO_FPS,
    modes: { text: true, first_frame: true, reference: true },
    duration_s: { min: 3, max: 15 },
    last_frame_max_s: 10,
    audio: true,
    rows: [...referenceVertical(video("360p", 360, 640, 5, H264, { vertical: true }, OMNI_DRAFT_360P)),
      ...referenceVertical(video("720p", 720, 1280, 12, H264, { vertical: true, horizontal: true }))],
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

/** Added to a prompt that works from a reference picture, unless `keep_text` is set (#1248): models redraw a label as garbled letters. */
export const GENERATION_NO_TEXT_CLAUSE = "No text, no lettering, no watermark, no logos on the object beyond the reference's plain shapes.";
const keepText = z.boolean().optional().describe("Keep the reference's own lettering; by default a no-text line is added to the prompt.");

/** The prompt a model gets: with a reference and no `keep_text`, the no-text line follows it (a prompt that already says so is left alone). */
export function withNoTextClause(promptText: string, options: { hasReference: boolean; keepText?: boolean | undefined }): string {
  if (!options.hasReference || options.keepText === true || /\bno (?:text|lettering)\b/i.test(promptText)) return promptText;
  return `${promptText}\n${GENERATION_NO_TEXT_CLAUSE}`;
}

const imageMaxReferences = (model: GenerationImageModel): number =>
  GENERATION_CAPABILITIES[model].max_references ?? GENERATION_MAX_REFERENCES;
const imageMinReferences = (model: GenerationImageModel): number => GENERATION_CAPABILITIES[model].min_references ?? 0;

/** No `visible_ai_label`: an unknown key is refused, never passed to the provenance policy (D12). */
export const generateImageRequest = z.strictObject({
  prompt,
  keep_text: keepText,
  model: z.enum(GENERATION_IMAGE_MODELS),
  aspect_ratio: z.enum(GENERATION_IMAGE_ASPECTS),
  references: z.array(generationReference).max(Math.max(...GENERATION_IMAGE_MODELS.map(imageMaxReferences))).optional()
    .describe("Pictures the image is made from; each model takes up to its max_references, and at least its min_references where it " +
      "lists one (list_generation_models)."),
  max_credits: maxCreditsField,
}).superRefine((request, context) => {
  const most = imageMaxReferences(request.model);
  const count = request.references?.length ?? 0;
  if (count > most) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["references"], message: `${request.model} takes up to ${most} references` });
  }
  if (count < imageMinReferences(request.model)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["references"],
      message: `${request.model} cleans up a picture: pass the picture, and any product photos, as references` });
  }
});
export type GenerateImageRequest = z.infer<typeof generateImageRequest>;

const SHOT_DESCRIPTION = "The clip as a shot, in place of prompt: framing, subject, start_state, timed beats, camera, light and " +
  "continuity. Write every field as what the frame shows: a state reads \"her fingertips are clean\", never as an absence.";

const AUDIO_DESCRIPTION = "Keep the model's own sound (words in prompt spoken, effects): models listed audio: true, same price. Else silent.";

/** Silent unless `audio` asks for the model's own sound (#1686). Exactly one of `prompt` and `shot`. */
export const generateVideoRequest = z.strictObject({
  prompt: prompt.optional().describe("What the clip shows, in your words; or pass shot instead."),
  shot: generationShot.optional().describe(SHOT_DESCRIPTION),
  keep_text: keepText,
  model: z.enum(GENERATION_VIDEO_MODELS),
  mode: z.enum(GENERATION_VIDEO_MODES),
  aspect_ratio: z.enum(GENERATION_VIDEO_ASPECTS),
  // Every video model has a measured 720p row in both aspects, so the default always lands on one (#911).
  resolution: z.enum(GENERATION_RESOLUTIONS).default("720p").describe("The clip's resolution; omitted means 720p. Rows and prices per resolution: list_generation_models."),
  duration_s: z.number().int().positive().safe(),
  first_frame: generationReference.optional(),
  last_frame: generationReference.optional(),
  references: z.array(generationReference).min(1).max(GENERATION_MAX_REFERENCES).optional(),
  /** Compiled into the prompt's first line; the price does not depend on it. */
  camera: z.enum(GENERATION_CAMERAS).optional().describe(GENERATION_CAMERA_DESCRIPTION),
  audio: z.boolean().optional().describe(AUDIO_DESCRIPTION),
  max_credits: maxCreditsField,
}).superRefine((request, context) => {
  const issue = (path: string, message: string) => context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  const capability = GENERATION_CAPABILITIES[request.model];
  if (request.audio === true && capability.audio !== true) issue("audio", `${request.model} makes no sound`);
  const { min, max } = capability.duration_s;
  if (request.duration_s < min || request.duration_s > max) {
    issue("duration_s", `${request.model} takes ${min} to ${max} seconds`);
  } else if (capability.duration_values && !capability.duration_values.includes(request.duration_s)) {
    issue("duration_s", `${request.model} takes ${capability.duration_values.join(", ")} seconds`);
  }
  if (request.mode === "first_frame" && request.first_frame === undefined) issue("first_frame", "first_frame mode requires first_frame");
  if (request.last_frame !== undefined && capability.last_frame === false) issue("last_frame", `${request.model} takes no last_frame`);
  if (request.last_frame !== undefined && capability.last_frame_max_s !== undefined && request.duration_s > capability.last_frame_max_s) {
    issue("last_frame", `${request.model} takes a last_frame up to ${capability.last_frame_max_s} seconds`);
  }
  if (request.mode !== "first_frame") {
    if (request.first_frame !== undefined) issue("first_frame", "first_frame is only accepted in first_frame mode");
    if (request.last_frame !== undefined) issue("last_frame", "last_frame is only accepted in first_frame mode");
  }
  if ((request.prompt === undefined) === (request.shot === undefined)) issue("prompt", "pass exactly one of prompt and shot");
  if (request.shot !== undefined) {
    if (request.camera !== undefined) issue("camera", "a shot names its camera in shot.camera");
    for (const found of shotIssues(request.shot, request.duration_s)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["shot", ...found.path], message: found.message });
    }
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
    if (request.audio === true && capability.audio !== true) return null;
    if (request.last_frame !== undefined && capability.last_frame === false) return null;
    if (request.last_frame !== undefined && request.duration_s > (capability.last_frame_max_s ?? max)) return null;
    if (capability.duration_values && !capability.duration_values.includes(request.duration_s)) return null;
    const row = capability.rows.find((one) => one.aspect_ratio === request.aspect_ratio && one.resolution === request.resolution);
    if (request.mode === "reference" && row?.reference !== true) return null;
    return row?.measured ? { kind: "video", model: request.model, capability, row } : null;
  }
  const capability = GENERATION_CAPABILITIES[request.model];
  if ((request.references?.length ?? 0) < imageMinReferences(request.model)) return null;
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
  reference: z.literal(true).optional().describe("Present on a clip row that takes reference mode; other rows refuse it."),
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
  min_references: z.number().int().positive().optional()
    .describe("Present on a picture model that only cleans up pictures it is given: the fewest references a request takes."),
  audio: z.literal(true).optional().describe("Present on a clip model that keeps its own sound on audio: true, at the same price."),
  rows: z.array(listedRow).min(1),
});

export const generationModels = z.strictObject({
  models: z.array(listedModel),
  contract_version: z.string().min(1),
});
export type GenerationModels = z.infer<typeof generationModels>;
export type ListedGenerationModel = z.infer<typeof listedModel>;

/** The models list from the table: a model with no measured row, or a video model with no measured mode, is left out. */
/** `audio` marks the sound models only while the API offers the field (its switch is read by the caller). */
export function listGenerationModels(options: { audio?: boolean } = {}): ListedGenerationModel[] {
  return (Object.keys(GENERATION_CAPABILITIES) as GenerationModel[]).flatMap((model): ListedGenerationModel[] => {
    const capability: GenerationImageCapability | GenerationVideoCapability = GENERATION_CAPABILITIES[model];
    if (capability.kind === "image") {
      const rows = capability.rows.filter((row) => row.measured)
        .map(({ aspect_ratio, width, height, unit_credits }) => ({ aspect_ratio, resolution: null, width, height, unit_credits }));
      const fewest = imageMinReferences(model as GenerationImageModel);
      return rows.length === 0 ? [] : [{ model, kind: "image", unit: "image", modes: null, duration_s: null,
        max_references: imageMaxReferences(model as GenerationImageModel), ...(fewest > 0 ? { min_references: fewest } : {}), rows }];
    }
    const modes = GENERATION_VIDEO_MODES.filter((mode) => capability.modes[mode]);
    const rows = capability.rows.filter((row) => row.measured)
      .map(({ aspect_ratio, resolution, width, height, unit_credits, reference }) => ({ aspect_ratio, resolution, width, height, unit_credits,
        ...(reference && capability.modes.reference ? { reference } : {}) }));
    return rows.length === 0 || modes.length === 0 ? [] : [{ model, kind: "video", unit: "second", modes,
      duration_s: { ...capability.duration_s },
      ...(capability.duration_values ? { duration_values: [...capability.duration_values] } : {}),
      max_references: modes.includes("reference") ? GENERATION_MAX_REFERENCES : 0,
      ...(options.audio === true && capability.audio === true ? { audio: true as const } : {}), rows }];
  });
}
