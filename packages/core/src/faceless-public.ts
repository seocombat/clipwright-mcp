import { z } from "zod";
import { editSummaryWire, revisionBilling } from "./edit-billing.js";
import { editDocument } from "./edit-document.js";
import { runId } from "./runs.js";
import { uploadResponse } from "./uploads.js";
import { MAX_URL_LENGTH, motionStyle, offeredResolution, pinnedInsertAsset, ugcScene, ugcTemplate } from "./skills.js";
import { MOTION_STYLE_UNUSED_WARNING, motionStyleAsked, motionStyleHasCanvas, motionStyleRefusals } from "./motion-styles.js";
import { MAX_SCENES, sceneRefusals } from "./ugc-scenes.js";
import { MAX_MOVES, moveRefusals, MOVES_DESCRIPTION, ugcMove } from "./moves.js";
import { MAX_TEMPLATE_MEDIA, MAX_TEMPLATES, templateRefusals } from "./templates/index.js";
import { assetId } from "./asset-identity.js";
import { FACELESS_REJECTED_FIELDS } from "./contract-dispositions.js";
import { FACELESS_MAX_OUTPUT_FRAMES, FACELESS_MAX_SELECTED_SECONDS, FACELESS_MAX_SHOTS, FACELESS_MIN_OUTPUT_FRAMES, FACELESS_MIN_SELECTED_SECONDS,
  EXPLAINER_TIER_TARIFFS, EXPLAINER_TIERS, explainerObjectCeiling, facelessQuote, quoteFaceless, type FacelessQuote,
  type SkillFilmTariff } from "./faceless-price.js";
import { DEFAULT_FACELESS_VOICE } from "./faceless-voices.js";
import { resolveFacelessCustomerAnchors } from "./faceless-customer-anchors.js";
import { FACELESS_TRANSITION_LOOKS } from "./faceless-media-record.js";
import { VOICE_NAME_PATTERN } from "./voices.js";
import { MUSIC_DESCRIPTION, musicRequest } from "./music.js";
import { facelessSoundRefusals, facelessTemplateSounds, mcpTemplateSounds } from "./templates/sounds.js";
import { FACELESS_SHOT_TRANSITIONS, facelessActionShotRefusals } from "./faceless-action-shots.js";
import { pauseTrim } from "./reference-voice.js";
import { pinnedMascot } from "./mascots.js";
import { filmDirections } from "./film-directions.js";
import { maxCreditsField } from "./max-credits.js";
import { sceneBible, sceneDirectionMark, storedSceneProposal } from "./scene-bible.js";

export const qualifiedImageUrl = uploadResponse.shape.url.max(MAX_URL_LENGTH).refine((value) => {
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

const customIssue = "custom" as const;
const transitionLook = z.enum(FACELESS_TRANSITION_LOOKS);
const scriptTransitions = z.strictObject({
  look: transitionLook,
  at: z.union([z.literal("scene_changes"), z.array(z.strictObject({ anchor: facelessSceneAnchor })).min(1).max(100)]).default("scene_changes"),
});
export type FacelessTransitionsInput = z.infer<typeof scriptTransitions>;
const briefTransitions = z.strictObject({
  look: transitionLook,
  at: z.literal("scene_changes", { error: "transitions.at word anchors need input_mode script; a brief takes \"scene_changes\"" })
    .default("scene_changes"),
});
export const FACELESS_BRIEF_DEFAULT_TRANSITIONS = Object.freeze({ look: "flash", at: "scene_changes" } as const);
const orPlainCuts = <T extends z.ZodType>(schema: T) => z.union([z.literal(false), schema], { error: issue => {
  if (issue.input === null || typeof issue.input !== "object" || Array.isArray(issue.input)) return "transitions is false (plain cuts) or { look, at }";
  const inner = schema.safeParse(issue.input).error?.issues[0];
  return inner && `${["transitions", ...inner.path.map(String)].join(".")}: ${inner.message}`;
} });
function refuseSounds(input: { input_mode: string; transitions?: false | { look: string } | undefined; edit_sounds?: boolean | undefined;
  template_sounds?: unknown }, context: z.RefinementCtx) {
  const look = input.transitions === undefined && input.input_mode === "brief" ? FACELESS_BRIEF_DEFAULT_TRANSITIONS.look
    : input.transitions ? input.transitions.look : undefined;
  for (const { path, message } of facelessSoundRefusals({ ...input, look })) context.addIssue({ code: customIssue, path, message });
}

export const FACELESS_FORMATS = ["standard", "explainer"] as const;
export const FACELESS_EXPLAINER_DISABLED_MESSAGE = "format explainer is not offered on make_faceless: write the explainer film yourself, " +
  "starting with get_film_guide, each part quoted before it is made; omit format for a narrated video over pictures";
export const FACELESS_EXPLAINER_BRIEF_REFUSAL = "format explainer needs input_mode script: write it as a hook, three to five steps and a result";

const common = {
  duration_seconds: z.number().min(FACELESS_MIN_SELECTED_SECONDS).max(FACELESS_MAX_SELECTED_SECONDS).refine((seconds) => Number.isInteger(seconds * 25),
    "duration_seconds must align to a 25 fps frame boundary"),
  style_reference: qualifiedImageUrl.optional(),
  character_reference: qualifiedImageUrl.optional()
    .describe("A picture of a person or figure: a public https image, or a picture you uploaded or saved in your assets. The figure is in every picture we generate and in the opening clip; " +
      "your own scene_images are shown as they are."),
  character_details: z.string().trim().min(1).max(2000).optional(),
  mascot_id: assetId.optional(),
  scene_images: z.array(facelessCustomerSceneImage).max(60).optional(),
  captions: z.boolean().default(true),
  voice: z.string({ error: "voice must be a voice name from list_voices, as a string" })
    .regex(VOICE_NAME_PATTERN, "voice is not a voice name: take one from list_voices with skill=make_faceless")
    .optional(),
  voice_id: z.never({ error: FACELESS_REJECTED_FIELDS.voice_id.message }).optional(),
  edit_sounds: z.boolean().optional(),
  template_sounds: facelessTemplateSounds.optional(),
  music: musicRequest.optional(),
  motion_style: motionStyle.optional(),
  format: z.enum(FACELESS_FORMATS).optional(),
  tier: z.enum(EXPLAINER_TIERS).optional(),
  resolution: offeredResolution.optional().describe("Output resolution: 720p (720x1280) or 1080p (1080x1920). Omitted means 720p. " +
    "The price does not depend on it."),
  max_credits: maxCreditsField,
  propose: z.literal(false).optional().describe("Deprecated: quotes no longer propose a scene, so false changes nothing; accepted so an " +
    "older body still parses."),
};
const storedSceneFields = { scene: sceneBible.optional(), proposal: storedSceneProposal.optional() };

export function facelessRunFrame(storedInput: unknown): { width: number; height: number } {
  const resolution = storedInput !== null && typeof storedInput === "object" ? (storedInput as { resolution?: unknown }).resolution : undefined;
  return resolution === "720p" ? { width: 720, height: 1280 } : { width: 1080, height: 1920 };
}

export const EXPLAINER_OWN_FIELDS = ["style_reference", "transitions", "templates", "shots", "scenes", "moves", "motion_style", "music"] as const;
export const explainerOwnFieldMessage = (field: string) => `format explainer draws its own scenes; omit ${field}`;
export const EXPLAINER_MAX_PRODUCT_PICTURES = 3;
export const EXPLAINER_PRODUCT_PICTURES_REFUSAL = `format explainer places at most ${EXPLAINER_MAX_PRODUCT_PICTURES} of your pictures`;
export function explainerPictureRefusals(script: unknown, images: unknown): { path: (string | number)[]; message: string }[] {
  if (!Array.isArray(images) || typeof script !== "string") return [];
  if (images.length > EXPLAINER_MAX_PRODUCT_PICTURES) return [{ path: ["scene_images"], message: EXPLAINER_PRODUCT_PICTURES_REFUSAL }];
  const anchored = images as FacelessCustomerSceneImage[];
  for (const [index, image] of anchored.entries()) {
    try { resolveFacelessCustomerAnchors(script, [image]); }
    catch (error) {
      return [{ path: ["scene_images", index, "anchor"], message: error instanceof Error && error.message === "ambiguous_customer_anchor"
        ? "the quote is said more than once in the script; add occurrence (0 is the first)" : "the anchor names no words of the script" }];
    }
  }
  try { resolveFacelessCustomerAnchors(script, anchored); }
  catch { return [{ path: ["scene_images"], message: "two of your pictures name the same words; give each its own" }]; }
  return [];
}
export function explainerFieldRefusals(input: Record<string, unknown>): { path: (string | number)[]; message: string }[] {
  if (input.format !== "explainer") return [];
  return [...(input.input_mode === "brief" ? [{ path: ["format"], message: FACELESS_EXPLAINER_BRIEF_REFUSAL }] : []),
    ...EXPLAINER_OWN_FIELDS.filter(field => input[field] !== undefined).map(field => ({ path: [field], message: explainerOwnFieldMessage(field) })),
    ...explainerPictureRefusals(input.script, input.scene_images)];
}
export function mascotFieldRefusals(input: Record<string, unknown>): { path: string[]; message: string }[] {
  if (input.mascot_id === undefined) return [];
  return [
    ...(input.format !== "explainer" ? [{ path: ["mascot_id"], message: "mascot_id needs format explainer: the mascot is its hero" }] : []),
    ...(["character_reference", "character_details"] as const).filter(field => input[field] !== undefined)
      .map(field => ({ path: [field], message: `mascot_id is the hero already made; omit ${field}` })),
  ];
}
export const EXPLAINER_TIER_REFUSAL = "tier needs format explainer: it picks the explainer's level";
function refuseExplainerFields(input: Record<string, unknown>, context: z.RefinementCtx) {
  for (const { path, message } of [...explainerFieldRefusals(input), ...mascotFieldRefusals(input)]) context.addIssue({ code: customIssue, path, message });
}
export function facelessTierRefusal(input: { tier?: unknown; format?: unknown }): string | null {
  return input.tier !== undefined && input.format !== "explainer" ? EXPLAINER_TIER_REFUSAL : null;
}
export const facelessDirectedMark = z.strictObject({ version: z.literal(1), tier: z.enum(EXPLAINER_TIERS),
  pairing: z.enum(["none", "keep", "by_meaning"]) });
export type FacelessDirectedMark = z.infer<typeof facelessDirectedMark>;

export function facelessMotionStyleWarnings(input: { motion_style?: Parameters<typeof motionStyleAsked>[0]["motion_style"]; captions?: boolean | undefined;
  templates?: readonly unknown[] | undefined; scenes?: readonly unknown[] | undefined }): string[] {
  return motionStyleAsked(input) && !motionStyleHasCanvas({ ...input, captions: input.captions !== false }) ? [MOTION_STYLE_UNUSED_WARNING] : [];
}

function refuseTemplates(input: { script: string; templates?: z.infer<typeof ugcTemplate>[] | undefined }, context: z.RefinementCtx) {
  if (!input.templates) return;
  for (const { path, message } of templateRefusals({ script: input.script, templates: input.templates, aspect_ratio: "9:16" })) {
    context.addIssue({ code: customIssue, path, message });
  }
}

export const facelessActionShot = z.strictObject({
  id: z.string().trim().min(1).max(64),
  anchor: facelessSceneAnchor,
  action: z.string().trim().min(1).max(1500),
  transition: z.enum(FACELESS_SHOT_TRANSITIONS).optional(),
  asset_id: assetId.optional(),
});
export type FacelessActionShot = z.infer<typeof facelessActionShot>;
export const FACELESS_SHOTS_BRIEF_REFUSAL = "shots need input_mode script: they sit on the narration's words";

const scriptShape = { ...common,
  input_mode: z.literal("script"),
  script: z.string().trim().min(1).max(10_000),
  transitions: orPlainCuts(scriptTransitions).optional(),
  templates: z.array(ugcTemplate).min(1).max(MAX_TEMPLATES).optional(),
  shots: z.array(facelessActionShot).min(1).max(FACELESS_MAX_SHOTS, `at most ${FACELESS_MAX_SHOTS} shots a video`).optional(),
  scenes: z.array(ugcScene).min(1).max(MAX_SCENES).optional(),
  moves: z.array(ugcMove).min(1).max(MAX_MOVES).optional(),
  pause_trim: z.union([z.literal(false), pauseTrim]).optional(),
};
const scriptBase = z.object(scriptShape).strict();
function refineScript(input: z.infer<typeof scriptBase>, context: z.RefinementCtx) {
  refuseSounds(input, context);
  refuseExplainerFields(input, context);
  refuseTemplates(input, context);
  for (const { path, message } of moveRefusals({ script: input.script, moves: input.moves })) context.addIssue({ code: customIssue, path, message });
  for (const { path, message } of sceneRefusals({ script: input.script, scenes: input.scenes, templates: input.templates }, { presenter: false })) {
    context.addIssue({ code: customIssue, path, message });
  }
  for (const { path, message } of motionStyleRefusals(input)) context.addIssue({ code: customIssue, path, message });
  if (input.shots) for (const { path, message } of facelessActionShotRefusals({ script: input.script, shots: input.shots,
    scene_images: input.scene_images })) context.addIssue({ code: customIssue, path, message });
  if (!input.transitions || !Array.isArray(input.transitions.at)) return;
  for (const [index, { anchor }] of input.transitions.at.entries()) {
    try { resolveFacelessCustomerAnchors(input.script, [{ image_url: "", anchor }]); }
    catch (error) {
      context.addIssue({ code: customIssue, path: ["transitions", "at", index, "anchor"],
        message: error instanceof Error && error.message === "ambiguous_customer_anchor"
          ? "the quote is said more than once in the script; add occurrence (0 is the first)"
          : "the anchor names no words of the script" });
    }
  }
}
const scriptInput = scriptBase.superRefine(refineScript);
const storedScriptInput = z.object({ ...scriptShape, ...storedSceneFields,
  insert_assets: z.array(pinnedInsertAsset).min(1).max(MAX_TEMPLATE_MEDIA + FACELESS_MAX_SHOTS).optional(),
  mascot: pinnedMascot.optional(),
  workflow_directions: filmDirections.optional(),
  scene_direction: sceneDirectionMark.optional(),
  directed: facelessDirectedMark.optional(),
  keep_anchors: z.boolean().optional(),
}).strict().superRefine(refineScript);
const briefShape = { ...common,
  input_mode: z.literal("brief"),
  brief: z.string().trim().min(1).max(10_000),
  transitions: orPlainCuts(briefTransitions).optional(),
  templates: z.never({ error: "templates need input_mode script: they sit on the narration's words" }).optional(),
  shots: z.never({ error: FACELESS_SHOTS_BRIEF_REFUSAL }).optional(),
  scenes: z.never({ error: "scenes need input_mode script: they sit on the narration's words" }).optional(),
  moves: z.never({ error: "moves need input_mode script: they sit on the narration's words" }).optional(),
  pause_trim: z.never({ error: "pause_trim needs input_mode script" }).optional(),
};
function refineBrief(input: z.infer<z.ZodObject<typeof briefShape>>, context: z.RefinementCtx) {
  refuseSounds(input, context);
  refuseExplainerFields(input, context);
  if (input.motion_style?.spans) context.addIssue({ code: customIssue, path: ["motion_style", "spans"],
    message: "motion_style spans need input_mode script: they sit on the narration's words; a brief takes style only" });
}
const briefInput = z.object(briefShape).strict().superRefine(refineBrief);
const storedBriefInput = z.object({ ...briefShape, ...storedSceneFields, scene_direction: sceneDirectionMark.optional(), directed: facelessDirectedMark.optional() })
  .strict().superRefine(refineBrief);

export const makeFacelessInput = z.discriminatedUnion("input_mode", [scriptInput, briefInput]);
export type MakeFacelessInput = z.infer<typeof makeFacelessInput> & { scene?: z.infer<typeof sceneBible> | undefined };
export type MakeFacelessInputArgs = z.input<typeof makeFacelessInput>;

export const facelessRevisionInput = z.strictObject({
  input_mode: z.literal("revision"),
  revision: z.strictObject({ source_run_id: runId, document: editDocument }),
  resolved_revision: z.strictObject({ root_run_id: runId, own_images: z.boolean(), summary: editSummaryWire, billing: revisionBilling }),
});
export type FacelessRevisionInput = z.infer<typeof facelessRevisionInput>;

export const facelessStoredInput = z.discriminatedUnion("input_mode", [storedScriptInput, storedBriefInput, facelessRevisionInput]);
export type FacelessStoredInput = z.infer<typeof facelessStoredInput>;

export function parseFacelessInputPreservingScript(input: unknown): MakeFacelessInput {
  const parsed = makeFacelessInput.parse(input);
  if (parsed.input_mode === "script") return { ...parsed, script: (input as { script: string }).script };
  return parsed.transitions === undefined ? { ...parsed, transitions: { ...FACELESS_BRIEF_DEFAULT_TRANSITIONS } } : parsed;
}
export function parseFacelessStoredInputPreservingScript(input: unknown): FacelessStoredInput {
  const parsed = facelessStoredInput.parse(input);
  return parsed.input_mode === "script" ? { ...parsed, script: (input as { script: string }).script } : parsed;
}

export function quoteFacelessInput(input: MakeFacelessInput, options: { explainerBeats?: boolean; explainerFilm?: SkillFilmTariff } = {}): FacelessQuote {
  const character = !!(input.character_reference || input.character_details);
  const filmHero = character || !(input.input_mode === "script" && input.mascot_id);
  return quoteFaceless({ outputFrames: input.duration_seconds * 25, captions: input.captions, music: input.music,
    shots: input.input_mode === "script" ? input.shots?.length ?? 0 : 0, scenes: input.input_mode === "script" ? input.scenes?.length ?? 0 : 0,
    ...(input.format !== "explainer" ? {} : options.explainerFilm ? { explainer: { character: filmHero, film: options.explainerFilm } } : { explainer: { character,
      ...(options.explainerBeats ? { beats: true } : {}), ...(input.input_mode === "script" ? { objects: explainerObjectCeiling(input.script) } : {}) } }) });
}

export function explainerTierTotals(input: MakeFacelessInput): { tier: (typeof EXPLAINER_TIERS)[number]; standard: number; pro: number } {
  const total = (tier: (typeof EXPLAINER_TIERS)[number]) => quoteFacelessInput(input, { explainerFilm: EXPLAINER_TIER_TARIFFS[tier] }).totalCredits;
  return { tier: input.tier ?? "standard", standard: total("standard"), pro: total("pro") };
}

export const FACELESS_QUOTE_PATH = "/v1/skills/make_faceless/quote";
export const FACELESS_RUN_PATH = "/v1/skills/make_faceless/run";

export const offeredFacelessInputShape = {
  input_mode: z.enum(["script", "brief"])
    .describe("'script' narrates your exact text; 'brief' writes the narration from a short description. Send exactly one of script or brief, matching this mode."),
  script: scriptInput.shape.script.optional()
    .describe("The narration, read as written. Required when input_mode is 'script'; must be absent when it is 'brief'."),
  brief: briefInput.shape.brief.optional()
    .describe("What the video is about; the narration is written from it. Required when input_mode is 'brief'; must be absent when it is 'script'."),
  duration_seconds: common.duration_seconds
    .describe("Selected length, 30 to 90 seconds, on a 1/25 s frame boundary. The video ends with its narration and runs at least 25 seconds, usually at most a quarter past the selection and 90 seconds; when the narration takes longer, the video runs to its end. A video more than 5 seconds longer than the selection says so in warnings[]. The charge never exceeds the quote. A script is accepted when its estimated length is 21 seconds to the selection plus 5, at most 90."),
  style_reference: common.style_reference
    .describe("Public https image whose visual style the scenes follow."),
  character_reference: common.character_reference,
  character_details: common.character_details
    .describe("Fixed visual details of that person or figure, such as hair, clothing and absent accessories; kept in every generated scene."),
  mascot_id: common.mascot_id
    .describe("Format explainer only, which is not offered here."),
  scene_images: common.scene_images
    .describe("Your images, each placed at a word range or quote of the narration. Free."),
  captions: common.captions.describe("Burned-in captions; on by default."),
  transitions: scriptInput.shape.transitions
    .describe("Flash or light leak on the cuts, with its sound: every scene change, or the one nearest each anchor (script only). " +
      "Omitted on a brief: a flash on every scene change; false for plain cuts. No extra charge."),
  edit_sounds: common.edit_sounds.describe("A low sound on every scene change, its peak on the cut; template_sounds.edit picks it. Price unchanged."),
  template_sounds: mcpTemplateSounds.optional().describe("false for no sounds, or { flash, whoosh (light leak), edit: name } from list_template_sounds."),
  music: common.music.describe(MUSIC_DESCRIPTION),
  templates: z.unknown().optional().describe("Script only: as make_ugc, a slot may show your image or video asset (asset_id, rights_confirmed). Free."),
  shots: z.unknown().optional().describe(`Script only: 1-${FACELESS_MAX_SHOTS} {id, anchor, action, asset_id?}, 5 s max each.`),
  scenes: z.unknown().optional().describe("Script only: as make_ugc scenes."),
  motion_style: z.unknown().optional().describe("As make_ugc motion_style; spans script only. Free."),
  moves: z.unknown().optional().describe(`Script only: ${MOVES_DESCRIPTION}`),
  format: common.format.describe("'explainer' is not offered here: for an explainer film, write it yourself starting with get_film_guide."),
  tier: common.tier.describe("Format explainer only, which is not offered here."),
  pause_trim: z.unknown().optional().describe("Script only: as make_ugc pause_trim, same default with templates, scenes or shots."),
  voice: common.voice
    .describe("Narration voice: a name from list_voices with skill=make_faceless (kind faceless_voice). " +
      `Omitted means ${DEFAULT_FACELESS_VOICE}. Choose a voice in the language of the narration: a voice reads any ` +
      "language, with the accent of its own. The API refuses an unknown name and a make_ugc voice before any charge. " +
      "A raw voice_id is not accepted here."),
  resolution: common.resolution,
  max_credits: common.max_credits,
  propose: common.propose,
};

const rejectedFacelessField = (key: string): string | undefined =>
  Object.hasOwn(FACELESS_REJECTED_FIELDS, key)
    ? FACELESS_REJECTED_FIELDS[key as keyof typeof FACELESS_REJECTED_FIELDS].message
    : undefined;

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
  outputFrames: z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(FACELESS_MAX_OUTPUT_FRAMES),
  captions: z.boolean(),
  words: z.array(wordTiming).min(1),
}).strict();
export type FacelessPlannerInput = z.infer<typeof facelessPlannerInput>;

export const facelessQuoteResponse = facelessQuote.extend({
  skill: z.literal("make_faceless"),
  explainer_fit: z.strictObject({ fits: z.boolean(), reason: z.string(), rewrite: z.string().optional() }).optional(),
  explainer_tiers: z.strictObject({ tier: z.enum(EXPLAINER_TIERS), standard: z.number().int().positive(), pro: z.number().int().positive() }).optional(),
  warnings: z.array(z.string()).default([]),
  contract_version: z.string().min(1),
}).strict();
export type FacelessQuoteResponse = z.infer<typeof facelessQuoteResponse>;
