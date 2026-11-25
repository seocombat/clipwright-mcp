import { z } from "zod";
import { FACELESS_EXPLAINER_POSE_PICTURES } from "./faceless-price.js";
import { FILM_MUSIC_BED_CREDITS, MUSIC_BED_CREDITS } from "./music.js";

export const OWN_AGENT_TARIFF = "own-agent-v2";
export const OWN_AGENT_TARIFF_V1 = "own-agent-v1";
export const OWN_AGENT_SKILLS = ["film_stills", "film_voice", "film_render", "film_hero", "film_edit", "film_take_frames", "film_take_check",
  "film_cut", "film_cut_preview"] as const;
export type OwnAgentSkill = (typeof OWN_AGENT_SKILLS)[number];

export const OWN_STILL_CREDITS = 1;
export const OWN_FREE_STILLS = 120, OWN_FREE_STILLS_WINDOW_HOURS = 24;
export const OWN_FILM_RENDER_CREDITS = 100, OWN_FILM_INCLUDED_SECONDS = 60, OWN_FILM_EXTRA_SECOND_CREDITS = 2;
export const OWN_VOICE_CREDITS_PER_SECOND = 1;
export const OWN_VOICE_FLOOR_CHARS_PER_SECOND = 25;
export const OWN_STILLS_MAX_PER_CALL = 24, OWN_FILM_MAX_SECONDS = 120, OWN_VOICE_MAX_SECONDS = 455;
export const OWN_STILLS_SINGLE_MAX = 8;
export const OWN_HERO_POSE_CREDITS = 9, OWN_HERO_POSES = FACELESS_EXPLAINER_POSE_PICTURES;
export const OWN_HERO_HEAD_CREDITS = 120;
export const OWN_HEAD_FAILED_PER_DAY = 3;
export const OWN_HERO_SPRITE_CREDITS = 8;
export const OWN_HERO_TALKING_POSES = ["neutral", "palm", "point", "up"] as const;
export const OWN_HERO_MAX_SPRITES = OWN_HERO_TALKING_POSES.length * 3;
export const OWN_EDIT_CREDITS = 10, OWN_EDIT_MAX_SECONDS = 60;
export const OWN_TAKE_FRAMES_MAX = 96, TAKE_FRAMES_PER_HOUR = 60, TAKE_FRAMES_WINDOW_SECONDS = 3600;
export const TAKE_PICTURE_CHECKS_PER_HOUR = 30;
export const TAKE_MOTION_CHECKS_PER_HOUR = 30;
export const HERO_RUNS_PER_HOUR = 10;
export const OWN_HERO_FREE_POSES_PER_DAY = 27;
export const OWN_HERO_FREE_POSES_WINDOW_HOURS = 24;
export const CUT_PREVIEWS_PER_HOUR = 20;
export const CUTS_IN_FLIGHT_PER_ACCOUNT = 4;
export const CUT_BUSY_RETRY_SECONDS = 120;
export const VOICES_IN_FLIGHT_PER_ACCOUNT = 2;
export const VOICE_BUSY_RETRY_SECONDS = 60;
export const OWN_TAKE_CHECK_CREDITS = 10;
export const OWN_TAKE_CHECK_PICTURE_CREDITS = 20;
export const OWN_TAKE_CHECK_PICTURE_LONG_CREDITS = 38, TAKE_PICTURE_SHORT_TIER_SECONDS = 4.1;
export const OWN_CUT_CREDITS = 45, OWN_CUT_INCLUDED_SECONDS = 60, OWN_CUT_EXTRA_SECOND_CREDITS = 1, OWN_CUT_MAX_SECONDS = 90;
export const OWN_CUT_MIN_SECONDS = 10;
export const OWN_CUT_BED_CREDITS = 35;
export const OWN_CUT_TAKE_SOUND_CREDITS_PER_SECOND = 4;
export const OWN_CUT_MAX_NEW_SOUNDS = 8;
export const OWN_CUT_MAX_BEATS = 96;
export const OWN_CUT_MAX_SOURCES = 96, OWN_CUT_MAX_SOURCE_BYTES = 1_000_000_000;
export const ownCutParts = z.strictObject({ bed: z.boolean(), take_sound_seconds: z.number().nonnegative(), music: z.boolean() });
export type OwnCutParts = z.infer<typeof ownCutParts>;

export const ownAgentTerms = z.strictObject({
  tariff: z.enum([OWN_AGENT_TARIFF_V1, OWN_AGENT_TARIFF]),
  still_credits: z.number().int().nonnegative(),
  render_credits: z.number().int().nonnegative(),
  included_seconds: z.number().int().positive(),
  extra_second_credits: z.number().int().nonnegative(),
  voice_credits_per_second: z.number().int().nonnegative(),
  voice_floor_chars_per_second: z.number().int().positive().optional(),
  pose_credits: z.number().int().nonnegative().optional(),
  head_credits: z.number().int().nonnegative().optional(),
  sprite_credits: z.number().int().nonnegative().optional(),
  edit_credits: z.number().int().nonnegative().optional(),
  music_credits: z.number().int().nonnegative().optional(),
  film_music_credits: z.number().int().nonnegative().optional(),
  take_check_credits: z.number().int().nonnegative().optional(),
  picture_check_credits: z.number().int().nonnegative().optional(),
  picture_check_long_credits: z.number().int().nonnegative().optional(),
  cut_credits: z.number().int().nonnegative().optional(),
  cut_included_seconds: z.number().int().positive().optional(),
  cut_extra_second_credits: z.number().int().nonnegative().optional(),
  cut_bed_credits: z.number().int().nonnegative().optional(),
  cut_take_sound_credits_per_second: z.number().int().nonnegative().optional(),
  cut_music_credits: z.number().int().nonnegative().optional(),
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
  voice_floor_chars_per_second: OWN_VOICE_FLOOR_CHARS_PER_SECOND, pose_credits: OWN_HERO_POSE_CREDITS, head_credits: OWN_HERO_HEAD_CREDITS, ...(options.sprites ? { sprite_credits: OWN_HERO_SPRITE_CREDITS } : {}),
  edit_credits: OWN_EDIT_CREDITS, music_credits: MUSIC_BED_CREDITS, film_music_credits: FILM_MUSIC_BED_CREDITS,
  take_check_credits: OWN_TAKE_CHECK_CREDITS,
  picture_check_credits: OWN_TAKE_CHECK_PICTURE_CREDITS, picture_check_long_credits: OWN_TAKE_CHECK_PICTURE_LONG_CREDITS, free_stills: OWN_FREE_STILLS, free_stills_window_hours: OWN_FREE_STILLS_WINDOW_HOURS, cut_credits: OWN_CUT_CREDITS, cut_included_seconds: OWN_CUT_INCLUDED_SECONDS,
  cut_extra_second_credits: OWN_CUT_EXTRA_SECOND_CREDITS, cut_bed_credits: OWN_CUT_BED_CREDITS,
  cut_take_sound_credits_per_second: OWN_CUT_TAKE_SOUND_CREDITS_PER_SECOND, cut_music_credits: MUSIC_BED_CREDITS });

const seconds = (s: number, max: number, what: string): number => {
  if (!Number.isFinite(s) || s <= 0 || s > max) throw new Error(`${what} of ${s} s is outside 0–${max} s`);
  return Math.ceil(s - 1e-9);
};
const frames = (n: number): number => {
  if (!Number.isSafeInteger(n) || n < 0 || n > OWN_STILLS_MAX_PER_CALL) throw new Error(`${n} stills is outside 0–${OWN_STILLS_MAX_PER_CALL}`);
  return n;
};

export function ownFilmRenderCredits(s: number, terms: OwnAgentTerms = ownAgentTermsNow(), music = false): number {
  const film = terms.render_credits + terms.extra_second_credits * Math.max(0, seconds(s, OWN_FILM_MAX_SECONDS, "a film") - terms.included_seconds);
  if (music && terms.film_music_credits === undefined) throw new Error("these terms price no film music");
  return film + (music ? terms.film_music_credits! : 0);
}
export function ownVoiceCredits(s: number, terms: OwnAgentTerms = ownAgentTermsNow(), chars?: number): number {
  const bySeconds = terms.voice_credits_per_second * seconds(s, OWN_VOICE_MAX_SECONDS, "a take");
  return chars === undefined ? bySeconds : Math.max(bySeconds, ownVoiceFloorCredits(chars, terms));
}
export function ownVoiceFloorCredits(chars: number, terms: OwnAgentTerms = ownAgentTermsNow()): number {
  if (!Number.isSafeInteger(chars) || chars < 0) throw new Error(`${chars} characters is not a script length`);
  const per = terms.voice_floor_chars_per_second;
  return per === undefined ? 0 : terms.voice_credits_per_second * Math.ceil(chars / per);
}
export function ownStillsCredits(n: number, terms: OwnAgentTerms = ownAgentTermsNow(), free = 0): number {
  if (!Number.isSafeInteger(free) || free < 0 || free > (terms.free_stills ?? 0))
    throw new Error(`${free} free stills is outside these terms`);
  return terms.still_credits * Math.max(0, frames(n) - free);
}
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

export function ownEditCredits(s: number, terms: OwnAgentTerms = ownAgentTermsNow(), music = false): number {
  seconds(s, OWN_EDIT_MAX_SECONDS, "an edit");
  if (terms.edit_credits === undefined) throw new Error("these terms price no edit");
  if (music && terms.music_credits === undefined) throw new Error("these terms price no music");
  return terms.edit_credits + (music ? terms.music_credits! : 0);
}

export type OwnAgentDelivery =
  | { skill: "film_stills"; frames: number; free?: number }
  | { skill: "film_cut_preview"; frames: number; free?: number }
  | { skill: "film_voice"; seconds: number; chars?: number }
  | { skill: "film_render"; seconds: number; music?: boolean }
  | { skill: "film_hero"; poses: number; sprites?: number; head?: boolean }
  | { skill: "film_edit"; seconds: number; music?: boolean }
  | { skill: "film_take_frames"; sheets: number }
  | { skill: "film_take_check"; checks: number; against?: "motion" | "picture"; long?: boolean }
  | ({ skill: "film_cut"; seconds: number } & OwnCutParts);

export function ownCutCredits(cut: { seconds: number } & OwnCutParts, terms: OwnAgentTerms = ownAgentTermsNow()): number {
  const s = seconds(cut.seconds, OWN_CUT_MAX_SECONDS, "a cut");
  if (terms.cut_credits === undefined) throw new Error("these terms price no cut");
  if (!Number.isFinite(cut.take_sound_seconds) || cut.take_sound_seconds < 0) throw new Error(`${cut.take_sound_seconds} s of take sound is not a length`);
  return terms.cut_credits + terms.cut_extra_second_credits! * Math.max(0, s - terms.cut_included_seconds!) + (cut.bed ? terms.cut_bed_credits! : 0)
    + terms.cut_take_sound_credits_per_second! * Math.ceil(cut.take_sound_seconds - 1e-9) + (cut.music ? terms.cut_music_credits! : 0);
}

export function ownTakeCheckCredits(n: number, terms: OwnAgentTerms = ownAgentTermsNow(), against: "motion" | "picture" = "motion",
  long = false): number {
  if (n !== 0 && n !== 1) throw new Error(`${n} take verdicts is outside 0–1`);
  const longPrice = against === "picture" && long && terms.picture_check_long_credits !== undefined;
  const unit = longPrice ? terms.picture_check_long_credits : against === "picture" ? terms.picture_check_credits : terms.take_check_credits;
  if (unit === undefined) throw new Error(against === "picture" ? "these terms price no picture check" : "these terms price no take check");
  return unit * n;
}
export function ownTakeFramesCredits(sheets: number): number {
  if (!Number.isSafeInteger(sheets) || sheets < 0 || sheets > OWN_TAKE_FRAMES_MAX) throw new Error(`${sheets} sheets is outside 0–${OWN_TAKE_FRAMES_MAX}`);
  return 0;
}

export function ownAgentCharge(delivery: OwnAgentDelivery, terms: OwnAgentTerms, heldCredits: number): number {
  const charge = delivery.skill === "film_stills" || delivery.skill === "film_cut_preview" ? ownStillsCredits(delivery.frames, terms, delivery.free)
    : delivery.skill === "film_voice" ? ownVoiceCredits(delivery.seconds, terms, delivery.chars)
    : delivery.skill === "film_hero" ? ownHeroCredits(delivery.poses, terms, delivery.sprites ?? 0, delivery.head === true)
    : delivery.skill === "film_edit" ? ownEditCredits(delivery.seconds, terms, delivery.music === true)
    : delivery.skill === "film_take_frames" ? ownTakeFramesCredits(delivery.sheets)
    : delivery.skill === "film_take_check" ? ownTakeCheckCredits(delivery.checks, terms, delivery.against, delivery.long === true)
    : delivery.skill === "film_cut" ? ownCutCredits(delivery, terms) : ownFilmRenderCredits(delivery.seconds, terms, delivery.music === true);
  if (!Number.isSafeInteger(heldCredits) || charge > heldCredits) throw new Error(`${delivery.skill} charge ${charge} is over its hold ${heldCredits}`);
  return charge;
}
