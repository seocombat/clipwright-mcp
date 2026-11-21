import { z } from "zod";
import { FACELESS_EXPLAINER_POSE_PICTURES } from "./faceless-price.js";
import { FILM_MUSIC_BED_CREDITS, MUSIC_BED_CREDITS } from "./music.js";

// The «own agent» tariff (#1291 F2): your agent writes the film; Clipwright sells its stills, voice with word timings, render and hero. Prices
// are frozen per run at admission, and only delivered work is charged.

/** The tariff runs are admitted on now: the first stills of a draft in a rolling day are free on it (#1369). */
export const OWN_AGENT_TARIFF = "own-agent-v2";
/** The tariff of runs admitted before free stills: every still charged. */
export const OWN_AGENT_TARIFF_V1 = "own-agent-v1";
/** The run skills of the mode, each with its own unit. */
export const OWN_AGENT_SKILLS = ["film_stills", "film_voice", "film_render", "film_hero", "film_edit", "film_take_frames", "film_take_check",
  "film_cut", "film_cut_preview"] as const;
export type OwnAgentSkill = (typeof OWN_AGENT_SKILLS)[number];

/** One still the agent saw, past the free ones. */
export const OWN_STILL_CREDITS = 1;
/** Stills of one draft, and preview stills of one account across its cut records, that are free in any rolling window of this many hours; a
 *  still past them is charged. */
export const OWN_FREE_STILLS = 120, OWN_FREE_STILLS_WINDOW_HOURS = 24;
/** A rendered film up to OWN_FILM_INCLUDED_SECONDS, then each second over it. */
export const OWN_FILM_RENDER_CREDITS = 100, OWN_FILM_INCLUDED_SECONDS = 60, OWN_FILM_EXTRA_SECOND_CREDITS = 2;
/** A second of delivered voice, rounded up once per take. */
export const OWN_VOICE_CREDITS_PER_SECOND = 2;
/** The bounds a run may ask: stills per call, the longest film and take. */
export const OWN_STILLS_MAX_PER_CALL = 24, OWN_FILM_MAX_SECONDS = 120, OWN_VOICE_MAX_SECONDS = 120;
/** Up to this many stills come one picture each; a round of more always comes with a sheet (#1372). */
export const OWN_STILLS_SINGLE_MAX = 8;
/** A hero's published pose picture (#1692; 7 on runs admitted before), and the poses a hero is made of. */
export const OWN_HERO_POSE_CREDITS = 9, OWN_HERO_POSES = FACELESS_EXPLAINER_POSE_PICTURES;
/** A head with every sprite saved (make_film_hero head), once per head. */
export const OWN_HERO_HEAD_CREDITS = 120;
/** Heads of one account that may fail in a trailing day before another is refused: each failure can have paid its pictures. */
export const OWN_HEAD_FAILED_PER_DAY = 3;
/** A published talking sprite of a sprite hero (a whole sprite hero: 81 + 12 × 8 = 177), priced only while sprite heroes are offered. */
export const OWN_HERO_SPRITE_CREDITS = 8;
/** The poses of a sprite hero that talk, each with its mouth half and open and a blink; the rest do not talk. */
export const OWN_HERO_TALKING_POSES = ["neutral", "palm", "point", "up"] as const;
export const OWN_HERO_MAX_SPRITES = OWN_HERO_TALKING_POSES.length * 3;
/** An edit of the account's own clips, voice and captions into one cut, charged once per delivered cut up to OWN_EDIT_MAX_SECONDS long. */
export const OWN_EDIT_CREDITS = 10, OWN_EDIT_MAX_SECONDS = 60;
/** A take's frames on contact sheets (take_frames): free, at most this many frames a call, and this many calls an account starts an hour. */
export const OWN_TAKE_FRAMES_MAX = 96, TAKE_FRAMES_PER_HOUR = 60, TAKE_FRAMES_WINDOW_SECONDS = 3600;
/** Checks against a picture an account starts an hour, in the same window; working number. */
export const TAKE_PICTURE_CHECKS_PER_HOUR = 30;
/** Checks against a prompt (motion) an account starts an hour, in the same window, counted apart from those against a picture. */
export const TAKE_MOTION_CHECKS_PER_HOUR = 30;
/** Heroes (make_film_hero, new or completing a mascot) an account starts an hour, in the same window; working number. */
export const HERO_RUNS_PER_HOUR = 10;
/** Hero poses published and not charged (a still mouth, a face not read) an account receives in a trailing window; past it, no new hero (#1735). */
export const OWN_HERO_FREE_POSES_PER_DAY = 27;
export const OWN_HERO_FREE_POSES_WINDOW_HOURS = 24;
/** preview_cut runs an account starts an hour, in the same window, whatever their stills cost; working number. */
export const CUT_PREVIEWS_PER_HOUR = 20;
/** render_cut runs an account may have queued or rendering at once; past it, a start is refused before any charge. */
export const CUTS_IN_FLIGHT_PER_ACCOUNT = 4;
export const CUT_BUSY_RETRY_SECONDS = 120;
/** A take judged frame by frame against its direction (check_take), charged once per delivered verdict. */
export const OWN_TAKE_CHECK_CREDITS = 10;
/** A take judged against the picture it was made from (check_take against picture), once per delivered verdict; working number. */
export const OWN_TAKE_CHECK_PICTURE_CREDITS = 20;
/** The same check on a long take, one past TAKE_PICTURE_SHORT_TIER_SECONDS, the longest take at the short price; working number. */
export const OWN_TAKE_CHECK_PICTURE_LONG_CREDITS = 38, TAKE_PICTURE_SHORT_TIER_SECONDS = 4.1;
/** A faceless cut (render_cut) up to OWN_CUT_INCLUDED_SECONDS, each second over it, and the longest cut; working numbers, the owner decides. */
export const OWN_CUT_CREDITS = 45, OWN_CUT_INCLUDED_SECONDS = 60, OWN_CUT_EXTRA_SECOND_CREDITS = 1, OWN_CUT_MAX_SECONDS = 90;
/** The shortest cut the directed composition draws (250 frames at 25 fps). */
export const OWN_CUT_MIN_SECONDS = 10;
/** A described bed, once per cut whatever its length (owner, 16.11): one made bed loops under the whole voice. A drawn (recipe) bed is free. */
export const OWN_CUT_BED_CREDITS = 35;
/** A listed take's own sound, per second of the whole take: its sound is made over the whole take, each take rounded up once; working number. */
export const OWN_CUT_TAKE_SOUND_CREDITS_PER_SECOND = 4;
/** Newly described sounds a cut includes; one more is refused before money. */
export const OWN_CUT_MAX_NEW_SOUNDS = 8;
/** The beats of one cut sheet and the slots of a cut record: a 90 s video with a new shot about every second. */
export const OWN_CUT_MAX_BEATS = 96;
/** The distinct sources (pictures and clips) one cut may name, and the most their stored bytes and the voice's may add up to. */
export const OWN_CUT_MAX_SOURCES = 96, OWN_CUT_MAX_SOURCE_BYTES = 1_000_000_000;
/** The paid parts of a cut beside its length: a described bed, its listed takes' own sound in whole-take seconds, music. */
export const ownCutParts = z.strictObject({ bed: z.boolean(), take_sound_seconds: z.number().nonnegative(), music: z.boolean() });
export type OwnCutParts = z.infer<typeof ownCutParts>;

/** The prices a run's admission freezes; a run settles by its snapshot, never by today's constants. */
export const ownAgentTerms = z.strictObject({
  tariff: z.enum([OWN_AGENT_TARIFF_V1, OWN_AGENT_TARIFF]),
  still_credits: z.number().int().nonnegative(),
  render_credits: z.number().int().nonnegative(),
  included_seconds: z.number().int().positive(),
  extra_second_credits: z.number().int().nonnegative(),
  voice_credits_per_second: z.number().int().nonnegative(),
  /** A published hero pose; absent on terms frozen before the hero was sold, and a hero run without it is never charged. */
  pose_credits: z.number().int().nonnegative().optional(),
  /** A saved head with every sprite; absent on terms frozen before heads were sold, which price none. */
  head_credits: z.number().int().nonnegative().optional(),
  /** A published talking sprite; present only on terms frozen while sprite heroes are offered, and a hero admitted without it has no sprites. */
  sprite_credits: z.number().int().nonnegative().optional(),
  /** A delivered edit; absent on terms frozen before the edit was sold, and an edit run without it is never charged. */
  edit_credits: z.number().int().nonnegative().optional(),
  /** Music made for an edit and carried by the delivered cut; absent on terms frozen before it was sold, which price none. A library bed is free. */
  music_credits: z.number().int().nonnegative().optional(),
  /** The same for a film (render_film), its own price; absent on terms frozen before it was sold, which price none. */
  film_music_credits: z.number().int().nonnegative().optional(),
  /** A delivered take verdict; absent on terms frozen before the check was sold, and a check run without it is never charged. */
  take_check_credits: z.number().int().nonnegative().optional(),
  /** A delivered verdict against a picture; absent on terms frozen before it was sold, which price none. */
  picture_check_credits: z.number().int().nonnegative().optional(),
  /** The same verdict on a take longer than TAKE_PICTURE_SHORT_TIER_SECONDS; absent, every picture check is at picture_check_credits. */
  picture_check_long_credits: z.number().int().nonnegative().optional(),
  /** A delivered cut and its paid parts; absent on terms frozen before the cut was sold, and a cut run without them is never charged. */
  cut_credits: z.number().int().nonnegative().optional(),
  cut_included_seconds: z.number().int().positive().optional(),
  cut_extra_second_credits: z.number().int().nonnegative().optional(),
  /** A described bed, once per cut. */
  cut_bed_credits: z.number().int().nonnegative().optional(),
  cut_take_sound_credits_per_second: z.number().int().nonnegative().optional(),
  cut_music_credits: z.number().int().nonnegative().optional(),
  /** A draft's free stills and their rolling window: present exactly on the tariff that has them. */
  free_stills: z.number().int().nonnegative().optional(),
  free_stills_window_hours: z.number().int().positive().optional(),
}).refine(t => (t.tariff === OWN_AGENT_TARIFF) === (t.free_stills !== undefined) && (t.free_stills === undefined) === (t.free_stills_window_hours === undefined),
  `free stills come with their window, and only on ${OWN_AGENT_TARIFF}`)
  .refine(t => new Set(CUT_TERMS.map(key => t[key] === undefined)).size === 1, "a cut's prices come all together or not at all");
export type OwnAgentTerms = z.infer<typeof ownAgentTerms>;
const CUT_TERMS = ["cut_credits", "cut_included_seconds", "cut_extra_second_credits", "cut_bed_credits", "cut_take_sound_credits_per_second",
  "cut_music_credits"] as const;

export const ownAgentTermsNow = (options: { sprites?: boolean } = {}): OwnAgentTerms => ({ tariff: OWN_AGENT_TARIFF, still_credits: OWN_STILL_CREDITS,
  render_credits: OWN_FILM_RENDER_CREDITS,
  included_seconds: OWN_FILM_INCLUDED_SECONDS, extra_second_credits: OWN_FILM_EXTRA_SECOND_CREDITS, voice_credits_per_second: OWN_VOICE_CREDITS_PER_SECOND,
  pose_credits: OWN_HERO_POSE_CREDITS, head_credits: OWN_HERO_HEAD_CREDITS, ...(options.sprites ? { sprite_credits: OWN_HERO_SPRITE_CREDITS } : {}),
  edit_credits: OWN_EDIT_CREDITS, music_credits: MUSIC_BED_CREDITS, film_music_credits: FILM_MUSIC_BED_CREDITS,
  take_check_credits: OWN_TAKE_CHECK_CREDITS,
  picture_check_credits: OWN_TAKE_CHECK_PICTURE_CREDITS, picture_check_long_credits: OWN_TAKE_CHECK_PICTURE_LONG_CREDITS, free_stills: OWN_FREE_STILLS, free_stills_window_hours: OWN_FREE_STILLS_WINDOW_HOURS, cut_credits: OWN_CUT_CREDITS, cut_included_seconds: OWN_CUT_INCLUDED_SECONDS,
  cut_extra_second_credits: OWN_CUT_EXTRA_SECOND_CREDITS, cut_bed_credits: OWN_CUT_BED_CREDITS,
  cut_take_sound_credits_per_second: OWN_CUT_TAKE_SOUND_CREDITS_PER_SECOND, cut_music_credits: MUSIC_BED_CREDITS });

/** Whether the mode is offered. */
export const isOwnAgentEnabled = (env: Readonly<Record<string, string | undefined>>): boolean => env.CLIPWRIGHT_OWN_AGENT === "1";
/** Whether make_film_hero draws a head from a photo. */
export const isFilmHeadEnabled = (env: Readonly<Record<string, string | undefined>>): boolean => env.CLIPWRIGHT_FILM_HEAD === "1";
/** Whether a new hero's talking poses get mouth and blink sprites, priced by the frozen terms. */
export const isHeroSpritesEnabled = (env: Readonly<Record<string, string | undefined>>): boolean => env.CLIPWRIGHT_HERO_SPRITES === "1";

const seconds = (s: number, max: number, what: string): number => {
  if (!Number.isFinite(s) || s <= 0 || s > max) throw new Error(`${what} of ${s} s is outside 0–${max} s`);
  return Math.ceil(s - 1e-9);
};
const frames = (n: number): number => {
  if (!Number.isSafeInteger(n) || n < 0 || n > OWN_STILLS_MAX_PER_CALL) throw new Error(`${n} stills is outside 0–${OWN_STILLS_MAX_PER_CALL}`);
  return n;
};

/** A film of `s` seconds: the base, each started second over the included length, and with `music` the track made for it. */
export function ownFilmRenderCredits(s: number, terms: OwnAgentTerms = ownAgentTermsNow(), music = false): number {
  const film = terms.render_credits + terms.extra_second_credits * Math.max(0, seconds(s, OWN_FILM_MAX_SECONDS, "a film") - terms.included_seconds);
  if (music && terms.film_music_credits === undefined) throw new Error("these terms price no film music");
  return film + (music ? terms.film_music_credits! : 0);
}
/** A take of `s` seconds, rounded up once. */
export const ownVoiceCredits = (s: number, terms: OwnAgentTerms = ownAgentTermsNow()): number =>
  terms.voice_credits_per_second * seconds(s, OWN_VOICE_MAX_SECONDS, "a take");
/** `n` delivered stills, the first `free` of them granted free when the run was admitted; terms without free stills grant none. */
export function ownStillsCredits(n: number, terms: OwnAgentTerms = ownAgentTermsNow(), free = 0): number {
  if (!Number.isSafeInteger(free) || free < 0 || free > (terms.free_stills ?? 0))
    throw new Error(`${free} free stills is outside these terms`);
  return terms.still_credits * Math.max(0, frames(n) - free);
}
/** `n` published hero poses and `sprites` published talking sprites, or with `head` one saved head; terms that price none of them price none. */
export function ownHeroCredits(n: number, terms: OwnAgentTerms = ownAgentTermsNow(), sprites = 0, head = false): number {
  if (head) {
    if (terms.head_credits === undefined) throw new Error("these terms price no head");
    if (n !== 0 && n !== 1) throw new Error(`${n} heads is outside 0–1`);
    return terms.head_credits * n;
  }
  if (!Number.isSafeInteger(n) || n < 0 || n > OWN_HERO_POSES) throw new Error(`${n} poses is outside 0–${OWN_HERO_POSES}`);
  if (terms.pose_credits === undefined) throw new Error("these terms price no hero pose");
  if (!Number.isSafeInteger(sprites) || sprites < 0 || sprites > OWN_HERO_MAX_SPRITES) throw new Error(`${sprites} sprites is outside 0–${OWN_HERO_MAX_SPRITES}`);
  if (sprites > 0 && terms.sprite_credits === undefined) throw new Error("these terms price no sprite");
  return terms.pose_credits * n + (terms.sprite_credits ?? 0) * sprites;
}

/** An edit of `s` seconds: one flat price up to the longest edit, and with `music` the track made for it on top; terms that price no edit, or
 *  no music when it is asked, price none. The quote, the hold and the charge all come from here. */
export function ownEditCredits(s: number, terms: OwnAgentTerms = ownAgentTermsNow(), music = false): number {
  seconds(s, OWN_EDIT_MAX_SECONDS, "an edit");
  if (terms.edit_credits === undefined) throw new Error("these terms price no edit");
  if (music && terms.music_credits === undefined) throw new Error("these terms price no music");
  return terms.edit_credits + (music ? terms.music_credits! : 0);
}

/** What a run of the mode delivered; a failed run delivered nothing, and is charged nothing. */
export type OwnAgentDelivery =
  /** `free`: the stills granted free when the run was admitted; absent, none. */
  | { skill: "film_stills"; frames: number; free?: number }
  /** A cut's preview stills, priced as a draft's stills; `free`, the ones its admission granted free out of the account's allowance. */
  | { skill: "film_cut_preview"; frames: number; free?: number }
  | { skill: "film_voice"; seconds: number }
  /** `music`: the delivered film carries a track made for it; a library bed is free and never sets it. */
  | { skill: "film_render"; seconds: number; music?: boolean }
  | { skill: "film_hero"; poses: number; sprites?: number; head?: boolean }
  /** `music`: the delivered cut carries a track made for it; a library bed is free and never sets it. */
  | { skill: "film_edit"; seconds: number; music?: boolean }
  /** `sheets`: the contact sheets drawn; free. */
  | { skill: "film_take_frames"; sheets: number }
  /** `checks`: one a run; `against`: the mode admission froze, motion when absent; `long`: admission found the take long, if it said. */
  | { skill: "film_take_check"; checks: number; against?: "motion" | "picture"; long?: boolean }
  /** `seconds`: the cut's length; the parts it delivered beside it. */
  | ({ skill: "film_cut"; seconds: number } & OwnCutParts);

/** A cut of `seconds` with its parts: the base up to the included length, each started second over it, a described bed once, each second of
 *  listed takes' own sound (whole takes, each already rounded up), and music; terms that price no cut price none. */
export function ownCutCredits(cut: { seconds: number } & OwnCutParts, terms: OwnAgentTerms = ownAgentTermsNow()): number {
  const s = seconds(cut.seconds, OWN_CUT_MAX_SECONDS, "a cut");
  if (terms.cut_credits === undefined) throw new Error("these terms price no cut");
  if (!Number.isFinite(cut.take_sound_seconds) || cut.take_sound_seconds < 0) throw new Error(`${cut.take_sound_seconds} s of take sound is not a length`);
  return terms.cut_credits + terms.cut_extra_second_credits! * Math.max(0, s - terms.cut_included_seconds!) + (cut.bed ? terms.cut_bed_credits! : 0)
    + terms.cut_take_sound_credits_per_second! * Math.ceil(cut.take_sound_seconds - 1e-9) + (cut.music ? terms.cut_music_credits! : 0);
}

/** `n` take verdicts of the mode `against`, a `long` take checked against its picture at the long price if the terms have it. */
export function ownTakeCheckCredits(n: number, terms: OwnAgentTerms = ownAgentTermsNow(), against: "motion" | "picture" = "motion",
  long = false): number {
  if (n !== 0 && n !== 1) throw new Error(`${n} take verdicts is outside 0–1`);
  const longPrice = against === "picture" && long && terms.picture_check_long_credits !== undefined;
  const unit = longPrice ? terms.picture_check_long_credits : against === "picture" ? terms.picture_check_credits : terms.take_check_credits;
  if (unit === undefined) throw new Error(against === "picture" ? "these terms price no picture check" : "these terms price no take check");
  return unit * n;
}
/** Contact sheets of a take: free under every terms, within the most one call draws. */
export function ownTakeFramesCredits(sheets: number): number {
  if (!Number.isSafeInteger(sheets) || sheets < 0 || sheets > OWN_TAKE_FRAMES_MAX) throw new Error(`${sheets} sheets is outside 0–${OWN_TAKE_FRAMES_MAX}`);
  return 0;
}

/** The charge for a delivery under the run's frozen terms, never above what admission held: a measure past the hold is a defect, not a bill. */
export function ownAgentCharge(delivery: OwnAgentDelivery, terms: OwnAgentTerms, heldCredits: number): number {
  const charge = delivery.skill === "film_stills" || delivery.skill === "film_cut_preview" ? ownStillsCredits(delivery.frames, terms, delivery.free)
    : delivery.skill === "film_voice" ? ownVoiceCredits(delivery.seconds, terms)
    : delivery.skill === "film_hero" ? ownHeroCredits(delivery.poses, terms, delivery.sprites ?? 0, delivery.head === true)
    : delivery.skill === "film_edit" ? ownEditCredits(delivery.seconds, terms, delivery.music === true)
    : delivery.skill === "film_take_frames" ? ownTakeFramesCredits(delivery.sheets)
    : delivery.skill === "film_take_check" ? ownTakeCheckCredits(delivery.checks, terms, delivery.against, delivery.long === true)
    : delivery.skill === "film_cut" ? ownCutCredits(delivery, terms) : ownFilmRenderCredits(delivery.seconds, terms, delivery.music === true);
  if (!Number.isSafeInteger(heldCredits) || charge > heldCredits) throw new Error(`${delivery.skill} charge ${charge} is over its hold ${heldCredits}`);
  return charge;
}
