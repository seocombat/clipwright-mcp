import { z } from "zod";
import { uploadResponse } from "./uploads.js";
import { MAX_URL_LENGTH } from "./skills.js";
import { FACELESS_REJECTED_FIELDS } from "./contract-dispositions.js";
import { FACELESS_MIN_OUTPUT_FRAMES, facelessQuote } from "./faceless-price.js";
import { DEFAULT_FACELESS_VOICE } from "./faceless-voices.js";
import { VOICE_NAME_PATTERN } from "./voices.js";

const qualifiedImageUrl = uploadResponse.shape.url.max(MAX_URL_LENGTH).refine((value) => {
  const host = new URL(value).hostname.toLowerCase();
  return host !== "localhost" && !host.endsWith(".localhost") &&
    host !== "127.0.0.1" && host !== "[::1]" &&
    !/^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host);
}, "image must use a qualified public https source");

export const facelessSceneAnchor = z.union([
  z.object({ startWord: z.number().int().nonnegative(), endWord: z.number().int().positive() })
    .strict().refine((range) => range.endWord > range.startWord),
  z.object({ quote: z.string().trim().min(1).max(500), occurrence: z.number().int().nonnegative().optional() }).strict(),
]);
export type FacelessSceneAnchor = z.infer<typeof facelessSceneAnchor>;

export const facelessCustomerSceneImage = z.object({
  image_url: qualifiedImageUrl,
  anchor: facelessSceneAnchor,
}).strict();
export type FacelessCustomerSceneImage = z.infer<typeof facelessCustomerSceneImage>;

const common = {
  duration_seconds: z.number().min(30).max(90).refine((seconds) => Number.isInteger(seconds * 25),
    "duration_seconds must align to a 25 fps frame boundary"),
  style_reference: qualifiedImageUrl.optional(),
  character_reference: qualifiedImageUrl.optional(),
  character_details: z.string().trim().min(1).max(400).optional(),
  scene_images: z.array(facelessCustomerSceneImage).max(30).optional(),
  captions: z.boolean().default(true),
  // A name form only: the server checks the name, so the list grows without a client release.
  voice: z.string({ error: "voice must be a voice name from list_voices, as a string" })
    .regex(VOICE_NAME_PATTERN, "voice is not a voice name: take one from list_voices with skill=make_faceless")
    .optional(),
  voice_id: z.never({ error: FACELESS_REJECTED_FIELDS.voice_id.message }).optional(),
};

const scriptInput = z.object({ ...common,
  input_mode: z.literal("script"),
  script: z.string().trim().min(1).max(10_000),
}).strict();
const briefInput = z.object({ ...common,
  input_mode: z.literal("brief"),
  brief: z.string().trim().min(1).max(5_000),
}).strict();

export const makeFacelessInput = z.discriminatedUnion("input_mode", [scriptInput, briefInput]);
export type MakeFacelessInput = z.infer<typeof makeFacelessInput>;
export type MakeFacelessInputArgs = z.input<typeof makeFacelessInput>;

/** The API routes repeat these paths as literals, and a test keeps them equal. */
export const FACELESS_QUOTE_PATH = "/v1/skills/make_faceless/quote";
export const FACELESS_RUN_PATH = "/v1/skills/make_faceless/run";

/** Flat form of `makeFacelessInput` for MCP, which needs an object shape, not a union. */
/** Clients still parse with `makeFacelessInput` before sending, so the union stays the contract. */
export const offeredFacelessInputShape = {
  input_mode: z.enum(["script", "brief"])
    .describe("'script' narrates your exact text; 'brief' writes the narration from a short description. Send exactly one of script or brief, matching this mode."),
  script: scriptInput.shape.script.optional()
    .describe("The narration, read as written. Required when input_mode is 'script'; must be absent when it is 'brief'."),
  brief: briefInput.shape.brief.optional()
    .describe("What the video is about; the narration is written from it. Required when input_mode is 'brief'; must be absent when it is 'script'."),
  duration_seconds: common.duration_seconds
    .describe("Selected length, 30 to 90 seconds, on a 1/25 s frame boundary. The video ends with its narration, runs at least 25 seconds and may exceed the selection by up to a quarter, never beyond 90 seconds; a video more than 5 seconds longer says so in warnings[]. The charge never exceeds the quote. A script is accepted when its estimated length is 21 seconds to the selection plus 5, at most 90."),
  style_reference: common.style_reference
    .describe("Optional public https image whose visual style the scenes follow."),
  character_reference: common.character_reference
    .describe("Optional public https image of a person or figure to keep consistent across scenes."),
  character_details: common.character_details
    .describe("Optional fixed visual details for the referenced person or figure, such as hairstyle, clothing and absent accessories; applied to every generated scene."),
  scene_images: common.scene_images
    .describe("Optional images of your own, each placed at a word range or quote of the narration."),
  captions: common.captions.describe("Burned-in captions; on by default."),
  voice: common.voice
    .describe("Narration voice: a name from list_voices with skill=make_faceless (kind faceless_voice). " +
      `Omitted means ${DEFAULT_FACELESS_VOICE}. Choose a voice in the language of the narration: a voice reads any ` +
      "language, with the accent of its own. The API refuses an unknown name and a make_ugc voice before any charge. " +
      "A raw voice_id is not accepted here."),
};

const rejectedFacelessField = (key: string): string | undefined =>
  Object.hasOwn(FACELESS_REJECTED_FIELDS, key)
    ? FACELESS_REJECTED_FIELDS[key as keyof typeof FACELESS_REJECTED_FIELDS].message
    : undefined;

/** The flat form as a tool input: an undeclared key is refused at the tool boundary, */
/** a field refused by name with its registry reason. */
export const offeredFacelessInput = z.strictObject(offeredFacelessInputShape, {
  error: (issue) =>
    issue.code === "unrecognized_keys"
      ? issue.keys.map((key) => rejectedFacelessField(key) ?? `"${key}" is not a field of this tool`).join("; ")
      : undefined,
});

const wordTiming = z.object({
  word: z.string().trim().min(1),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
}).strict().refine((word) => word.endSec > word.startSec);

export const facelessPlannerInput = z.object({
  script: z.string().trim().min(1),
  outputFrames: z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(2250),
  captions: z.boolean(),
  words: z.array(wordTiming).min(1),
}).strict();
export type FacelessPlannerInput = z.infer<typeof facelessPlannerInput>;

export const facelessQuoteResponse = facelessQuote.extend({
  skill: z.literal("make_faceless"),
  warnings: z.array(z.string()).default([]),
  contract_version: z.string().min(1),
}).strict();
export type FacelessQuoteResponse = z.infer<typeof facelessQuoteResponse>;
