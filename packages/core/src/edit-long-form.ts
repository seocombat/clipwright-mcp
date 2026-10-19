import { z } from "zod";
import { EXACT_FIT_EPSILON } from "./canvas-fit.js";
import type { EditRules, ShotAction } from "./edit-rules.js";
import type { PlannedRunShots, ViewShot } from "./edit-shots.js";
import type { LongFormBackground, LongFormOverlay, LongFormRevisionRecord } from "./long-form-revision.js";
import { completeFrames } from "./media-timebase.js";
import type { ResolvedTimeline } from "./resolved-timeline.js";
import type { AspectRatio } from "./skills.js";

// The shots view of a long-form run (#604 S7), read from its resolved timeline and its word timings, or from a revision's record.
// A shot lists operations only while the run states `editable`.

/** The shortest picture over presenter time (owner, Q22: one second). */
export const LONG_FORM_COVER_MIN_FRAMES = 25;

/** What a long-form timeline allows. Without a background nothing paints the bars, so an upload must fill the canvas (rule 4). */
export function longFormEditRules(background: LongFormBackground | null): EditRules {
  return {
    kinds: {
      picture: { min_frames: 1, max_frames: 100_000, movable: true, resizable: true },
      clip: { min_frames: 1, max_frames: 100_000, movable: false, resizable: false },
      presenter: { min_frames: 1, max_frames: 100_000, movable: false, resizable: false },
    },
    output_coverage: "union", first_visual_kind: null, picture_assets_unique: false, visual_covers_presenter: true,
    add_visual: "over_presenter", reuse_source_asset: true,
    upload_aspect: background === null ? { mode: "exact", epsilon: EXACT_FIT_EPSILON } : null,
    max_generated_per_revision: 0, cover_min_frames: LONG_FORM_COVER_MIN_FRAMES,
  };
}

/** A word as a long-form run stores it, in seconds from the start of its own audio. */
export const longFormWordTimings = z.array(z.object({ word: z.string().min(1), startSec: z.number().finite().nonnegative(),
  endSec: z.number().finite().nonnegative() }).strict()).min(1).max(10000);
export type LongFormWordTimings = z.infer<typeof longFormWordTimings>;

/** Where the presenter's recording of an actor slot is stored: one take per slot, in both modes. */
export const longFormTakeKey = (runId: string, position: number): string => `runs/${runId}/seg${position}/avatar.source.mp4`;

/** The word timings a view needs, by key: each actor slot's own in `segments`, the one narration's in `script_inserts`. */
export function longFormTimingKeys(timeline: ResolvedTimeline): string[] {
  return timeline.mode === "script_inserts" ? [`runs/${timeline.runId}/timings.json`]
    : timeline.slots.flatMap((slot) => (slot.kind === "actor" ? [`runs/${timeline.runId}/seg${slot.position}/timings.json`] : []));
}

/** The canvas of a long-form run: the short side is 1080 at every aspect ratio (`apps/web/remotion/canvas.ts`). */
export function longFormFrame(aspect: AspectRatio): PlannedRunShots["frame"] {
  if (aspect === "16:9") return { width: 1920, height: 1080, aspect_ratio: aspect };
  if (aspect === "1:1") return { width: 1080, height: 1080, aspect_ratio: aspect };
  return { width: 1080, height: 1920, aspect_ratio: aspect };
}

/** The run's words on the output's clock: a segment's words shifted to its slot, or the narration's as they are. */
export function longFormWords(timeline: ResolvedTimeline, timings: ReadonlyMap<string, LongFormWordTimings>): PlannedRunShots["narration"]["words"] {
  const keys = longFormTimingKeys(timeline);
  const actors = timeline.slots.filter((slot) => slot.kind === "actor");
  const shifted = keys.flatMap((key, at) => {
    const words = timings.get(key);
    if (!words) throw new Error(`the word timings ${key} are missing`);
    const offsetMs = timeline.mode === "segments" ? Math.round((actors[at]!.startFrame / timeline.fps) * 1000) : 0;
    return words.map((word) => ({ text: word.word, start_ms: offsetMs + Math.round(word.startSec * 1000),
      end_ms: Math.max(offsetMs + Math.round(word.endSec * 1000), offsetMs + Math.round(word.startSec * 1000) + 1) }));
  });
  return shifted.map((word, index) => ({ index, ...word }));
}

export interface LongFormShotsContext {
  runId: string;
  frame: PlannedRunShots["frame"];
  editable: PlannedRunShots["editable"];
  lineage: PlannedRunShots["lineage"];
  captions: boolean | null;
  contractVersion: string;
  exposure: { descriptions: boolean; source_media: boolean };
  /** Signed links by storage key; a key with no link is shown without a picture. */
  previews: ReadonlyMap<string, string>;
  /** The source's `background`, `null` when it named none. */
  background: LongFormBackground | null;
}

/** The words a slot shows: those that start inside its frames. */
function wordRange(words: PlannedRunShots["narration"]["words"], fps: number, start: number, end: number): [number | null, number | null] {
  const inside = words.filter((word) => word.start_ms * fps >= start * 1000 && word.start_ms * fps < end * 1000);
  return inside.length === 0 ? [null, null] : [inside[0]!.index, inside.at(-1)!.index + 1];
}

/** The shot id of a timeline slot: a take by its position, an insert by its position. */
export const longFormSlotShotId = (slot: ResolvedTimeline["slots"][number]): string =>
  `${slot.kind === "actor" ? "take" : "insert"}-${slot.position}`;

/** The planned view of a long-form run: each actor slot a presenter take, each media slot an insert, together tiling the output. */
/** An overlay named after an insert replaces it on the visual track; any other overlay is a cover added by a revision. */
export function longFormRunShots(timeline: ResolvedTimeline, words: PlannedRunShots["narration"]["words"],
  context: LongFormShotsContext, overlays: readonly LongFormOverlay[] = []): PlannedRunShots {
  const preview = (key: string): string | null => (context.exposure.source_media ? context.previews.get(key) ?? null : null);
  const offered = (operations: ShotAction[]): ShotAction[] => (context.editable.state === "editable" ? operations : []);
  const replaced = new Set(overlays.map((overlay) => overlay.shot_id));
  const inserts = new Set(timeline.slots.filter((slot) => slot.kind === "media").map(longFormSlotShotId));
  const placed = (start: number, end: number) => {
    const [first, last] = wordRange(words, timeline.fps, start, end);
    return { start_frame: start, end_frame: end, first_word: first, end_word: last, description: null };
  };
  const shots: Omit<ViewShot, "index">[] = timeline.slots.flatMap((slot): Omit<ViewShot, "index">[] => {
    const id = longFormSlotShotId(slot);
    if (slot.kind === "actor") {
      return [{ ...placed(slot.startFrame, slot.endFrame), id, track: "presenter", kind: "presenter",
        preview_url: preview(longFormTakeKey(timeline.runId, slot.position)), source: "generated",
        media_frames: slot.endFrame - slot.startFrame, media_offset_frames: 0, operations: offered(["cover"]) }];
    }
    if (replaced.has(id)) return [];
    const clip = slot.mediaType === "video";
    return [{ ...placed(slot.startFrame, slot.endFrame), id, track: "visual", kind: clip ? "clip" : "picture",
      preview_url: preview(slot.key), source: "customer",
      media_frames: clip ? completeFrames(slot.durationSec, timeline.fps) : null, media_offset_frames: clip ? 0 : null,
      operations: offered(clip ? [] : ["upload", "retime"]) }];
  });
  for (const overlay of overlays) {
    shots.push({ ...placed(overlay.start_frame, overlay.end_frame), id: overlay.shot_id, track: "visual", kind: "picture",
      preview_url: preview(overlay.object.key), source: overlay.origin === "upload" ? "upload" : "customer",
      media_frames: null, media_offset_frames: null,
      operations: offered(inserts.has(overlay.shot_id) ? ["upload", "retime"] : ["upload", "retime", "delete"]) });
  }
  const ordered: ViewShot[] = shots
    .sort((a, b) => a.start_frame - b.start_frame || (a.track === b.track ? 0 : a.track === "presenter" ? -1 : 1))
    .map((shot, index) => ({ ...shot, index }));
  return {
    planned: true, run_id: context.runId, line: "long_form",
    frame: context.frame, timebase: { fps: timeline.fps },
    duration_frames: timeline.outputFrames, captions: context.captions,
    narration: { offset_frames: 0, words },
    tracks: [{ id: "presenter", shots: ordered.filter((shot) => shot.track === "presenter") },
      { id: "visual", shots: ordered.filter((shot) => shot.track === "visual") }],
    rules: longFormEditRules(context.background),
    editable: context.editable, lineage: context.lineage,
    withheld: [...(context.exposure.descriptions ? [] : ["description" as const]), ...(context.exposure.source_media ? [] : ["source_media" as const])],
    pricing: null, paid_edits: { enabled: false, reason: "long videos cannot be edited yet" },
    contract_version: context.contractVersion,
  };
}

/** The view of a delivered long-form revision: its source tiling with its overlays, one shot per id. */
export function longFormRevisionShots(record: LongFormRevisionRecord, words: PlannedRunShots["narration"]["words"],
  context: LongFormShotsContext): PlannedRunShots {
  return longFormRunShots(record.base, words, context, record.visual);
}
