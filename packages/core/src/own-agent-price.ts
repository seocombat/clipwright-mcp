import { z } from "zod";
import { FACELESS_EXPLAINER_POSE_PICTURES, FACELESS_IMAGE_CREDITS } from "./faceless-price.js";

// The «own agent» tariff (#1291 F2): your agent writes the film; Clipwright sells its stills, voice with word timings, render and hero. Prices
// are frozen per run at admission, and only delivered work is charged.

/** The tariff runs are admitted on now: the first stills of a draft in a rolling day are free on it (#1369). */
export const OWN_AGENT_TARIFF = "own-agent-v2";
/** The tariff of runs admitted before free stills: every still charged. */
export const OWN_AGENT_TARIFF_V1 = "own-agent-v1";
/** The run skills of the mode, each with its own unit. */
export const OWN_AGENT_SKILLS = ["film_stills", "film_voice", "film_render", "film_hero"] as const;
export type OwnAgentSkill = (typeof OWN_AGENT_SKILLS)[number];

/** One still the agent saw, past the free ones. */
export const OWN_STILL_CREDITS = 1;
/** Stills of one draft that are free in any rolling window of this many hours; a still past them is charged. */
export const OWN_FREE_STILLS = 120, OWN_FREE_STILLS_WINDOW_HOURS = 24;
/** A rendered film up to OWN_FILM_INCLUDED_SECONDS, then each second over it. */
export const OWN_FILM_RENDER_CREDITS = 100, OWN_FILM_INCLUDED_SECONDS = 60, OWN_FILM_EXTRA_SECOND_CREDITS = 2;
/** A second of delivered voice, rounded up once per take. */
export const OWN_VOICE_CREDITS_PER_SECOND = 2;
/** The bounds a run may ask: stills per call, the longest film and take. */
export const OWN_STILLS_MAX_PER_CALL = 24, OWN_FILM_MAX_SECONDS = 120, OWN_VOICE_MAX_SECONDS = 120;
/** Up to this many stills come one picture each; a round of more always comes with a sheet (#1372). */
export const OWN_STILLS_SINGLE_MAX = 8;
/** A hero's pose picture, priced as the done-for-you explainer's, and the poses a hero is made of. */
export const OWN_HERO_POSE_CREDITS = FACELESS_IMAGE_CREDITS, OWN_HERO_POSES = FACELESS_EXPLAINER_POSE_PICTURES;

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
  /** A draft's free stills and their rolling window: present exactly on the tariff that has them. */
  free_stills: z.number().int().nonnegative().optional(),
  free_stills_window_hours: z.number().int().positive().optional(),
}).refine(t => (t.tariff === OWN_AGENT_TARIFF) === (t.free_stills !== undefined) && (t.free_stills === undefined) === (t.free_stills_window_hours === undefined),
  `free stills come with their window, and only on ${OWN_AGENT_TARIFF}`);
export type OwnAgentTerms = z.infer<typeof ownAgentTerms>;

export const ownAgentTermsNow = (): OwnAgentTerms => ({ tariff: OWN_AGENT_TARIFF, still_credits: OWN_STILL_CREDITS, render_credits: OWN_FILM_RENDER_CREDITS,
  included_seconds: OWN_FILM_INCLUDED_SECONDS, extra_second_credits: OWN_FILM_EXTRA_SECOND_CREDITS, voice_credits_per_second: OWN_VOICE_CREDITS_PER_SECOND,
  pose_credits: OWN_HERO_POSE_CREDITS, free_stills: OWN_FREE_STILLS, free_stills_window_hours: OWN_FREE_STILLS_WINDOW_HOURS });

/** Whether the mode is offered. */
export const isOwnAgentEnabled = (env: Readonly<Record<string, string | undefined>>): boolean => env.CLIPWRIGHT_OWN_AGENT === "1";

const seconds = (s: number, max: number, what: string): number => {
  if (!Number.isFinite(s) || s <= 0 || s > max) throw new Error(`${what} of ${s} s is outside 0–${max} s`);
  return Math.ceil(s - 1e-9);
};
const frames = (n: number): number => {
  if (!Number.isSafeInteger(n) || n < 0 || n > OWN_STILLS_MAX_PER_CALL) throw new Error(`${n} stills is outside 0–${OWN_STILLS_MAX_PER_CALL}`);
  return n;
};

/** A film of `s` seconds: the base up to the included length, each started second over it on top. */
export const ownFilmRenderCredits = (s: number, terms: OwnAgentTerms = ownAgentTermsNow()): number =>
  terms.render_credits + terms.extra_second_credits * Math.max(0, seconds(s, OWN_FILM_MAX_SECONDS, "a film") - terms.included_seconds);
/** A take of `s` seconds, rounded up once. */
export const ownVoiceCredits = (s: number, terms: OwnAgentTerms = ownAgentTermsNow()): number =>
  terms.voice_credits_per_second * seconds(s, OWN_VOICE_MAX_SECONDS, "a take");
/** `n` delivered stills, the first `free` of them granted free when the run was admitted; terms without free stills grant none. */
export function ownStillsCredits(n: number, terms: OwnAgentTerms = ownAgentTermsNow(), free = 0): number {
  if (!Number.isSafeInteger(free) || free < 0 || free > (terms.free_stills ?? 0))
    throw new Error(`${free} free stills is outside these terms`);
  return terms.still_credits * Math.max(0, frames(n) - free);
}
/** `n` published hero poses; terms without a pose price price none. */
export function ownHeroCredits(n: number, terms: OwnAgentTerms = ownAgentTermsNow()): number {
  if (!Number.isSafeInteger(n) || n < 0 || n > OWN_HERO_POSES) throw new Error(`${n} poses is outside 0–${OWN_HERO_POSES}`);
  if (terms.pose_credits === undefined) throw new Error("these terms price no hero pose");
  return terms.pose_credits * n;
}

/** What a run of the mode delivered; a failed run delivered nothing, and is charged nothing. */
export type OwnAgentDelivery =
  /** `free`: the stills granted free when the run was admitted; absent, none. */
  | { skill: "film_stills"; frames: number; free?: number }
  | { skill: "film_voice"; seconds: number }
  | { skill: "film_render"; seconds: number }
  | { skill: "film_hero"; poses: number };

/** The charge for a delivery under the run's frozen terms, never above what admission held: a measure past the hold is a defect, not a bill. */
export function ownAgentCharge(delivery: OwnAgentDelivery, terms: OwnAgentTerms, heldCredits: number): number {
  const charge = delivery.skill === "film_stills" ? ownStillsCredits(delivery.frames, terms, delivery.free)
    : delivery.skill === "film_voice" ? ownVoiceCredits(delivery.seconds, terms)
    : delivery.skill === "film_hero" ? ownHeroCredits(delivery.poses, terms) : ownFilmRenderCredits(delivery.seconds, terms);
  if (!Number.isSafeInteger(heldCredits) || charge > heldCredits) throw new Error(`${delivery.skill} charge ${charge} is over its hold ${heldCredits}`);
  return charge;
}
