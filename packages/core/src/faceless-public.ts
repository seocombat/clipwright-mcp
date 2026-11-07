import { z } from "zod";
import { editSummaryWire, revisionBilling } from "./edit-billing.js";
import { editDocument } from "./edit-document.js";
import { runId } from "./runs.js";
import { uploadResponse } from "./uploads.js";
import { MAX_URL_LENGTH, motionStyle, ugcScene, ugcTemplate } from "./skills.js";
import { MOTION_STYLE_UNUSED_WARNING, motionStyleAsked, motionStyleHasCanvas, motionStyleRefusals } from "./motion-styles.js";
import { MAX_SCENES, sceneRefusals } from "./ugc-scenes.js";
import { MAX_MOVES, moveRefusals, MOVES_DESCRIPTION, ugcMove } from "./moves.js";
import { MAX_TEMPLATES, templateMediaOf, templateRefusals } from "./templates/index.js";
import { FACELESS_REJECTED_FIELDS } from "./contract-dispositions.js";
import { FACELESS_MAX_OUTPUT_FRAMES, FACELESS_MAX_SELECTED_SECONDS, FACELESS_MAX_SHOTS, FACELESS_MIN_OUTPUT_FRAMES, FACELESS_MIN_SELECTED_SECONDS,
  facelessQuote } from "./faceless-price.js";
import { DEFAULT_FACELESS_VOICE } from "./faceless-voices.js";
import { resolveFacelessCustomerAnchors } from "./faceless-customer-anchors.js";
import { FACELESS_TRANSITION_LOOKS } from "./faceless-media-record.js";
import { VOICE_NAME_PATTERN } from "./voices.js";
import { FACELESS_MUSIC_REFUSAL, musicRequest } from "./music.js";
import { facelessSoundRefusals, facelessTemplateSounds, mcpTemplateSounds } from "./templates/sounds.js";
import { FACELESS_SHOT_TRANSITIONS, facelessActionShotRefusals } from "./faceless-action-shots.js";

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

const common = {
  duration_seconds: z.number().min(FACELESS_MIN_SELECTED_SECONDS).max(FACELESS_MAX_SELECTED_SECONDS).refine((seconds) => Number.isInteger(seconds * 25),
    "duration_seconds must align to a 25 fps frame boundary"),
  style_reference: qualifiedImageUrl.optional(),
  character_reference: qualifiedImageUrl.optional(),
  character_details: z.string().trim().min(1).max(2000).optional(),
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
};

/** The line a faceless quote and run name when a style has nothing to dress: captions off and no templates or scenes (#1123). */
export function facelessMotionStyleWarnings(input: { motion_style?: Parameters<typeof motionStyleAsked>[0]["motion_style"]; captions?: boolean | undefined;
  templates?: readonly unknown[] | undefined; scenes?: readonly unknown[] | undefined }): string[] {
  return motionStyleAsked(input) && !motionStyleHasCanvas({ ...input, captions: input.captions !== false }) ? [MOTION_STYLE_UNUSED_WARNING] : [];
}

/** Templates over the pictures (#1113): kinds on the script's words; a slot that shows a picture or clip of the customer's is refused. */
export const FACELESS_TEMPLATE_MEDIA_REFUSAL = "a template that shows your picture or clip (asset_id) is not available on make_faceless; " +
  "drop that slot or the template";
function refuseTemplates(input: { script: string; templates?: z.infer<typeof ugcTemplate>[] | undefined }, context: z.RefinementCtx) {
  if (!input.templates) return;
  for (const media of templateMediaOf(input.templates)) {
    context.addIssue({ code: customIssue, path: ["templates", media.index, "data", media.slot], message: FACELESS_TEMPLATE_MEDIA_REFUSAL });
  }
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
});
export type FacelessActionShot = z.infer<typeof facelessActionShot>;
export const FACELESS_SHOTS_BRIEF_REFUSAL = "shots need input_mode script: they sit on the narration's words";
export const FACELESS_SHOTS_DISABLED_MESSAGE = "shots are not available on make_faceless right now; omit shots";
export const FACELESS_SCENES_DISABLED_MESSAGE = "scenes are not available on make_faceless right now; omit scenes";

const scriptInput = z.object({ ...common,
  input_mode: z.literal("script"),
  script: z.string().trim().min(1).max(10_000),
  transitions: orPlainCuts(scriptTransitions).optional(),
  templates: z.array(ugcTemplate).min(1).max(MAX_TEMPLATES).optional(),
  shots: z.array(facelessActionShot).min(1).max(FACELESS_MAX_SHOTS, `at most ${FACELESS_MAX_SHOTS} shots a video`).optional(),
  scenes: z.array(ugcScene).min(1).max(MAX_SCENES).optional(),
  moves: z.array(ugcMove).min(1).max(MAX_MOVES).optional(),
}).strict().superRefine((input, context) => {
  refuseSounds(input, context);
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
});
const briefInput = z.object({ ...common,
  input_mode: z.literal("brief"),
  brief: z.string().trim().min(1).max(10_000),
  transitions: orPlainCuts(briefTransitions).optional(),
  // A brief's narration is written by the run, so no template can name its words.
  templates: z.never({ error: "templates need input_mode script: they sit on the narration's words" }).optional(),
  shots: z.never({ error: FACELESS_SHOTS_BRIEF_REFUSAL }).optional(),
  scenes: z.never({ error: "scenes need input_mode script: they sit on the narration's words" }).optional(),
  moves: z.never({ error: "moves need input_mode script: they sit on the narration's words" }).optional(),
}).strict().superRefine((input, context) => {
  refuseSounds(input, context);
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
export const facelessStoredInput = z.discriminatedUnion("input_mode", [scriptInput, briefInput, facelessRevisionInput]);
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
    .describe("Selected length, 30 to 90 seconds, on a 1/25 s frame boundary. The video ends with its narration and runs at least 25 seconds, usually at most a quarter past the selection and 90 seconds; when the narration takes longer, the video runs to its end. A video more than 5 seconds longer than the selection says so in warnings[]. The charge never exceeds the quote. A script is accepted when its estimated length is 21 seconds to the selection plus 5, at most 90."),
  style_reference: common.style_reference
    .describe("Public https image whose visual style the scenes follow."),
  character_reference: common.character_reference
    .describe("Public https image of a person or figure to keep consistent across scenes."),
  character_details: common.character_details
    .describe("Fixed visual details of that person or figure, such as hair, clothing and absent accessories; kept in every generated scene."),
  scene_images: common.scene_images
    .describe("Your images, each placed at a word range or quote of the narration."),
  captions: common.captions.describe("Burned-in captions; on by default."),
  transitions: scriptInput.shape.transitions
    .describe("Flash or light leak on the cuts, with its sound: every scene change, or the one nearest each anchor (script only). " +
      "Omitted on a brief: a flash on every scene change; false for plain cuts. No extra charge."),
  edit_sounds: common.edit_sounds.describe("A low sound on every scene change, its peak on the cut; template_sounds.edit picks it. Price unchanged."),
  // The slim form keeps tools/list small; the client parses with makeFacelessInput, which checks beats and names.
  template_sounds: mcpTemplateSounds.optional().describe("false for no sounds, or { flash, whoosh (light leak), edit: name } from list_template_sounds."),
  music: common.music.describe(`REJECTED for now: ${FACELESS_MUSIC_REFUSAL}. Before any charge.`),
  // No shape here keeps tools/list small: the items are make_ugc's, which the client and the server check strictly.
  templates: z.unknown().optional().describe("Script only: as make_ugc, no asset_id. Free."),
  shots: z.unknown().optional().describe("Script only: 1-3 {id, anchor, action}, 5 s max each."),
  scenes: z.unknown().optional().describe("Script only: as make_ugc scenes."),
  motion_style: z.unknown().optional().describe("As make_ugc motion_style; spans script only. Free."),
  moves: z.unknown().optional().describe(`Script only: ${MOVES_DESCRIPTION}`),
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
  outputFrames: z.number().int().min(FACELESS_MIN_OUTPUT_FRAMES).max(FACELESS_MAX_OUTPUT_FRAMES),
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
