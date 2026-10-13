import { FACELESS_EDIT_RULES, facelessShotActions, type ShotSource } from "./edit-rules.js";
import type { PlannedRunShots } from "./edit-shots.js";
import type { FacelessPublicPlan } from "./faceless-public-plan.js";

export interface FacelessShotsContext {
  runId: string;
  editable: PlannedRunShots["editable"];
  lineage: PlannedRunShots["lineage"];
  paidEdits: PlannedRunShots["paid_edits"];
  pricing: PlannedRunShots["pricing"];
  captions: boolean | null;
  contractVersion: string;
  /** What this reader may see: a closed side is nulled in the view and named in `withheld`. */
  exposure: { descriptions: boolean; source_media: boolean };
  /** By shot id; `null` when the run's media record is gone. */
  media: ReadonlyMap<string, { source: "generated" | "customer"; previewUrl: string | null; mediaFrames: number | null }> | null;
}

/** The shots view of a faceless run, read from its stored plan. The line's frame and timebase are stated here, once. */
export function facelessRunShots(plan: FacelessPublicPlan, context: FacelessShotsContext): PlannedRunShots {
  const { exposure, media } = context;
  const editable = context.editable.state === "editable";
  return {
    planned: true, run_id: context.runId, line: "faceless",
    frame: { width: 1080, height: 1920, aspect_ratio: "9:16" },
    timebase: { fps: 25 },
    duration_frames: plan.outputFrames, captions: context.captions,
    narration: { offset_frames: plan.narrationStartFrame, words: plan.words.map((word, index) => ({
      index, text: word.word, start_ms: Math.round(word.startSec * 1000), end_ms: Math.round(word.endSec * 1000) })) },
    tracks: [{ id: "visual", shots: plan.shots.map((shot, index) => {
      // The word each neighbouring cut falls after; a plan that records no cut gives the shot no word range.
      const cutBefore = index === 0 ? -1 : plan.shots[index - 1]!.cutAfterWord;
      const cutAfter = index === plan.shots.length - 1 ? plan.words.length - 1 : shot.cutAfterWord;
      const ranged = cutBefore !== undefined && cutAfter !== undefined;
      const asset = media?.get(shot.id);
      const source: ShotSource = asset?.source ?? "unknown";
      return {
        id: shot.id, index, track: "visual" as const, kind: shot.mediaType === "video" ? "clip" as const : "picture" as const,
        start_frame: shot.startFrame, end_frame: shot.endFrame,
        first_word: ranged ? cutBefore + 1 : null, end_word: ranged ? cutAfter + 1 : null,
        description: exposure.descriptions ? shot.visualPrompts.join(" ") : null,
        preview_url: exposure.source_media ? asset?.previewUrl ?? null : null,
        source,
        media_frames: shot.mediaType === "video" ? asset?.mediaFrames ?? null : null, media_offset_frames: null,
        operations: editable ? facelessShotActions({ index, source }) : [],
      };
    }) }],
    rules: FACELESS_EDIT_RULES,
    editable: context.editable, lineage: context.lineage,
    withheld: [...(exposure.descriptions ? [] : ["description" as const]), ...(exposure.source_media ? [] : ["source_media" as const])],
    pricing: context.pricing, paid_edits: context.paidEdits,
    contract_version: context.contractVersion,
  };
}
