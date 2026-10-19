import { describe, expect, it } from "vitest";

import {
  LONG_FORM_REVISION_ID, LONG_FORM_RUN_ID, overlayFixture, revisionRecordFixture, revisionTimingsFixture, scriptInsertsTimelineFixture,
  segmentsTimelineFixture, segmentsTimingsFixture, segmentWords, shortInsertTimelineFixture,
} from "./__fixtures__/long-form-timeline.fixture.js";
import { identityEditDocument, type EditDocument, type EditShot } from "./edit-document.js";
import {
  longFormFrame, longFormRevisionShots, longFormRunShots, longFormTakeKey, longFormTimingKeys, longFormWords, type LongFormShotsContext,
} from "./edit-long-form.js";
import type { ShotAction } from "./edit-rules.js";
import { plannedRunShots, type PlannedRunShots } from "./edit-shots.js";
import { presenterVisibleFrames, validateEditDocument, type EditFacts } from "./edit-validate.js";
import { calculateFaceCharge, LONG_FORM_LAUNCH_TARIFF } from "./long-form-pricing.js";
import { readLongFormRevisionRecord, type LongFormBackground } from "./long-form-revision.js";
import { faceBillingUnitsOf, type ResolvedTimeline } from "./resolved-timeline.js";
import { MAX_INSERTS } from "./skills.js";

const TARIFF = LONG_FORM_LAUNCH_TARIFF;

function context(over: Partial<LongFormShotsContext> = {}): LongFormShotsContext {
  return {
    runId: LONG_FORM_RUN_ID, frame: longFormFrame("16:9"),
    editable: { state: "view_only", media_available_until: "2026-10-21T10:00:00.000Z", reason: "editing a long video comes later" },
    lineage: { source_run_id: null, root_run_id: LONG_FORM_RUN_ID, revisions: [] },
    captions: false, contractVersion: "test", exposure: { descriptions: true, source_media: true },
    previews: new Map([[longFormTakeKey(LONG_FORM_RUN_ID, 1), "https://media.example.test/take-1.mp4"],
      [`runs/${LONG_FORM_RUN_ID}/seg2/media.image`, "https://media.example.test/insert-2.png"]]),
    background: null,
    ...over,
  };
}
const segmentsView = (over: Partial<LongFormShotsContext> = {}) => {
  const timeline = segmentsTimelineFixture();
  return longFormRunShots(timeline, longFormWords(timeline, segmentsTimingsFixture()), context(over));
};

describe("longFormRunShots (#604 S7a)", () => {
  it("a stored timeline projects to presenter and visual shots that tile the output, and its identity document validates under union coverage", () => {
    const view = plannedRunShots.parse(segmentsView());
    const all = view.tracks.flatMap((track) => track.shots).sort((a, b) => a.start_frame - b.start_frame);
    expect(all.map((shot) => [shot.id, shot.track, shot.kind, shot.start_frame, shot.end_frame])).toEqual([
      ["take-1", "presenter", "presenter", 0, 376], ["insert-2", "visual", "picture", 376, 876],
      ["take-3", "presenter", "presenter", 876, 1228], ["insert-4", "visual", "picture", 1228, 1728],
    ]);
    expect(all.at(-1)!.end_frame).toBe(view.duration_frames);
    expect(view.rules.output_coverage).toBe("union");
    expect(validateEditDocument(identityEditDocument(view), view, { candidates: {}, uploads: {} })).toMatchObject({ ok: true });
  });

  it("presenter shots carry their recording's frames from its start; an inserted picture has none and a clip its own", () => {
    const presenter = segmentsView().tracks.find((track) => track.id === "presenter")!.shots;
    expect(presenter.map((shot) => [shot.media_frames, shot.media_offset_frames])).toEqual([[376, 0], [352, 0]]);
    const timeline = scriptInsertsTimelineFixture();
    const words = longFormWords(timeline, new Map([[`runs/${LONG_FORM_RUN_ID}/timings.json`, segmentWords("w", 80, 40)]]));
    const visual = longFormRunShots(timeline, words, context()).tracks.find((track) => track.id === "visual")!.shots;
    expect(visual.map((shot) => [shot.kind, shot.media_frames, shot.media_offset_frames])).toEqual([["clip", 250, 0], ["picture", null, null]]);
  });

  it("every shot lists no operation, and the view states that paid edits are not open", () => {
    const view = segmentsView();
    expect(view.tracks.flatMap((track) => track.shots).every((shot) => shot.operations.length === 0)).toBe(true);
    expect([view.paid_edits, view.pricing, view.editable.state]).toEqual([{ enabled: false, reason: "long videos cannot be edited yet" }, null, "view_only"]);
  });

  it("presenterVisibleFrames equals the face frames the run is billed for, in both modes", () => {
    for (const timeline of [segmentsTimelineFixture(), scriptInsertsTimelineFixture()]) {
      const words = longFormWords(timeline, new Map(longFormTimingKeys(timeline).map((key) => [key, segmentWords("w", 10, 1)])));
      const billed = calculateFaceCharge(faceBillingUnitsOf(timeline).flatMap((unit) => unit.faceIntervals), timeline.fps, TARIFF);
      expect(presenterVisibleFrames(longFormRunShots(timeline, words, context()))).toBe(Number(billed.faceFrames));
    }
    // The production run: 376 + 352 frames, the 29.12 s it was billed for.
    expect(presenterVisibleFrames(segmentsView()) / 25).toBe(29.12);
  });

  it("segment words are moved to their slot on the output's clock; narration words stay where they are", () => {
    const view = segmentsView();
    const second = view.narration.words.find((word) => word.text === "three0")!;
    expect([second.start_ms, second.end_ms]).toEqual([876 * 40, 876 * 40 + 282]);
    expect(view.narration.words.map((word) => word.index)).toEqual(view.narration.words.map((_, at) => at));
    const take3 = view.tracks.find((track) => track.id === "presenter")!.shots[1]!;
    expect([take3.first_word, take3.end_word]).toEqual([45, 85]);
    // The inserted pictures say nothing in segments mode.
    expect(view.tracks.find((track) => track.id === "visual")!.shots.map((shot) => shot.first_word)).toEqual([null, null]);
    expect(longFormTimingKeys(scriptInsertsTimelineFixture())).toEqual([`runs/${LONG_FORM_RUN_ID}/timings.json`]);
    const narration = longFormWords(scriptInsertsTimelineFixture(),
      new Map([[`runs/${LONG_FORM_RUN_ID}/timings.json`, segmentWords("n", 3, 1.2)]]));
    expect(narration.map((word) => [word.start_ms, word.end_ms])).toEqual([[0, 320], [400, 720], [800, 1120]]);
    expect(() => longFormWords(segmentsTimelineFixture(), new Map())).toThrow(/seg1\/timings.json are missing/);
  });

  it("previews are the signed takes and inserts, and none when the source media are withheld", () => {
    const shots = segmentsView().tracks.flatMap((track) => track.shots);
    expect(shots.find((shot) => shot.id === "take-1")!.preview_url).toBe("https://media.example.test/take-1.mp4");
    expect(shots.find((shot) => shot.id === "take-3")!.preview_url).toBeNull();
    const closed = segmentsView({ exposure: { descriptions: true, source_media: false } });
    expect(closed.tracks.flatMap((track) => track.shots).every((shot) => shot.preview_url === null)).toBe(true);
    expect(closed.withheld).toEqual(["source_media"]);
  });

  it("the canvas keeps a short side of 1080 at every aspect ratio", () => {
    expect([longFormFrame("16:9"), longFormFrame("9:16"), longFormFrame("1:1")]).toEqual([
      { width: 1920, height: 1080, aspect_ratio: "16:9" }, { width: 1080, height: 1920, aspect_ratio: "9:16" },
      { width: 1080, height: 1080, aspect_ratio: "1:1" }]);
  });
});

// The segments fixture: take-1 on 0–376, insert-2 on 376–876, take-3 on 876–1228, insert-4 on 1228–1728.
const UPLOAD = `upl_${"b2".repeat(16)}`;
const NO_FACTS: EditFacts = { candidates: {}, uploads: {} };
const uploadOf = (width = 1920, height = 1080): EditFacts => ({ candidates: {}, uploads: { [UPLOAD]: { width, height } } });
const UNCHANGED = { retimed: [], deleted: [], added: [], replaced: [], generated: [], changed: false };
const OPEN: LongFormShotsContext["editable"] = { state: "editable", media_available_until: "2026-10-21T10:00:00.000Z", reason: null };
const fromUpload = { from: "upload", upload_id: UPLOAD } as const;

function editableView(timeline: ResolvedTimeline = segmentsTimelineFixture(), background: LongFormBackground | null = null): PlannedRunShots {
  return longFormRunShots(timeline, longFormWords(timeline, segmentsTimingsFixture()), context({ editable: OPEN, background }));
}
/** The view of the revision fixture: by default the root's tiling with cover-1 over frames 900–1000. */
function revisionView(record: unknown = revisionRecordFixture()): PlannedRunShots {
  const read = readLongFormRevisionRecord(JSON.stringify(record), { runId: LONG_FORM_REVISION_ID, accountId: "acc_fixture" });
  return longFormRevisionShots(read, longFormWords(read.base, revisionTimingsFixture()), context({ runId: LONG_FORM_REVISION_ID, editable: OPEN,
    lineage: { source_run_id: LONG_FORM_RUN_ID, root_run_id: LONG_FORM_RUN_ID, revisions: [] } }));
}
/** The identity document with shots patched by id (`null` removes one) and new shots appended. */
function edited(view: PlannedRunShots, patch: Record<string, Partial<EditShot> | null>, added: EditShot[] = []): EditDocument {
  const document = identityEditDocument(view);
  return { ...document, shots: [...document.shots.flatMap((shot) => {
    const change = patch[shot.id];
    return change === null ? [] : [{ ...shot, ...change }];
  }), ...added] };
}
const cover = (start: number, end: number, asset: EditShot["asset"] = fromUpload, id = "cover-9"): EditShot =>
  ({ id, track: "visual", kind: "picture", start_frame: start, end_frame: end, asset });
function issuesOf(document: EditDocument, view: PlannedRunShots, facts: EditFacts = NO_FACTS) {
  const result = validateEditDocument(document, view, facts);
  return result.ok ? [] : result.issues.map(({ message: _message, ...issue }) => issue);
}
const offering = (view: PlannedRunShots, id: string, operations: ShotAction[]): PlannedRunShots => ({ ...view,
  tracks: view.tracks.map((track) => ({ ...track, shots: track.shots.map((shot) => (shot.id === id ? { ...shot, operations } : shot)) })) });
const operationsOf = (view: PlannedRunShots) => Object.fromEntries(view.tracks.flatMap((track) => track.shots).map((shot) => [shot.id, shot.operations]));
/** Presenter frames no visual shot of a document covers. */
const visibleFrames = (document: EditDocument) => presenterVisibleFrames({ tracks: (["presenter", "visual"] as const).map((id) => ({ id,
  shots: document.shots.filter((shot) => shot.track === id).map((shot) => ({ ...shot, index: 0, first_word: null, end_word: null,
    description: null, preview_url: null, source: "unknown" as const, media_frames: null, media_offset_frames: null, operations: [] })) })) });

describe("long-form edits (#604 S7b-1)", () => {
  it("the long-form fixture projects an editable view whose identity document validates and changes nothing", () => {
    const view = plannedRunShots.parse(editableView());
    expect(validateEditDocument(identityEditDocument(view), view, NO_FACTS)).toEqual({ ok: true, summary: UNCHANGED });
    expect(operationsOf(view)).toEqual({ "take-1": ["cover"], "insert-2": ["upload", "retime"], "take-3": ["cover"], "insert-4": ["upload", "retime"] });
    expect([view.rules.cover_min_frames, view.rules.max_generated_per_revision, view.rules.reuse_source_asset]).toEqual([25, 0, true]);
  });

  it("a fixture with a 0.3 s insert has a valid identity document", () => {
    const view = editableView(shortInsertTimelineFixture());
    expect(view.tracks.find((track) => track.id === "visual")!.shots.map((shot) => shot.end_frame - shot.start_frame)).toEqual([8, 500]);
    expect(validateEditDocument(identityEditDocument(view), view, NO_FACTS)).toEqual({ ok: true, summary: UNCHANGED });
  });

  it("a cover over part of take 2 from an upload validates and is listed as added", () => {
    const view = editableView();
    expect(validateEditDocument(edited(view, {}, [cover(901, 1000)]), view, uploadOf())).toEqual({ ok: true,
      summary: { ...UNCHANGED, added: ["cover-9"], replaced: [{ shot_id: "cover-9", from: "upload" }], changed: true } });
  });

  it("a cover shorter than 25 frames is refused too_short", () => {
    const view = editableView();
    expect(issuesOf(edited(view, {}, [cover(901, 925)]), view, uploadOf())).toEqual([{ code: "too_short", shot_id: "cover-9" }]);
    expect(issuesOf(edited(view, {}, [cover(901, 926)]), view, uploadOf())).toEqual([]);
  });

  it("two covers on one take that leave the presenter visible for less than 25 frames are refused too_short", () => {
    const view = editableView();
    expect(issuesOf(edited(view, {}, [cover(901, 1000), cover(1010, 1100, fromUpload, "cover-10")]), view, uploadOf()))
      .toEqual([{ code: "too_short", shot_id: "take-3", from_frame: 1000, to_frame: 1010 }]);
    // A cover ending 24 frames before its take does leaves the same kind of sliver.
    expect(issuesOf(edited(view, {}, [cover(1100, 1204)]), view, uploadOf()))
      .toEqual([{ code: "too_short", shot_id: "take-3", from_frame: 1204, to_frame: 1228 }]);
  });

  it("two covers that touch, and two covers 25 frames apart, validate", () => {
    const view = editableView();
    expect(issuesOf(edited(view, {}, [cover(901, 1000), cover(1000, 1100, fromUpload, "cover-10")]), view, uploadOf())).toEqual([]);
    expect(issuesOf(edited(view, {}, [cover(901, 1000), cover(1025, 1100, fromUpload, "cover-10")]), view, uploadOf())).toEqual([]);
  });

  it("the shortest presenter gap is the view's cover_min_frames, not a constant", () => {
    const view = editableView(), longer = { ...view, rules: { ...view.rules, cover_min_frames: 50 } };
    expect(issuesOf(edited(view, {}, [cover(901, 1000)]), view, uploadOf())).toEqual([]);
    expect(issuesOf(edited(longer, {}, [cover(901, 1000)]), longer, uploadOf()))
      .toEqual([{ code: "too_short", shot_id: "take-3", from_frame: 876, to_frame: 901 }]);
  });

  it("the shortest cover is the view's cover_min_frames, not a constant", () => {
    const view = editableView(), longer = { ...view, rules: { ...view.rules, cover_min_frames: 50 } };
    // 926–956 leaves 50 frames of take-3 before it, so only the cover's own length is short.
    expect(issuesOf(edited(view, {}, [cover(926, 956)]), view, uploadOf())).toEqual([]);
    expect(issuesOf(edited(longer, {}, [cover(926, 956)]), longer, uploadOf())).toEqual([{ code: "too_short", shot_id: "cover-9" }]);
    expect(issuesOf(edited(longer, {}, [cover(926, 976)]), longer, uploadOf())).toEqual([]);
  });

  it("the exact-fit epsilon is the view's, not a constant", () => {
    const view = editableView(), looser = { ...view, rules: { ...view.rules, upload_aspect: { mode: "exact" as const, epsilon: 0.01 } } };
    const document = edited(view, {}, [cover(901, 1000)]);
    expect(issuesOf(document, view, uploadOf(1923, 1080))).toEqual([{ code: "upload_shape_refused", shot_id: "cover-9" }]);
    expect(issuesOf(document, looser, uploadOf(1923, 1080))).toEqual([]);
    // 1940/1080 is 0.0185 from 16/9: past the looser epsilon too.
    expect(issuesOf(document, looser, uploadOf(1940, 1080))).toEqual([{ code: "upload_shape_refused", shot_id: "cover-9" }]);
  });

  it("a short presenter gap the source already shows stays valid", () => {
    // The revision fixture's cover-1 on 900–1000 leaves take-3 visible on 876–900, 24 frames.
    const view = revisionView();
    expect(validateEditDocument(identityEditDocument(view), view, NO_FACTS)).toEqual({ ok: true, summary: UNCHANGED });
    expect(issuesOf(edited(view, { "cover-1": { end_frame: 1100 } }), view)).toEqual([]);
    // Moving the cover makes the stretch a new one, and it is held to the minimum.
    expect(issuesOf(edited(view, { "cover-1": { start_frame: 890 } }), view))
      .toEqual([{ code: "too_short", shot_id: "take-3", from_frame: 876, to_frame: 890 }]);
  });

  it("a cover from an earlier revision shrunk to 10 frames is refused too_short", () => {
    const view = revisionView();
    expect(issuesOf(edited(view, { "cover-1": { end_frame: 910 } }), view)).toEqual([{ code: "too_short", shot_id: "cover-1" }]);
    expect(issuesOf(edited(view, { "cover-1": { end_frame: 925 } }), view)).toEqual([]);
  });

  it("a cover that crosses an insert is refused overlap", () => {
    const view = editableView(), revision = revisionView();
    expect(issuesOf(edited(view, {}, [cover(1200, 1260)]), view, uploadOf())).toEqual([{ code: "shot_added_not_allowed", shot_id: "cover-9" },
      { code: "overlap", shot_id: "insert-4", from_frame: 1228, to_frame: 1260 }]);
    // An earlier cover stretched across the insert is refused by the overlap alone.
    expect(issuesOf(edited(revision, { "cover-1": { end_frame: 1250 } }), revision))
      .toEqual([{ code: "overlap", shot_id: "insert-4", from_frame: 1228, to_frame: 1250 }]);
  });

  it("shortening an original insert is refused uncovered", () => {
    const view = editableView();
    expect(issuesOf(edited(view, { "insert-2": { end_frame: 800 } }), view)).toEqual([{ code: "uncovered", from_frame: 800, to_frame: 876 }]);
  });

  it("extending an original insert over a take validates only when the take offers cover", () => {
    const view = editableView(), extended = edited(view, { "insert-2": { end_frame: 926 } });
    expect(validateEditDocument(extended, view, NO_FACTS)).toEqual({ ok: true, summary: { ...UNCHANGED, retimed: ["insert-2"], changed: true } });
    expect(issuesOf(extended, offering(view, "take-3", []))).toEqual([{ code: "action_not_allowed", shot_id: "insert-2" }]);
    // Only the take the insert newly reaches is asked.
    expect(issuesOf(extended, offering(view, "take-1", []))).toEqual([]);
  });

  it("stretching a cover from an earlier revision further over its take asks the take for cover", () => {
    const view = revisionView(), stretched = edited(view, { "cover-1": { end_frame: 1050 } });
    expect(issuesOf(stretched, view)).toEqual([]);
    expect(issuesOf(stretched, offering(view, "take-3", []))).toEqual([{ code: "action_not_allowed", shot_id: "cover-1" }]);
    // Shrinking it reaches no new presenter frame.
    expect(issuesOf(edited(view, { "cover-1": { start_frame: 920 } }), offering(view, "take-3", []))).toEqual([]);
  });

  it("covers carried from earlier revisions count toward the cap of shots over the presenter", () => {
    const carried = (count: number) => revisionView(revisionRecordFixture(Array.from({ length: count }, (_, at) =>
      overlayFixture(`cover-${at + 1}`, at * 7, at * 7 + 5))));
    const added = cover(901, 926, fromUpload, "cover-100");
    const full = carried(MAX_INSERTS);
    expect(issuesOf(edited(full, {}, [added]), full, uploadOf())).toEqual([{ code: "shot_added_not_allowed", shot_id: "cover-100" }]);
    // One carried cover deleted makes room for the new one.
    expect(issuesOf(edited(full, { [`cover-${MAX_INSERTS}`]: null }, [added]), full, uploadOf())).toEqual([]);
    const room = carried(MAX_INSERTS - 1);
    expect(issuesOf(edited(room, {}, [added]), room, uploadOf())).toEqual([]);
  });

  it("an extended insert's revision record projects one shot per id, and its identity document validates", () => {
    const view = revisionView(revisionRecordFixture([overlayFixture("insert-2", 376, 926, { origin: "source" })]));
    const shots = view.tracks.flatMap((track) => track.shots).sort((a, b) => a.index - b.index);
    expect(shots.map((shot) => [shot.id, shot.track, shot.start_frame, shot.end_frame])).toEqual([["take-1", "presenter", 0, 376],
      ["insert-2", "visual", 376, 926], ["take-3", "presenter", 876, 1228], ["insert-4", "visual", 1228, 1728]]);
    expect(operationsOf(view)["insert-2"]).toEqual(["upload", "retime"]);
    expect(validateEditDocument(identityEditDocument(view), view, NO_FACTS)).toEqual({ ok: true, summary: UNCHANGED });
  });

  it("deleting a cover added by an earlier revision uncovers recorded presenter time and validates", () => {
    const view = revisionView(), deleted = edited(view, { "cover-1": null });
    expect(operationsOf(view)["cover-1"]).toEqual(["upload", "retime", "delete"]);
    expect(validateEditDocument(deleted, view, NO_FACTS)).toEqual({ ok: true, summary: { ...UNCHANGED, deleted: ["cover-1"], changed: true } });
    expect([presenterVisibleFrames(view), visibleFrames(deleted)]).toEqual([628, 728]);
  });

  it("a presenter shot offers cover and nothing else", () => {
    for (const view of [editableView(), revisionView()]) {
      const presenter = view.tracks.find((track) => track.id === "presenter")!.shots;
      expect(presenter.map((shot) => shot.operations)).toEqual([["cover"], ["cover"]]);
    }
    // A view that is only shown offers nothing at all.
    const shown = longFormRunShots(segmentsTimelineFixture(), longFormWords(segmentsTimelineFixture(), segmentsTimingsFixture()), context());
    expect(Object.values(operationsOf(shown)).every((operations) => operations.length === 0)).toBe(true);
  });

  it("a picture cover naming a presenter take is refused kind_asset_mismatch", () => {
    const view = editableView();
    expect(issuesOf(edited(view, {}, [cover(901, 1000, { from: "source", shot_id: "take-1" })]), view))
      .toEqual([{ code: "kind_asset_mismatch", shot_id: "cover-9" }]);
    // A cover may show a picture of the video.
    expect(issuesOf(edited(view, {}, [cover(901, 1000, { from: "source", shot_id: "insert-4" })]), view)).toEqual([]);
  });

  it("a picture cover naming a clip insert is refused kind_asset_mismatch", () => {
    // The script-with-inserts fixture: insert-2 is a clip on 200–450, take-1 runs 0–200.
    const timeline = scriptInsertsTimelineFixture();
    const words = longFormWords(timeline, new Map([[`runs/${LONG_FORM_RUN_ID}/timings.json`, segmentWords("w", 80, 40)]]));
    const view = longFormRunShots(timeline, words, context({ editable: OPEN }));
    expect(issuesOf(edited(view, {}, [cover(25, 100, { from: "source", shot_id: "insert-2" })]), view))
      .toEqual([{ code: "kind_asset_mismatch", shot_id: "cover-9" }]);
    expect(issuesOf(edited(view, {}, [cover(25, 100, { from: "source", shot_id: "insert-4" })]), view)).toEqual([]);
  });

  it("an insert whose picture is another insert's is summarised as replaced from source", () => {
    const view = editableView();
    expect(validateEditDocument(edited(view, { "insert-2": { asset: { from: "source", shot_id: "insert-4" } } }), view, NO_FACTS))
      .toEqual({ ok: true, summary: { ...UNCHANGED, replaced: [{ shot_id: "insert-2", from: "source" }], changed: true } });
  });

  it("an upload 0.3% off 16:9 is refused on a source without background and taken on a source with one", () => {
    const document = edited(editableView(), {}, [cover(901, 1000)]);
    expect(issuesOf(document, editableView(), uploadOf(1926, 1080))).toEqual([{ code: "upload_shape_refused", shot_id: "cover-9" }]);
    expect(issuesOf(document, editableView(undefined, "blur"), uploadOf(1926, 1080))).toEqual([]);
    expect(issuesOf(document, editableView(), uploadOf(1920, 1080))).toEqual([]);
  });

  it("an upload about 0.15% off 16:9 (about 0.0027 absolute) is refused on a source without background", () => {
    // 1923/1080 is 0.0028 from 16/9 in absolute terms and 0.16% in relative ones: only the absolute test refuses it.
    expect(Math.abs(1923 / 1080 - 16 / 9)).toBeGreaterThan(0.0027);
    const view = editableView();
    expect(issuesOf(edited(view, {}, [cover(901, 1000)]), view, uploadOf(1923, 1080))).toEqual([{ code: "upload_shape_refused", shot_id: "cover-9" }]);
  });

  it("a generate asset on an added long-form shot is refused too_many_generated", () => {
    const view = editableView();
    const drawn = cover(901, 1000, { from: "generate", operation: { mode: "new_picture", description: "A harbour at dawn" } });
    expect(issuesOf(edited(view, {}, [drawn]), view)).toEqual([{ code: "too_many_generated" }]);
  });

  it("on an original shot the issues include too_many_generated and action_not_allowed", () => {
    const view = editableView();
    expect(issuesOf(edited(view, { "insert-2": { asset: { from: "generate", operation: { mode: "retake" } } } }), view))
      .toEqual([{ code: "action_not_allowed", shot_id: "insert-2" }, { code: "too_many_generated" }]);
  });

  it("a revision's presenterVisibleFrames never exceeds the root's billed face frames", () => {
    const root = segmentsTimelineFixture();
    const billed = calculateFaceCharge(faceBillingUnitsOf(root).flatMap((unit) => unit.faceIntervals), root.fps, TARIFF).faceFrames;
    let seed = 604, accepted = 0;
    const random = (below: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return below <= 0 ? 0 : seed % below;
    };
    for (const view of [editableView(), revisionView()]) {
      const shots = view.tracks.flatMap((track) => track.shots), takes = shots.filter((shot) => shot.track === "presenter");
      for (let round = 0; round < 300; round++) {
        const patch: Record<string, Partial<EditShot> | null> = {};
        for (const shot of shots.filter((item) => item.track === "visual")) {
          const roll = random(4);
          if (roll === 0 && shot.operations.includes("delete")) patch[shot.id] = null;
          if (roll === 1) patch[shot.id] = { start_frame: Math.max(0, shot.start_frame - random(120)), end_frame: Math.min(view.duration_frames, shot.end_frame + random(120)) };
          if (roll === 2) patch[shot.id] = { start_frame: shot.start_frame + random(40), end_frame: shot.end_frame - random(40) };
        }
        const covers = Array.from({ length: random(4) }, (_, at) => {
          const take = takes[random(takes.length)]!, start = take.start_frame + random(take.end_frame - take.start_frame - 25);
          return cover(start, start + 25 + random(take.end_frame - start - 25), fromUpload, `cover-r${at}`);
        });
        const document = edited(view, patch, covers);
        if (!validateEditDocument(document, view, uploadOf()).ok) continue;
        accepted++;
        expect(visibleFrames(document)).toBeLessThanOrEqual(billed);
      }
    }
    expect(billed).toBe(728);
    expect(accepted).toBeGreaterThan(50);
  });
});
