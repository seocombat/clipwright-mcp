import { z } from "zod";
import {
  identifier, partsFaceTariffSchema, presenterRatesSchema, SHORT_PRESENTER_ENGINES, TAKE_ENGINES,
  type FaceBillingInterval, type PartsFaceTariff, type PresenterEngine, type ShortPresenterEngine, type ShotEngine, type TakeEngine,
} from "./face-billing.js";
import { unionFaceFrames } from "./long-form-pricing.js";
import type { Resolution } from "./skills.js";


export const PARTS_PRICING_VERSION = "parts-v5";
export const PRESENTER_CREDITS_PER_SECOND: Readonly<Record<ShortPresenterEngine, number>> = Object.freeze({ heygen: 10, omnihuman: 22,
  heygen_avatar6_turbo: 12 });
const PARTS_V2_PRESENTER_CREDITS_PER_SECOND: Readonly<Record<PresenterEngine, number>> = Object.freeze({ heygen: 9, omnihuman: 22 });
export const PRODUCTION_CREDITS_PER_SECOND = 1;
export const LIVE_AVATAR_STILL_CREDITS = 400;
export const DELIVERED_VIDEO_MINIMUM_CREDITS = 50;
export const SCENE_CREDITS = 25;

export const PRESENTER_ENGINE_LABELS: Readonly<Record<ShortPresenterEngine, string>> = Object.freeze({
  heygen: "presenter, HeyGen Avatar IV", omnihuman: "presenter, OmniHuman 2.0", heygen_avatar6_turbo: "presenter, HeyGen Avatar 6 Turbo",
});

type MethodShotEngine = "shot_omni" | "shot_seedance" | "shot_omni_no_text" | "shot_seedance_no_text";
export const METHOD_SHOT_CREDITS_PER_SECOND: Readonly<Record<Exclude<Resolution, "4k">, Readonly<Record<MethodShotEngine, number>>>> = Object.freeze({
  "720p": Object.freeze({ shot_omni: 20, shot_omni_no_text: 12, shot_seedance: 89, shot_seedance_no_text: 42 }),
  "1080p": Object.freeze({ shot_omni: 20, shot_omni_no_text: 20, shot_seedance: 217, shot_seedance_no_text: 217 }),
});
export const SHOT_CREDITS_PER_SECOND: Readonly<Record<ShotEngine, number>> = Object.freeze({ shot_talking_action: 30, shot_action: 30,
  ...METHOD_SHOT_CREDITS_PER_SECOND["720p"] });
export const SHOT_ENGINE_LABELS: Readonly<Record<ShotEngine, string>> = Object.freeze({
  shot_talking_action: "live shot, speaking while acting", shot_action: "live shot, acting under voice-over",
  shot_omni: "live shot, Gemini Omni 1.2", shot_seedance: "live shot, Seedance 2.5",
  shot_omni_no_text: "live shot, Gemini Omni 1.2, no text in frame", shot_seedance_no_text: "live shot, Seedance 2.5, no text in frame",
});
const TAKE_ENGINE_LABELS: Readonly<Record<TakeEngine, string>> = { ...PRESENTER_ENGINE_LABELS, ...SHOT_ENGINE_LABELS };

export const PARTS_V2_FACE_TARIFF: PartsFaceTariff = Object.freeze({
  version: 3, pricingVersion: "parts-v2", presenterCreditsPerSecond: PARTS_V2_PRESENTER_CREDITS_PER_SECOND,
  shotCreditsPerSecond: Object.freeze({ shot_talking_action: SHOT_CREDITS_PER_SECOND.shot_talking_action, shot_action: SHOT_CREDITS_PER_SECOND.shot_action }),
  productionCreditsPerSecond: PRODUCTION_CREDITS_PER_SECOND, liveAvatarStillCredits: LIVE_AVATAR_STILL_CREDITS,
  minimumCredits: DELIVERED_VIDEO_MINIMUM_CREDITS, rounding: "ceil_aggregate_seconds", failurePolicy: "verified_delivery_only",
} as const);

export const PARTS_FACE_TARIFF: PartsFaceTariff = Object.freeze({ ...PARTS_V2_FACE_TARIFF, pricingVersion: PARTS_PRICING_VERSION,
  presenterCreditsPerSecond: PRESENTER_CREDITS_PER_SECOND });

export const PARTS_OMNI_PRICING_VERSION = "parts-v3";
export const PARTS_OMNI_FACE_TARIFF: PartsFaceTariff = Object.freeze({ ...PARTS_V2_FACE_TARIFF, pricingVersion: PARTS_OMNI_PRICING_VERSION,
  shotCreditsPerSecond: Object.freeze({ shot_talking_action: SHOT_CREDITS_PER_SECOND.shot_talking_action,
    shot_action: SHOT_CREDITS_PER_SECOND.shot_action, shot_omni: SHOT_CREDITS_PER_SECOND.shot_omni }) });

export const PARTS_METHOD_PRICING_VERSION = "parts-v4";
export function partsMethodFaceTariff(resolution: Resolution): PartsFaceTariff {
  if (resolution === "4k") throw new RangeError("no method shot second at 4k");
  return Object.freeze({ ...PARTS_OMNI_FACE_TARIFF, pricingVersion: PARTS_METHOD_PRICING_VERSION,
    shotCreditsPerSecond: Object.freeze({ ...PARTS_OMNI_FACE_TARIFF.shotCreditsPerSecond!, ...METHOD_SHOT_CREDITS_PER_SECOND[resolution] }) });
}

export const FACE_BILLING_TARIFFS: readonly PartsFaceTariff[] = Object.freeze([PARTS_FACE_TARIFF]);

export const durationPartsTariffSchema = z.object({
  version: z.literal(1),
  pricingVersion: identifier,
  presenterCreditsPerSecond: presenterRatesSchema,
  productionCreditsPerSecond: z.number().int().nonnegative().max(2_147_483_647),
  minimumCredits: z.number().int().nonnegative().max(2_147_483_647),
  presenterEngine: z.enum(["heygen", "heygen_avatar6_turbo"]).optional(),
}).strict().readonly();
export type DurationPartsTariff = z.infer<typeof durationPartsTariffSchema>;

export const PARTS_DURATION_TARIFF: DurationPartsTariff = Object.freeze({
  version: 1, pricingVersion: PARTS_PRICING_VERSION, presenterCreditsPerSecond: PRESENTER_CREDITS_PER_SECOND,
  productionCreditsPerSecond: PRODUCTION_CREDITS_PER_SECOND, minimumCredits: DELIVERED_VIDEO_MINIMUM_CREDITS,
} as const);

export function durationPartsTariffFor(engine: "heygen" | "heygen_avatar6_turbo"): DurationPartsTariff {
  return Object.freeze({ ...PARTS_DURATION_TARIFF, presenterEngine: engine });
}

export const partsLineSchema = z.object({
  label: z.string().min(1),
  unit: z.enum(["face_second", "second", "still", "track", "scene", "template"]),
  quantity: z.number().int().nonnegative(),
  unit_credits: z.number().int().nonnegative(),
  credits: z.number().int().nonnegative(),
}).strict();
export type PartsLine = z.infer<typeof partsLineSchema>;

export function sceneLine(scenes: number, credits: number = SCENE_CREDITS): PartsLine {
  return { label: "scenes made for the video", unit: "scene", quantity: scenes, unit_credits: credits, credits: scenes * credits };
}

export interface PartsCharge {
  lines: PartsLine[];
  usageCredits: number;
  credits: number;
  minimumApplied: boolean;
  faceFrames: number;
  billableFaceSeconds: number;
}

const MAX_CREDITS = 2_147_483_647n;

function settle(lines: PartsLine[], minimum: number, delivered: boolean, faceFrames: number, billableFaceSeconds: number): PartsCharge {
  const usage = lines.reduce((sum, line) => sum + BigInt(line.credits), 0n);
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
  presenter: Partial<Record<TakeEngine, readonly FaceBillingInterval[]>>;
  outputFrames: number;
  fps: number;
  liveAvatarStills: number;
}

export function calculatePartsCharge(measure: PartsMeasure, tariffInput: PartsFaceTariff, delivered: boolean): PartsCharge {
  const tariff = partsFaceTariffSchema.parse(tariffInput);
  const fps = BigInt(z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(measure.fps));
  const outputFrames = BigInt(z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(measure.outputFrames));
  const stills = BigInt(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(measure.liveAvatarStills));
  const lines: PartsLine[] = [];
  let billableFaceSeconds = 0n;
  for (const engine of TAKE_ENGINES) {
    const intervals = measure.presenter[engine];
    if (intervals === undefined || intervals.length === 0) continue;
    const rate = (SHORT_PRESENTER_ENGINES as readonly string[]).includes(engine)
      ? tariff.presenterCreditsPerSecond[engine as ShortPresenterEngine] : tariff.shotCreditsPerSecond?.[engine as ShotEngine];
    if (rate === undefined) throw new RangeError(`the tariff has no rate for ${engine}`);
    const seconds = ceilSeconds(unionFaceFrames(intervals), fps);
    billableFaceSeconds += seconds;
    lines.push(line(TAKE_ENGINE_LABELS[engine], "face_second", seconds, rate));
  }
  lines.push(line("production (voice and render)", "second", ceilSeconds(outputFrames, fps), tariff.productionCreditsPerSecond));
  if (stills > 0n) lines.push(line("live avatar on a call", "still", stills, tariff.liveAvatarStillCredits));
  const faceFrames = unionFaceFrames(TAKE_ENGINES.flatMap((engine) => [...(measure.presenter[engine] ?? [])]));
  return settle(lines, tariff.minimumCredits, delivered, Number(faceFrames), Number(billableFaceSeconds));
}

export const PRODUCTION_LINE = "production (voice and render)";
export const PRODUCTION_RENDER_LINE = "production (render)";

export function calculateDurationPartsCharge(durationSec: number, engine: ShortPresenterEngine, tariffInput: DurationPartsTariff,
  delivered: boolean, heldSec = 0, deliveredVoice = false): PartsCharge {
  const tariff = durationPartsTariffSchema.parse(tariffInput);
  const rate = tariff.presenterCreditsPerSecond[engine];
  if (rate === undefined) throw new RangeError(`the tariff has no rate for ${engine}`);
  if (!Number.isFinite(durationSec) || durationSec < 0) throw new RangeError("duration must be a finite, non-negative number of seconds");
  if (!Number.isFinite(heldSec) || heldSec < 0 || heldSec > durationSec) throw new RangeError("the held still must lie within the video");
  const seconds = BigInt(Math.max(1, Math.ceil(durationSec)));
  const take = heldSec === 0 ? seconds : BigInt(Math.max(1, Math.ceil(Number((durationSec - heldSec).toFixed(6)))));
  const lines = [line(PRESENTER_ENGINE_LABELS[engine], "face_second", take, rate),
    line(deliveredVoice ? PRODUCTION_RENDER_LINE : PRODUCTION_LINE, "second", seconds, tariff.productionCreditsPerSecond)];
  return settle(lines, tariff.minimumCredits, delivered, 0, Number(take));
}

export const partsBillingSummarySchema = z.object({
  pricingVersion: identifier,
  lines: z.array(partsLineSchema),
  minimumCredits: z.number().int().nonnegative(),
  minimumApplied: z.boolean(),
  actualDurationSec: z.number().positive().max(Number.MAX_SAFE_INTEGER),
  finalCreditsCharged: z.number().int().nonnegative(),
}).strict().readonly();
export type PartsBillingSummary = z.infer<typeof partsBillingSummarySchema>;
