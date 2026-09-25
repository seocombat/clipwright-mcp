import { z } from "zod";
import { faceBillingTariffSchema } from "./face-billing.js";

/** Server-authored terms, exposed read-only on runs; never accepted as skill input. */
export const faceBillingAdmissionTermsSchema = z.object({
  mode: z.literal("face_seconds"),
  tariffSnapshot: faceBillingTariffSchema,
}).strict().readonly();

export type FaceBillingAdmissionTerms = z.infer<typeof faceBillingAdmissionTermsSchema>;
