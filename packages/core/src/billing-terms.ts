import { z } from "zod";
import { faceBillingTariffSchema } from "./face-billing.js";
import { durationPartsTariffSchema } from "./parts-pricing.js";

export const faceBillingAdmissionTermsSchema = z.object({
  mode: z.literal("face_seconds"),
  tariffSnapshot: faceBillingTariffSchema,
}).strict().readonly();

export type FaceBillingAdmissionTerms = z.infer<typeof faceBillingAdmissionTermsSchema>;

export const durationPartsAdmissionTermsSchema = z.object({
  mode: z.literal("duration_parts"),
  tariffSnapshot: durationPartsTariffSchema,
}).strict().readonly();

export type DurationPartsAdmissionTerms = z.infer<typeof durationPartsAdmissionTermsSchema>;

export const runBillingAdmissionTermsSchema = z.union([faceBillingAdmissionTermsSchema, durationPartsAdmissionTermsSchema]);
export type RunBillingAdmissionTerms = z.infer<typeof runBillingAdmissionTermsSchema>;
