import { z } from "zod";
import { assetId } from "./asset-identity.js";
import { brandStyleName } from "./brand-styles.js";
import { FILM_MAX_BEATS, FILM_STYLES, filmBeat } from "./film-styles.js";
import { EXPLAINER_MAX_PRODUCT_PICTURES, facelessCustomerSceneImage } from "./faceless-public.js";
import { MASCOT_POSES } from "./mascots.js";
import { runId } from "./runs.js";
import { resolvedSkillTheme, skillThemeOverrides } from "./skill-theme.js";

// A film draft of the «own agent» mode (#1291 F2): your agent keeps its scene files, anchors and sound events here between calls, under the
// brand theme frozen when the draft was made. Stills and the render read a revision of it; the draft itself is free.

export const FILM_DRAFTS_PATH = "/v1/film-drafts";
export const FILM_DRAFT_PATH = "/v1/film-drafts/:id";
export const FILM_DRAFT_FILES_PATH = "/v1/film-drafts/:id/files";
export const filmDraftId = z.string().regex(/^fdr_[a-f0-9]{32}$/);
export const FILM_SKILLS = ["explainer"] as const;

/** The scene gate's bounds and its words for them (#1370): one source for the gate, the free check and a draft's save. */
export const FILM_MAX_FILES = 12, FILM_FILE_MAX_BYTES = 40_000, FILM_FILE_MAX_NODES = 8_000;
export const filmFilesRefusal = (count: number): string => `the film has ${count} files; at most ${FILM_MAX_FILES}`;
export const filmFileBytesRefusal = (name: string): string => `${name}: over ${FILM_FILE_MAX_BYTES} bytes`;
export const filmFileNodesRefusal = (name: string): string => `${name}: over ${FILM_FILE_MAX_NODES} syntax nodes`;
export const FILM_FILE_NAME = /^[A-Za-z][\w-]{0,40}\.tsx?$/;
/** A draft lives this long after its last change, and an account keeps at most this many. */
export const FILM_DRAFT_TTL_DAYS = 7, FILM_DRAFTS_PER_ACCOUNT = 20;
export const FILM_MAX_CUES = 200, FILM_MAX_SFX = 400, FILM_SFX_MAX_REPEATS = 40, FILM_CAPTIONS_MAX_CHARS = 4000;

const ANCHOR = z.string().regex(/^[A-Za-z_]\w{0,40}$/, "an anchor is an identifier");
const moment = z.union([ANCHOR, z.number().min(0).max(600)]);
/** One sound event: one sound, a series (`n` × `step`), or key strokes on every word between `from` and `to`. */
export const filmSfxEvent = z.strictObject({
  s: z.string().min(1).max(80).describe("A built-in sound (thud pop tick click key swish whoosh marker stamp ding confetti popper rise) or one named in words"),
  at: moment.optional(), dt: z.number().min(-5).max(5).optional(),
  n: z.number().int().min(1).max(FILM_SFX_MAX_REPEATS).optional(), step: z.number().min(0).max(2).optional(),
  g: z.number().min(0).max(3).optional(),
  from: moment.optional(), to: moment.optional(),
}).refine(e => e.at !== undefined || e.from !== undefined || e.to !== undefined, "an event has `at`, or both `from` and `to`")
  .refine(e => (e.from === undefined) === (e.to === undefined), "`from` and `to` come together")
  .refine(e => !(e.at !== undefined && e.from !== undefined), "an event has `at` or `from`/`to`, not both");
export type FilmSfxEvent = z.infer<typeof filmSfxEvent>;

/** The storyboard's bounds: phrases a film may hold, events a phrase may hold. */
export const FILM_STORYBOARD_MAX_ROWS = 120, FILM_STORYBOARD_MAX_EVENTS = 24;
/** One thing that happens on screen in a phrase: on a spoken word (offset seconds after it starts), or on an anchor of cues. */
export const filmStoryboardEvent = z.strictObject({
  word: z.string().trim().min(1).max(60).describe("The spoken word the event lands on"),
  anchor: ANCHOR.optional().describe("The anchor of cues your code reads for this event; every anchor the code reads needs one event"),
  offset: z.number().min(-2).max(5).optional().describe("Seconds after the word starts; omitted, on the word"),
  what: z.string().trim().min(1).max(200).describe("What happens on screen"),
}).refine(e => !(e.anchor !== undefined && e.offset !== undefined), "an event lands on an anchor or on its word plus offset, not both");
/** One phrase of the voice: its words, when the voice speaks it, and the events on its words. */
export const filmStoryboardRow = z.strictObject({
  phrase: z.string().trim().min(1).max(400).describe("The phrase's words as the voice speaks them"),
  start: z.number().min(0).max(600).describe("When the phrase starts, from the voice's word timings"),
  end: z.number().min(0).max(600).describe("When it ends, from the voice's word timings"),
  events: z.array(filmStoryboardEvent).max(FILM_STORYBOARD_MAX_EVENTS).describe("What happens on screen, 2–4 events a second"),
  headline: z.string().trim().max(120).optional().describe("The text the screen headlines"),
  state: z.string().trim().max(200).optional().describe("What stays on screen at the phrase's end"),
  pose: z.enum(MASCOT_POSES).optional().describe("The hero's pose"),
}).refine(r => r.end > r.start, "a phrase ends after it starts");
export const filmStoryboard = z.array(filmStoryboardRow).min(1).max(FILM_STORYBOARD_MAX_ROWS);
export type FilmStoryboard = z.infer<typeof filmStoryboard>;
export type FilmStoryboardRow = z.infer<typeof filmStoryboardRow>;

export const createFilmDraftInput = z.strictObject({
  skill: z.enum(FILM_SKILLS).default("explainer"),
  mascot_id: assetId.optional().describe("A saved mascot (list_assets with mascot true) as the film's hero; the brand kit's when omitted"),
  language: z.string().regex(/^[a-z]{2}$/).optional().describe("The script's language (ISO 639-1); a brand face without its letters keeps the kit's"),
  brand_style: brandStyleName.optional()
    .describe("A saved style (brand_kit styles) the film draws in instead of the kit's design"),
  theme_overrides: skillThemeOverrides.optional().describe("Palette roles, faces or variation over the brand kit, for this film only"),
  style: z.enum(FILM_STYLES).optional()
    .describe("A drawn style: the film is drawn from the draft's beats in this style and the brand's colours, not from scene files"),
});
export type CreateFilmDraftInput = z.infer<typeof createFilmDraftInput>;

export const putFilmFilesInput = z.strictObject({
  base_revision: z.number().int().min(0).describe("The revision these changes apply to; a stale one is refused with 409"),
  files: z.record(z.string(), z.string().max(FILM_FILE_MAX_BYTES).nullable()).default({})
    .describe("Scene files by name (Movie.tsx, ch1.tsx…): text replaces the file, null deletes it, an omitted file stays"),
  cues: z.record(ANCHOR, z.number().min(0).max(600)).optional()
    .describe("Every anchor the scenes read, in seconds; when sent, replaces the draft's anchors; omitted, the draft's stay"),
  sfx: z.array(filmSfxEvent).max(FILM_MAX_SFX).optional().describe("The sound events; when sent, replaces the draft's; omitted, the draft's stay"),
  captions: z.string().max(FILM_CAPTIONS_MAX_CHARS).optional()
    .describe("One caption phrase per line, *word* the phrase's accent; when sent, replaces the draft's; omitted, the draft's stay"),
  beats: z.array(filmBeat).min(1).max(FILM_MAX_BEATS).optional()
    .describe("A styled draft's beats in order, each drawn until the next starts; replaces the draft's"),
  storyboard: filmStoryboard.optional()
    .describe("The storyboard, written after the voice and before the code: one row per phrase, in order; replaces the draft's"),
});
export type PutFilmFilesInput = z.infer<typeof putFilmFilesInput>;

export const filmDraft = z.strictObject({
  draft_id: filmDraftId,
  skill: z.enum(FILM_SKILLS),
  revision: z.number().int().min(0),
  theme: resolvedSkillTheme,
  theme_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mascot_id: assetId.nullable(),
  // An answer from before saved styles (#1364) carries none.
  brand_style: z.string().nullable().default(null),
  language: z.string().nullable(),
  files: z.array(z.strictObject({ name: z.string(), bytes: z.number().int().min(0) })),
  cues: z.record(z.string(), z.number()),
  sfx: z.array(filmSfxEvent),
  captions: z.string().nullable(),
  // An answer from before styled drafts (#1338) carries neither: a draft of scene files.
  style: z.enum(FILM_STYLES).nullable().default(null),
  beats: z.array(filmBeat).default([]),
  // An answer from before the storyboard (#1356) carries none.
  storyboard: filmStoryboard.nullable().default(null),
  warnings: z.array(z.string()),
  created_at: z.string(),
  expires_at: z.string(),
});
export type FilmDraft = z.infer<typeof filmDraft>;

export const FILM_DRAFT_CHECK_PATH = "/v1/film-drafts/:id/check";
/** The free check (#1356): a draft revision, or the same changes put_film_files takes laid over it unsaved, read on a delivered voice. */
export const checkFilmInput = z.strictObject({
  revision: z.number().int().min(0).describe("The draft revision to check; a draft that moved on is refused with 409"),
  voice_run_id: runId.describe("A delivered make_voice run of this account: the check reads its words and length"),
  scene_images: z.array(facelessCustomerSceneImage).max(EXPLAINER_MAX_PRODUCT_PICTURES).optional().describe("The product pictures you will send to stills and render"),
  files: z.record(z.string(), z.string().max(FILM_FILE_MAX_BYTES).nullable()).optional()
    .describe("Changes to check without saving them, as put_film_files takes them: text replaces a file, null deletes it"),
  cues: putFilmFilesInput.shape.cues, sfx: putFilmFilesInput.shape.sfx, captions: putFilmFilesInput.shape.captions,
  beats: putFilmFilesInput.shape.beats, storyboard: putFilmFilesInput.shape.storyboard,
});
export type CheckFilmInput = z.infer<typeof checkFilmInput>;

export const filmCheck = z.strictObject({
  draft_id: filmDraftId,
  revision: z.number().int().min(0),
  /** True when nothing is refused: stills and the render will take this revision's code, apart from the checks below that run with them. */
  ok: z.boolean(),
  /** Each refusal as `file:line: reason` where a file is named; stills and the render refuse the same, free. */
  refusals: z.array(z.string()),
  warnings: z.array(z.string()),
  /** Checks that run only when stills or the render draw: their refusals are free too. */
  deferred: z.array(z.string()),
  voice_end_sec: z.number().nonnegative(),
  /** Every anchor in cues: its second and the voice word spoken nearest it. */
  anchors: z.array(z.strictObject({ name: z.string(), seconds: z.number(), word: z.string().nullable() })),
  /** The storyboard's phrases and events as the check read them; zero when there is none. */
  storyboard: z.strictObject({ phrases: z.number().int().nonnegative(), events: z.number().int().nonnegative() }),
});
export type FilmCheck = z.infer<typeof filmCheck>;

/** The draft's files after a patch, or the sentences saying why the patch is refused. Bytes are UTF-8, as the gate counts them. */
export function patchFilmFiles(current: Readonly<Record<string, string>>, patch: Readonly<Record<string, string | null>>):
  { files: Record<string, string> } | { refusals: string[] } {
  const refusals: string[] = [], files: Record<string, string> = { ...current };
  for (const [name, text] of Object.entries(patch)) {
    if (!FILM_FILE_NAME.test(name)) { refusals.push(`${name}: a file name is a letter, then letters, digits, - or _, ending .ts or .tsx`); continue; }
    if (text === null) { delete files[name]; continue; }
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > FILM_FILE_MAX_BYTES) { refusals.push(filmFileBytesRefusal(name)); continue; }
    files[name] = text;
  }
  if (Object.keys(files).length > FILM_MAX_FILES) refusals.push(filmFilesRefusal(Object.keys(files).length));
  return refusals.length ? { refusals } : { files };
}
