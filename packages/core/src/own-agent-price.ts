import { z } from "zod";
import { FACELESS_EXPLAINER_POSE_PICTURES, FACELESS_IMAGE_CREDITS } from "./faceless-price.js";

// The «own agent» tariff (#1291 F2): your agent writes the film; Clipwright sells its stills, voice with word timings, render and hero. Prices
// are frozen per run at admission, and only delivered work is charged.

export const OWN_AGENT_TARIFF = "own-agent-v1";
/** The run skills of the mode, each with its own unit. */
export const OWN_AGENT_SKILLS = ["film_stills", "film_voice", "film_render", "film_hero"] as const;
export type OwnAgentSkill = (typeof OWN_AGENT_SKILLS)[number];

/** One still the agent saw. */
export const OWN_STILL_CREDITS = 1;
/** A rendered film up to OWN_FILM_INCLUDED_SECONDS, then each second over it. */
export const OWN_FILM_RENDER_CREDITS = 100, OWN_FILM_INCLUDED_SECONDS = 60, OWN_FILM_EXTRA_SECOND_CREDITS = 2;
/** A second of delivered voice, rounded up once per take. */
export const OWN_VOICE_CREDITS_PER_SECOND = 2;
/** The bounds a run may ask: stills per call, the longest film and take. */
export const OWN_STILLS_MAX_PER_CALL = 8, OWN_FILM_MAX_SECONDS = 120, OWN_VOICE_MAX_SECONDS = 120;
/** A hero's pose picture, priced as the done-for-you explainer's, and the poses a hero is made of. */
export const OWN_HERO_POSE_CREDITS = FACELESS_IMAGE_CREDITS, OWN_HERO_POSES = FACELESS_EXPLAINER_POSE_PICTURES;

/** The prices a run's admission freezes; a run settles by its snapshot, never by today's constants. */
export const ownAgentTerms = z.strictObject({
  tariff: z.literal(OWN_AGENT_TARIFF),
  still_credits: z.number().int().nonnegative(),
  render_credits: z.number().int().nonnegative(),
  included_seconds: z.number().int().positive(),
  extra_second_credits: z.number().int().nonnegative(),
  voice_credits_per_second: z.number().int().nonnegative(),
  /** A published hero pose; absent on terms frozen before the hero was sold, and a hero run without it is never charged. */
  pose_credits: z.number().int().nonnegative().optional(),
});
export type OwnAgentTerms = z.infer<typeof ownAgentTerms>;

export const ownAgentTermsNow = (): OwnAgentTerms => ({ tariff: OWN_AGENT_TARIFF, still_credits: OWN_STILL_CREDITS, render_credits: OWN_FILM_RENDER_CREDITS,
  included_seconds: OWN_FILM_INCLUDED_SECONDS, extra_second_credits: OWN_FILM_EXTRA_SECOND_CREDITS, voice_credits_per_second: OWN_VOICE_CREDITS_PER_SECOND,
  pose_credits: OWN_HERO_POSE_CREDITS });

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
/** `n` delivered stills. */
export const ownStillsCredits = (n: number, terms: OwnAgentTerms = ownAgentTermsNow()): number => terms.still_credits * frames(n);
/** `n` published hero poses; terms without a pose price price none. */
export function ownHeroCredits(n: number, terms: OwnAgentTerms = ownAgentTermsNow()): number {
  if (!Number.isSafeInteger(n) || n < 0 || n > OWN_HERO_POSES) throw new Error(`${n} poses is outside 0–${OWN_HERO_POSES}`);
  if (terms.pose_credits === undefined) throw new Error("these terms price no hero pose");
  return terms.pose_credits * n;
}

/** What a run of the mode delivered; a failed run delivered nothing, and is charged nothing. */
export type OwnAgentDelivery =
  | { skill: "film_stills"; frames: number }
  | { skill: "film_voice"; seconds: number }
  | { skill: "film_render"; seconds: number }
  | { skill: "film_hero"; poses: number };

/** The charge for a delivery under the run's frozen terms, never above what admission held: a measure past the hold is a defect, not a bill. */
export function ownAgentCharge(delivery: OwnAgentDelivery, terms: OwnAgentTerms, heldCredits: number): number {
  const charge = delivery.skill === "film_stills" ? ownStillsCredits(delivery.frames, terms)
    : delivery.skill === "film_voice" ? ownVoiceCredits(delivery.seconds, terms)
    : delivery.skill === "film_hero" ? ownHeroCredits(delivery.poses, terms) : ownFilmRenderCredits(delivery.seconds, terms);
  if (!Number.isSafeInteger(heldCredits) || charge > heldCredits) throw new Error(`${delivery.skill} charge ${charge} is over its hold ${heldCredits}`);
  return charge;
}
