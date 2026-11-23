import { z } from "zod";
import { LIVE_SHOT_KINDS } from "./live-shot-kinds.js";

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
  creditsPerSecond: z.number().int().positive().max(2_147_483_647),
  rounding: z.literal("ceil_aggregate_seconds"),
}).strict().readonly();

export const PRESENTER_ENGINES = ["heygen", "omnihuman"] as const;
export type PresenterEngine = (typeof PRESENTER_ENGINES)[number];

export const SHORT_PRESENTER_ENGINES = [...PRESENTER_ENGINES, "heygen_avatar6_turbo"] as const;
export type ShortPresenterEngine = (typeof SHORT_PRESENTER_ENGINES)[number];

const tariffCredits = z.number().int().nonnegative().max(2_147_483_647);
export const presenterRatesSchema = z.object({ heygen: tariffCredits.positive(), omnihuman: tariffCredits.positive(),
  heygen_avatar6_turbo: tariffCredits.positive().optional() }).strict().readonly();

export const SHOT_ENGINES = ["shot_talking_action", "shot_action", "shot_omni", "shot_seedance", "shot_omni_no_text", "shot_seedance_no_text"] as const;
export type ShotEngine = (typeof SHOT_ENGINES)[number];
export const TAKE_ENGINES = [...SHORT_PRESENTER_ENGINES, ...SHOT_ENGINES] as const;
export type TakeEngine = (typeof TAKE_ENGINES)[number];
export const shotRatesSchema = z.object({ shot_talking_action: tariffCredits.positive(), shot_action: tariffCredits.positive(),
  shot_omni: tariffCredits.positive().optional(), shot_seedance: tariffCredits.positive().optional(),
  shot_omni_no_text: tariffCredits.positive().optional(), shot_seedance_no_text: tariffCredits.positive().optional() }).strict().readonly();
export const SHOT_MODELS = ["omni", "seedance", "omni_no_text", "seedance_no_text"] as const;
export type ShotModel = (typeof SHOT_MODELS)[number];
export const SHOT_MODEL_ENGINE: Readonly<Record<ShotModel, ShotEngine>> = Object.freeze({ omni: "shot_omni", seedance: "shot_seedance",
  omni_no_text: "shot_omni_no_text", seedance_no_text: "shot_seedance_no_text" });

export const partsFaceTariffSchema = z.object({
  version: z.literal(3),
  pricingVersion: identifier,
  presenterCreditsPerSecond: presenterRatesSchema,
  shotCreditsPerSecond: shotRatesSchema.optional(),
  productionCreditsPerSecond: tariffCredits,
  liveAvatarStillCredits: tariffCredits,
  minimumCredits: tariffCredits,
  rounding: z.literal("ceil_aggregate_seconds"),
  failurePolicy: z.literal("verified_delivery_only"),
}).strict().readonly();
export type PartsFaceTariff = z.infer<typeof partsFaceTariffSchema>;

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
  partsFaceTariffSchema,
]);
export type FaceBillingTariff = z.infer<typeof faceBillingTariffSchema>;

const unitSchema = z.object({
  unitId: identifier,
  requestHash: hash,
  audioDurationSec: seconds,
  faceIntervals: z.array(faceBillingIntervalSchema).min(1).readonly(),
  optional: z.literal(true).optional(),
  shot: z.enum(LIVE_SHOT_KINDS).optional(),
  shotModel: z.enum(SHOT_MODELS).optional(),
  engine: z.literal("heygen_avatar6_turbo").optional(),
}).strict().readonly();

const planShape = {
  version: z.literal(1),
  fps: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  outputFrames: frames.positive(),
  fullSpeechDurationSec: seconds,
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

export const SIMPLIFIED_STEPS = ["head", "card"] as const;

export const faceBillingAcceptanceSchema = z.object({
  operationId: identifier,
  unitId: identifier,
  planHash: hash,
  requestHash: hash,
  providerJobId: identifier,
  liveAvatarJobId: identifier.optional(),
}).strict().readonly();

export const faceBillingFactsSchema = z.object({
  version: z.literal(1),
  mode: z.literal("face_seconds"),
  tariff: faceBillingTariffSchema,
  plan: faceBillingPlanSchema,
  acceptedUnits: z.array(faceBillingAcceptanceSchema).readonly(),
  unknownUnitIds: z.array(identifier).readonly(),
  acceptedEngines: z.record(identifier, z.enum(TAKE_ENGINES)).readonly().optional(),
  simplifiedUnits: z.record(identifier, z.enum(SIMPLIFIED_STEPS)).readonly().optional(),
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
