import { freezeResolvedTimeline, type ResolvedTimeline } from "../resolved-timeline.js";
import type { LongFormWordTimings } from "../edit-long-form.js";
import type { LongFormOverlay } from "../long-form-revision.js";

/** The slots of the one delivered long-form run on production (2026-09-21): two takes of the presenter and two 20 s pictures, */
/** 1728 frames at 25 fps, 29.12 s of face billed. Hashes, keys and words are made up; the frames and durations are the run's. */
export const LONG_FORM_RUN_ID = "run_longform0fixture";
const hex = (seed: string): string => seed.repeat(64).slice(0, 64);

export function segmentsTimelineFixture(): ResolvedTimeline {
  return freezeResolvedTimeline({
    version: 1, mode: "segments", runId: LONG_FORM_RUN_ID, accountId: "acc_fixture", inputHash: hex("a"), fps: 25,
    outputFrames: 1728, fullSpeechDurationSec: 29.12, warnings: [],
    slots: [
      { position: 1, startFrame: 0, endFrame: 376, kind: "actor", requestHash: hex("1"), speechDurationSec: 15.04 },
      { position: 2, startFrame: 376, endFrame: 876, kind: "media", key: `runs/${LONG_FORM_RUN_ID}/seg2/media.image`, sha256: hex("2"),
        bytes: 50986, width: 1920, height: 1080, durationSec: 20, mediaType: "image", contentType: "image/png" },
      { position: 3, startFrame: 876, endFrame: 1228, kind: "actor", requestHash: hex("3"), speechDurationSec: 14.08 },
      { position: 4, startFrame: 1228, endFrame: 1728, kind: "media", key: `runs/${LONG_FORM_RUN_ID}/seg4/media.image`, sha256: hex("4"),
        bytes: 47383, width: 1920, height: 1080, durationSec: 20, mediaType: "image", contentType: "image/png" },
    ],
  });
}

/** Words of a segment: `count` words spread evenly over `seconds`, each from the segment's own start. */
export function segmentWords(prefix: string, count: number, seconds: number): LongFormWordTimings {
  const step = seconds / count;
  return Array.from({ length: count }, (_, at) => ({ word: `${prefix}${at}`, startSec: at * step, endSec: at * step + step * 0.8 }));
}

/** The word timings of the segments fixture, by key. */
export function segmentsTimingsFixture(): Map<string, LongFormWordTimings> {
  return new Map([
    [`runs/${LONG_FORM_RUN_ID}/seg1/timings.json`, segmentWords("one", 45, 15.04)],
    [`runs/${LONG_FORM_RUN_ID}/seg3/timings.json`, segmentWords("three", 40, 14.08)],
  ]);
}

/** A script-with-inserts run: one narration over 40 s, a 10 s clip insert from 8 s, a picture insert of 5 s from 25 s. */
export function scriptInsertsTimelineFixture(): ResolvedTimeline {
  const narration = { key: `runs/${LONG_FORM_RUN_ID}/narration/${hex("9")}.wav`, sha256: hex("9"), bytes: 1000, alignmentHash: hex("8"),
    semanticPlan: { sourceTokens: Array.from({ length: 80 }, (_, at) => `t${at}`),
      inserts: [{ insertId: "ins-a", mediaId: "m-a", startWord: 16, endWord: 36 }, { insertId: "ins-b", mediaId: "m-b", startWord: 50, endWord: 60 }] } };
  const audio = (seed: string) => ({ key: `runs/${LONG_FORM_RUN_ID}/narration/${hex(seed)}.wav`, sha256: hex(seed), bytes: 100 });
  return freezeResolvedTimeline({
    version: 1, mode: "script_inserts", runId: LONG_FORM_RUN_ID, accountId: "acc_fixture", inputHash: hex("b"), fps: 25,
    outputFrames: 1000, fullSpeechDurationSec: 40, warnings: [], narration,
    slots: [
      { position: 1, startFrame: 0, endFrame: 200, kind: "actor", requestHash: hex("c"), speechDurationSec: 8, audio: audio("5") },
      { position: 2, startFrame: 200, endFrame: 450, kind: "media", key: `runs/${LONG_FORM_RUN_ID}/inserts/ins-a.mp4`, sha256: hex("d"),
        bytes: 900000, width: 1920, height: 1080, durationSec: 10, mediaType: "video", contentType: "video/mp4", insertId: "ins-a" },
      { position: 3, startFrame: 450, endFrame: 625, kind: "actor", requestHash: hex("e"), speechDurationSec: 7, audio: audio("6") },
      { position: 4, startFrame: 625, endFrame: 750, kind: "media", key: `runs/${LONG_FORM_RUN_ID}/inserts/ins-b.image`, sha256: hex("f"),
        bytes: 40000, width: 1920, height: 1080, durationSec: 5, mediaType: "image", contentType: "image/png", insertId: "ins-b" },
      { position: 5, startFrame: 750, endFrame: 1000, kind: "actor", requestHash: hex("0"), speechDurationSec: 10, audio: audio("7") },
    ],
  });
}

/** The segments fixture with its first insert cut to 0.3 s (8 frames) and the rest moved up to follow it. */
export function shortInsertTimelineFixture(): ResolvedTimeline {
  const { hash: _hash, ...content } = segmentsTimelineFixture();
  const [take1, insert2, take3, insert4] = content.slots;
  return freezeResolvedTimeline({ ...content, outputFrames: 1236, slots: [take1, { ...insert2!, durationSec: 0.3, endFrame: 384 },
    { ...take3!, startFrame: 384, endFrame: 736 }, { ...insert4!, startFrame: 736, endFrame: 1236 }] });
}

/** A revision of the segments fixture. */
export const LONG_FORM_REVISION_ID = "run_longformrevision1";

/** The timeline with every stored key moved under another run, as a revision copies its sources. */
export function reboundTimeline(timeline: ResolvedTimeline, runId: string): ResolvedTimeline {
  const { hash: _hash, ...content } = timeline;
  const move = (key: string) => key.replace(`runs/${timeline.runId}/`, `runs/${runId}/`);
  return freezeResolvedTimeline({ ...content, runId,
    slots: content.slots.map((slot) => (slot.kind === "media" ? { ...slot, key: move(slot.key) }
      : slot.audio ? { ...slot, audio: { ...slot.audio, key: move(slot.audio.key) } } : slot)),
    ...(content.narration ? { narration: { ...content.narration, key: move(content.narration.key) } } : {}) });
}

/** A picture drawn over the revision's tiling, stored under the revision's own prefix. */
export function overlayFixture(shotId: string, startFrame: number, endFrame: number, over: Partial<LongFormOverlay> = {}): LongFormOverlay {
  return { shot_id: shotId, start_frame: startFrame, end_frame: endFrame,
    object: { key: `runs/${LONG_FORM_REVISION_ID}/overlays/${shotId}.png`, sha256: hex("e"), bytes: 40000, width: 1920, height: 1080,
      content_type: "image/png" },
    origin: "upload", motion: null, ...over };
}

/** The record of a revision of the segments fixture as stored: by default one cover over frames 900–1000 of the second take. */
export function revisionRecordFixture(visual: LongFormOverlay[] = [overlayFixture("cover-1", 900, 1000)]): unknown {
  return JSON.parse(JSON.stringify({ version: 1, run_id: LONG_FORM_REVISION_ID, account_id: "acc_fixture",
    source_run_id: LONG_FORM_RUN_ID, root_run_id: LONG_FORM_RUN_ID,
    base: reboundTimeline(segmentsTimelineFixture(), LONG_FORM_REVISION_ID), visual }));
}

/** The segments fixture's word timings under the revision's prefix. */
export function revisionTimingsFixture(): Map<string, LongFormWordTimings> {
  return new Map([...segmentsTimingsFixture()].map(([key, words]) => [key.replace(LONG_FORM_RUN_ID, LONG_FORM_REVISION_ID), words]));
}
