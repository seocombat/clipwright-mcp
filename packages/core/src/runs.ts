import { z } from "zod";
import { longFormBillingSummarySchema } from "./long-form-pricing.js";
import { speechRhythmResult } from "./speech-rhythm-contract.js";
import { actorSelection } from "./actors.js";
import { createdActor } from "./account-actors.js";
import { faceBillingAdmissionTermsSchema } from "./billing-terms.js";
import { brollPolicy } from "./broll-policy.js";
import { facelessQuote } from "./faceless-price.js";

/** Shared run stages; skill-specific workers use the stages they need. */
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

/** The signature covers GET only, so `curl -I` gets 403 and reads as "the link is dead". */
/** Said where the link is handed out. */
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

/** AI output disclosure, one constant for every surface: a fully synthetic clip says so */
/** itself, the same way whichever client downloaded it. Not a claim of legal compliance. */
export const AI_DISCLOSURE_TEXT =
  "This video was generated with AI: the actor, the voice and the lip sync are synthetic.";

/** Storage object metadata, one constant so writer and readers share keys. Weaker than an */
/** embedded tag (lost on re-save), but always set, without parsing MP4 boxes. */
export const AI_DISCLOSURE_OBJECT_METADATA: Readonly<Record<string, string>> = {
  "ai-generated": "true",
  generator: "clipwright",
  "ai-disclosure": AI_DISCLOSURE_TEXT,
};

/** Run id shape, a separate schema because INPUT asks for it too: the MCP `get_run` tool, */
/** where a bare `z.string()` let garbage reach the network. */
export const runId = z.string().regex(/^run_[a-zA-Z0-9]+$/);

export const run = z.object({
  run_id: runId,
  actor: actorSelection.optional(),
  skill: z.string(),
  state: runState,
  credits_reserved: z.number().int().nonnegative(),
  credits_charged: z.number().int().nonnegative().nullable(),
  billing_terms: faceBillingAdmissionTermsSchema.optional(),
  faceless_billing: facelessQuote.optional(),
  resolved_broll_policy: brollPolicy.optional(),
  warnings: z.array(z.string()).default([]),
  /** The reason. A non-empty `error` does NOT imply `state: "failed"`: on a non-terminal */
  /** run it explains a delay awaiting human review, and such a run will not finish by itself. */
  error: z.string().nullable(),
  /** The result of a `create_actor` run; absent on `make_ugc`, whose result is `final_output`. */
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
      face_duration_seconds: z.number().nonnegative().optional(),
      full_speech_duration_seconds: z.number().positive().optional(),
      face_credits_per_second: z.number().int().positive().optional(),
      face_tariff_id: z.string().min(1).optional(),
      speech_timing_gaps: speechRhythmResult.optional(),
      /** REQUIRED disclosure fields: an optional one could be forgotten and the clip ship */
      /** unmarked, while `z.literal(true)` makes `run.parse` fail on our side first. */
      ai_generated: z.literal(true),
      ai_disclosure: z.string().min(1),
      /** Three formats, not one: requested, sent to the vendor and final. Set only on the */
      /** composition path; without it the vendor file is returned as is. */
      requested_aspect_ratio: z.string().optional(),
      vendor_aspect_ratio: z.string().optional(),
      final_aspect_ratio: z.string().optional(),
      /** How the clip was fitted into the frame: `exact` or a background mode. */
      composition_policy: z.string().optional(),
    })
    .nullable(),
  steps: z.array(runStep).default([]),
  created_at: z.string().datetime(),
  finished_at: z.string().datetime().nullable(),
});
export type Run = z.infer<typeof run>;

/** Terminal run states as shared constants, the single source of truth about completion, */
/** instead of string literals repeated across consumers. */
export const SUCCEEDED_STATE = "succeeded" as const;
export const FAILED_STATE = "failed" as const;

// Consumers tell outcomes apart ONLY through the named constants above: a positional
// `TERMINAL_STATES[1]` would silently invert success and failure on reorder.
export const TERMINAL_STATES = [SUCCEEDED_STATE, FAILED_STATE] as const;

/** Tolerant READ projection: only `state` is loosened to `z.string()`, everything else is */
/** inherited via `run.extend`, so a new server stage does not break installed clients. */
export const runRead = run.extend({ state: z.string() });
export type RunRead = z.infer<typeof runRead>;

/** A money field of a run. Names are derived FROM THE SCHEMA: a hand list next to the MCP */
/** formatter kept losing them. */
export type RunMoneyField = Extract<keyof RunRead, `credits_${string}`>;

export const RUN_MONEY_FIELDS: readonly RunMoneyField[] = Object.keys(run.shape).filter(
  (field): field is RunMoneyField => field.startsWith("credits_"),
);

/** A run's money fields as one object, for surfaces that build their own response. */
export function runMoney(read: RunRead): Pick<RunRead, RunMoneyField> {
  return Object.fromEntries(RUN_MONEY_FIELDS.map((field) => [field, read[field]])) as Pick<
    RunRead,
    RunMoneyField
  >;
}

/** Whether a run is terminal. Takes a `string` (the read projection), so an unknown */
/** status from an extended enum correctly gives `false`. */
export function isTerminal(state: string): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}
