import { z } from "zod";

// Internal, closed-mode facts. These schemas do not enable a public input or tariff.
export const identifier = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const frames = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const seconds = z.number().positive().max(Number.MAX_SAFE_INTEGER);

export const faceBillingIntervalSchema = z.object({
  startFrame: frames,
  endFrame: frames,
}).strict().refine((value) => value.endFrame > value.startFrame, {
  message: "face interval must contain at least one frame",
}).readonly();

const legacyFaceBillingTariffSchema = z.object({
  version: z.literal(1),
  id: identifier,
  // Integer credits match the existing ledger. Fractional rates need a separate policy.
  creditsPerSecond: z.number().int().positive().max(2_147_483_647),
  // Explicit caller choice; not a default or a claim of owner approval.
  rounding: z.literal("ceil_aggregate_seconds"),
}).strict().readonly();

export const faceBillingTariffSchema = z.union([
  legacyFaceBillingTariffSchema,
  z.object({
    version: z.literal(2),
    pricingVersion: identifier,
    rateCreditsPerFaceSecond: z.number().int().positive().max(2_147_483_647),
    minimumCredits: z.number().int().nonnegative().max(2_147_483_647),
    rounding: z.literal("ceil_aggregate_seconds"),
    failurePolicy: z.literal("verified_delivery_only"),
  }).strict().readonly(),
]);
export type FaceBillingTariff = z.infer<typeof faceBillingTariffSchema>;

const unitSchema = z.object({
  unitId: identifier,
  requestHash: hash,
  audioDurationSec: seconds,
  faceIntervals: z.array(faceBillingIntervalSchema).min(1).readonly(),
}).strict().readonly();

const planShape = {
  version: z.literal(1),
  fps: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  outputFrames: frames.positive(),
  fullSpeechDurationSec: seconds,
  // Zero-face economics are unresolved; this version cannot represent that product.
  units: z.array(unitSchema).min(1).readonly(),
};

type PlanShape = {
  outputFrames: number;
  units: readonly z.infer<typeof unitSchema>[];
};
function validPlan(plan: PlanShape): boolean {
  return new Set(plan.units.map((unit) => unit.unitId)).size === plan.units.length &&
    plan.units.every((unit) => unit.faceIntervals.every((part) => part.endFrame <= plan.outputFrames));
}

export const faceBillingPlanContentSchema = z.object(planShape).strict()
  .refine(validPlan, { message: "plan unit ids must be unique and intervals within output" }).readonly();
export const faceBillingPlanSchema = z.object({ ...planShape, hash }).strict()
  .refine(validPlan, { message: "plan unit ids must be unique and intervals within output" }).readonly();

export const faceBillingAcceptanceSchema = z.object({
  operationId: identifier,
  unitId: identifier,
  planHash: hash,
  requestHash: hash,
  providerJobId: identifier,
}).strict().readonly();

export const faceBillingFactsSchema = z.object({
  version: z.literal(1),
  mode: z.literal("face_seconds"),
  tariff: faceBillingTariffSchema,
  plan: faceBillingPlanSchema,
  acceptedUnits: z.array(faceBillingAcceptanceSchema).readonly(),
  // Unknown vendor responses stay unresolved until authoritative reconciliation.
  unknownUnitIds: z.array(identifier).readonly(),
}).strict().readonly();

export const faceBillingOutcomeSchema = z.discriminatedUnion("runState", [
  z.object({
    runState: z.literal("failed"),
    haltedBySpendGuard: z.boolean().optional(),
    paidArtifactLost: z.boolean().optional(),
    vendorRefusedOnOurAccount: z.boolean().optional(),
    deliverableRejectedByUs: z.boolean().optional(),
  }).strict().readonly(),
  z.object({
    runState: z.literal("succeeded"),
    delivered: z.object({ planHash: hash, outputFrames: frames.positive() }).strict().readonly(),
  }).strict().readonly(),
]);

export type FaceBillingFacts = z.infer<typeof faceBillingFactsSchema>;
export type FaceBillingPlanContent = z.infer<typeof faceBillingPlanContentSchema>;
export type FaceBillingOutcome = z.infer<typeof faceBillingOutcomeSchema>;
export type FaceBillingInterval = z.infer<typeof faceBillingIntervalSchema>;
