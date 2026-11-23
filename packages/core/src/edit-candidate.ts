import { z } from "zod";
import { SHOT_OPERATION_MODES, shotId, shotOperation } from "./edit-operations.js";
import { maxCreditsField } from "./max-credits.js";
import { runCandidate, runId, runState } from "./runs.js";

export const candidateRequest = z.strictObject({
  shot_id: shotId,
  operation: shotOperation,
  take: z.number().int().positive().safe(),
  max_credits: maxCreditsField,
});
export type CandidateRequest = z.infer<typeof candidateRequest>;

const credits = z.number().int().positive().safe();

export const candidateQuote = z.strictObject({
  source_run_id: runId,
  root_run_id: runId,
  shot_id: shotId,
  kind: z.enum(["picture", "clip"]),
  operation_mode: z.enum(SHOT_OPERATION_MODES),
  unit: z.enum(["picture", "clip", "clip_with_new_picture"]),
  credits,
  usable_until: z.string().datetime(),
  warnings: z.array(z.string()),
  contract_version: z.string().min(1),
});
export type CandidateQuote = z.infer<typeof candidateQuote>;

export const storedCandidateInput = z.strictObject({
  source_run_id: runId,
  ...candidateRequest.shape,
  resolved_candidate: z.strictObject({
    root_run_id: runId,
    shot_kind: z.enum(["picture", "clip"]),
    unit: candidateQuote.shape.unit,
    credits,
  }),
});
export type StoredCandidateInput = z.infer<typeof storedCandidateInput>;

export const runCandidates = z.strictObject({
  run_id: runId,
  root_run_id: runId,
  candidates: z.array(runCandidate.extend({
    run_id: runId,
    state: runState,
    credits_reserved: z.number().int().nonnegative(),
    credits_charged: z.number().int().nonnegative().nullable(),
    created_at: z.string().datetime(),
    finished_at: z.string().datetime().nullable(),
  })),
  warnings: z.array(z.string()),
  contract_version: z.string().min(1),
});
export type RunCandidates = z.infer<typeof runCandidates>;

export const candidateQuoteRead = candidateQuote.extend({
  kind: z.string().min(1), operation_mode: z.string().min(1), unit: z.string().min(1),
}).loose();
export type CandidateQuoteRead = z.infer<typeof candidateQuoteRead>;

const listedCandidate = runCandidates.shape.candidates.element;
export const runCandidatesRead = runCandidates.extend({
  candidates: z.array(listedCandidate.extend({
    kind: z.string().min(1), operation_mode: z.string().min(1).nullable(), state: z.string().min(1),
  }).loose()),
  warnings: z.array(z.string()).optional(),
}).loose();
export type RunCandidatesRead = z.infer<typeof runCandidatesRead>;

export const CANDIDATE_CHARGE_TEXT =
  "A delivered candidate is charged its one unit whether it is kept or discarded; one that fails is charged nothing.";

export const runCandidatesQuotePath = (id: string): string => `/v1/runs/${encodeURIComponent(id)}/candidates/quote`;
export const runCandidatesPath = (id: string): string => `/v1/runs/${encodeURIComponent(id)}/candidates`;
