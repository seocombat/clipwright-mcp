import { readFileSync } from "node:fs";
import type { FacelessShotsContext } from "../edit-faceless.js";
import type { EditRules } from "../edit-rules.js";
import type { PlannedRunShots, UnplannedRunShots, ViewShot } from "../edit-shots.js";
import { parseCutStyle } from "../faceless-cut-style.js";
import { parseFacelessPublicStory, planPublicFacelessStory, type FacelessPublicPlan } from "../faceless-public-plan.js";

export const FACELESS_FIXTURE_RUN_ID = "run_929e3c321d744bc9ad16ed4c232ebfcc";
const LONG_FORM_FIXTURE_RUN_ID ="run_longform16x9";
const AVAILABLE_UNTIL = "2026-10-19T00:00:00.000Z";

/** Freezes a value all the way down, so a function that writes to its argument throws; a Map or Set refuses its writers. */
export function frozen<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Map || value instanceof Set) {
    const refuse = () => { throw new TypeError("write to a frozen collection"); };
    Object.assign(value, { set: refuse, add: refuse, delete: refuse, clear: refuse });
    [...value.values()].forEach(frozen);
  }
  Object.freeze(value);
  Object.values(value).forEach(frozen);
  return value;
}

const lineageAlone =(runId: string) => ({ source_run_id: null, root_run_id: runId, revisions: [] });

/** The plan of the delivered run 929e3c32, built as `faceless-public-plan.test.ts` builds it: 17 shots, 1041 frames. */
export function facelessPlanFixture(): FacelessPublicPlan {
  const style = parseCutStyle(JSON.parse(readFileSync(new URL("../fixtures/cut-style-profile-v1.json", import.meta.url), "utf8")));
  const run = JSON.parse(readFileSync(new URL("../fixtures/faceless-pace-run-929e3c32.json", import.meta.url), "utf8")) as {
    script: string; narrationStartFrame: number; outputFrames: number; words: [string, number, number][]; beats: [number, number, string, string][] };
  const words = run.words.map(([word, start, end]) => ({ word, startSec: start / 1000, endSec: end / 1000 }));
  const story = parseFacelessPublicStory({ script: run.script, narrationStartFrame: run.narrationStartFrame,
    beats: run.beats.map(([wordStart, wordEnd, reason, phase], i) => ({ id: `beat-${i + 1}`, wordStart, wordEnd,
      mediaType: i ? "image" : "video", reason, phase, visualPrompt: `Scene ${i}` })) });
  return planPublicFacelessStory(story, words, style, run.outputFrames);
}

/** An editable run with both exposures open and every shot generated; the opener holds 125 frames of footage. */
export function editableContext(overrides: Partial<FacelessShotsContext> = {}): FacelessShotsContext {
  return {
    runId: FACELESS_FIXTURE_RUN_ID,
    editable: { state: "editable", media_available_until: AVAILABLE_UNTIL, reason: null },
    lineage: lineageAlone(FACELESS_FIXTURE_RUN_ID),
    paidEdits: { enabled: false, reason: "not priced" }, pricing: null,
    captions: true, contractVersion: "test",
    exposure: { descriptions: true, source_media: true },
    media: new Map(facelessPlanFixture().shots.map((shot, i) => [shot.id, { source: "generated" as const,
      previewUrl: `https://media.example.test/${FACELESS_FIXTURE_RUN_ID}/${shot.id}.${i ? "jpg" : "mp4"}`, mediaFrames: i ? null : 125 }])),
    ...overrides,
  };
}

export function unplannedShotsFixture(state: "not_succeeded" | "unsupported_line"): UnplannedRunShots {
  const failed = state === "not_succeeded";
  const runId = failed ? "run_failed0faceless" : "run_delivered0ugc";
  return {
    planned: false, run_id: runId, line: failed ? "faceless" : "ugc",
    editable: { state, media_available_until: null, reason: failed ? "the run did not succeed" : "this line has no editor yet" },
    lineage: lineageAlone(runId), contract_version: "test",
  };
}

const LONG_FORM_RULES: EditRules = {
  kinds: {
    picture: { min_frames: 25, max_frames: 3000, movable: true, resizable: true },
    clip: { min_frames: 25, max_frames: 3000, movable: true, resizable: true },
    presenter: { min_frames: 25, max_frames: 100000, movable: false, resizable: true },
  },
  output_coverage: "union", first_visual_kind: null, picture_assets_unique: false, visual_covers_presenter: true,
  add_visual: "over_presenter", reuse_source_asset: false, upload_aspect: null, max_generated_per_revision: 8,
};

/** A 16:9 view of 2700 frames that tiles as long-form slots do: three presenter takes and three inserts, two words a shot. */
export function longFormShotsFixture(): PlannedRunShots {
  const slots = [
    ["take-1", "presenter", 0, 200], ["insert-1", "picture", 200, 500], ["insert-2", "clip", 500, 900],
    ["take-2", "presenter", 900, 1500], ["insert-3", "picture", 1500, 1800], ["take-3", "presenter", 1800, 2700],
  ] as const;
  const shots = slots.map(([id, kind, start, end], index): ViewShot => ({
    id, index, track: kind === "presenter" ? "presenter" : "visual", kind, start_frame: start, end_frame: end,
    first_word: index * 2, end_word: index * 2 + 2,
    description: `Slot ${index}`, preview_url: `https://media.example.test/${LONG_FORM_FIXTURE_RUN_ID}/${id}.jpg`,
    source: "generated",
    media_frames: kind === "presenter" ? end - start : kind === "clip" ? 450 : null,
    media_offset_frames: kind === "picture" ? null : 0,
    operations: kind === "presenter" ? ["cover", "retime"] : ["upload", "retime", "delete"],
  }));
  const words = slots.flatMap(([, , start, end], index) => [start, (start + end) / 2].map((frame, half) => ({
    index: index * 2 + half, text: `word${index * 2 + half}`, start_ms: frame * 40 + 80, end_ms: frame * 40 + 480 })));
  return {
    planned: true, run_id: LONG_FORM_FIXTURE_RUN_ID, line: "long_form",
    frame: { width: 1920, height: 1080, aspect_ratio: "16:9" }, timebase: { fps: 25 },
    duration_frames: 2700, captions: true,
    narration: { offset_frames: 0, words },
    tracks: [{ id: "presenter", shots: shots.filter(shot => shot.track === "presenter") },
      { id: "visual", shots: shots.filter(shot => shot.track === "visual") }],
    rules: structuredClone(LONG_FORM_RULES),
    editable: { state: "editable", media_available_until: AVAILABLE_UNTIL, reason: null },
    lineage: lineageAlone(LONG_FORM_FIXTURE_RUN_ID),
    withheld: [], pricing: null, paid_edits: { enabled: false, reason: "not priced" }, contract_version: "test",
  };
}
