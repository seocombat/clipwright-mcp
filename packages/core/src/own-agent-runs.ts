import { z } from "zod";
import { assetId } from "./asset-identity.js";
import { adId, adSlotId } from "./ad-ids.js";
import { cutId } from "./cut-ids.js";
import { diyBlocked, diyNext } from "./diy-next.js";
import { editMusic } from "./edit-music.js";
import { EXPLAINER_MAX_PRODUCT_PICTURES, facelessCustomerSceneImage, qualifiedImageUrl } from "./faceless-public.js";
import { filmCutPicture } from "./film-cut.js";
import { filmDraftId, filmSceneVideo } from "./film-drafts.js";
import { MASCOT_POSES } from "./mascots.js";
import { maxCreditsField } from "./max-credits.js";
import { OWN_AGENT_SKILLS, OWN_FREE_STILLS, OWN_FREE_STILLS_WINDOW_HOURS, OWN_STILLS_MAX_PER_CALL, OWN_STILLS_SINGLE_MAX, OWN_VOICE_MAX_SECONDS } from "./own-agent-price.js";
import { runId } from "./runs.js";
import { VOICE_NAME_PATTERN } from "./voices.js";


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
export const OWN_AGENT_CUT_TASK = "own-agent-cut";
export const OWN_AGENT_CUT_PREVIEW_TASK = "own-agent-cut-preview";

export const FILM_STILL_FPS = 30, FILM_RENDER_FPS = 25;
export const FILM_STILL_ANCHOR_LAG_SEC = 0.25;
export const FILM_TAIL_SEC = 0.8;
export const OWN_VOICE_SLOWEST_CHARS_PER_SECOND = 13, OWN_VOICE_MAX_CHARS = 1500;

const anchor = z.string().regex(/^[A-Za-z_]\w{0,40}$/, "an anchor is an identifier");
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
  scene_video: filmSceneVideo.optional(),
  max_credits: maxCreditsField,
});
export type FilmStillsInput = z.infer<typeof filmStillsInput>;
export type FilmStillsRequest = z.input<typeof filmStillsInput>;

export const filmVoiceInput = z.strictObject({
  text: z.string().trim().min(1).max(OWN_VOICE_MAX_CHARS).describe("The script, spoken exactly as written"),
  voice: z.string({ error: "voice must be a voice name from list_voices, as a string" })
    .regex(VOICE_NAME_PATTERN, "voice is not a voice name: take one from list_voices with skill=make_faceless").optional()
    .describe("A narrator (list_voices with skill=make_faceless); the fastest of the script's language when omitted. The API refuses a name " +
      "list_voices does not return, before any charge"),
  cut_id: cutId.optional().describe("The cut record this voice is for: the record then names it as its voice and says what comes next"),
  max_credits: maxCreditsField,
});
export type FilmVoiceInput = z.infer<typeof filmVoiceInput>;

export const filmRenderInput = z.strictObject({
  draft_id: filmDraftId,
  revision: z.number().int().min(0).describe("The draft revision to render; a draft that moved on is refused with 409"),
  voice_run_id: runId.describe("A delivered make_voice run of this account: the film is cut to its length and its words time the captions"),
  scene_images: sceneImages,
  scene_video: filmSceneVideo.optional(),
  music: editMusic.optional().describe("Music under the film from at to the end: a library track (free) or one made for the film (paid on " +
    "delivery); under the voice it plays lower"),
  max_credits: maxCreditsField,
});
export type FilmRenderInput = z.infer<typeof filmRenderInput>;

export const FILM_EDIT_WIDTH = 720, FILM_EDIT_HEIGHT = 1280, FILM_EDIT_FPS = 25;
export const FILM_EDIT_MAX_CLIPS = 24, FILM_EDIT_MAX_PIECES = 24, FILM_EDIT_MAX_CAPTIONS = 160, FILM_EDIT_MAX_HOLD_SEC = 3;
export const FILM_EDIT_CAPTION_POSITIONS = ["top", "middle", "bottom", "low"] as const;
export const FILM_EDIT_CAPTION_STYLES = ["outline", "banner", "badge"] as const;
export const FILM_EDIT_CAPTION_ALIGNS = ["center", "left"] as const;

const editSecond = z.number().min(0).max(600);
export const EDIT_CLIP_MIN_VOLUME_DB = -24, EDIT_CLIP_MAX_VOLUME_DB = 3;
const editClip = z.strictObject({
  run_id: runId.optional().describe("A delivered generate_video run of this account"),
  asset_id: assetId.optional().describe("Instead of run_id: a video asset of this account"),
  from: editSecond.describe("The second of the clip the cut starts at"),
  to: editSecond.describe("The second of the clip the cut ends at, after from"),
  speed: z.number().min(0.5).max(2).default(1).describe("Play speed; the clip lasts (to - from) / speed in the edit. 1.2 lifts a slow beat"),
  sound: z.boolean().optional().describe("Play this window's own sound (a clip made with audio: true); at speed 1, never over the voice's " +
    "words. speech and volume say how it sits in the mix"),
  speech: z.boolean().optional().describe("With sound: true. true: the window's sound is someone speaking, so it plays at the level of " +
    "speech and the music goes lower under it as under the voice. false: room sound or effects, which never lower the music. Omitted: " +
    "what the clip's latest check_take heard, if one ran, else false"),
  volume: z.number().min(EDIT_CLIP_MIN_VOLUME_DB).max(EDIT_CLIP_MAX_VOLUME_DB).optional()
    .describe("With sound: true. dB from the level the edit gives this window's sound: 0 (the default) near the voice, -10 well under it"),
  slot: adSlotId.optional().describe("With ad_id: the slot of the ad this clip fills"),
}).refine(clip => (clip.run_id === undefined) !== (clip.asset_id === undefined), "name the clip by run_id or by asset_id, one of them")
  .refine(clip => clip.to > clip.from, "to must be after from")
  .refine(clip => clip.sound !== true || clip.run_id !== undefined,
    { path: ["sound"], message: "a clip's own sound is kept only from a generate_video run made with audio: true" })
  .refine(clip => clip.sound !== true || clip.speed === 1, { path: ["sound"], message: "a clip's own sound plays at speed 1 only" })
  .refine(clip => clip.sound === true || (clip.speech === undefined && clip.volume === undefined),
    { path: ["sound"], message: "speech and volume describe a clip's own sound: they need sound: true" });
export const EDIT_AMBIENCE_MIN_VOLUME_DB = -40, EDIT_AMBIENCE_MAX_VOLUME_DB = -18, EDIT_AMBIENCE_DEFAULT_VOLUME_DB = -20, EDIT_AMBIENCE_MIN_SPAN_SEC = 1;
const editAmbience = z.strictObject({
  run_id: runId.optional().describe("A delivered generate_video run of this account made with audio: true, whose own sound is the place's"),
  asset_id: assetId.optional().describe("Instead of run_id: a video asset of this account with its own sound"),
  from: editSecond.describe("The second of the clip the room sound starts at"),
  to: editSecond.describe(`The second of the clip it ends at, at least ${EDIT_AMBIENCE_MIN_SPAN_SEC} s after from: a stretch with no one speaking ` +
    "and no sharp sound in it"),
  volume: z.number().min(EDIT_AMBIENCE_MIN_VOLUME_DB).max(EDIT_AMBIENCE_MAX_VOLUME_DB).default(EDIT_AMBIENCE_DEFAULT_VOLUME_DB)
    .describe(`dB from the level of speech: ${EDIT_AMBIENCE_DEFAULT_VOLUME_DB} (the default) is a quiet room under the voice, ` +
      `${EDIT_AMBIENCE_MAX_VOLUME_DB} the loudest`),
}).refine(a => (a.run_id === undefined) !== (a.asset_id === undefined), "name the room sound by run_id or by asset_id, one of them")
  .refine(a => a.to - a.from >= EDIT_AMBIENCE_MIN_SPAN_SEC - 1e-9,
    { path: ["to"], message: `the room sound is taken from at least ${EDIT_AMBIENCE_MIN_SPAN_SEC} s: to must be that far after from` });
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
  ambience: editAmbience.optional().describe("Free: the place's quiet room sound, a stretch of one of your clips' own sound repeated " +
    "smoothly under the whole cut whatever its windows and their speed, so every window can play silent and sped up. It never lowers the " +
    "music and the voice stays on top of it; it goes with a voice, music or a clip's own sound"),
  ad_id: adId.optional().describe("The ad record this cut belongs to: every clip then names its slot"),
  max_credits: maxCreditsField,
}).refine(edit => edit.ad_id !== undefined || edit.clips.every(clip => clip.slot === undefined), "a clip's slot needs ad_id")
  .refine(edit => edit.ad_id === undefined || edit.clips.every(clip => clip.slot !== undefined), "with ad_id, every clip names its slot");
export type FilmEditInput = z.infer<typeof filmEditInput>;
export type FilmEditRequest = z.input<typeof filmEditInput>;

export const TAKE_FRAMES_COLUMNS = 8, TAKE_FRAMES_CELL_WIDTH = 240, TAKE_FRAMES_PER_SHEET = 24;
export const TAKE_FRAMES_MIN_FPS = 1, TAKE_FRAMES_MAX_FPS = 24, TAKE_FRAMES_DEFAULT_FPS = 8;
export const TAKE_CHECK_PROMPT_MAX_CHARS = 1500, TAKE_CHECK_MAX_MOVES = 5;
export const TAKE_MOTION_FORMATS = ["fashion", "product"] as const;
export type TakeMotionFormat = (typeof TAKE_MOTION_FORMATS)[number];
export const TAKE_MOTION_TARGETS: Record<TakeMotionFormat, { subject: number; camera: number | null }> = {
  fashion: { subject: 11, camera: 5 }, product: { subject: 1.5, camera: null } };
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
  run_id: runId.optional().describe("The take: a delivered generate_video run of this account, or a delivered render_edit run to read the " +
    "finished edit"),
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

export const TAKE_CHECK_AGAINST = ["motion", "picture"] as const;
export type TakeCheckAgainst = (typeof TAKE_CHECK_AGAINST)[number];
export const TAKE_PICTURE_MAX_CHANGES = 4, TAKE_PICTURE_MAX_LOCKS = 6;
const words = (most: number) => z.string().trim().min(1).max(most);
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
const PICTURE_ONLY = ["look", "picture", "cut_id"] as const, MOTION_ONLY = ["product_image", "moves", "format", "ad_id", "speed"] as const;

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
  product_image: z.union([qualifiedImageUrl, filmCutPicture]).optional()
    .describe("The product as it really is, the take's product compared with it: an https link to your upload or a saved asset, or the " +
      "picture by run_id (a delivered generate_image run of this account, such as a product sheet), upload_id or asset_id"),
  moves: z.array(takeSecond).max(TAKE_CHECK_MAX_MOVES).optional()
    .describe("Seconds of the take where a hand meets the product (a grip, a lid, a set-down): looked at first"),
  ad_id: adId.optional().describe("With slot: the ad record the verdict joins, as a take of that slot"),
  cut_id: cutId.optional().describe("With against picture, required with slot: the cut record the verdict joins, as a take of that slot"),
  slot: adSlotId.optional().describe("With ad_id or cut_id: the slot of the record this take is for; on a cut record, a slot that needs a take"),
  format: z.enum(TAKE_MOTION_FORMATS).optional().describe("What the take's motion is measured against: fashion (people and clothes in " +
    "motion: fashion, lifestyle, sport) or product (a product worked in the hands); omitted, product"),
  speed: z.boolean().optional().describe("true: also look for things hanging in the air (slow motion), same price; off by default"),
  max_credits: maxCreditsField,
}).refine(oneTake, ONE_TAKE)
  .superRefine((v, ctx) => {
    const picture = v.against === "picture", refuse = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (picture && v.cut_id === undefined) refuse("cut_id", "with against picture, name the cut record (create_cut) the take is for");
    if (picture && v.slot === undefined) refuse("slot", "with against picture, name the cut record's slot the take is for");
    if (!picture && (v.ad_id === undefined) !== (v.slot === undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: "ad_id and slot go together" });
    if (picture !== (typeof v.direction === "object")) refuse("direction", picture ? "with against picture, direction is an object of start, changes, " +
      "camera, end and locks" : "direction is the shot's prompt as text; the object form goes with against picture");
    if (picture && v.look === undefined) refuse("look", "with against picture, name the look");
    for (const key of picture ? MOTION_ONLY : PICTURE_ONLY) if (v[key] !== undefined)
      refuse(key, picture ? `${key} goes with a motion check, not against picture` : `${key} goes with against picture`);
  });
export type TakeCheckInput = z.infer<typeof takeCheckInput>;
export type TakeCheckRequest = z.input<typeof takeCheckInput>;

export const TAKE_DEFECT_LEVELS = ["asset", "action", "camera", "roll"] as const;
const takeWindow = z.strictObject({ from: z.number().min(0), to: z.number().min(0) });
const motionNumbers = {
  subject: z.number().nonnegative().describe("How much the subject moves once the camera's own move is taken out: mean change of brightness between frames, 0 to 255"),
  camera: z.number().nonnegative().describe("How fast the camera travels on its smooth path, percent of the frame's width a second"),
  jitter: z.number().nonnegative().describe("Camera shake: how far the camera strays from that smooth path, percent of the frame's width a step"),
};
export const takeMotionWindow = z.strictObject({ from: z.number().min(0), to: z.number().min(0), ...motionNumbers });
export type TakeMotionWindow = z.infer<typeof takeMotionWindow>;
export const takeMotion = z.strictObject({
  format: z.enum(TAKE_MOTION_FORMATS),
  target: z.strictObject({ subject: z.number().nonnegative(), camera: z.number().nonnegative().nullable() }),
  ...motionNumbers,
  windows: z.array(takeMotionWindow),
  finding: z.string().nullable().describe("too static for this format, with what to change; null when every window reaches the target"),
  shake: z.string().nullable().describe("camera shake past the limit, with what to change; null when the camera is steady"),
});
export type TakeMotion = z.infer<typeof takeMotion>;
export const takeCheckVerdict = z.strictObject({ duration_sec: z.number().positive(),
  findings: z.array(z.strictObject({ code: z.string(), level: z.enum(TAKE_DEFECT_LEVELS), from: z.number().min(0), to: z.number().min(0),
    whole_take: z.boolean(), why: z.string().nullable() })),
  clean: z.array(takeWindow),
  motion: takeMotion.optional(),
  speech: z.boolean().optional().describe("A take with its own sound: whether someone speaks in it, on screen or off. render_edit plays " +
    "a window of this take as speech when its speech is not given"),
  against: z.enum(TAKE_CHECK_AGAINST).optional(),
  action_at_s: z.number().min(0).nullable().optional().describe("Against picture: the second the first asked change shows; null when it never does"),
  subject: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0).max(1), h: z.number().min(0).max(1) })
    .nullable().optional().describe("Against picture: the main subject's box at that second, shares of the frame from its top-left corner") });
export type TakeCheckVerdict = z.infer<typeof takeCheckVerdict>;
export const takeCheckPassed = (verdict: Pick<TakeCheckVerdict, "findings" | "clean">): boolean =>
  verdict.clean.length > 0 && !verdict.findings.some(finding => finding.whole_take);
export const TAKE_VOICE_MISMATCH = "VOICE_MISMATCH" as const;

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
  head: z.boolean().optional().describe("true with character_reference, your own photo saved as an asset with rights_confirmed (create_asset) or " +
    "your actor's picture (list_actors): draws only the head as a cartoon that talks, blinks, " +
    "smiles, looks surprised and looks aside, saved as a mascot whose mascot_id a film's actor wears; one price per head, charged only when the " +
    "head is saved with all its pictures"),
  max_credits: maxCreditsField,
}).refine(value => value.mascot_id !== undefined || FILM_HERO_SOURCE_FIELDS.some(field => value[field] !== undefined),
  "name the hero with character_reference or character_details, pass script or voice_run_id, or pass mascot_id")
  .refine(value => value.mascot_id === undefined || FILM_HERO_SOURCE_FIELDS.every(field => value[field] === undefined),
    `mascot_id completes a saved mascot and takes no other field: drop ${FILM_HERO_SOURCE_FIELDS.join(", ")}`)
  .refine(value => value.head !== true || (value.character_reference !== undefined && value.script === undefined
    && value.voice_run_id === undefined && value.mascot_id === undefined),
    "head is drawn from character_reference (with character_details if you like): pass it, and drop script, voice_run_id and mascot_id");
export type FilmHeroInput = z.infer<typeof filmHeroInput>;

export function ownVoiceCeilingSeconds(text: string, tempo = 1): number {
  return Math.ceil(text.length / (OWN_VOICE_SLOWEST_CHARS_PER_SECOND * tempo)) + 2;
}

export const ownFilmFrames = (voiceSeconds: number): number => Math.ceil((voiceSeconds + FILM_TAIL_SEC) * FILM_RENDER_FPS);
export const ownFilmSeconds = (voiceSeconds: number): number => +(ownFilmFrames(voiceSeconds) / FILM_RENDER_FPS).toFixed(2);

const filmSec = z.number().positive().describe("How long the film runs: the voice, then a short tail; say this length, not the voice's");
export const ownAgentQuoteLine = z.strictObject({ label: z.string().min(1), unit: z.enum(["film", "track"]), quantity: z.number().int().nonnegative(),
  unit_credits: z.number().int().nonnegative(), credits: z.number().int().nonnegative() });
export type OwnAgentQuoteLine = z.infer<typeof ownAgentQuoteLine>;

export const ownAgentQuote = z.strictObject({
  skill: z.enum(OWN_AGENT_SKILLS),
  credits: z.number().int().nonnegative(),
  unit: z.enum(["still", "second", "film", "pose", "sheet", "check"]),
  units: z.number().int().nonnegative(),
  film_sec: filmSec.optional(),
  free_units: z.number().int().nonnegative().optional()
    .describe(`How many of the asked stills are free: the first ${OWN_FREE_STILLS} stills of a draft, or previews of an account, in any ` +
      `${OWN_FREE_STILLS_WINDOW_HOURS} h are`),
  free_left: z.number().int().nonnegative().optional().describe("Free stills the draft, or the account's previews, have left in the rolling day after this call"),
  frames: z.number().int().positive().optional(),
  items: z.array(z.strictObject({ item: z.enum(["cut", "extra_seconds", "bed", "take_sound", "music"]), units: z.number().int().nonnegative(),
    credits: z.number().int().nonnegative() })).optional(),
  lines: z.array(ownAgentQuoteLine).optional(),
  warnings: z.array(z.string()),
  next: diyNext.optional(),
});
export type OwnAgentQuote = z.infer<typeof ownAgentQuote>;

export const filmStill = z.strictObject({
  at: z.union([z.string(), z.number()]),
  seconds: z.number(),
  frame: z.number().int().min(0),
  image_url: z.string().url(),
  findings: z.array(z.string()),
});
export const filmWord = z.strictObject({ text: z.string(), start: z.number(), end: z.number() });

export const filmRun = z.strictObject({
  run_id: runId,
  skill: z.enum(OWN_AGENT_SKILLS),
  state: z.string(),
  credits_reserved: z.number().int().nonnegative(),
  credits_charged: z.number().int().nonnegative().nullable(),
  warnings: z.array(z.string()),
  error: z.string().nullable(),
  stills: z.strictObject({ frames: z.array(filmStill), sheet_url: z.string().url().nullable(), refusals: z.array(z.string()) }).optional(),
  voice: z.strictObject({ duration_sec: z.number().positive(), film_sec: filmSec.optional(), words: z.array(filmWord), audio_url: z.string().url() }).optional(),
  film: z.strictObject({ video_url: z.string().url(), duration_sec: z.number().positive(),
    thumbnail_url: z.string().url().nullable().default(null) }).optional(),
  hero: z.strictObject({ mascot_id: assetId, poses: z.array(z.enum(MASCOT_POSES)), character: z.string().nullable(),
    sheet_url: z.string().url().nullable().default(null) }).optional(),
  take_frames: z.strictObject({ fps: z.number().int().positive(), frames: z.number().int().positive(),
    sheets: z.array(z.strictObject({ image_url: z.string().url(), from: z.number().min(0), to: z.number().min(0), frames: z.number().int().positive() })),
    shots: z.array(takeMotionWindow).optional()
      .describe("The stretches between cuts and whips in these seconds, each with its subject motion, camera move and camera shake: a reference's energy, shot by shot") })
    .optional(),
  take_check: takeCheckVerdict.optional(),
  next: diyNext.nullable().optional(),
  blocked: diyBlocked.nullable().optional(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
});
export type FilmRun = z.infer<typeof filmRun>;

export const isOwnAgentSkill = (skill: unknown): skill is (typeof OWN_AGENT_SKILLS)[number] =>
  typeof skill === "string" && (OWN_AGENT_SKILLS as readonly string[]).includes(skill);

export const OWN_VOICE_CEILING_LIMIT = OWN_VOICE_MAX_SECONDS;
