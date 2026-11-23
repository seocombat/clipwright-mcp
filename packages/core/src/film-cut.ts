import { z } from "zod";
import { assetId } from "./asset-identity.js";
import { cutId } from "./cut-ids.js";
import { diyNext } from "./diy-next.js";
import { FACELESS_BEAT_KINDS, FACELESS_CAMERA_MOVES, FACELESS_CUT_LOOKS, FACELESS_SHOT_SIZES, FACELESS_SPEEDS } from "./faceless-direction-summary.js";
import { filmLookDescription, filmLookTag } from "./film-look.js";
import { maxCreditsField } from "./max-credits.js";
import { OWN_CUT_MAX_BEATS } from "./own-agent-price.js";
import { runId } from "./runs.js";
import { uploadId } from "./uploads.js";


export const FILM_CUT_CHECK_PATH = "/v1/film-cuts/check";
export const FILM_CUTS_QUOTE_PATH = "/v1/film-cuts/quote";
export const FILM_CUTS_PATH = "/v1/film-cuts";
export const CUT_PREVIEWS_QUOTE_PATH = "/v1/cut-previews/quote";
export const CUT_PREVIEWS_PATH = "/v1/cut-previews";
export const FILM_CUT_FORMATS = ["story", "list", "own_pictures", "cartoon"] as const;
export const FILM_CUT_METHODS = ["story", "horror", "list", "how_to", "history", "cartoon"] as const;
export const FILM_CUT_SYNTH_SOUNDS = ["sub_boom", "heartbeat", "pop", "slap", "whoosh", "tick", "ding", "boing", "thud"] as const;
export const FILM_CUT_BED_RECIPES = ["drone_low", "wind_dark", "room_tone", "tick_pulse"] as const;
export const FILM_CUT_HOLDS = ["ending", "read_text", "reveal"] as const;
export const CUT_MAX_QUIET_SEC = 3;
export const CUT_PREVIEW_MAX_STILLS = 24;

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/u, "lowercase letters, digits, - and _, at most 32, starting with a letter or digit");
const word = z.number().int().nonnegative().max(5000);
const words = z.tuple([word, word]).refine(([first, last]) => last >= first, "the last word comes at or after the first")
  .describe("Words of the voice as [first, last], both included: indexes into make_voice's words, 0 for the first");
const line = (most: number) => z.string().trim().min(1).max(most);
const why = line(300).describe("Why: what this choice does for the viewer");
const clipSecond = z.number().min(0).max(60);
const share = z.number().min(0).max(1);

const oneOf = (ref: Record<string, unknown>, keys: readonly string[]) => keys.filter(key => ref[key] !== undefined).length === 1;
export const filmCutPicture = z.strictObject({
  run_id: runId.optional().describe("A delivered generate_image run of this account"),
  upload_id: uploadId.optional().describe("Instead of run_id: your upload; send rights_confirmed true with it"),
  rights_confirmed: z.boolean().optional().describe("With upload_id: true confirms you may use the picture"),
  asset_id: assetId.optional().describe("Instead of run_id: an image asset of this account"),
}).refine(ref => oneOf(ref, ["run_id", "upload_id", "asset_id"]), "name the picture by run_id, upload_id or asset_id, one of them");
const clipRef = {
  run_id: runId.optional().describe("A delivered generate_video run of this account"),
  asset_id: assetId.optional().describe("Instead of run_id: a video asset of this account"),
};
const ONE_CLIP = "name the clip by run_id or by asset_id, one of them";

export const filmCutSound = z.union([
  z.strictObject({ synth: z.enum(FILM_CUT_SYNTH_SOUNDS).describe("A drawn sound") }),
  z.strictObject({ kept: line(80).describe("One of your kept sounds, by its exact name (get_film_guide kept_sounds)") }),
  z.strictObject({ file: z.string().regex(/^[a-z]+__[a-z0-9_]+$/u).describe("A catalogue sound as beat__name (list_template_sounds)") }),
  z.strictObject({ describe: line(200).describe("What it should sound like, one event: \"a wooden shutter creaks open\"") }),
]);
export const FILM_CUT_BED_RULE = "a bed is a recipe or a description; kept sounds are short effects";
export const filmCutBed = z.union([
  z.strictObject({ recipe: z.enum(FILM_CUT_BED_RECIPES).describe("A drawn ambience") }),
  z.strictObject({ describe: line(200).describe("What the ambience sounds like: \"a looping night wind through dry grass\"; never music") }),
], { error: `${FILM_CUT_BED_RULE}: send { recipe } or { describe }` });

const beat = z.strictObject({
  id: id.describe("The beat's name, unique in the cut"),
  words: words.nullable().describe("The words it plays on; null only on the cold open, which plays before the voice"),
  kind: z.enum(FACELESS_BEAT_KINDS).describe("live: a take; still_move, static_insert or customer_image: a picture or a held frame with a " +
    "camera move; card: a text card"),
  shot_size: z.enum(FACELESS_SHOT_SIZES).describe("How close the shot is, from ecu (extreme close-up) to ews (extreme wide)"),
  camera: z.strictObject({
    move: z.enum(FACELESS_CAMERA_MOVES), speed: z.enum(FACELESS_SPEEDS),
    from: z.number().min(1).max(2).describe("Scale at the start, 1 the whole frame"), to: z.number().min(1).max(2).describe("Scale at the end"),
    ease: z.enum(["linear", "ease_out", "ease_in_out"]),
  }).optional().describe("The move over a picture; every beat but a live one has one"),
  focus: z.strictObject({ x: share, y: share }).optional()
    .describe("Where a push, pull or punch-in closes, as shares of the picture's width and height from its top-left; the centre when omitted"),
  punch_ins: z.array(z.strictObject({ word, scale: z.number().min(1.1).max(2), hold_s: z.number().min(0.2).max(2) })).max(3).default([])
    .describe("Quick zooms on words of this beat"),
  priority: z.number().int().min(1).max(OWN_CUT_MAX_BEATS).default(20).describe("1 is the beat that matters most"),
  why,
  technique_ids: z.array(line(64)).min(1).max(6).describe("Short names of the techniques this beat uses"),
  text_visible: z.boolean().optional().describe("On a live beat: its frame shows readable text, a logo or a sign"),
  picture: filmCutPicture.optional().describe("The beat shows this picture with its camera move"),
  take: z.strictObject({ ...clipRef,
    action_s: clipSecond.describe("The second of the clip where its action lands"),
    action_word: word.describe("The word the action lands on; on the cold open, a word of the payoff"),
  }).refine(take => oneOf(take, ["run_id", "asset_id"]), ONE_CLIP).optional()
    .describe("The beat plays this clip; the window is placed so its action lands on action_word"),
  held_frame: z.strictObject({ ...clipRef, at_s: clipSecond.describe("The second of the clip whose frame is shown") })
    .refine(held => oneOf(held, ["run_id", "asset_id"]), ONE_CLIP).optional()
    .describe("The beat shows one frame of a clip as a still picture, with its camera move"),
  card: line(80).optional().describe("The beat is a text card with these words"),
  hold: z.enum(FILM_CUT_HOLDS).optional().describe(`Only on a beat that holds over ${CUT_MAX_QUIET_SEC} s with nothing landing: ending (it ` +
    "covers a word of the ending), read_text (a card, or a beat whose words carry an event with text) or reveal (a reveal left to sink in)"),
}).refine(one => oneOf(one, ["picture", "take", "held_frame", "card"]), "a beat shows exactly one of picture, take, held_frame or card");

export const filmCutInput = z.strictObject({
  format: z.enum(FILM_CUT_FORMATS).describe("The video: story, list (facts, tips or steps), own_pictures or cartoon"),
  look: filmLookTag.describe("The look you picked, by its tag from the guide's menu, or your own"),
  voice_run_id: runId.describe("A delivered make_voice run of this account: its words place every beat"),
  method: z.strictObject({
    kind: z.enum(FILM_CUT_METHODS),
    techniques: z.array(z.strictObject({ id: line(64), why })).min(3).max(24).describe("The techniques that shaped the video, each with why"),
  }),
  structure: z.strictObject({
    arc: line(240).describe("The story in one line"),
    hook: z.strictObject({
      kind: z.enum(["payoff_cold_open", "payoff_line"]).describe("payoff_cold_open shows the payoff before the voice; payoff_line says it first"),
      payoff_words: words.describe("The words of the payoff"),
      cold_open: z.strictObject({ beat: id.describe("The first beat"), seconds: z.number().min(0.3).max(1) }).nullable()
        .describe("With payoff_cold_open: the first beat, words null, shown this long before the voice"),
    }),
    loops: z.array(z.strictObject({ plant: word, pay: word })).max(3).default([])
      .describe("Open questions: the word that plants each and the later word that pays it off"),
    ending: z.strictObject({ kind: z.enum(["callback", "reveal", "call", "cut_to_black"]), words }),
  }),
  style: z.strictObject({
    look: filmLookDescription, light: line(300),
    palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/iu)).min(3).max(5).describe("3 to 5 colours as #rrggbb: cards and outlines take theirs from it"),
    effect_colours: line(240).describe("The colours of sparkles, glows and outlines, named"),
  }),
  beats: z.array(beat).min(2).max(OWN_CUT_MAX_BEATS).describe("The beats in order, covering every word of the voice once"),
  events: z.array(z.strictObject({ word, device: line(64).describe("The text's style: headline, badge, stamp or label; any other device draws a headline"),
    text: z.string().trim().max(40).optional().describe("Drawn as big text on its word, such as a number; without text the event is a timing note for sound"),
    why: line(160) })).max(160).default([])
    .describe("Drawn as big text on its word when it has text (device: headline, badge, stamp or label); without text it is a timing note for sound"),
  captions: z.strictObject({ on: z.boolean().default(true).describe("Burn the captions in; false for none"),
    accents: z.array(word).max(80).default([]).describe("The word of each caption phrase that carries its point") })
    .default({ on: true, accents: [] }),
  transitions: z.array(z.strictObject({ after_word: word.describe("A beat's last word"), look: z.enum(FACELESS_CUT_LOOKS) })).max(OWN_CUT_MAX_BEATS).default([])
    .describe("Cuts other than hard, after a beat's last word"),
  sound: z.strictObject({
    bed: filmCutBed.nullable().describe(`One ambience under the whole voice, or null; ${FILM_CUT_BED_RULE}`),
    hits: z.array(z.strictObject({ word: word.nullable().describe("null: the cold open"), sound: filmCutSound, why: line(160) })).max(12).default([])
      .describe("Hits on the key words"),
    sfx: z.array(z.strictObject({ word, sound: filmCutSound })).max(160).default([]).describe("One sound on an event's word"),
    take_sound: z.array(runId).max(16).optional().describe("Takes (generate_video run ids of this cut) whose own sound plays under them"),
    music: z.boolean().optional().describe("Music under the voice; the bed is then null"),
  }),
  breath: z.strictObject({ after_word: word, seconds: z.number().min(0.2).max(1) }).nullable().default(null)
    .describe("One pause in the voice after the main reveal's word, with motion through it"),
  pairing: z.array(z.strictObject({
    picture: filmCutPicture,
    anchored: words.optional().describe("The words the user tied the picture to, when they did"),
    shown: words.describe("The words it is shown on"),
    why,
  })).max(60).default([]).describe("Your own pictures moved off the words the user tied them to, each with why"),
  callouts: z.array(z.strictObject({
    beat: id.describe("A picture or held_frame beat"), word: word.describe("The word it appears on, inside the beat's words"),
    shape: z.enum(["oval", "rounded"]),
    box: z.strictObject({ x: share, y: share, w: share, h: share }).refine(box => box.x + box.w <= 1 + 1e-9 && box.y + box.h <= 1 + 1e-9,
      "the box stays inside the picture").describe("The object's box as shares of the picture: x, y from the top-left, w, h"),
  })).max(24).optional().describe("Outlines round a whole object on a picture"),
  overrides: z.array(z.strictObject({ check: line(64), why })).max(12).default([])
    .describe("Advice you keep your choice against, each by its check name with why"),
  cut_id: cutId.optional().describe("The cut record this sheet belongs to (create_cut)"),
});
export type FilmCutInput = z.infer<typeof filmCutInput>;
export type FilmCutRequest = z.input<typeof filmCutInput>;
export const filmCutRunInput = filmCutInput.extend({ cut_id: cutId.describe("The cut record this video belongs to (create_cut)"),
  max_credits: maxCreditsField });
export type FilmCutRunInput = z.infer<typeof filmCutRunInput>;
export type FilmCutRunRequest = z.input<typeof filmCutRunInput>;

export const filmCutPreviewInput = filmCutInput.extend({
  cut_id: cutId.describe("The cut record this sheet belongs to (create_cut)"),
  at: z.array(word).min(1).max(CUT_PREVIEW_MAX_STILLS).refine(list => new Set(list).size === list.length, "each word is asked once")
    .describe(`Up to ${CUT_PREVIEW_MAX_STILLS} words of the voice, by index: each still shows the composed frame just after its word starts, ` +
      "with the captions, text, outlines and camera as the video draws them"),
  max_credits: maxCreditsField,
});
export type FilmCutPreviewInput = z.infer<typeof filmCutPreviewInput>;
export type FilmCutPreviewRequest = z.input<typeof filmCutPreviewInput>;

export const FILM_CUT_SOURCES = ["picture", "take", "held_frame", "card"] as const;
export const filmCutCheck = z.strictObject({
  ok: z.boolean(),
  refusals: z.array(z.strictObject({ path: z.string(), message: z.string() })),
  advice: z.array(z.strictObject({ check: z.string(), message: z.string() })),
  plan: z.strictObject({
    output_sec: z.number().nonnegative(),
    shots: z.array(z.strictObject({ beat: z.string(), source: z.enum(FILM_CUT_SOURCES), from_sec: z.number().nonnegative(), to_sec: z.number().nonnegative(),
      clip: z.strictObject({ from_sec: z.number().nonnegative(), to_sec: z.number().nonnegative(), rate: z.number().positive() }).optional() })),
    live_sec: z.number().nonnegative(),
  }).nullable(),
  warnings: z.array(z.string()),
  next: diyNext.optional().describe("A passed sheet: its quote_cut; a refused sheet: check_cut again, add naming the fields to fix"),
});
export type FilmCutCheck = z.infer<typeof filmCutCheck>;
