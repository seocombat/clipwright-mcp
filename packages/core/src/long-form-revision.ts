import { z } from "zod";
import { editSummaryWire, revisionBilling } from "./edit-billing.js";
import { editDocument } from "./edit-document.js";
import { longFormSlotShotId } from "./edit-long-form.js";
import { frame, frameCount, shotId } from "./edit-primitives.js";
import { EDIT_MAX_SHOTS } from "./edit-rules.js";
import { readResolvedTimeline, type ResolvedTimeline } from "./resolved-timeline.js";
import { runId } from "./runs.js";
import { ASPECT_RATIOS } from "./skills.js";

// A revision of a long-form run (#604 S7b): the input its admission stores, and the record its render writes.

/** How a long-form run fills what a picture leaves of the canvas (`makeUgcInput.background`). */
export const LONG_FORM_BACKGROUNDS = ["white", "blur", "contain"] as const;
export type LongFormBackground = (typeof LONG_FORM_BACKGROUNDS)[number];

/** A picture's zoom, as `makeUgcInput` takes it. */
export const longFormImageMotion = z.strictObject({ direction: z.enum(["in", "out"]), amount: z.number().min(0).lt(1) });
export type LongFormImageMotion = z.infer<typeof longFormImageMotion>;

const RATIO_PARTS = { "16:9": [16, 9], "9:16": [9, 16], "1:1": [1, 1] } as const;

/** What a render needs beyond the timeline, copied from the root's input at admission; a position absent from the motions does not move. */
export const longFormRevisionRender = z.strictObject({
  aspect_ratio: z.enum(ASPECT_RATIOS), width: frameCount, height: frameCount,
  background: z.enum(LONG_FORM_BACKGROUNDS).nullable(),
  motion_by_position: z.record(z.string().regex(/^[1-9][0-9]{0,3}$/), longFormImageMotion),
}).refine((render) => render.width * RATIO_PARTS[render.aspect_ratio][1] === render.height * RATIO_PARTS[render.aspect_ratio][0],
  { message: "the canvas does not have the shape of its aspect ratio" });
export type LongFormRevisionRender = z.infer<typeof longFormRevisionRender>;

/** The stored input of a `revise_long_form` run: the request as resolved, and what admission froze about it. */
export const longFormRevisionInput = z.strictObject({
  input_mode: z.literal("revision"),
  revision: z.strictObject({ source_run_id: runId, document: editDocument }),
  resolved_revision: z.strictObject({ root_run_id: runId, summary: editSummaryWire, billing: revisionBilling, render: longFormRevisionRender }),
});
export type LongFormRevisionInput = z.infer<typeof longFormRevisionInput>;

const digest = z.string().regex(/^[a-f0-9]{64}$/);

/** One changed visual shot, drawn above the source tiling over its whole span. A cover has no motion; an insert keeps its slot's. */
export const longFormOverlay = z.strictObject({
  shot_id: shotId, start_frame: frame, end_frame: frameCount,
  object: z.strictObject({ key: z.string().min(1).max(1024), sha256: digest, bytes: frameCount, width: frameCount, height: frameCount,
    content_type: z.enum(["image/png", "image/jpeg"]) }),
  origin: z.enum(["upload", "source"]),
  motion: longFormImageMotion.nullable(),
});
export type LongFormOverlay = z.infer<typeof longFormOverlay>;

const recordShape = z.strictObject({
  version: z.literal(1),
  run_id: runId, account_id: z.string().min(1).max(200), source_run_id: runId, root_run_id: runId,
  base: z.unknown(),
  visual: z.array(longFormOverlay).max(EDIT_MAX_SHOTS),
});
/** What a delivered long-form revision rendered: the source tiling rebound to its own run and keys, and its overlays. */
export type LongFormRevisionRecord = Omit<z.infer<typeof recordShape>, "base"> & { base: ResolvedTimeline };

/** Where a long-form revision's record is stored, and the most bytes it may take there. */
export const longFormRevisionRecordKey = (id: string): string => `runs/${id}/long-form-revision.v1.json`;
export const LONG_FORM_REVISION_RECORD_MAX_BYTES = 512_000;

/** Whether a key names an object of this run: a plain path under `runs/<runId>/`, with no segment to climb out by. */
export function longFormOwnKey(key: string, id: string): boolean {
  const prefix = `runs/${id}/`;
  return key.startsWith(prefix) && /^[\w-]+(?:\/[\w-]+)*(?:\.[a-z0-9]+)+$/.test(key.slice(prefix.length));
}

/** The stored record of the run being read, checked against that run and against itself: every key and overlay belong to it. */
export function readLongFormRevisionRecord(stored: string | Uint8Array, expected: { runId: string; accountId: string }): LongFormRevisionRecord {
  const bytes = typeof stored === "string" ? new TextEncoder().encode(stored) : stored;
  if (bytes.length > LONG_FORM_REVISION_RECORD_MAX_BYTES) {
    throw new Error(`invalid long-form revision record: ${bytes.length} bytes, at most ${LONG_FORM_REVISION_RECORD_MAX_BYTES}`);
  }
  const parsed = recordShape.parse(JSON.parse(new TextDecoder().decode(bytes)));
  const base = readResolvedTimeline(parsed.base);
  const record = { ...parsed, base };
  const failures: string[] = [];
  if (record.run_id !== expected.runId || record.account_id !== expected.accountId) failures.push("the record belongs to another run or account");
  if (record.run_id === record.source_run_id) failures.push("the revision names itself as its source");
  if (base.runId !== record.run_id || base.accountId !== record.account_id) failures.push("the timeline names another run or account");
  const keys = [...base.slots.flatMap((slot) => (slot.kind === "media" ? [slot.key] : slot.audio ? [slot.audio.key] : [])),
    ...(base.narration ? [base.narration.key] : []), ...record.visual.map((overlay) => overlay.object.key)];
  if (!keys.every((key) => longFormOwnKey(key, record.run_id))) failures.push("a key leaves the run's prefix");

  const slots = new Map(base.slots.map((slot) => [longFormSlotShotId(slot), slot]));
  const ids = new Set<string>();
  for (const overlay of record.visual) {
    const slot = slots.get(overlay.shot_id);
    if (ids.has(overlay.shot_id)) failures.push(`two overlays are ${overlay.shot_id}`);
    ids.add(overlay.shot_id);
    if (overlay.end_frame <= overlay.start_frame || overlay.end_frame > base.outputFrames) failures.push(`${overlay.shot_id} lies outside the video`);
    if (slot?.kind === "actor") failures.push(`${overlay.shot_id} is a presenter take`);
    if (slot?.kind === "media" && slot.mediaType === "video") failures.push(`${overlay.shot_id} is a clip`);
    if (!slot && overlay.motion !== null) failures.push(`${overlay.shot_id} is a cover and does not move`);
    // No presenter time was recorded under an insert, so its overlay keeps every frame of its slot.
    if (slot?.kind === "media" && (overlay.start_frame > slot.startFrame || overlay.end_frame < slot.endFrame)) {
      failures.push(`${overlay.shot_id} leaves part of its slot uncovered`);
    }
  }
  const visual = [...base.slots.flatMap((slot) => (slot.kind === "media" && !ids.has(longFormSlotShotId(slot))
    ? [{ start: slot.startFrame, end: slot.endFrame }] : [])),
    ...record.visual.map((overlay) => ({ start: overlay.start_frame, end: overlay.end_frame }))].sort((a, b) => a.start - b.start);
  let reach = 0;
  for (const span of visual) {
    if (span.start < reach) failures.push("two visual shots overlap");
    reach = Math.max(reach, span.end);
  }
  if (failures.length) throw new Error(`invalid long-form revision record: ${failures.join("; ")}`);
  return record;
}
