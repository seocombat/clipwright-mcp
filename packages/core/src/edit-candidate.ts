import { z } from "zod";
import { SHOT_OPERATION_MODES, shotId, shotOperation } from "./edit-operations.js";
import { runCandidate, runId, runState } from "./runs.js";

/** One generated picture or clip for one shot. `take` makes a deliberate retry a new run; the same take replays the first. */
export const candidateRequest = z.strictObject({
  shot_id: shotId,
  operation: shotOperation,
  take: z.number().int().positive().safe(),
});
export type CandidateRequest = z.infer<typeof candidateRequest>;

const credits = z.number().int().positive().safe();

/** What a candidate would cost: one unit, charged once it is published, kept or discarded. */
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

/** The input a candidate run stores: the request, and what admission resolved for the worker. */
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

/** The candidates of one family, oldest first, each with its run's state and money. */
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
  contract_version: z.string().min(1),
});
export type RunCandidates = z.infer<typeof runCandidates>;

// What installed clients parse: kinds, modes, units and states are open strings, and unknown keys are kept.
export const candidateQuoteRead = candidateQuote.extend({
  kind: z.string().min(1), operation_mode: z.string().min(1), unit: z.string().min(1),
}).loose();
export type CandidateQuoteRead = z.infer<typeof candidateQuoteRead>;

const listedCandidate = runCandidates.shape.candidates.element;
export const runCandidatesRead = runCandidates.extend({
  candidates: z.array(listedCandidate.extend({
    kind: z.string().min(1), operation_mode: z.string().min(1).nullable(), state: z.string().min(1),
  }).loose()),
}).loose();
export type RunCandidatesRead = z.infer<typeof runCandidatesRead>;

/** The one sentence every client and the docs page state a shot candidate's charge by. */
export const CANDIDATE_CHARGE_TEXT =
  "A delivered candidate is charged its one unit whether it is kept or discarded; one that fails is charged nothing, even when its paid work was already done.";

/** The paths of a run's candidate quote, start and list. The id is encoded, since it comes from the caller. */
export const runCandidatesQuotePath = (id: string): string => `/v1/runs/${encodeURIComponent(id)}/candidates/quote`;
export const runCandidatesPath = (id: string): string => `/v1/runs/${encodeURIComponent(id)}/candidates`;
