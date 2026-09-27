import { z } from "zod";
import { uploadResponse } from "./uploads.js";
import { MAX_URL_LENGTH } from "./skills.js";
import { FACELESS_MIN_OUTPUT_FRAMES, facelessQuote } from "./faceless-price.js";

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
  scene_images: z.array(facelessCustomerSceneImage).max(30).optional(),
  captions: z.boolean().default(true),
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
    .describe("Selected length, 30 to 90 seconds, on a 1/25 s frame boundary. The video ends with its narration, runs at least 25 seconds and may exceed the selection by up to 5 seconds, never beyond 90 seconds. The charge never exceeds the quote. A script must fit this output range."),
  style_reference: common.style_reference
    .describe("Optional public https image whose visual style the scenes follow."),
  character_reference: common.character_reference
    .describe("Optional public https image of a person or figure to keep consistent across scenes."),
  scene_images: common.scene_images
    .describe("Optional images of your own, each placed at a word range or quote of the narration."),
  captions: common.captions.describe("Burned-in captions; on by default."),
};

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
