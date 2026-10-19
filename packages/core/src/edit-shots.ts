import { z } from "zod";
import { frame, frameCount, shotId } from "./edit-primitives.js";
import { EDIT_LINES, SHOT_ACTIONS, SHOT_KINDS, SHOT_SOURCES, SHOT_TRACKS, editRules } from "./edit-rules.js";
import { runId } from "./runs.js";
import { ASPECT_RATIOS } from "./skills.js";

/** The tariff a paid edit is priced by; the prices join it later, so further keys pass through. */
export const editPricing = z.object({ tariff_id: z.string().min(1) }).passthrough();

const word = z.object({ index: frame, text: z.string().min(1), start_ms: frame, end_ms: frame.positive() });

export const viewShot = z.object({
  id: shotId, index: frame, track: z.enum(SHOT_TRACKS), kind: z.enum(SHOT_KINDS),
  start_frame: frame, end_frame: frame.positive(),
  first_word: frame.nullable(), end_word: frame.nullable(),
  description: z.string().nullable(), preview_url: z.string().url().nullable(),
  source: z.enum(SHOT_SOURCES),
  media_frames: frameCount.nullable(), media_offset_frames: frame.nullable(),
  operations: z.array(z.enum(SHOT_ACTIONS)),
});
export type ViewShot = z.infer<typeof viewShot>;

const lineage = z.object({ source_run_id: runId.nullable(), root_run_id: runId, revisions: z.array(z.object({ run_id: runId, state: z.string() })) });
const until = z.string().datetime().nullable();

/** A run whose plan is recorded: its timeline, its words and the rules an edit of it must keep. */
export const plannedRunShots = z.object({
  planned: z.literal(true),
  run_id: runId, line: z.enum(EDIT_LINES),
  frame: z.object({ width: frameCount, height: frameCount, aspect_ratio: z.enum(ASPECT_RATIOS) }),
  timebase: z.object({ fps: z.number().int().positive() }),
  duration_frames: frameCount, captions: z.boolean().nullable(),
  narration: z.object({ offset_frames: frame, words: z.array(word) }),
  tracks: z.array(z.object({ id: z.enum(SHOT_TRACKS), shots: z.array(viewShot) })),
  rules: editRules,
  // `view_only`: the run's shots are shown, and no draft of them is kept yet (long form, #604 S7a).
  editable: z.object({ state: z.enum(["editable", "view_only", "expired", "not_recorded"]), media_available_until: until, reason: z.string().nullable() }),
  lineage,
  withheld: z.array(z.enum(["description", "source_media"])),
  pricing: editPricing.nullable(),
  paid_edits: z.object({ enabled: z.boolean(), reason: z.string().nullable() }),
  contract_version: z.string().min(1),
});

/** A run with no plan to show: it carries no frame, duration, words or rules, and none are invented. */
export const unplannedRunShots = z.object({
  planned: z.literal(false),
  run_id: runId, line: z.enum(EDIT_LINES),
  editable: z.object({ state: z.enum(["not_succeeded", "unsupported_line", "not_recorded"]), media_available_until: until, reason: z.string().min(1) }),
  lineage,
  contract_version: z.string().min(1),
});

export const runShots = z.discriminatedUnion("planned", [plannedRunShots, unplannedRunShots]);
export type PlannedRunShots = z.infer<typeof plannedRunShots>;
export type UnplannedRunShots = z.infer<typeof unplannedRunShots>;
export type RunShots = z.infer<typeof runShots>;

// What installed clients parse: every closed vocabulary is an open string, and `rules` is opaque.
const editableRead = z.object({ state: z.string(), media_available_until: until, reason: z.string().nullable() });
const viewShotRead = viewShot.extend({ track: z.string(), kind: z.string(), source: z.string(), operations: z.array(z.string()) });
export const plannedRunShotsRead = plannedRunShots.extend({
  line: z.string(),
  frame: z.object({ width: frameCount, height: frameCount, aspect_ratio: z.string() }),
  tracks: z.array(z.object({ id: z.string(), shots: z.array(viewShotRead) })),
  rules: z.record(z.string(), z.unknown()),
  editable: editableRead,
  withheld: z.array(z.string()),
});
export const unplannedRunShotsRead = unplannedRunShots.extend({ line: z.string(), editable: editableRead });
export const runShotsRead = z.discriminatedUnion("planned", [plannedRunShotsRead, unplannedRunShotsRead]);
export type RunShotsRead = z.infer<typeof runShotsRead>;

/** The path of a run's shots. The id is encoded, since it comes from the caller. */
export const runShotsPath = (id: string): string => `/v1/runs/${encodeURIComponent(id)}/shots`;
