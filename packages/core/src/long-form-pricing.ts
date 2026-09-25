import { z } from "zod";
import { faceBillingIntervalSchema, faceBillingTariffSchema,
  type FaceBillingInterval, type FaceBillingTariff } from "./face-billing.js";

export const LONG_FORM_LAUNCH_TARIFF = Object.freeze({
  version: 2, pricingVersion: "long-form-v1", rateCreditsPerFaceSecond: 10,
  minimumCredits: 400, rounding: "ceil_aggregate_seconds", failurePolicy: "verified_delivery_only",
} as const satisfies FaceBillingTariff);

/** Active face tariffs as a LIST: public text walks it, not two known constants, so a */
/** third tariff cannot ship silently. */
export const FACE_BILLING_TARIFFS: readonly FaceBillingTariff[] = Object.freeze([
  LONG_FORM_LAUNCH_TARIFF,
]);

export function faceTariffRate(tariff: FaceBillingTariff): number {
  return tariff.version === 1 ? tariff.creditsPerSecond : tariff.rateCreditsPerFaceSecond;
}
export function faceTariffPricingVersion(tariff: FaceBillingTariff): string {
  return tariff.version === 1 ? tariff.id : tariff.pricingVersion;
}
export function faceTariffMinimum(tariff: FaceBillingTariff): number {
  return tariff.version === 1 ? 0 : tariff.minimumCredits;
}
export function isDeliveryOnlyFaceTariff(tariff: FaceBillingTariff): boolean {
  return tariff.version === 2 && tariff.failurePolicy === "verified_delivery_only";
}

/** Exact union and one aggregate rounding; customer failure policy is applied by settlement. */
export function calculateFaceCharge(intervals: readonly FaceBillingInterval[], fps: number, tariff: FaceBillingTariff) {
  const terms = faceBillingTariffSchema.parse(tariff);
  const frameRate = BigInt(z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(fps));
  const sorted = z.array(faceBillingIntervalSchema).parse(intervals)
    .sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame);
  let end = 0n;
  let frames = 0n;
  for (const part of sorted) {
    const start = BigInt(part.startFrame) > end ? BigInt(part.startFrame) : end;
    const nextEnd = BigInt(part.endFrame);
    if (nextEnd > start) frames += nextEnd - start;
    if (nextEnd > end) end = nextEnd;
  }
  const seconds = (frames + frameRate - 1n) / frameRate;
  const usageCredits = seconds * BigInt(faceTariffRate(terms));
  const minimum = BigInt(faceTariffMinimum(terms));
  const credits = usageCredits < minimum ? minimum : usageCredits;
  if (credits > 2_147_483_647n) throw new RangeError("face billing credit overflow");
  return { faceFrames: Number(frames), billableFaceSeconds: Number(seconds), credits: Number(credits),
    minimumApplied: usageCredits < minimum };
}

/** Reserve headroom for speech shape: a NAMED bound, not a derived number, since the */
/** honest product of three terms varies by layout. */
export const FACE_RESERVE_SHAPE_MARGIN = 1.15;

const credits = z.number().int().nonnegative().max(2_147_483_647);
const pricing = {
  pricingVersion: z.string().min(1).max(200),
  rateCreditsPerFaceSecond: credits.positive(),
  minimumCredits: credits,
};
export const longFormQuoteSchema = z.object({
  ...pricing,
  estimatedTotalDurationSec: z.number().positive().max(Number.MAX_SAFE_INTEGER),
  estimatedFaceSeconds: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  estimatedCredits: credits,
  estimatedFaceWordShare: z.number().positive().max(1).optional(),
  minimumApplied: z.boolean(),
}).strict().readonly();
export const longFormBillingSummarySchema = z.object({
  ...pricing,
  actualDurationSec: z.number().positive().max(Number.MAX_SAFE_INTEGER),
  actualBillableFaceSeconds: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  finalCreditsCharged: credits,
  minimumApplied: z.boolean(),
}).strict().readonly();
export type LongFormQuote = z.infer<typeof longFormQuoteSchema>;
export type LongFormBillingSummary = z.infer<typeof longFormBillingSummarySchema>;
