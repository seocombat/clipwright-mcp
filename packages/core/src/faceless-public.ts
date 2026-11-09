import { z } from "zod";
import { editSummaryWire, revisionBilling } from "./edit-billing.js";
import { editDocument } from "./edit-document.js";
import { runId } from "./runs.js";
import { uploadResponse } from "./uploads.js";
import { MAX_URL_LENGTH, motionStyle, pinnedInsertAsset, ugcScene, ugcTemplate } from "./skills.js";
import { MOTION_STYLE_UNUSED_WARNING, motionStyleAsked, motionStyleHasCanvas, motionStyleRefusals } from "./motion-styles.js";
import { MAX_SCENES, sceneRefusals } from "./ugc-scenes.js";
import { MAX_MOVES, moveRefusals, MOVES_DESCRIPTION, ugcMove } from "./moves.js";
import { MAX_TEMPLATE_MEDIA, MAX_TEMPLATES, templateRefusals } from "./templates/index.js";
import { assetId } from "./asset-identity.js";
import { FACELESS_REJECTED_FIELDS } from "./contract-dispositions.js";
import { FACELESS_MAX_OUTPUT_FRAMES, FACELESS_MAX_SELECTED_SECONDS, FACELESS_MAX_SHOTS, FACELESS_MIN_OUTPUT_FRAMES, FACELESS_MIN_SELECTED_SECONDS,
  explainerObjectCeiling, facelessQuote, quoteFaceless, type FacelessQuote } from "./faceless-price.js";
import { DEFAULT_FACELESS_VOICE } from "./faceless-voices.js";
import { resolveFacelessCustomerAnchors } from "./faceless-customer-anchors.js";
import { FACELESS_TRANSITION_LOOKS } from "./faceless-media-record.js";
import { VOICE_NAME_PATTERN } from "./voices.js";
import { MUSIC_DESCRIPTION, musicRequest } from "./music.js";
import { facelessSoundRefusals, facelessTemplateSounds, mcpTemplateSounds } from "./templates/sounds.js";
import { FACELESS_SHOT_TRANSITIONS, facelessActionShotRefusals } from "./faceless-action-shots.js";
import { pauseTrim } from "./reference-voice.js";
import { pinnedMascot } from "./mascots.js";

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

const customIssue = "custom" as const;
/** Cut transitions of a new run: every scene change, or the one nearest each anchor's first word. */
const transitionLook = z.enum(FACELESS_TRANSITION_LOOKS);
const scriptTransitions = z.strictObject({
  look: transitionLook,
  at: z.union([z.literal("scene_changes"), z.array(z.strictObject({ anchor: facelessSceneAnchor })).min(1).max(100)]).default("scene_changes"),
});
export type FacelessTransitionsInput = z.infer<typeof scriptTransitions>;
// A brief's narration is written by the run, so no word of it can be named in advance.
const briefTransitions = z.strictObject({
  look: transitionLook,
  at: z.literal("scene_changes", { error: "transitions.at word anchors need input_mode script; a brief takes \"scene_changes\"" })
    .default("scene_changes"),
});
/** A brief that names no transitions gets a flash on every scene change at admission (#1067); `false` keeps plain cuts. */
export const FACELESS_BRIEF_DEFAULT_TRANSITIONS = Object.freeze({ look: "flash", at: "scene_changes" } as const);
/** `false` or the object; a union names no branch on its own, so the refusal carries the object's first issue with its path. */
const orPlainCuts = <T extends z.ZodType>(schema: T) => z.union([z.literal(false), schema], { error: issue => {
  if (issue.input === null || typeof issue.input !== "object" || Array.isArray(issue.input)) return "transitions is false (plain cuts) or { look, at }";
  const inner = schema.safeParse(issue.input).error?.issues[0];
  return inner && `${["transitions", ...inner.path.map(String)].join(".")}: ${inner.message}`;
} });
/** Sound refusals against the look the run draws: a brief without the field draws the default flash. */
function refuseSounds(input: { input_mode: string; transitions?: false | { look: string } | undefined; edit_sounds?: boolean | undefined;
  template_sounds?: unknown }, context: z.RefinementCtx) {
  const look = input.transitions === undefined && input.input_mode === "brief" ? FACELESS_BRIEF_DEFAULT_TRANSITIONS.look
    : input.transitions ? input.transitions.look : undefined;
  for (const { path, message } of facelessSoundRefusals({ ...input, look })) context.addIssue({ code: customIssue, path, message });
}

export const FACELESS_FORMATS = ["standard", "explainer"] as const;
export const FACELESS_EXPLAINER_DISABLED_MESSAGE = "format explainer is not available on make_faceless right now; omit format";
export const FACELESS_EXPLAINER_BRIEF_REFUSAL = "format explainer needs input_mode script: write it as a hook, three to five steps and a result";

const common = {
  duration_seconds: z.number().min(FACELESS_MIN_SELECTED_SECONDS).max(FACELESS_MAX_SELECTED_SECONDS).refine((seconds) => Number.isInteger(seconds * 25),
    "duration_seconds must align to a 25 fps frame boundary"),
  style_reference: qualifiedImageUrl.optional(),
  character_reference: qualifiedImageUrl.optional(),
  character_details: z.string().trim().min(1).max(2000).optional(),
  /** A saved mascot of this account (#1257) the explainer's hero is drawn from: its poses are not made again, and the quote shows none. */
  mascot_id: assetId.optional(),
  scene_images: z.array(facelessCustomerSceneImage).max(60).optional(),
  captions: z.boolean().default(true),
  // A name form only: the server checks the name, so the list grows without a client release.
  voice: z.string({ error: "voice must be a voice name from list_voices, as a string" })
    .regex(VOICE_NAME_PATTERN, "voice is not a voice name: take one from list_voices with skill=make_faceless")
    .optional(),
  voice_id: z.never({ error: FACELESS_REJECTED_FIELDS.voice_id.message }).optional(),
  // Opt-in, so a run that never asked keeps its silent scene changes (rule 3).
  edit_sounds: z.boolean().optional(),
  template_sounds: facelessTemplateSounds.optional(),
  music: musicRequest.optional(),
  // A style dresses the captions, templates and scenes over the pictures (#1123); its spans sit on a script's words.
  motion_style: motionStyle.optional(),
  format: z.enum(FACELESS_FORMATS).optional(),
};

/** The explainer (#1216) draws its own scene on every phrase, so the fields that place pictures, clips or graphics have no room in it. */
export const EXPLAINER_OWN_FIELDS = ["style_reference", "scene_images", "transitions", "templates", "shots", "scenes", "moves", "motion_style", "music"] as const;
/** What an explainer request may not carry: a brief, or a field the explainer draws itself. */
export function explainerFieldRefusals(input: Record<string, unknown>): { path: string[]; message: string }[] {
  if (input.format !== "explainer") return [];
  return [...(input.input_mode === "brief" ? [{ path: ["format"], message: FACELESS_EXPLAINER_BRIEF_REFUSAL }] : []),
    ...EXPLAINER_OWN_FIELDS.filter(field => input[field] !== undefined).map(field => ({ path: [field], message: `format explainer draws its own scenes; omit ${field}` }))];
}
/** A mascot is the explainer's hero already made: it needs the format, and it replaces a character the run would draw. */
export function mascotFieldRefusals(input: Record<string, unknown>): { path: string[]; message: string }[] {
  if (input.mascot_id === undefined) return [];
  return [
    ...(input.format !== "explainer" ? [{ path: ["mascot_id"], message: "mascot_id needs format explainer: the mascot is its hero" }] : []),
    ...(["character_reference", "character_details"] as const).filter(field => input[field] !== undefined)
      .map(field => ({ path: [field], message: `mascot_id is the hero already made; omit ${field}` })),
  ];
}
function refuseExplainerFields(input: Record<string, unknown>, context: z.RefinementCtx) {
  for (const { path, message } of [...explainerFieldRefusals(input), ...mascotFieldRefusals(input)]) context.addIssue({ code: customIssue, path, message });
}

/** The line a faceless quote and run name when a style has nothing to dress: captions off and no templates or scenes (#1123). */
export function facelessMotionStyleWarnings(input: { motion_style?: Parameters<typeof motionStyleAsked>[0]["motion_style"]; captions?: boolean | undefined;
  templates?: readonly unknown[] | undefined; scenes?: readonly unknown[] | undefined }): string[] {
  return motionStyleAsked(input) && !motionStyleHasCanvas({ ...input, captions: input.captions !== false }) ? [MOTION_STYLE_UNUSED_WARNING] : [];
}

/** Templates over the pictures (#1113): kinds on the script's words; a slot may show the account's own picture or clip (asset_id), as on make_ugc. */
function refuseTemplates(input: { script: string; templates?: z.infer<typeof ugcTemplate>[] | undefined }, context: z.RefinementCtx) {
  if (!input.templates) return;
  for (const { path, message } of templateRefusals({ script: input.script, templates: input.templates, aspect_ratio: "9:16" })) {
    context.addIssue({ code: customIssue, path, message });
  }
}

/** Action shots (#1113): a moving clip from the picture under the named words, on those words, instead of the still. */
export const facelessActionShot = z.strictObject({
  id: z.string().trim().min(1).max(64),
  anchor: facelessSceneAnchor,
  action: z.string().trim().min(1).max(1500),
  transition: z.enum(FACELESS_SHOT_TRANSITIONS).optional(),
  /** An image asset of this account (rights_confirmed) the clip starts from, in place of a picture the run draws; that picture is not charged. */
  asset_id: assetId.optional(),
});
export type FacelessActionShot = z.infer<typeof facelessActionShot>;
export const FACELESS_SHOTS_BRIEF_REFUSAL = "shots need input_mode script: they sit on the narration's words";
export const FACELESS_SHOTS_DISABLED_MESSAGE = "shots are not available on make_faceless right now; omit shots";
export const FACELESS_SCENES_DISABLED_MESSAGE = "scenes are not available on make_faceless right now; omit scenes";

const scriptShape = { ...common,
  input_mode: z.literal("script"),
  script: z.string().trim().min(1).max(10_000),
  transitions: orPlainCuts(scriptTransitions).optional(),
  templates: z.array(ugcTemplate).min(1).max(MAX_TEMPLATES).optional(),
  shots: z.array(facelessActionShot).min(1).max(FACELESS_MAX_SHOTS, `at most ${FACELESS_MAX_SHOTS} shots a video`).optional(),
  scenes: z.array(ugcScene).min(1).max(MAX_SCENES).optional(),
  moves: z.array(ugcMove).min(1).max(MAX_MOVES).optional(),
  // make_ugc's field (#1228): the narration's pauses are cut before its words are timed, so everything drawn on them follows the cut.
  pause_trim: z.union([z.literal(false), pauseTrim]).optional(),
};
const scriptBase = z.object(scriptShape).strict();
function refineScript(input: z.infer<typeof scriptBase>, context: z.RefinementCtx) {
  refuseSounds(input, context);
  refuseExplainerFields(input, context);
  refuseTemplates(input, context);
  for (const { path, message } of moveRefusals({ script: input.script, moves: input.moves })) context.addIssue({ code: customIssue, path, message });
  // Scenes sit on the script's words as on make_ugc and share the templates' ids (#1113).
  for (const { path, message } of sceneRefusals({ script: input.script, scenes: input.scenes, templates: input.templates })) {
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
/** What a run stores for a script: the request plus the assets admission pinned for it, which a public body never carries. */
const storedScriptInput = z.object({ ...scriptShape,
  insert_assets: z.array(pinnedInsertAsset).min(1).max(MAX_TEMPLATE_MEDIA + FACELESS_MAX_SHOTS).optional(),
  /** The mascot a run reuses, as admission read it (#1257). */
  mascot: pinnedMascot.optional(),
}).strict().superRefine(refineScript);
const briefInput = z.object({ ...common,
  input_mode: z.literal("brief"),
  brief: z.string().trim().min(1).max(10_000),
  transitions: orPlainCuts(briefTransitions).optional(),
  // A brief's narration is written by the run, so no template can name its words.
  templates: z.never({ error: "templates need input_mode script: they sit on the narration's words" }).optional(),
  shots: z.never({ error: FACELESS_SHOTS_BRIEF_REFUSAL }).optional(),
  scenes: z.never({ error: "scenes need input_mode script: they sit on the narration's words" }).optional(),
  moves: z.never({ error: "moves need input_mode script: they sit on the narration's words" }).optional(),
  pause_trim: z.never({ error: "pause_trim needs input_mode script" }).optional(),
}).strict().superRefine((input, context) => {
  refuseSounds(input, context);
  refuseExplainerFields(input, context);
  if (input.motion_style?.spans) context.addIssue({ code: customIssue, path: ["motion_style", "spans"],
    message: "motion_style spans need input_mode script: they sit on the narration's words; a brief takes style only" });
});

export const makeFacelessInput = z.discriminatedUnion("input_mode", [scriptInput, briefInput]);
export type MakeFacelessInput = z.infer<typeof makeFacelessInput>;
export type MakeFacelessInputArgs = z.input<typeof makeFacelessInput>;

/** The stored input of a revision: the request as resolved, and what admission froze about it. */
export const facelessRevisionInput = z.strictObject({
  input_mode: z.literal("revision"),
  revision: z.strictObject({ source_run_id: runId, document: editDocument }),
  resolved_revision: z.strictObject({ root_run_id: runId, own_images: z.boolean(), summary: editSummaryWire, billing: revisionBilling }),
});
export type FacelessRevisionInput = z.infer<typeof facelessRevisionInput>;

/** What a `make_faceless` run stores as its input: a generate request or a revision. */
export const facelessStoredInput = z.discriminatedUnion("input_mode", [storedScriptInput, briefInput, facelessRevisionInput]);
export type FacelessStoredInput = z.infer<typeof facelessStoredInput>;

/** Admission and the run validate accepted input without canonicalizing its narration again. */
/** A brief's default flash is frozen here, so the stored input names what the video draws; a stored input is read as stored. */
export function parseFacelessInputPreservingScript(input: unknown): MakeFacelessInput {
  const parsed = makeFacelessInput.parse(input);
  if (parsed.input_mode === "script") return { ...parsed, script: (input as { script: string }).script };
  return parsed.transitions === undefined ? { ...parsed, transitions: { ...FACELESS_BRIEF_DEFAULT_TRANSITIONS } } : parsed;
}
export function parseFacelessStoredInputPreservingScript(input: unknown): FacelessStoredInput {
  const parsed = facelessStoredInput.parse(input);
  return parsed.input_mode === "script" ? { ...parsed, script: (input as { script: string }).script } : parsed;
}

/** A request's quote: what the quote shows and admission reserves, read from the same fields by the same call. */
/** `explainerBeats`: an explainer's drawn scenes are on, so the quote holds them. `explainerFilm`: the explainer is priced as one drawn film. */
export function quoteFacelessInput(input: MakeFacelessInput, options: { explainerBeats?: boolean; explainerFilm?: boolean } = {}): FacelessQuote {
  const character = !!(input.character_reference || input.character_details);
  return quoteFaceless({ outputFrames: input.duration_seconds * 25, captions: input.captions, music: input.music,
    shots: input.input_mode === "script" ? input.shots?.length ?? 0 : 0, scenes: input.input_mode === "script" ? input.scenes?.length ?? 0 : 0,
    ...(input.format !== "explainer" ? {} : options.explainerFilm ? { explainer: { character, film: true } } : { explainer: { character,
      ...(options.explainerBeats ? { beats: true } : {}), ...(input.input_mode === "script" ? { objects: explainerObjectCeiling(input.script) } : {}) } }) });
}

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
    .describe("Selected length, 30 to 90 seconds, on a 1/25 s frame boundary. The video ends with its narration and runs at least 25 seconds (an explainer, as long as its narration), usually at most a quarter past the selection and 90 seconds; when the narration takes longer, the video runs to its end. A video more than 5 seconds longer than the selection says so in warnings[]. The charge never exceeds the quote. A script is accepted when its estimated length is 21 seconds to the selection plus 5, at most 90."),
  style_reference: common.style_reference
    .describe("Public https image whose visual style the scenes follow."),
  character_reference: common.character_reference
    .describe("Public https image of a person or figure to keep consistent across scenes."),
  character_details: common.character_details
    .describe("Fixed visual details of that person or figure, such as hair, clothing and absent accessories; kept in every generated scene."),
  mascot_id: common.mascot_id
    .describe("A mascot saved in your assets (list_assets with mascot true), for format explainer: its hero, already drawn, with no pose pictures made or charged. " +
      "Replaces character_reference and character_details."),
  scene_images: common.scene_images
    .describe("Your images, each placed at a word range or quote of the narration."),
  captions: common.captions.describe("Burned-in captions; on by default."),
  transitions: scriptInput.shape.transitions
    .describe("Flash or light leak on the cuts, with its sound: every scene change, or the one nearest each anchor (script only). " +
      "Omitted on a brief: a flash on every scene change; false for plain cuts. No extra charge."),
  edit_sounds: common.edit_sounds.describe("A low sound on every scene change, its peak on the cut; template_sounds.edit picks it. Price unchanged."),
  // The slim form keeps tools/list small; the client parses with makeFacelessInput, which checks beats and names.
  template_sounds: mcpTemplateSounds.optional().describe("false for no sounds, or { flash, whoosh (light leak), edit: name } from list_template_sounds."),
  music: common.music.describe(MUSIC_DESCRIPTION),
  // No shape here keeps tools/list small: the items are make_ugc's, which the client and the server check strictly.
  templates: z.unknown().optional().describe("Script only: as make_ugc, a slot may show your image or video asset (asset_id, rights_confirmed). Free."),
  shots: z.unknown().optional().describe(`Script only: 1-${FACELESS_MAX_SHOTS} {id, anchor, action, asset_id?}, 5 s max each.`),
  scenes: z.unknown().optional().describe("Script only: as make_ugc scenes."),
  motion_style: z.unknown().optional().describe("As make_ugc motion_style; spans script only. Free."),
  moves: z.unknown().optional().describe(`Script only: ${MOVES_DESCRIPTION}`),
  format: common.format.describe("'explainer': a drawn explainer cartoon, an event on every word, a hero in the corner; script only. " +
    "It fits a chain of concrete actions told by one narrator: a how-to by steps, how something works, a workflow, a tool walkthrough, " +
    "N mistakes or N ways, with something to show on every phrase. Reasoning without actions, a dialogue or a story about people fits " +
    "poorly. Every script quote answers explainer_fit: offer the format where it fits; where it does not, show its reason and its " +
    "rewrite into actions before asking. The hero is drawn from character_reference or character_details (its pose pictures on the " +
    "quote), else ours, free. A list of named things gets a picture of each in its scene, one for each thing on the quote, charged only " +
    "when shown. Without voice, an English script is read by our fastest voice."),
  // No shape here keeps tools/list small, as for templates: the field is make_ugc's, which the client and the server check strictly.
  pause_trim: z.unknown().optional().describe("Script only: as make_ugc pause_trim, same default with templates, scenes, shots or format explainer."),
  voice: common.voice
    .describe("Narration voice: a name from list_voices with skill=make_faceless (kind faceless_voice). " +
      `Omitted means ${DEFAULT_FACELESS_VOICE}; for an English explainer, the fastest voice. Choose a voice in the language of the narration: a voice reads any ` +
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
  outputFrames: z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(FACELESS_MAX_OUTPUT_FRAMES),
  captions: z.boolean(),
  words: z.array(wordTiming).min(1),
}).strict();
export type FacelessPlannerInput = z.infer<typeof facelessPlannerInput>;

export const facelessQuoteResponse = facelessQuote.extend({
  skill: z.literal("make_faceless"),
  /** Whether the script suits the explainer format, with the reason, and a rewrite into actions when it does not. */
  explainer_fit: z.strictObject({ fits: z.boolean(), reason: z.string(), rewrite: z.string().optional() }).optional(),
  warnings: z.array(z.string()).default([]),
  contract_version: z.string().min(1),
}).strict();
export type FacelessQuoteResponse = z.infer<typeof facelessQuoteResponse>;
