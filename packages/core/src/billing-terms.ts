import { z } from "zod";
import { faceBillingTariffSchema } from "./face-billing.js";
import { durationPartsTariffSchema } from "./parts-pricing.js";

/** Server-authored terms, exposed read-only on runs; never accepted as skill input. */
export const faceBillingAdmissionTermsSchema = z.object({
  mode: z.literal("face_seconds"),
  tariffSnapshot: faceBillingTariffSchema,
}).strict().readonly();

export type FaceBillingAdmissionTerms = z.infer<typeof faceBillingAdmissionTermsSchema>;

/** A short run's parts tariff (#800): billed by its measured duration on the short run's settlement path. */
export const durationPartsAdmissionTermsSchema = z.object({
  mode: z.literal("duration_parts"),
  tariffSnapshot: durationPartsTariffSchema,
}).strict().readonly();

export type DurationPartsAdmissionTerms = z.infer<typeof durationPartsAdmissionTermsSchema>;

/** Every mode a run's billing terms, frozen at admission, may hold. */
export const runBillingAdmissionTermsSchema = z.union([faceBillingAdmissionTermsSchema, durationPartsAdmissionTermsSchema]);
export type RunBillingAdmissionTerms = z.infer<typeof runBillingAdmissionTermsSchema>;
