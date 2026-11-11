import { z } from "zod";
import { assetId } from "./asset-identity.js";
import { EXPLAINER_MAX_PRODUCT_PICTURES, facelessCustomerSceneImage, qualifiedImageUrl } from "./faceless-public.js";
import { FACELESS_VOICE_NAMES } from "./faceless-voices.js";
import { filmDraftId } from "./film-drafts.js";
import { MASCOT_POSES } from "./mascots.js";
import { OWN_AGENT_SKILLS, OWN_FREE_STILLS, OWN_FREE_STILLS_WINDOW_HOURS, OWN_STILLS_MAX_PER_CALL, OWN_STILLS_SINGLE_MAX, OWN_VOICE_MAX_SECONDS } from "./own-agent-price.js";
import { runId } from "./runs.js";

// The paid runs of the «own agent» mode (#1291 F2): stills of a draft revision, a voice with word timings, the film's render, a hero saved as
// a mascot. Each is quoted first, holds its ceiling at admission, is charged by what it delivered; its status lives in `/v1/runs/{id}`.

export const FILM_STILLS_QUOTE_PATH = "/v1/film-stills/quote";
export const FILM_STILLS_PATH = "/v1/film-stills";
export const FILM_VOICES_QUOTE_PATH = "/v1/film-voices/quote";
export const FILM_VOICES_PATH = "/v1/film-voices";
export const FILM_RENDERS_QUOTE_PATH = "/v1/film-renders/quote";
export const FILM_RENDERS_PATH = "/v1/film-renders";
export const FILM_HEROES_QUOTE_PATH = "/v1/film-heroes/quote";
export const FILM_HEROES_PATH = "/v1/film-heroes";
export const FILM_RUN_PATH = "/v1/film-runs/:id";
export const OWN_AGENT_FILM_TASK = "own-agent-film";

/** The frame rate of a still's timeline (the SkillFilm composition's) and of the delivered film. */
export const FILM_STILL_FPS = 30, FILM_RENDER_FPS = 25;
/** A still asked by anchor shows the moment this long after it, so the anchor's entrance has played. */
export const FILM_STILL_ANCHOR_LAG_SEC = 0.25;
/** The film runs this long after the voice's last sound. */
export const FILM_TAIL_SEC = 0.8;
/** The slowest narration pace a voice is held at, characters a second, and the most characters one take speaks. */
export const OWN_VOICE_SLOWEST_CHARS_PER_SECOND = 13, OWN_VOICE_MAX_CHARS = 1500;

const anchor = z.string().regex(/^[A-Za-z_]\w{0,40}$/, "an anchor is an identifier");
/** The customer's product pictures a run places (#1356): each run takes them, so the stills and the render read the same list. */
const sceneImages = z.array(facelessCustomerSceneImage).max(EXPLAINER_MAX_PRODUCT_PICTURES).optional()
  .describe(`Up to ${EXPLAINER_MAX_PRODUCT_PICTURES} of your product pictures, p1 first: each on the script words its anchor names, placed by ` +
    "your code with <Product id=\"p1\"/> while those words are spoken. Send the same list to the stills and the render");
export const filmStillsInput = z.strictObject({
  draft_id: filmDraftId,
  revision: z.number().int().min(0).describe("The draft revision to draw; a draft that moved on is refused with 409"),
  voice_run_id: runId.describe("A delivered make_voice run of this account: its words time the captions the stills show"),
  at: z.array(z.union([anchor, z.number().min(0).max(600)])).min(1).max(OWN_STILLS_MAX_PER_CALL).optional()
    .describe(`Up to ${OWN_STILLS_MAX_PER_CALL} moments: an anchor of the draft's cues (the still shows it ${FILM_STILL_ANCHOR_LAG_SEC} s later) or ` +
      `seconds; omitted, the storyboard's events, up to ${OWN_STILLS_MAX_PER_CALL} spread over the film`),
  sheet: z.boolean().default(false)
    .describe(`Also tile the stills, in order, into one picture (3 across); always on for more than ${OWN_STILLS_SINGLE_MAX} stills`),
  scene_images: sceneImages,
});
export type FilmStillsInput = z.infer<typeof filmStillsInput>;
/** What a client sends: `sheet` may be left out. */
export type FilmStillsRequest = z.input<typeof filmStillsInput>;

export const filmVoiceInput = z.strictObject({
  text: z.string().trim().min(1).max(OWN_VOICE_MAX_CHARS).describe("The script, spoken exactly as written"),
  voice: z.enum(FACELESS_VOICE_NAMES).optional().describe("A narrator (list_voices with skill=make_faceless); the fastest of the script's language when omitted"),
});
export type FilmVoiceInput = z.infer<typeof filmVoiceInput>;

export const filmRenderInput = z.strictObject({
  draft_id: filmDraftId,
  revision: z.number().int().min(0).describe("The draft revision to render; a draft that moved on is refused with 409"),
  voice_run_id: runId.describe("A delivered make_voice run of this account: the film is cut to its length and its words time the captions"),
  scene_images: sceneImages,
});
export type FilmRenderInput = z.infer<typeof filmRenderInput>;

/** What a hero is drawn from, at least one: a character named by picture or words, else the meaning of the film's script. */
export const FILM_HERO_SOURCE_FIELDS = ["character_reference", "character_details", "script", "voice_run_id"] as const;
export const filmHeroInput = z.strictObject({
  character_reference: qualifiedImageUrl.optional().describe("https image of the character the poses are drawn after: a public picture, your upload, a " +
    "saved asset or your actor's picture (list_actors); a person's photo is drawn as a cartoon unless character_details ask for a photoreal look"),
  character_details: z.string().trim().min(1).max(2000).optional().describe("The character's look in words: shape, colours, one distinctive detail"),
  script: z.string().trim().min(1).max(OWN_VOICE_MAX_CHARS).optional()
    .describe("With no character named: the film's script, and a hero is invented to fit its meaning"),
  voice_run_id: runId.optional().describe("With no character and no script: a delivered make_voice run of this account, whose text is the script"),
  mascot_id: assetId.optional().describe("Alone, instead of the fields above: a saved mascot of this account (list_assets with mascot true) that lacks " +
    "poses. Only the poses it lacks are drawn, in its look, and added to it, so the same mascot_id then has them"),
}).refine(value => value.mascot_id !== undefined || FILM_HERO_SOURCE_FIELDS.some(field => value[field] !== undefined),
  "name the hero with character_reference or character_details, pass script or voice_run_id, or pass mascot_id")
  .refine(value => value.mascot_id === undefined || FILM_HERO_SOURCE_FIELDS.every(field => value[field] === undefined),
    `mascot_id completes a saved mascot and takes no other field: drop ${FILM_HERO_SOURCE_FIELDS.join(", ")}`);
export type FilmHeroInput = z.infer<typeof filmHeroInput>;

/** The seconds a take is held at before it is spoken: every character at the slowest pace, two seconds of lead and tail. */
export function ownVoiceCeilingSeconds(text: string): number {
  return Math.ceil(text.length / OWN_VOICE_SLOWEST_CHARS_PER_SECOND) + 2;
}

/** A film's frames on its voice: the take, then the tail, at the delivered rate. */
export const ownFilmFrames = (voiceSeconds: number): number => Math.ceil((voiceSeconds + FILM_TAIL_SEC) * FILM_RENDER_FPS);
/** How long the film on a take runs, to the hundredth (#1376): the take's length is not the film's. */
export const ownFilmSeconds = (voiceSeconds: number): number => +(ownFilmFrames(voiceSeconds) / FILM_RENDER_FPS).toFixed(2);

const filmSec = z.number().positive().describe("How long the film runs: the voice, then a short tail; say this length, not the voice's");

export const ownAgentQuote = z.strictObject({
  skill: z.enum(OWN_AGENT_SKILLS),
  /** What admission holds: the most the run can be charged. */
  credits: z.number().int().nonnegative(),
  unit: z.enum(["still", "second", "film", "pose"]),
  units: z.number().int().nonnegative(),
  /** `film_render`: how long the film will run. */
  film_sec: filmSec.optional(),
  /** `film_stills`: how many of the asked stills are free, and the free stills the draft has left in the rolling day after them. */
  free_units: z.number().int().nonnegative().optional()
    .describe(`How many of the asked stills are free: the first ${OWN_FREE_STILLS} stills of a draft in any ${OWN_FREE_STILLS_WINDOW_HOURS} h are`),
  free_left: z.number().int().nonnegative().optional().describe("Free stills this draft has left in the rolling day after this call"),
  warnings: z.array(z.string()),
});
export type OwnAgentQuote = z.infer<typeof ownAgentQuote>;

export const filmStill = z.strictObject({
  at: z.union([z.string(), z.number()]),
  seconds: z.number(),
  frame: z.number().int().min(0),
  image_url: z.string().url(),
  /** What the layout probe found on this still: overlapping or clipped text, an empty slot, a name left on screen. */
  findings: z.array(z.string()),
});
export const filmWord = z.strictObject({ text: z.string(), start: z.number(), end: z.number() });

/** One run of the mode as the agent reads it: the run's money and state, and what it delivered. */
export const filmRun = z.strictObject({
  run_id: runId,
  skill: z.enum(OWN_AGENT_SKILLS),
  state: z.string(),
  credits_reserved: z.number().int().nonnegative(),
  credits_charged: z.number().int().nonnegative().nullable(),
  warnings: z.array(z.string()),
  error: z.string().nullable(),
  /** `film_stills`: the stills drawn, a tiled sheet when asked, and the gate's refusals as `file:line: reason`. */
  stills: z.strictObject({ frames: z.array(filmStill), sheet_url: z.string().url().nullable(), refusals: z.array(z.string()) }).optional(),
  /** `film_voice`: the take's length and its words, each with its start and end, and how long a film on it runs. */
  voice: z.strictObject({ duration_sec: z.number().positive(), film_sec: filmSec.optional(), words: z.array(filmWord), audio_url: z.string().url() }).optional(),
  /** `film_render`: the delivered film, and its frame as a thumbnail when one could be taken. */
  film: z.strictObject({ video_url: z.string().url(), duration_sec: z.number().positive(),
    thumbnail_url: z.string().url().nullable().default(null) }).optional(),
  /** `film_hero`: the saved mascot (pass `mascot_id` to create_film_draft), the poses it was published with, and those poses on one picture
   *  to look at before stills. */
  hero: z.strictObject({ mascot_id: assetId, poses: z.array(z.enum(MASCOT_POSES)), character: z.string().nullable(),
    sheet_url: z.string().url().nullable().default(null) }).optional(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
});
export type FilmRun = z.infer<typeof filmRun>;

export const isOwnAgentSkill = (skill: unknown): skill is (typeof OWN_AGENT_SKILLS)[number] =>
  typeof skill === "string" && (OWN_AGENT_SKILLS as readonly string[]).includes(skill);

/** A take longer than this is refused before money: its hold would pass the longest take the tariff prices. */
export const OWN_VOICE_CEILING_LIMIT = OWN_VOICE_MAX_SECONDS;
