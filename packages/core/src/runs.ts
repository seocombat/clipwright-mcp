import { z } from "zod";
import { longFormBillingSummarySchema } from "./long-form-pricing.js";
import { partsBillingSummarySchema } from "./parts-pricing.js";
import { speechRhythmResult } from "./speech-rhythm-contract.js";
import { actorSelection } from "./actors.js";
import { createdActor } from "./account-actors.js";
import { faceBillingAdmissionTermsSchema } from "./billing-terms.js";
import { brollPolicy } from "./broll-policy.js";
import { facelessRunBilling } from "./faceless-price.js";
import { revisionBilling } from "./edit-billing.js";
import { SHOT_OPERATION_MODES, shotId } from "./edit-operations.js";
import { runGeneration } from "./generations-output.js";
import { postText } from "./post-text.js";
import { runVideo } from "./video-size.js";

export const RUN_STATES = [
  "queued",
  "generating",
  "scripting",
  "tts",
  "avatar",
  "compositing",
  "uploading",
  "succeeded",
  "failed",
] as const;

export const runState = z.enum(RUN_STATES);
export type RunState = z.infer<typeof runState>;

export const VIDEO_URL_CHECK =
  "signed for GET only: HEAD returns 403. To check it without downloading, " +
  'use a ranged GET (curl -r 0-0), not curl -I.';

export const runStep = z.object({
  step: z.string(),
  state: z.enum(["pending", "running", "succeeded", "failed"]),
  started_at: z.string().datetime().nullable(),
  finished_at: z.string().datetime().nullable(),
  artifacts: z
    .array(z.object({ kind: z.string(), url: z.string().url(), bytes: z.number().int() }))
    .default([]),
});

export const AI_DISCLOSURE_TEXT =
  "This video was generated with AI: the actor, the voice and the lip sync are synthetic.";

export const FACELESS_AI_DISCLOSURE_TEXT =
  "This video was generated with AI: the voice, the opening clip and the images are synthetic.";

export const FACELESS_EXPLAINER_AI_DISCLOSURE_TEXT =
  "This video was generated with AI: the voice, the animation and the images in it are synthetic.";

export const FACELESS_OWN_IMAGES_AI_DISCLOSURE_TEXT =
  "This video was generated with AI: the voice and the opening clip are synthetic, " +
  "and so is every image its author did not supply.";

export const FILM_CUT_AI_DISCLOSURE_TEXT =
  "This video was generated with AI: the voice is synthetic, and so is every picture and clip its author did not supply.";

export function aiDisclosureText(skill: string, input: unknown): string {
  if (skill === "film_cut" || skill === "film_cut_preview") return FILM_CUT_AI_DISCLOSURE_TEXT;
  if (skill === "revise_long_form") return AI_DISCLOSURE_TEXT;
  if (skill !== "make_faceless") return AI_DISCLOSURE_TEXT;
  if ((input as { format?: unknown } | null)?.format === "explainer") return FACELESS_EXPLAINER_AI_DISCLOSURE_TEXT;
  return facelessOwnImages(input) ? FACELESS_OWN_IMAGES_AI_DISCLOSURE_TEXT : FACELESS_AI_DISCLOSURE_TEXT;
}

export function facelessOwnImages(input: unknown): boolean {
  const stored = typeof input === "object" && input !== null
    ? input as { scene_images?: unknown; resolved_revision?: { own_images?: unknown } } : {};
  return stored.resolved_revision !== undefined ? stored.resolved_revision?.own_images === true
    : Array.isArray(stored.scene_images) && stored.scene_images.length > 0;
}

export const AI_DISCLOSURE_EMBEDDED_METADATA_KEY = "ai-disclosure-embedded";

export function aiDisclosureObjectMetadata(text: string, embedded?: boolean): Readonly<Record<string, string>> {
  return { "ai-generated": "true", generator: "clipwright", "ai-disclosure": text,
    ...(embedded === undefined ? {} : { [AI_DISCLOSURE_EMBEDDED_METADATA_KEY]: String(embedded) }) };
}

export const AI_DISCLOSURE_OBJECT_METADATA = aiDisclosureObjectMetadata(AI_DISCLOSURE_TEXT);

export const runId = z.string().regex(/^run_[a-zA-Z0-9]+$/);

export const runCandidate = z.object({
  source_run_id: runId, root_run_id: runId, shot_id: shotId,
  kind: z.enum(["picture", "clip"]),
  operation_mode: z.enum(SHOT_OPERATION_MODES).nullable(),
  take: z.number().int().positive().safe().nullable(),
  preview_url: z.string().url().nullable(),
  usable_until: z.string().datetime().nullable(),
});
export type RunCandidate = z.infer<typeof runCandidate>;

export const RUN_ELEMENT_ORIGINS = ["library", "generated"] as const;
export const runElement = z.object({ id: z.string().min(1).max(64), kind: z.string().min(1).max(64), origin: z.enum(RUN_ELEMENT_ORIGINS) }).strict();
export type RunElement = z.infer<typeof runElement>;

export const run = z.object({
  run_id: runId,
  actor: actorSelection.optional(),
  skill: z.string(),
  state: runState,
  credits_reserved: z.number().int().nonnegative(),
  credits_charged: z.number().int().nonnegative().nullable(),
  balance_after_credits: z.number().int().nullable().optional(),
  billing_terms: faceBillingAdmissionTermsSchema.optional(),
  faceless_billing: facelessRunBilling.optional(),
  revision: z.object({
    source_run_id: runId, root_run_id: runId,
    quoted_credits: z.number().int().nonnegative(),
    billing: revisionBilling.nullable(),
  }).optional(),
  candidate: runCandidate.optional(),
  generation: runGeneration.optional(),
  resolved_broll_policy: brollPolicy.optional(),
  warnings: z.array(z.string()).default([]),
  error: z.string().nullable(),
  created_actor: createdActor.optional(),
  final_output: z
    .object({
      video_url: z.string().url(),
      video_url_unsubtitled: z.string().url().optional(),
      portrait_url: z.string().url().optional(),
      character_sheet_url: z.string().url().optional(),
      character_id: z.string().optional(),
      duration_seconds: z.number().positive(),
      long_form_billing: longFormBillingSummarySchema.optional(),
      parts_billing: partsBillingSummarySchema.optional(),
      face_duration_seconds: z.number().nonnegative().optional(),
      full_speech_duration_seconds: z.number().positive().optional(),
      face_credits_per_second: z.number().int().positive().optional(),
      face_tariff_id: z.string().min(1).optional(),
      speech_timing_gaps: speechRhythmResult.optional(),
      ai_generated: z.literal(true),
      ai_disclosure: z.string().min(1),
      requested_aspect_ratio: z.string().optional(),
      vendor_aspect_ratio: z.string().optional(),
      final_aspect_ratio: z.string().optional(),
      composition_policy: z.string().optional(),
      elements: z.array(runElement).max(64).optional(),
      post_text: postText.optional(),
    })
    .nullable(),
  video: runVideo.optional(),
  steps: z.array(runStep).default([]),
  created_at: z.string().datetime(),
  finished_at: z.string().datetime().nullable(),
});
export type Run = z.infer<typeof run>;

export const SUCCEEDED_STATE = "succeeded" as const;
export const FAILED_STATE = "failed" as const;

export const TERMINAL_STATES = [SUCCEEDED_STATE, FAILED_STATE] as const;

export const runRead = run.extend({ state: z.string() });
export type RunRead = z.infer<typeof runRead>;

export type RunMoneyField = Extract<keyof RunRead, `credits_${string}` | "balance_after_credits">;

export const RUN_MONEY_FIELDS: readonly RunMoneyField[] = Object.keys(run.shape).filter(
  (field): field is RunMoneyField => field.startsWith("credits_") || field === "balance_after_credits",
);

export function runMoney(read: Pick<RunRead, RunMoneyField>): Pick<RunRead, RunMoneyField> {
  return Object.fromEntries(RUN_MONEY_FIELDS.map((field) => [field, read[field]])) as Pick<
    RunRead,
    RunMoneyField
  >;
}

export function isTerminal(state: string): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

export const RUN_WAIT_MAX_SECONDS = 50;
export const runQuery = z.object({
  wait_seconds: z.coerce.number().int().min(0).max(RUN_WAIT_MAX_SECONDS).optional()
    .describe(`Wait up to this many seconds (at most ${RUN_WAIT_MAX_SECONDS}) for the run to succeed or fail before answering.`),
});
export type RunQuery = z.infer<typeof runQuery>;
