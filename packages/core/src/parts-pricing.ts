import { z } from "zod";
import {
  identifier, partsFaceTariffSchema, presenterRatesSchema, PRESENTER_ENGINES, SHOT_ENGINES,
  type FaceBillingInterval, type PartsFaceTariff, type PresenterEngine, type ShotEngine, type TakeEngine,
} from "./face-billing.js";
import { unionFaceFrames } from "./long-form-pricing.js";

// Parts prices: one tariff for short and long make_ugc.
// parts-v2: the HeyGen second 12 → 9; parts-v1, long-form-v1 and 30 a second stay with their snapshots.

export const PARTS_PRICING_VERSION = "parts-v2";
/** Credits per second a presenter is in the video, covered or not, by the engine that rendered the take. */
export const PRESENTER_CREDITS_PER_SECOND: Readonly<Record<PresenterEngine, number>> = Object.freeze({ heygen: 9, omnihuman: 22 });
/** Voice and render, per second of the finished video. */
export const PRODUCTION_CREDITS_PER_SECOND = 1;
/** A call scene's live avatar: one HeyGen photo avatar of the still, per still in the delivered video. */
export const LIVE_AVATAR_STILL_CREDITS = 400;
/** The least a delivered video costs. */
export const DELIVERED_VIDEO_MINIMUM_CREDITS = 50;
/** A graphic made for the run (#1107), per scene drawn in the delivered video. */
export const SCENE_CREDITS = 25;

export const PRESENTER_ENGINE_LABELS: Readonly<Record<PresenterEngine, string>> = Object.freeze({
  heygen: "presenter, HeyGen Avatar IV", omnihuman: "presenter, OmniHuman 2.0",
});

/** Credits per second of a live shot (#1103), by the shot kind's engine: the actor speaking while acting, and acting under voice-over. */
export const SHOT_CREDITS_PER_SECOND: Readonly<Record<ShotEngine, number>> = Object.freeze({ shot_talking_action: 30, shot_action: 30 });
export const SHOT_ENGINE_LABELS: Readonly<Record<ShotEngine, string>> = Object.freeze({
  shot_talking_action: "live shot, speaking while acting", shot_action: "live shot, acting under voice-over",
});
const TAKE_ENGINE_LABELS: Readonly<Record<TakeEngine, string>> = { ...PRESENTER_ENGINE_LABELS, ...SHOT_ENGINE_LABELS };

/** The long-form run's tariff, frozen at admission like long-form-v1 before it. */
export const PARTS_FACE_TARIFF: PartsFaceTariff = Object.freeze({
  version: 3, pricingVersion: PARTS_PRICING_VERSION, presenterCreditsPerSecond: PRESENTER_CREDITS_PER_SECOND,
  shotCreditsPerSecond: SHOT_CREDITS_PER_SECOND,
  productionCreditsPerSecond: PRODUCTION_CREDITS_PER_SECOND, liveAvatarStillCredits: LIVE_AVATAR_STILL_CREDITS,
  minimumCredits: DELIVERED_VIDEO_MINIMUM_CREDITS, rounding: "ceil_aggregate_seconds", failurePolicy: "verified_delivery_only",
} as const);

/** The face tariffs new runs are admitted on, as a LIST: public text walks it, so another tariff cannot ship silently. */
export const FACE_BILLING_TARIFFS: readonly PartsFaceTariff[] = Object.freeze([PARTS_FACE_TARIFF]);

/** A short run's tariff: one take, so the presenter is in every second of the video. Its failures keep the short run's outcomes. */
export const durationPartsTariffSchema = z.object({
  version: z.literal(1),
  pricingVersion: identifier,
  presenterCreditsPerSecond: presenterRatesSchema,
  productionCreditsPerSecond: z.number().int().nonnegative().max(2_147_483_647),
  minimumCredits: z.number().int().nonnegative().max(2_147_483_647),
}).strict().readonly();
export type DurationPartsTariff = z.infer<typeof durationPartsTariffSchema>;

export const PARTS_DURATION_TARIFF: DurationPartsTariff = Object.freeze({
  version: 1, pricingVersion: PARTS_PRICING_VERSION, presenterCreditsPerSecond: PRESENTER_CREDITS_PER_SECOND,
  productionCreditsPerSecond: PRODUCTION_CREDITS_PER_SECOND, minimumCredits: DELIVERED_VIDEO_MINIMUM_CREDITS,
} as const);

/** One line of an itemized price: what was counted, how many, at what rate, and the product. */
export const partsLineSchema = z.object({
  label: z.string().min(1),
  unit: z.enum(["face_second", "second", "still", "track", "scene"]),
  quantity: z.number().int().nonnegative(),
  unit_credits: z.number().int().nonnegative(),
  credits: z.number().int().nonnegative(),
}).strict();
export type PartsLine = z.infer<typeof partsLineSchema>;

/** The quote's and the bill's line for the scenes made for a run: asked for on a quote, drawn on a bill. */
export function sceneLine(scenes: number, credits: number = SCENE_CREDITS): PartsLine {
  return { label: "scenes made for the video", unit: "scene", quantity: scenes, unit_credits: credits, credits: scenes * credits };
}

export interface PartsCharge {
  lines: PartsLine[];
  /** The lines added up, before the minimum. */
  usageCredits: number;
  credits: number;
  minimumApplied: boolean;
  /** Presenter frames over all engines, an overlap counted once. */
  faceFrames: number;
  billableFaceSeconds: number;
}

const MAX_CREDITS = 2_147_483_647n;

function settle(lines: PartsLine[], minimum: number, delivered: boolean, faceFrames: number, billableFaceSeconds: number): PartsCharge {
  const usage = lines.reduce((sum, line) => sum + BigInt(line.credits), 0n);
  // The minimum is per DELIVERED video: a failed run that still bills is charged its parts only.
  const minimumApplied = delivered && usage < BigInt(minimum);
  const credits = minimumApplied ? BigInt(minimum) : usage;
  if (credits > MAX_CREDITS) throw new RangeError("parts billing credit overflow");
  return { lines, usageCredits: Number(usage), credits: Number(credits), minimumApplied, faceFrames, billableFaceSeconds };
}

function line(label: string, unit: PartsLine["unit"], quantity: bigint, unitCredits: number): PartsLine {
  const credits = quantity * BigInt(unitCredits);
  if (credits > MAX_CREDITS) throw new RangeError("parts billing credit overflow");
  return { label, unit, quantity: Number(quantity), unit_credits: unitCredits, credits: Number(credits) };
}

const ceilSeconds = (frames: bigint, fps: bigint): bigint => (frames + fps - 1n) / fps;

export interface PartsMeasure {
  /** Each engine's presenter intervals: a take's whole slot, covered or not; a live shot's under its shot engine. */
  presenter: Partial<Record<TakeEngine, readonly FaceBillingInterval[]>>;
  outputFrames: number;
  fps: number;
  liveAvatarStills: number;
}

/** A long-form video's price under a parts tariff: each engine's presenter seconds rounded up once over the video, every */
/** second of the video, each witnessed still; the minimum when delivered. Failure policy is settlement's, not this function's. */
export function calculatePartsCharge(measure: PartsMeasure, tariffInput: PartsFaceTariff, delivered: boolean): PartsCharge {
  const tariff = partsFaceTariffSchema.parse(tariffInput);
  const fps = BigInt(z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(measure.fps));
  const outputFrames = BigInt(z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(measure.outputFrames));
  const stills = BigInt(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(measure.liveAvatarStills));
  const lines: PartsLine[] = [];
  let billableFaceSeconds = 0n;
  for (const engine of [...PRESENTER_ENGINES, ...SHOT_ENGINES]) {
    const intervals = measure.presenter[engine];
    if (intervals === undefined || intervals.length === 0) continue;
    const rate = (PRESENTER_ENGINES as readonly string[]).includes(engine) ? tariff.presenterCreditsPerSecond[engine as PresenterEngine]
      : tariff.shotCreditsPerSecond?.[engine as ShotEngine];
    // A snapshot admitted before live shots has no shot rate: such a take is never priced by a guess.
    if (rate === undefined) throw new RangeError(`the tariff has no rate for ${engine}`);
    const seconds = ceilSeconds(unionFaceFrames(intervals), fps);
    billableFaceSeconds += seconds;
    lines.push(line(TAKE_ENGINE_LABELS[engine], "face_second", seconds, rate));
  }
  lines.push(line("production (voice and render)", "second", ceilSeconds(outputFrames, fps), tariff.productionCreditsPerSecond));
  if (stills > 0n) lines.push(line("live avatar on a call", "still", stills, tariff.liveAvatarStillCredits));
  const faceFrames = unionFaceFrames([...PRESENTER_ENGINES, ...SHOT_ENGINES].flatMap((engine) => [...(measure.presenter[engine] ?? [])]));
  return settle(lines, tariff.minimumCredits, delivered, Number(faceFrames), Number(billableFaceSeconds));
}

/** A short video's price: the presenter is in every second of its one take. Rounding is the legacy rule: whole seconds, at least one. */
export function calculateDurationPartsCharge(durationSec: number, engine: PresenterEngine, tariffInput: DurationPartsTariff,
  delivered: boolean): PartsCharge {
  const tariff = durationPartsTariffSchema.parse(tariffInput);
  if (!Number.isFinite(durationSec) || durationSec < 0) throw new RangeError("duration must be a finite, non-negative number of seconds");
  const seconds = BigInt(Math.max(1, Math.ceil(durationSec)));
  const lines = [line(PRESENTER_ENGINE_LABELS[engine], "face_second", seconds, tariff.presenterCreditsPerSecond[engine]),
    line("production (voice and render)", "second", seconds, tariff.productionCreditsPerSecond)];
  return settle(lines, tariff.minimumCredits, delivered, 0, Number(seconds));
}

/** What a delivered parts-tariff video records about its price. */
export const partsBillingSummarySchema = z.object({
  pricingVersion: identifier,
  lines: z.array(partsLineSchema),
  minimumCredits: z.number().int().nonnegative(),
  minimumApplied: z.boolean(),
  actualDurationSec: z.number().positive().max(Number.MAX_SAFE_INTEGER),
  finalCreditsCharged: z.number().int().nonnegative(),
}).strict().readonly();
export type PartsBillingSummary = z.infer<typeof partsBillingSummarySchema>;
