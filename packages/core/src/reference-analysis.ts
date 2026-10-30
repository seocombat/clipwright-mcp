import { z } from "zod";

import { assetId } from "./asset-identity.js";
import { ASSET_VIDEO_MAX_SECONDS } from "./assets.js";
import { referenceProfile, type ReferenceProfile } from "./reference-profile.js";

/** Reference analysis (reference-to-video S1c): an MP4 asset read into a `reference_profile`. Its status lives at its own */
/** path, as an asset's processing does; its money (#927) rides a run of skill `analyze_reference` that holds and settles it. */

export const REFERENCE_ANALYSES_PATH = "/v1/reference-analyses";
export const REFERENCE_ANALYSIS_PATH = "/v1/reference-analyses/:id";
export const REFERENCE_ANALYSIS_QUOTE_PATH = "/v1/reference-analyses/quote";
export const ANALYZE_REFERENCE_TASK = "analyze-reference";
/** The run skill that carries an analysis's hold and charge; not a `SKILLS` entry, since no `/v1/skills` route starts it. */
export const ANALYZE_REFERENCE_SKILL = "analyze_reference";

export const referenceAnalysisId = z.string().regex(/^ref_[a-f0-9]{32}$/);

/** The price of a delivered analysis (owner, 29.10, #800/#927): Argon video plus Flash stills cost us ≈ $0.23 today. */
/** Argon's price doubles on 2026-12-01 (≈ $0.45, ≈ 135 credits at ×2.5): the owner reprices then; nothing changes it by itself. */
export const REFERENCE_ANALYSIS_CREDITS = 70;

/** New analyses per account per hour: each costs us vendor money even when it fails, so the cap stays beside the price. */
export const REFERENCE_ANALYSIS_PER_HOUR = 10;
export const REFERENCE_ANALYSIS_WINDOW_SECONDS = 3600;
/** The worker stops its own work here, removes its temp copy and fails the analysis; under the task's ceiling. */
export const REFERENCE_ANALYSIS_WORK_SECONDS = 420;
export const REFERENCE_ANALYSIS_TASK_MAX_DURATION_SECONDS = 600;
/** Past this a read calls an unfinished analysis failed: a task killed at its ceiling writes nothing. */
export const REFERENCE_ANALYSIS_DEADLINE_SECONDS = 900;

export const REFERENCE_ANALYSIS_STATES = ["queued", "analyzing", "succeeded", "failed"] as const;
export const REFERENCE_ANALYSIS_ERRORS = ["timed_out", "analysis_failed", "asset_gone", "enqueue_failed"] as const;
export type ReferenceAnalysisError = (typeof REFERENCE_ANALYSIS_ERRORS)[number];

export const REFERENCE_ANALYSIS_ERROR_MESSAGES: Readonly<Record<ReferenceAnalysisError, string>> = {
  timed_out: "the analysis did not finish in time and was stopped; start it again",
  analysis_failed: "the reference could not be analysed; start it again or use another clip",
  asset_gone: "the asset was deleted before the analysis began",
  enqueue_failed: "the analysis could not be handed to the worker; start it again",
};

/** What the API hands the worker: ids only, so no file name or reference text reaches Trigger.dev's log. */
export const analyzeReferencePayload = z.strictObject({ analysisId: referenceAnalysisId, accountId: z.string().min(1) });
export type AnalyzeReferencePayload = z.infer<typeof analyzeReferencePayload>;

export const analyzeReferenceRequest = z.strictObject({
  asset_id: assetId.describe(`asset_id of an MP4 asset of this account, at most ${ASSET_VIDEO_MAX_SECONDS} s and 100 MiB`),
});
export type AnalyzeReferenceRequest = z.infer<typeof analyzeReferenceRequest>;

export const referenceAnalysis = z.strictObject({
  analysis_id: referenceAnalysisId,
  asset_id: assetId,
  state: z.enum(REFERENCE_ANALYSIS_STATES),
  /** Set once the analysis succeeded, `null` before and on failure. */
  reference_profile: referenceProfile.nullable(),
  warnings: z.array(z.string()),
  error: z.strictObject({ code: z.enum(REFERENCE_ANALYSIS_ERRORS), message: z.string().min(1) }).nullable(),
  /** Held at the start; 0 for an analysis started before it was paid (#927). */
  credits_reserved: z.number().int().nonnegative(),
  /** Set at settlement: the price once succeeded, 0 once failed; `null` while it runs. */
  credits_charged: z.number().int().nonnegative().nullable(),
  /** The account's balance right after the settlement, read in its transaction; `null` until settled. */
  balance_after_credits: z.number().int().nullable(),
  created_at: z.string().datetime(),
  finished_at: z.string().datetime().nullable(),
});
export type ReferenceAnalysis = z.infer<typeof referenceAnalysis>;

export const analysisQuoteResponse = z.strictObject({
  asset_id: assetId,
  /** What starting it now holds and, once it succeeds, charges: 0 when the asset already has a live analysis to answer. */
  credits_estimate: z.number().int().nonnegative(),
  /** The analysis a start would answer for free, or `null` when a start would begin a new, paid one. */
  replays_analysis_id: referenceAnalysisId.nullable(),
  warnings: z.array(z.string()),
});
export type AnalysisQuoteResponse = z.infer<typeof analysisQuoteResponse>;

/** What a client reads: a new state, error code or profile field must not break an installed client. */
export const referenceAnalysisRead = referenceAnalysis.extend({
  state: z.string(),
  reference_profile: z.record(z.string(), z.unknown()).nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  // A server from before #927 sends no money fields.
  credits_reserved: referenceAnalysis.shape.credits_reserved.optional(),
  credits_charged: referenceAnalysis.shape.credits_charged.optional(),
  balance_after_credits: referenceAnalysis.shape.balance_after_credits.optional(),
});
export type ReferenceAnalysisRead = z.infer<typeof referenceAnalysisRead>;

/** Rule 3: every element we cannot draw is said in `warnings[]` too, not only inside the profile. */
export function referenceAnalysisWarnings(profile: ReferenceProfile): string[] {
  return [...profile.unmapped.map((entry) =>
    `beat ${entry.beat_index}: ${entry.what} is not drawn by our templates; substitute: ${entry.suggested_substitute}`), ...profile.analysis.warnings ?? []];
}

export const ANALYZE_REFERENCE_DESCRIPTION =
  "Read a reference ad into a reference_profile: its beats (role, timing as shares of the clip, whether the presenter " +
  "speaks, listens or is off screen), the graphics in our template vocabulary, captions, pacing, palette and music. " +
  "What we cannot draw is in unmapped with a substitute and in warnings. Pass asset_id of an MP4 asset (create_asset " +
  `with kind: "video"), at most ${ASSET_VIDEO_MAX_SECONDS} s and 100 MiB; there is no url input. ` +
  `${REFERENCE_ANALYSIS_CREDITS} credits are held at the start and charged once it succeeds; a failed analysis costs ` +
  `nothing. ${REFERENCE_ANALYSIS_PER_HOUR} new analyses per hour per account. Answers at once with state queued; call ` +
  "get_reference_analysis every 10 seconds until succeeded (about a minute) or failed. The same asset returns the " +
  "same analysis, free, unless it failed. The asset is not changed. The profile names techniques; it copies no face, voice, " +
  "music or brand of the reference.";

export const GET_REFERENCE_ANALYSIS_DESCRIPTION =
  "Read an analysis started by analyze_reference: state queued or analyzing, succeeded with reference_profile and " +
  "warnings, or failed with error.code and error.message (timed_out, analysis_failed, asset_gone, enqueue_failed); " +
  "credits_charged is the price once succeeded, 0 once failed. Free.";

export const QUOTE_ANALYSIS_DESCRIPTION =
  "Price analyze_reference for an asset before starting it: credits_estimate is what a start holds and charges once it " +
  "succeeds, 0 when the asset already has an analysis that a start would answer (replays_analysis_id). Free; starts nothing.";
