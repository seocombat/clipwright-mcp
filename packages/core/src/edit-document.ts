import { z } from "zod";
import { shotOperation, type ShotChange } from "./edit-operations.js";
import { frame, shotId } from "./edit-primitives.js";
import { EDIT_MAX_DISCARDED, EDIT_MAX_SHOTS, SHOT_KINDS, SHOT_TRACKS } from "./edit-rules.js";
import type { PlannedRunShots } from "./edit-shots.js";
import { EDIT_ISSUE_CODES } from "./edit-validate.js";
import { facelessShotTransitions } from "./faceless-media-record.js";
import { runId } from "./runs.js";
import { uploadId } from "./uploads.js";

export const editAsset = z.discriminatedUnion("from", [
  z.strictObject({ from: z.literal("source"), shot_id: shotId }),
  z.strictObject({ from: z.literal("candidate"), run_id: runId }),
  z.strictObject({ from: z.literal("upload"), upload_id: uploadId }),
  z.strictObject({ from: z.literal("generate"), operation: shotOperation }),
]);
export type EditAsset = z.infer<typeof editAsset>;

export const editShot = z.strictObject({
  id: shotId, track: z.enum(SHOT_TRACKS), kind: z.enum(SHOT_KINDS),
  start_frame: frame, end_frame: frame.positive(),
  media_offset_frames: frame.optional(),
  asset: editAsset,
});
export type EditShot = z.infer<typeof editShot>;

export const editDocument = z.strictObject({
  v: z.literal(1), source_run_id: runId,
  timebase: z.strictObject({ fps: z.number().int().positive() }),
  duration_frames: z.number().int().positive().safe(),
  shots: z.array(editShot).min(1).max(EDIT_MAX_SHOTS),
  discarded: z.array(runId).max(EDIT_MAX_DISCARDED).default([]),
  transitions: facelessShotTransitions.nullable().optional(),
});
export type EditDocument = z.infer<typeof editDocument>;

export const EDIT_DOCUMENT_MAX_BYTES = 256_000;

export function serializeEditDocument(document: EditDocument): { json: string; bytes: number } {
  const json = JSON.stringify(document);
  return { json, bytes: new TextEncoder().encode(json).length };
}

const customIssue = "custom" as const;

export const saveRunEdit = z.strictObject({
  base_version: z.number().int().nonnegative(),
  document: editDocument,
}).superRefine((save, context) => {
  const { bytes } = serializeEditDocument(save.document);
  if (bytes > EDIT_DOCUMENT_MAX_BYTES) {
    context.addIssue({ code: customIssue, path: ["document"],
      message: `the document is ${bytes} bytes as stored; a draft holds at most ${EDIT_DOCUMENT_MAX_BYTES}` });
  }
});
export type SaveRunEdit = z.infer<typeof saveRunEdit>;

const editIssue = z.object({
  code: z.enum(EDIT_ISSUE_CODES), shot_id: z.string().optional(), from_frame: frame.optional(), to_frame: frame.optional(),
  message: z.string().min(1),
});

export const runEdit = z.object({
  run_id: runId,
  version: z.number().int().nonnegative(),
  document: editDocument,
  issues: z.array(editIssue),
  updated_at: z.string().datetime().nullable(),
});
export type RunEdit = z.infer<typeof runEdit>;

const editShotRead = z.looseObject({
  id: shotId, track: z.string(), kind: z.string(),
  start_frame: frame, end_frame: frame.positive(),
  media_offset_frames: frame.optional(),
  asset: z.looseObject({ from: z.string() }),
});
export const editDocumentRead = z.looseObject({
  v: z.literal(1), source_run_id: runId,
  timebase: z.looseObject({ fps: z.number().int().positive() }),
  duration_frames: z.number().int().positive().safe(),
  shots: z.array(editShotRead),
  discarded: z.array(runId).default([]),
});
export type EditDocumentRead = z.infer<typeof editDocumentRead>;

export const runEditRead = runEdit.extend({
  document: editDocumentRead,
  issues: z.array(editIssue.extend({ code: z.string() })),
});
export type RunEditRead = z.infer<typeof runEditRead>;
export type SaveRunEditArgs = { base_version: number; document: z.input<typeof editDocumentRead> };

export const runEditPath = (id: string): string => `/v1/runs/${encodeURIComponent(id)}/edit`;

export function identityEditDocument(shots: PlannedRunShots): EditDocument {
  return {
    v: 1, source_run_id: shots.run_id, timebase: { fps: shots.timebase.fps }, duration_frames: shots.duration_frames,
    shots: shots.tracks.flatMap(track => track.shots.map((shot): EditShot => ({
      id: shot.id, track: shot.track, kind: shot.kind, start_frame: shot.start_frame, end_frame: shot.end_frame,
      ...(shot.media_offset_frames === null ? {} : { media_offset_frames: shot.media_offset_frames }),
      asset: { from: "source", shot_id: shot.id },
    }))),
    discarded: [],
  };
}

export function applyShotChanges(document: EditDocument, changes: ShotChange[]): EditDocument {
  const operations = new Map<string, ShotChange["operation"]>();
  for (const change of changes) {
    if (operations.has(change.shot_id)) throw new Error(`shot ${change.shot_id} is named twice`);
    if (!document.shots.some(shot => shot.id === change.shot_id)) throw new Error(`unknown shot ${change.shot_id}`);
    operations.set(change.shot_id, change.operation);
  }
  return { ...document, shots: document.shots.map((shot): EditShot => {
    const operation = operations.get(shot.id);
    return operation ? { ...shot, asset: { from: "generate", operation } } : shot;
  }) };
}
