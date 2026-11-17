import { z } from "zod";
import { assetId } from "./asset-identity.js";
import { adId, adSlotId } from "./ad-ids.js";
import { diyBlocked, diyNext } from "./diy-next.js";
import { editMusic } from "./edit-music.js";
import { EXPLAINER_MAX_PRODUCT_PICTURES, facelessCustomerSceneImage, qualifiedImageUrl } from "./faceless-public.js";
import { FACELESS_VOICE_NAMES } from "./faceless-voices.js";
import { filmCutPicture } from "./film-cut.js";
import { filmDraftId } from "./film-drafts.js";
import { MASCOT_POSES } from "./mascots.js";
import { maxCreditsField } from "./max-credits.js";
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
export const FILM_EDITS_QUOTE_PATH = "/v1/film-edits/quote";
export const FILM_EDITS_PATH = "/v1/film-edits";
export const TAKE_FRAMES_QUOTE_PATH = "/v1/take-frames/quote";
export const TAKE_FRAMES_PATH = "/v1/take-frames";
export const TAKE_CHECKS_QUOTE_PATH = "/v1/take-checks/quote";
export const TAKE_CHECKS_PATH = "/v1/take-checks";
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
  max_credits: maxCreditsField,
});
export type FilmStillsInput = z.infer<typeof filmStillsInput>;
/** What a client sends: `sheet` may be left out. */
export type FilmStillsRequest = z.input<typeof filmStillsInput>;

export const filmVoiceInput = z.strictObject({
  text: z.string().trim().min(1).max(OWN_VOICE_MAX_CHARS).describe("The script, spoken exactly as written"),
  voice: z.enum(FACELESS_VOICE_NAMES).optional().describe("A narrator (list_voices with skill=make_faceless); the fastest of the script's language when omitted"),
  max_credits: maxCreditsField,
});
export type FilmVoiceInput = z.infer<typeof filmVoiceInput>;

export const filmRenderInput = z.strictObject({
  draft_id: filmDraftId,
  revision: z.number().int().min(0).describe("The draft revision to render; a draft that moved on is refused with 409"),
  voice_run_id: runId.describe("A delivered make_voice run of this account: the film is cut to its length and its words time the captions"),
  scene_images: sceneImages,
  max_credits: maxCreditsField,
});
export type FilmRenderInput = z.infer<typeof filmRenderInput>;

/** An edit's frame: vertical 720p at the rate every delivered video has. */
export const FILM_EDIT_WIDTH = 720, FILM_EDIT_HEIGHT = 1280, FILM_EDIT_FPS = 25;
/** The most clips, voice pieces and captions one edit takes, and the longest end hold. */
export const FILM_EDIT_MAX_CLIPS = 24, FILM_EDIT_MAX_PIECES = 24, FILM_EDIT_MAX_CAPTIONS = 160, FILM_EDIT_MAX_HOLD_SEC = 3;
/** Where a caption sits: `top` about a fifth down, `middle` centred, `bottom` about a quarter up, `low` near the bottom edge. */
export const FILM_EDIT_CAPTION_POSITIONS = ["top", "middle", "bottom", "low"] as const;
/** `outline`: bold white with a dark outline; `banner`: a band across the frame; `badge`: the words on a filled rounded box. */
export const FILM_EDIT_CAPTION_STYLES = ["outline", "banner", "badge"] as const;
export const FILM_EDIT_CAPTION_ALIGNS = ["center", "left"] as const;

const editSecond = z.number().min(0).max(600);
const editClip = z.strictObject({
  run_id: runId.optional().describe("A delivered generate_video run of this account"),
  asset_id: assetId.optional().describe("Instead of run_id: a video asset of this account"),
  from: editSecond.describe("The second of the clip the cut starts at"),
  to: editSecond.describe("The second of the clip the cut ends at, after from"),
  speed: z.number().min(0.5).max(2).default(1).describe("Play speed; the clip lasts (to - from) / speed in the edit. 1.2 lifts a slow beat"),
  slot: adSlotId.optional().describe("With ad_id: the slot of the ad this clip fills. A clip made with generate_video must have passed " +
    "check_take in that slot; your own footage needs no check"),
}).refine(clip => (clip.run_id === undefined) !== (clip.asset_id === undefined), "name the clip by run_id or by asset_id, one of them")
  .refine(clip => clip.to > clip.from, "to must be after from");
const voicePiece = z.strictObject({
  from: editSecond.describe("The second of the take the piece starts at (make_voice words give each word's start and end)"),
  to: editSecond.describe("The second of the take the piece ends at, after from"),
  at: editSecond.describe("The second of the edit the piece is heard from"),
}).refine(piece => piece.to > piece.from, "to must be after from");
const editCaption = z.strictObject({
  text: z.string().trim().min(1).max(40).regex(/^[^\n{}\\]+$/, "one line, without braces or backslashes")
    .describe("What the caption reads, as written: 2 to 4 words in capitals read best"),
  start: editSecond.describe("The second of the edit it appears"),
  end: editSecond.describe("The second of the edit it goes, after start"),
  position: z.enum(FILM_EDIT_CAPTION_POSITIONS).default("bottom")
    .describe("Where it sits; pick the one that keeps it off the product, its print, the working hands and the face"),
  align: z.enum(FILM_EDIT_CAPTION_ALIGNS).default("center").describe("center, or left to sit at the frame's left edge"),
  style: z.enum(FILM_EDIT_CAPTION_STYLES).default("outline")
    .describe("outline: bold white with a dark outline; banner: a band across the frame that stays for its seconds; badge: the words on a filled box"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "a hex colour such as #F4EBD9").optional()
    .describe("The fill of the boxed word, the badge or the banner, as #RRGGBB; omitted, white. The words take black or white, whichever reads"),
  highlight: z.number().int().min(0).max(9).optional()
    .describe("outline only: the place of the word drawn in a filled box (0 for the first), the word being spoken"),
}).refine(caption => caption.end > caption.start, "end must be after start")
  .refine(caption => caption.highlight === undefined || caption.style === "outline", "highlight boxes a word of an outline caption only")
  .refine(caption => caption.color === undefined || caption.style !== "outline" || caption.highlight !== undefined,
    "color fills a boxed word, a badge or a banner; an outline caption without highlight has none")
  .refine(caption => caption.highlight === undefined || caption.highlight < caption.text.split(/\s+/).length,
    "highlight names a word the caption does not have");

export const filmEditInput = z.strictObject({
  clips: z.array(editClip).min(1).max(FILM_EDIT_MAX_CLIPS)
    .describe("The cut in order, each a window of one of your clips; they play back to back with hard cuts"),
  voice: z.strictObject({
    run_id: runId.describe("A delivered make_voice run of this account"),
    at: editSecond.default(0.1).describe("Without pieces: the second of the edit the whole take starts at"),
    pieces: z.array(voicePiece).min(1).max(FILM_EDIT_MAX_PIECES).optional()
      .describe("Instead of the whole take: its sentences laid one by one, each on the second its picture starts; pieces may not overlap"),
  }).optional().describe("The voice-over; without it the edit is silent"),
  captions: z.array(editCaption).max(FILM_EDIT_MAX_CAPTIONS).default([])
    .describe("Burned-in captions, each in its style: outline (default), banner or badge"),
  hold: z.number().min(0).max(FILM_EDIT_MAX_HOLD_SEC).default(0)
    .describe("Seconds the last frame is held at the end, for the packshot"),
  music: editMusic.optional().describe("Music from at to the end: a library track (free) or one made for the cut (paid on delivery); " +
    "under a voice it plays lower"),
  ad_id: adId.optional().describe("The ad record this cut belongs to: every clip then names its slot, and a clip made with generate_video " +
    "that has not passed check_take in its slot is refused before any credits; your own footage needs no check"),
  max_credits: maxCreditsField,
}).refine(edit => edit.ad_id !== undefined || edit.clips.every(clip => clip.slot === undefined), "a clip's slot needs ad_id")
  .refine(edit => edit.ad_id === undefined || edit.clips.every(clip => clip.slot !== undefined), "with ad_id, every clip names its slot");
export type FilmEditInput = z.infer<typeof filmEditInput>;
/** What a client sends: the defaults may be left out. */
export type FilmEditRequest = z.input<typeof filmEditInput>;

/** A take's contact sheets (take_frames): columns, a cell's width in pixels, the frames one sheet holds, and the rate bounds with their default. */
export const TAKE_FRAMES_COLUMNS = 8, TAKE_FRAMES_CELL_WIDTH = 240, TAKE_FRAMES_PER_SHEET = 24;
export const TAKE_FRAMES_MIN_FPS = 1, TAKE_FRAMES_MAX_FPS = 24, TAKE_FRAMES_DEFAULT_FPS = 8;
/** The longest direction a take check reads whole, and the most planned contact seconds it looks at first. */
export const TAKE_CHECK_PROMPT_MAX_CHARS = 1500, TAKE_CHECK_MAX_MOVES = 5;
/** The kinds of ad a take's motion is measured against: people and clothes in motion, or a product worked in the hands. */
export const TAKE_MOTION_FORMATS = ["fashion", "product"] as const;
export type TakeMotionFormat = (typeof TAKE_MOTION_FORMATS)[number];
/** What a take's window should reach for its format: subject motion (the mean change of brightness between frames once the camera's own */
/** move is taken out, 0 to 255) and, for people in motion, a camera that moves (percent of the frame's width a second). */
export const TAKE_MOTION_TARGETS: Record<TakeMotionFormat, { subject: number; camera: number | null }> = {
  fashion: { subject: 11, camera: 5 }, product: { subject: 1.5, camera: null } };
/** Camera shake above this (percent of the frame's width a step, off the camera's smooth path) is named as shake. */
export const TAKE_SHAKE_LIMIT = 4;

const takeSecond = z.number().min(0).max(600);
const takeSource = {
  run_id: runId.optional().describe("The take: a delivered generate_video run of this account"),
  asset_id: assetId.optional().describe("Instead of run_id: a video asset of this account"),
};
const oneTake = (take: { run_id?: string | undefined; asset_id?: string | undefined }) => (take.run_id === undefined) !== (take.asset_id === undefined);
const ONE_TAKE = "name the take by run_id or by asset_id, one of them";

export const takeFramesInput = z.strictObject({
  ...takeSource,
  fps: z.number().int().min(TAKE_FRAMES_MIN_FPS).max(TAKE_FRAMES_MAX_FPS).default(TAKE_FRAMES_DEFAULT_FPS)
    .describe("Frames a second: 8 to read the whole take, 12 to 24 on a contact"),
  from: takeSecond.optional().describe("The second of the take the frames start at; omitted, its start"),
  to: takeSecond.optional().describe("The second of the take the frames end at; omitted, its end"),
  crop: z.strictObject({
    x: z.number().min(0).max(0.95), y: z.number().min(0).max(0.95), w: z.number().min(0.05).max(1), h: z.number().min(0.05).max(1),
  }).refine(c => c.x + c.w <= 1 + 1e-9 && c.y + c.h <= 1 + 1e-9, "the crop stays inside the frame: x + w and y + h at most 1").optional()
    .describe("Only this part of the frame, enlarged: x, y from the top-left corner and w, h, each a share of the frame's width or height"),
  max_credits: maxCreditsField,
}).refine(oneTake, ONE_TAKE).refine(v => v.from === undefined || v.to === undefined || v.to > v.from, "to must be after from");
export type TakeFramesInput = z.infer<typeof takeFramesInput>;
export type TakeFramesRequest = z.input<typeof takeFramesInput>;

/** What a take is checked against: its ad shot's motion, or the picture it was made from (faceless). */
export const TAKE_CHECK_AGAINST = ["motion", "picture"] as const;
export type TakeCheckAgainst = (typeof TAKE_CHECK_AGAINST)[number];
/** The most changes a picture-mode direction names, and the most locks. */
export const TAKE_PICTURE_MAX_CHANGES = 4, TAKE_PICTURE_MAX_LOCKS = 6;
const words = (most: number) => z.string().trim().min(1).max(most);
/** A picture-mode direction: the take's start, each change at its second, the camera, the end, and what must not change. */
export const pictureTakeAsk = z.strictObject({
  start: words(300).describe("What the first frame shows"),
  changes: z.array(z.strictObject({ at_s: takeSecond.describe("The second of the take the change starts"), cause: words(200), result: words(240) }))
    .min(1).max(TAKE_PICTURE_MAX_CHANGES).describe("Each change the take was asked to show, in order"),
  camera: words(160).default("as made").describe("The camera's move; omitted, as made"),
  end: words(300).describe("What the last frame shows"),
  locks: z.array(words(200)).max(TAKE_PICTURE_MAX_LOCKS).default([]).describe("What must stay as the picture shows it"),
});
export type PictureTakeAsk = z.infer<typeof pictureTakeAsk>;
const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "a colour is #RRGGBB");
const PICTURE_ONLY = ["look", "picture"] as const, MOTION_ONLY = ["product_image", "moves", "format", "ad_id", "slot"] as const;

export const takeCheckInput = z.strictObject({
  ...takeSource,
  against: z.enum(TAKE_CHECK_AGAINST).optional().describe("motion (an ad shot, the default) or picture: the take against the picture it was " +
    "made from, with direction as start, changes, camera, end and locks"),
  direction: z.union([z.string().trim().min(1).max(TAKE_CHECK_PROMPT_MAX_CHARS), pictureTakeAsk])
    .describe("What the take was asked to show: the shot's part of the prompt you made it with (its action and timeline), up to 1500 characters; " +
      "with against picture, the object of start, changes, camera, end and locks"),
  look: z.strictObject({ words: words(200).describe("The video's look in words"),
    palette: z.array(hexColour).min(3).max(5).optional().describe("Its colours") }).optional()
    .describe("With against picture: the look a colour outside it is named against"),
  picture: filmCutPicture.optional().describe("With against picture: the picture the take is checked against; needed only when the take " +
    "was not made from a first frame, and it must be that first frame when it was"),
  product_image: qualifiedImageUrl.optional()
    .describe("https picture of the product as it really is (your upload or a saved asset): the take's product is compared with it"),
  moves: z.array(takeSecond).max(TAKE_CHECK_MAX_MOVES).optional()
    .describe("Seconds of the take where a hand meets the product (a grip, a lid, a set-down): looked at first"),
  ad_id: adId.optional().describe("With slot: the ad record the verdict joins, as a take of that slot"),
  slot: adSlotId.optional().describe("With ad_id: the slot of the ad this take is for"),
  format: z.enum(TAKE_MOTION_FORMATS).optional().describe("What the take's motion is measured against: fashion (people and clothes in " +
    "motion: fashion, lifestyle, sport) or product (a product worked in the hands); omitted, product"),
  max_credits: maxCreditsField,
}).refine(oneTake, ONE_TAKE).refine(v => (v.ad_id === undefined) === (v.slot === undefined), "ad_id and slot go together")
  .superRefine((v, ctx) => {
    const picture = v.against === "picture", refuse = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (picture !== (typeof v.direction === "object")) refuse("direction", picture ? "with against picture, direction is an object of start, changes, " +
      "camera, end and locks" : "direction is the shot's prompt as text; the object form goes with against picture");
    if (picture && v.look === undefined) refuse("look", "with against picture, name the look");
    for (const key of picture ? MOTION_ONLY : PICTURE_ONLY) if (v[key] !== undefined)
      refuse(key, picture ? `${key} goes with a motion check, not against picture` : `${key} goes with against picture`);
  });
export type TakeCheckInput = z.infer<typeof takeCheckInput>;
export type TakeCheckRequest = z.input<typeof takeCheckInput>;

/** How a take defect is repaired: a new first frame or reference, the motion prompt's action, its framing, or another roll of the same prompt. */
export const TAKE_DEFECT_LEVELS = ["asset", "action", "camera", "roll"] as const;
const takeWindow = z.strictObject({ from: z.number().min(0), to: z.number().min(0) });
/** A stretch of a take with its motion, cuts and whips left out: subject, camera move and camera shake. */
const motionNumbers = {
  subject: z.number().nonnegative().describe("How much the subject moves once the camera's own move is taken out: mean change of brightness between frames, 0 to 255"),
  camera: z.number().nonnegative().describe("How fast the camera travels on its smooth path, percent of the frame's width a second"),
  jitter: z.number().nonnegative().describe("Camera shake: how far the camera strays from that smooth path, percent of the frame's width a step"),
};
export const takeMotionWindow = z.strictObject({ from: z.number().min(0), to: z.number().min(0), ...motionNumbers });
export type TakeMotionWindow = z.infer<typeof takeMotionWindow>;
/** How much a take moves, free with its check: the whole take and each clean window (the whole take when none is clean) against its */
/** format's target. Advice only: it never changes the findings, the clean windows or a pass. */
export const takeMotion = z.strictObject({
  format: z.enum(TAKE_MOTION_FORMATS),
  target: z.strictObject({ subject: z.number().nonnegative(), camera: z.number().nonnegative().nullable() }),
  ...motionNumbers,
  windows: z.array(takeMotionWindow),
  finding: z.string().nullable().describe("too static for this format, with what to change; null when every window reaches the target"),
  shake: z.string().nullable().describe("camera shake past the limit, with what to change; null when the camera is steady"),
});
export type TakeMotion = z.infer<typeof takeMotion>;
/** A delivered take check: each defect the frames show, where in the take and how it is repaired, and the take's clean windows. */
export const takeCheckVerdict = z.strictObject({ duration_sec: z.number().positive(),
  findings: z.array(z.strictObject({ code: z.string(), level: z.enum(TAKE_DEFECT_LEVELS), from: z.number().min(0), to: z.number().min(0),
    whole_take: z.boolean(), why: z.string().nullable() })),
  clean: z.array(takeWindow),
  motion: takeMotion.optional(),
  against: z.enum(TAKE_CHECK_AGAINST).optional(),
  action_at_s: z.number().min(0).nullable().optional().describe("Against picture: the second the first asked change shows; null when it never does"),
  subject: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0).max(1), h: z.number().min(0).max(1) })
    .nullable().optional().describe("Against picture: the main subject's box at that second, shares of the frame from its top-left corner") });
export type TakeCheckVerdict = z.infer<typeof takeCheckVerdict>;
/** A take passes its check when no defect spans the whole take and a clean window is left to cut from. */
export const takeCheckPassed = (verdict: Pick<TakeCheckVerdict, "findings" | "clean">): boolean =>
  verdict.clean.length > 0 && !verdict.findings.some(finding => finding.whole_take);

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
  max_credits: maxCreditsField,
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
/** One line of an own-agent quote: what is counted, how many, at what rate, and the product. */
export const ownAgentQuoteLine = z.strictObject({ label: z.string().min(1), unit: z.enum(["film", "track"]), quantity: z.number().int().nonnegative(),
  unit_credits: z.number().int().nonnegative(), credits: z.number().int().nonnegative() });
export type OwnAgentQuoteLine = z.infer<typeof ownAgentQuoteLine>;

export const ownAgentQuote = z.strictObject({
  skill: z.enum(OWN_AGENT_SKILLS),
  /** What admission holds: the most the run can be charged. */
  credits: z.number().int().nonnegative(),
  unit: z.enum(["still", "second", "film", "pose", "sheet", "check"]),
  units: z.number().int().nonnegative(),
  /** `film_render`, `film_edit`, `film_cut`: how long the film will run. */
  film_sec: filmSec.optional(),
  /** `film_stills`: how many of the asked stills are free, and the free stills the draft has left in the rolling day after them. */
  free_units: z.number().int().nonnegative().optional()
    .describe(`How many of the asked stills are free: the first ${OWN_FREE_STILLS} stills of a draft in any ${OWN_FREE_STILLS_WINDOW_HOURS} h are`),
  free_left: z.number().int().nonnegative().optional().describe("Free stills this draft has left in the rolling day after this call"),
  /** `film_take_frames`: how many frames the sheets will show. */
  frames: z.number().int().positive().optional(),
  /** `film_cut`: the credits line by line; they add up to `credits`. */
  items: z.array(z.strictObject({ item: z.enum(["cut", "extra_seconds", "bed", "take_sound", "music"]), units: z.number().int().nonnegative(),
    credits: z.number().int().nonnegative() })).optional(),
  /** `film_edit` with music made for the cut: the cut and the music, each its own line; they add up to credits. */
  lines: z.array(ownAgentQuoteLine).optional(),
  warnings: z.array(z.string()),
  /** The ad tools' quotes (#1539): the paid call with the same arguments, to send after the go-ahead. */
  next: diyNext.optional(),
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
  /** `film_render`, `film_edit`, `film_cut`: the delivered film, and its frame as a thumbnail when one could be taken. */
  film: z.strictObject({ video_url: z.string().url(), duration_sec: z.number().positive(),
    thumbnail_url: z.string().url().nullable().default(null) }).optional(),
  /** `film_hero`: the saved mascot (pass `mascot_id` to create_film_draft), the poses it was published with, and those poses on one picture
   *  to look at before stills. */
  hero: z.strictObject({ mascot_id: assetId, poses: z.array(z.enum(MASCOT_POSES)), character: z.string().nullable(),
    sheet_url: z.string().url().nullable().default(null) }).optional(),
  /** `film_take_frames`: the take's frames on contact sheets in reading order, each frame labelled with its second of the take. */
  take_frames: z.strictObject({ fps: z.number().int().positive(), frames: z.number().int().positive(),
    sheets: z.array(z.strictObject({ image_url: z.string().url(), from: z.number().min(0), to: z.number().min(0), frames: z.number().int().positive() })),
    shots: z.array(takeMotionWindow).optional()
      .describe("The stretches between cuts and whips in these seconds, each with its subject motion, camera move and camera shake: a reference's energy, shot by shot") })
    .optional(),
  /** `film_take_check`: each defect the frames show, where in the take and how it is repaired, and the take's clean windows. */
  take_check: takeCheckVerdict.optional(),
  /** The ad tools (#1539): the call that moves the ad on with its arguments, or why it cannot move on and what unblocks it. */
  next: diyNext.nullable().optional(),
  blocked: diyBlocked.nullable().optional(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
});
export type FilmRun = z.infer<typeof filmRun>;

export const isOwnAgentSkill = (skill: unknown): skill is (typeof OWN_AGENT_SKILLS)[number] =>
  typeof skill === "string" && (OWN_AGENT_SKILLS as readonly string[]).includes(skill);

/** A take longer than this is refused before money: its hold would pass the longest take the tariff prices. */
export const OWN_VOICE_CEILING_LIMIT = OWN_VOICE_MAX_SECONDS;
