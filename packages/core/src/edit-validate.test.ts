import { describe, expect, it } from "vitest";
import { editableContext, facelessPlanFixture, frozen, longFormShotsFixture } from "./__fixtures__/edit-views.fixture.js";
import { applyShotChanges as applyChanges, identityEditDocument as identityOf, type EditDocument, type EditShot } from "./edit-document.js";
import { facelessRunShots } from "./edit-faceless.js";
import type { ShotOperation } from "./edit-operations.js";
import type { ShotAction, ShotKind } from "./edit-rules.js";
import type { PlannedRunShots } from "./edit-shots.js";
import { EDIT_ISSUE_CODES, diffEditDocument as diff, presenterVisibleFrames as visibleFrames, validateEditDocument as validate,
  type EditFacts, type EditIssue, type EditIssueCode } from "./edit-validate.js";

// The contract functions take frozen arguments in this file: one that writes to its argument throws.
const identityEditDocument: typeof identityOf = view => identityOf(frozen(view));
const applyShotChanges: typeof applyChanges = (document, changes) => applyChanges(frozen(document), frozen(changes));
const validateEditDocument: typeof validate = (document, view, facts) => validate(frozen(document), frozen(view), frozen(facts));
const diffEditDocument: typeof diff = (document, view) => diff(frozen(document), frozen(view));
const presenterVisibleFrames: typeof visibleFrames = shots => visibleFrames(frozen(shots));

// The faceless fixture: beat-1 is the opening clip on frames 0–88, beat-2 … beat-17 are pictures tiling 88–1041.
const faceless = () => facelessRunShots(frozen(facelessPlanFixture()), frozen(editableContext()));
const UPLOAD = `upl_${"a1".repeat(16)}`, CANDIDATE = "run_candidate1";
const NO_FACTS: EditFacts = { candidates: {}, uploads: {} };
const FACTS: EditFacts = { candidates: { [CANDIDATE]: { shot_id: "beat-3", kind: "picture", media_frames: null } },
  uploads: { [UPLOAD]: { width: 1080, height: 1920 } } };
const UNCHANGED = { retimed: [], deleted: [], added: [], replaced: [], generated: [], changed: false };
const fromUpload = { asset: { from: "upload" as const, upload_id: UPLOAD } };
const fromCandidate = { asset: { from: "candidate" as const, run_id: CANDIDATE } };
/** A new picture over frames 1000–1200 of the 16:9 fixture's second presenter take. */
const COVER: EditShot = { id: "cover-1", track: "visual", kind: "picture", start_frame: 1000, end_frame: 1200, ...fromUpload };

/** The identity document with shots patched by id (`null` removes one) and new shots appended. */
function edited(view: PlannedRunShots, patch: Record<string, Partial<EditShot> | null>, added: EditShot[] = []): EditDocument {
  const document = identityEditDocument(view);
  return { ...document, shots: [...document.shots.flatMap(shot => {
    const change = patch[shot.id];
    return change === null ? [] : [{ ...shot, ...change }];
  }), ...added] };
}
/** The issues without their messages, which only have to be there. */
function issuesOf(document: EditDocument, view: PlannedRunShots, facts: EditFacts = NO_FACTS) {
  const result = validateEditDocument(document, view, facts);
  if (result.ok) return [];
  return result.issues.map(({ message, ...issue }) => {
    expect(message).not.toBe("");
    return issue;
  });
}
const offering = (view: PlannedRunShots, id: string, operations: ShotAction[]): PlannedRunShots => ({ ...view,
  tracks: view.tracks.map(track => ({ ...track, shots: track.shots.map(shot => shot.id === id ? { ...shot, operations } : shot) })) });
const ruled = (view: PlannedRunShots, rules: Partial<PlannedRunShots["rules"]>): PlannedRunShots => ({ ...view, rules: { ...view.rules, ...rules } });

describe("validateEditDocument on the faceless view", () => {
  it("faceless: a hole between two pictures is `uncovered` with its frame range, and two overlapping pictures are `overlap`", () => {
    const view = faceless();
    expect(issuesOf(edited(view, { "beat-3": { end_frame: 230 } }), view)).toEqual([{ code: "uncovered", from_frame: 230, to_frame: 242 }]);
    expect(issuesOf(edited(view, { "beat-3": { end_frame: 250 } }), view))
      .toEqual([{ code: "overlap", shot_id: "beat-4", from_frame: 242, to_frame: 250 }]);
    // A hole at the end of the output is one too.
    expect(issuesOf(edited(view, { "beat-17": { end_frame: 1030 } }), view)).toEqual([{ code: "uncovered", from_frame: 1030, to_frame: 1041 }]);
  });

  it("faceless: a picture of 24 or 151 frames is too_short or too_long; 25 and 150 pass", () => {
    const view = faceless();
    // beat-15 starts at 889; beat-12 starts at 669 and, with beat-13 removed, may reach beat-14.
    const short = (frames: number) => edited(view, { "beat-15": { end_frame: 889 + frames }, "beat-16": { start_frame: 889 + frames } });
    const long = (frames: number) => edited(view, { "beat-13": null, "beat-12": { end_frame: 669 + frames }, "beat-14": { start_frame: 669 + frames } });
    expect(issuesOf(short(24), view)).toEqual([{ code: "too_short", shot_id: "beat-15" }]);
    expect(issuesOf(short(25), view)).toEqual([]);
    expect(issuesOf(long(151), view)).toEqual([{ code: "too_long", shot_id: "beat-12" }]);
    expect(issuesOf(long(150), view)).toEqual([]);
  });

  it("faceless: the opening clip may not be deleted, moved off frame 0, or leave 75–125 frames", () => {
    const view = faceless();
    expect(issuesOf(edited(view, { "beat-1": null }), view)).toEqual([{ code: "action_not_allowed", shot_id: "beat-1" },
      { code: "uncovered", from_frame: 0, to_frame: 88 }, { code: "first_shot_fixed", shot_id: "beat-1" }]);
    // With a picture pulled to frame 0 nothing is uncovered, and the video still has to open with its clip.
    expect(issuesOf(edited(view, { "beat-1": null, "beat-2": { start_frame: 0, end_frame: 150 }, "beat-3": { start_frame: 150 } }), view))
      .toEqual([{ code: "action_not_allowed", shot_id: "beat-1" }, { code: "first_shot_fixed", shot_id: "beat-1" }]);
    expect(issuesOf(edited(view, { "beat-1": { start_frame: 5 } }), view))
      .toEqual([{ code: "not_movable", shot_id: "beat-1" }, { code: "uncovered", from_frame: 0, to_frame: 5 }]);
    const opener = (frames: number) => edited(view, { "beat-1": { end_frame: frames }, "beat-2": { start_frame: frames } });
    expect(issuesOf(opener(74), view)).toEqual([{ code: "too_short", shot_id: "beat-1" }]);
    expect(issuesOf(opener(75), view)).toEqual([]);
    expect(issuesOf(opener(125), view)).toEqual([]);
    // The fixture's opener holds 125 frames of footage, so the 126th is missing as well.
    expect(issuesOf(opener(126), view)).toEqual([{ code: "too_long", shot_id: "beat-1" }, { code: "footage_exceeded", shot_id: "beat-1" }]);
  });

  it("an action the source shot does not list is action_not_allowed, for each of the six cases of the table", () => {
    const view = faceless(), long = longFormShotsFixture();
    const cases: Array<[view: PlannedRunShots, withheld: [id: string, left: ShotAction[]], document: EditDocument, subject: string]> = [
      [view, ["beat-3", ["retime"]], applyShotChanges(identityEditDocument(view), [{ shot_id: "beat-3", operation: { mode: "retake" } }]), "beat-3"],
      [view, ["beat-3", ["retake"]], edited(view, { "beat-3": fromUpload }), "beat-3"],
      [view, ["beat-3", ["upload", "retime", "delete"]], edited(view, { "beat-3": fromCandidate }), "beat-3"],
      [view, ["beat-3", ["retake"]], edited(view, { "beat-3": { end_frame: 240 }, "beat-4": { start_frame: 240 } }), "beat-3"],
      [view, ["beat-3", ["retime"]], edited(view, { "beat-3": null, "beat-2": { end_frame: 200 }, "beat-4": { start_frame: 200 } }), "beat-3"],
      [long, ["take-2", ["retime"]], edited(long, {}, [COVER]), "cover-1"],
    ];
    for (const [offered, [id, left], document, subject] of cases) {
      expect(issuesOf(document, offered, FACTS)).toEqual([]);
      expect(issuesOf(document, offering(offered, id, left), FACTS)).toEqual([{ code: "action_not_allowed", shot_id: subject }]);
    }
  });

  it("a candidate or upload id absent from facts is unknown_asset; a source asset whose shot id is not in the view is unknown_asset, for an added shot that names itself and with `reuse_source_asset` true; a candidate made for another shot is candidate_for_other_shot", () => {
    const view = faceless(), long = longFormShotsFixture();
    for (const asset of [fromCandidate, fromUpload]) {
      expect(issuesOf(edited(view, { "beat-3": asset }), view, FACTS)).toEqual([]);
      expect(issuesOf(edited(view, { "beat-3": asset }), view, NO_FACTS)).toEqual([{ code: "unknown_asset", shot_id: "beat-3" }]);
    }
    const ghost = edited(view, { "beat-3": { asset: { from: "source", shot_id: "ghost" } } });
    const selfNamed = edited(long, {}, [{ ...COVER, asset: { from: "source", shot_id: COVER.id } }]);
    for (const reuse_source_asset of [false, true]) {
      expect(issuesOf(ghost, ruled(view, { reuse_source_asset }))).toEqual([{ code: "unknown_asset", shot_id: "beat-3" }]);
      expect(issuesOf(selfNamed, ruled(long, { reuse_source_asset }))).toEqual([{ code: "unknown_asset", shot_id: "cover-1" }]);
    }
    const forOther: EditFacts = { ...FACTS, candidates: { [CANDIDATE]: { shot_id: "beat-4", kind: "picture", media_frames: null } } };
    expect(issuesOf(edited(view, { "beat-3": fromCandidate }), view, forOther)).toEqual([{ code: "candidate_for_other_shot", shot_id: "beat-3" }]);
  });

  it("two pictures on one upload are duplicate_picture_asset under the faceless rules and pass under the long-form fixture's rules", () => {
    const view = faceless(), long = longFormShotsFixture();
    expect(issuesOf(edited(view, { "beat-3": fromUpload, "beat-4": fromUpload }), view, FACTS))
      .toEqual([{ code: "duplicate_picture_asset", shot_id: "beat-4" }]);
    expect(issuesOf(edited(long, { "insert-1": fromUpload, "insert-3": fromUpload }), long, FACTS)).toEqual([]);
  });

  it("nine generate items are too_many_generated", () => {
    const view = faceless();
    const retakes = (count: number) => applyShotChanges(identityEditDocument(view),
      Array.from({ length: count }, (_, i) => ({ shot_id: `beat-${i + 2}`, operation: { mode: "retake" as const } })));
    expect(issuesOf(retakes(8), view)).toEqual([]);
    expect(issuesOf(retakes(9), view)).toEqual([{ code: "too_many_generated" }]);
    // The ceiling is the view's.
    const one = ruled(view, { max_generated_per_revision: 1 });
    expect(issuesOf(retakes(1), one)).toEqual([]);
    expect(issuesOf(retakes(2), one)).toEqual([{ code: "too_many_generated" }]);
  });

  it("the bounds, the opening kind and the upload distance are the view's: a second value of each changes the answer", () => {
    const view = faceless(), long = longFormShotsFixture();
    const loose = ruled(view, { kinds: { ...view.rules.kinds, picture: { min_frames: 10, max_frames: 200, movable: true, resizable: true } } });
    const short = (frames: number) => edited(view, { "beat-15": { end_frame: 889 + frames }, "beat-16": { start_frame: 889 + frames } });
    const lengthy = (frames: number) => edited(view, { "beat-13": null, "beat-12": { end_frame: 669 + frames }, "beat-14": { start_frame: 669 + frames } });
    expect(issuesOf(short(9), loose)).toEqual([{ code: "too_short", shot_id: "beat-15" }]);
    expect(issuesOf(short(10), loose)).toEqual([]);
    expect(issuesOf(lengthy(200), loose)).toEqual([]);
    expect(issuesOf(lengthy(201), loose)).toEqual([{ code: "too_long", shot_id: "beat-12" }]);

    expect(issuesOf(identityEditDocument(view), ruled(view, { first_visual_kind: "picture" }))).toEqual([{ code: "first_shot_fixed", shot_id: "beat-1" }]);
    expect(issuesOf(identityEditDocument(long), ruled(long, { first_visual_kind: "picture" }))).toEqual([]);
    expect(issuesOf(identityEditDocument(long), ruled(long, { first_visual_kind: "clip" }))).toEqual([{ code: "first_shot_fixed", shot_id: "insert-1" }]);

    const tall = edited(view, { "beat-3": fromUpload }), refused = [{ code: "upload_shape_refused", shot_id: "beat-3" }];
    const within = (max_distance: number, height: number) =>
      issuesOf(tall, ruled(view, { upload_aspect: { max_distance } }), { candidates: {}, uploads: { [UPLOAD]: { width: 1080, height } } });
    expect([within(0.15, 1700), within(0.05, 1700), within(0.15, 1600), within(0.25, 1600)]).toEqual([[], refused, refused, []]);
  });

  it("rules decide, not the line: the faceless view with `line` changed to `long_form` gives the same issues; the faceless view with the fixture's long-form rules accepts a 200-frame picture the faceless rules call too_long", () => {
    const view = faceless();
    const broken = edited(view, { "beat-1": null, "beat-3": { end_frame: 230 }, "beat-13": null, "beat-12": { end_frame: 820 }, "beat-14": { start_frame: 820 } });
    const asFaceless = validateEditDocument(broken, view, NO_FACTS);
    expect(issuesOf(broken, view).map(issue => issue.code)).toEqual(["too_long", "action_not_allowed", "uncovered", "uncovered", "first_shot_fixed"]);
    expect(validateEditDocument(broken, { ...view, line: "long_form" }, NO_FACTS)).toEqual(asFaceless);
    expect(validateEditDocument(broken, { ...view, line: "ugc" }, NO_FACTS)).toEqual(asFaceless);
    // beat-2 stretched to 200 frames over the removed beat-3.
    const stretched = edited(view, { "beat-3": null, "beat-2": { end_frame: 288 }, "beat-4": { start_frame: 288 } });
    expect(issuesOf(stretched, view)).toEqual([{ code: "too_long", shot_id: "beat-2" }]);
    expect(issuesOf(stretched, { ...view, rules: longFormShotsFixture().rules })).toEqual([]);
  });

  it("a source asset naming another shot is foreign_source_asset; a changed kind is kind_changed; an upload on the opening clip is kind_asset_mismatch", () => {
    const view = faceless();
    // Under the faceless rules the borrowed picture is also shown twice.
    expect(issuesOf(edited(view, { "beat-3": { asset: { from: "source", shot_id: "beat-4" } } }), view))
      .toEqual([{ code: "foreign_source_asset", shot_id: "beat-3" }, { code: "duplicate_picture_asset", shot_id: "beat-4" }]);
    // The refusal is the rule's: where the rules allow reuse, the same borrowing passes.
    const long = longFormShotsFixture(), borrowed = edited(long, { "insert-1": { asset: { from: "source", shot_id: "insert-3" } } });
    expect(issuesOf(borrowed, long)).toEqual([{ code: "foreign_source_asset", shot_id: "insert-1" }]);
    expect(issuesOf(borrowed, ruled(long, { reuse_source_asset: true }))).toEqual([]);
    expect(issuesOf(edited(view, { "beat-4": { kind: "clip" } }), view)).toEqual([{ code: "kind_changed", shot_id: "beat-4" }]);
    expect(issuesOf(edited(view, { "beat-1": fromUpload }), view, FACTS))
      .toEqual([{ code: "action_not_allowed", shot_id: "beat-1" }, { code: "kind_asset_mismatch", shot_id: "beat-1" }]);
  });

  it("an upload farther than `max_distance` from the frame's ratio is upload_shape_refused when the rule is set, and passes when it is null", () => {
    const view = faceless(), long = longFormShotsFixture(), limit = { upload_aspect: { max_distance: 0.15 } };
    const facts = (width: number, height: number): EditFacts => ({ candidates: {}, uploads: { [UPLOAD]: { width, height } } });
    const tall = edited(view, { "beat-3": fromUpload }), wide = edited(long, { "insert-1": fromUpload });
    expect(issuesOf(tall, ruled(view, limit), facts(1920, 1080))).toEqual([{ code: "upload_shape_refused", shot_id: "beat-3" }]);
    expect(issuesOf(tall, ruled(view, limit), facts(1080, 1600))).toEqual([{ code: "upload_shape_refused", shot_id: "beat-3" }]);
    expect(issuesOf(tall, ruled(view, limit), facts(1080, 1700))).toEqual([]);
    expect(issuesOf(tall, ruled(view, limit), facts(1080, 1920))).toEqual([]);
    expect(issuesOf(tall, view, facts(1920, 1080))).toEqual([]);
    // The ratio is the view's: the 16:9 fixture takes the wide upload and refuses the tall one.
    expect(issuesOf(wide, ruled(long, limit), facts(1920, 1080))).toEqual([]);
    expect(issuesOf(wide, ruled(long, limit), facts(1080, 1920))).toEqual([{ code: "upload_shape_refused", shot_id: "insert-1" }]);
  });
});

describe("validateEditDocument on the 16:9 fixture", () => {
  it("16:9 fixture: its identity document validates under union coverage", () => {
    const long = longFormShotsFixture(), document = identityEditDocument(long);
    expect(long.rules.output_coverage).toBe("union");
    expect(validateEditDocument(document, long, NO_FACTS)).toEqual({ ok: true, summary: UNCHANGED });
    // The same timeline under visual coverage has a hole wherever the presenter is on screen.
    expect(issuesOf(document, ruled(long, { output_coverage: "visual" }))).toEqual([{ code: "uncovered", from_frame: 0, to_frame: 200 },
      { code: "uncovered", from_frame: 900, to_frame: 1500 }, { code: "uncovered", from_frame: 1800, to_frame: 2700 }]);
  });

  it("16:9 fixture: an insert removed leaves `uncovered` with frames 200–500", () => {
    const long = longFormShotsFixture();
    expect(issuesOf(edited(long, { "insert-1": null }), long)).toEqual([{ code: "uncovered", from_frame: 200, to_frame: 500 }]);
  });

  it("16:9 fixture: a new picture over frames 1000–1200 of a presenter take validates; the same shot is tracks_overlap when `visual_covers_presenter` is false, and shot_added_not_allowed when `add_visual` is `never`", () => {
    const long = longFormShotsFixture(), covered = edited(long, {}, [COVER]);
    expect(validateEditDocument(covered, long, FACTS)).toEqual({ ok: true,
      summary: { ...UNCHANGED, added: ["cover-1"], replaced: [{ shot_id: "cover-1", from: "upload" }], changed: true } });
    // A picture to generate may cover the take as well: a new shot has nothing to retake, but it can be drawn.
    const drawn = edited(long, {}, [{ ...COVER, asset: { from: "generate", operation: { mode: "new_picture", description: "A harbour at dawn" } } }]);
    expect(validateEditDocument(drawn, long, NO_FACTS)).toMatchObject({ ok: true,
      summary: { added: ["cover-1"], generated: [{ shot_id: "cover-1", kind: "picture", mode: "new_picture" }] } });
    expect(issuesOf(covered, ruled(long, { visual_covers_presenter: false }), FACTS))
      .toEqual([{ code: "tracks_overlap", shot_id: "cover-1", from_frame: 1000, to_frame: 1200 }]);
    expect(issuesOf(covered, ruled(long, { add_visual: "never" }), FACTS)).toEqual([{ code: "shot_added_not_allowed", shot_id: "cover-1" }]);
    // A new shot reaching out of presenter time is refused, here over the insert that follows the take.
    expect(issuesOf(edited(long, {}, [{ ...COVER, start_frame: 150, end_frame: 250 }]), long, FACTS)).toEqual([
      { code: "shot_added_not_allowed", shot_id: "cover-1" }, { code: "overlap", shot_id: "insert-1", from_frame: 200, to_frame: 250 }]);
  });

  it("16:9 fixture: a presenter take whose start moves is not_movable; one trimmed at its end raises no not_resizable (the hole it leaves is `uncovered`); one extended past its recording is presenter_outside_recording; one whose `media_offset_frames` is set to 5 while its start stays is presenter_out_of_sync; the clip stretched to 451 frames is footage_exceeded", () => {
    // take-2 is on frames 900–1500 with 600 frames recorded; insert-2 is the clip on 500–900 with 450 frames of footage.
    const long = longFormShotsFixture();
    expect(issuesOf(edited(long, { "take-2": { start_frame: 910, media_offset_frames: 10 } }), long))
      .toEqual([{ code: "not_movable", shot_id: "take-2" }, { code: "uncovered", from_frame: 900, to_frame: 910 }]);
    expect(issuesOf(edited(long, { "take-2": { end_frame: 1400 } }), long)).toEqual([{ code: "uncovered", from_frame: 1400, to_frame: 1500 }]);
    expect(issuesOf(edited(long, { "take-2": { end_frame: 1501 } }), long)).toEqual([{ code: "presenter_outside_recording", shot_id: "take-2" }]);
    // Five frames in, the full length also runs five frames past the recording.
    expect(issuesOf(edited(long, { "take-2": { media_offset_frames: 5 } }), long))
      .toEqual([{ code: "presenter_out_of_sync", shot_id: "take-2" }, { code: "presenter_outside_recording", shot_id: "take-2" }]);
    expect(issuesOf(edited(long, { "take-2": { end_frame: 1400, media_offset_frames: 5 } }), long))
      .toEqual([{ code: "uncovered", from_frame: 1400, to_frame: 1500 }, { code: "presenter_out_of_sync", shot_id: "take-2" }]);
    expect(issuesOf(edited(long, { "insert-2": { end_frame: 950 } }), long)).toEqual([]);
    expect(issuesOf(edited(long, { "insert-2": { end_frame: 951 } }), long)).toEqual([{ code: "footage_exceeded", shot_id: "insert-2" }]);
  });
});

describe("the validator's table", () => {
  it("every row of the validator's table has a case: each code and each listed reason is raised by its own document", () => {
    const v = faceless(), l = longFormShotsFixture();
    const generate = (operation: ShotOperation) => ({ asset: { from: "generate" as const, operation } });
    const fromSource = (shot_id: string) => ({ asset: { from: "source" as const, shot_id } });
    const candidate = (shot_id: string, kind: "picture" | "clip", media_frames: number | null = null): EditFacts =>
      ({ ...FACTS, candidates: { [CANDIDATE]: { shot_id, kind, media_frames } } });
    const kindRuled = (view: PlannedRunShots, kind: ShotKind, change: { movable?: boolean; resizable?: boolean }) =>
      ruled(view, { kinds: { ...view.rules.kinds, [kind]: { ...view.rules.kinds[kind]!, ...change } } });
    const on = (code: EditIssueCode, shot_id: string, from_frame?: number, to_frame?: number) =>
      ({ code, shot_id, ...(from_frame === undefined || to_frame === undefined ? {} : { from_frame, to_frame }) });
    const hole = (from_frame: number, to_frame: number) => ({ code: "uncovered" as const, from_frame, to_frame });
    const retake = { mode: "retake" as const }, picture = { mode: "new_picture" as const, description: "A harbour at dawn" };
    const reusing = ruled(l, { reuse_source_asset: true }), limited = ruled(v, { upload_aspect: { max_distance: 0.15 } });
    const everyAction: ShotAction[] = ["retake", "animate", "new_picture", "retime", "delete"];
    const identity = identityEditDocument(v);

    // `issues` is the whole expected list; a row raises more than its own code only where the table leaves no document without company.
    type Row = { code: EditIssueCode; name: string; view: PlannedRunShots; document: EditDocument; facts?: EditFacts;
      issues: Omit<EditIssue, "message">[]; reason?: string };
    const rows: Row[] = [
      { code: "source_mismatch", name: "another run", view: v, document: { ...identity, source_run_id: "run_another1" }, issues: [{ code: "source_mismatch" }] },
      { code: "timebase_mismatch", name: "30 fps", view: v, document: { ...identity, timebase: { fps: 30 } }, issues: [{ code: "timebase_mismatch" }] },
      { code: "duration_mismatch", name: "one frame longer", view: v, document: { ...identity, duration_frames: 1042 }, issues: [{ code: "duration_mismatch" }] },
      { code: "duplicate_shot_id", name: "an insert split into two shots of one id", view: l,
        document: edited(l, { "insert-1": { end_frame: 350 } }, [{ ...identityEditDocument(l).shots.find(shot => shot.id === "insert-1")!, start_frame: 350 }]),
        issues: [on("duplicate_shot_id", "insert-1")] },
      { code: "span_out_of_range", name: "ends past the output", view: v, document: edited(v, { "beat-17": { end_frame: 1045 } }),
        issues: [on("span_out_of_range", "beat-17")] },
      { code: "span_out_of_range", name: "ends where it starts", view: l, facts: FACTS,
        document: edited(l, {}, [{ ...COVER, start_frame: 1100, end_frame: 1100 }]), issues: [on("span_out_of_range", "cover-1"), on("too_short", "cover-1")] },
      { code: "kind_changed", name: "another kind", view: v, document: edited(v, { "beat-4": { kind: "clip" } }), issues: [on("kind_changed", "beat-4")] },
      { code: "kind_changed", name: "another track", view: l, document: edited(l, { "insert-1": { track: "presenter" } }), issues: [on("kind_changed", "insert-1")] },
      { code: "shot_added_not_allowed", name: "the rules take no new shot", view: ruled(l, { add_visual: "never" }), facts: FACTS,
        document: edited(l, {}, [COVER]), issues: [on("shot_added_not_allowed", "cover-1")], reason: "takes no new shots" },
      { code: "shot_added_not_allowed", name: "a new shot outside presenter time, in place of an insert", view: l, facts: FACTS,
        document: edited(l, { "insert-1": null }, [{ ...COVER, start_frame: 200, end_frame: 500 }]), issues: [on("shot_added_not_allowed", "cover-1")] },
      { code: "shot_added_not_allowed", name: "a new shot on the presenter track", view: reusing,
        document: edited(l, {}, [{ id: "take-9", track: "presenter", kind: "presenter", start_frame: 300, end_frame: 400, ...fromSource("take-1") }]),
        issues: [on("shot_added_not_allowed", "take-9")] },
      { code: "too_short", name: "24 frames", view: v, document: edited(v, { "beat-15": { end_frame: 913 }, "beat-16": { start_frame: 913 } }),
        issues: [on("too_short", "beat-15")], reason: "at least 25 frames" },
      { code: "too_short", name: "a kind the rules have no entry for", view: v, document: edited(v, { "beat-4": { kind: "presenter" } }),
        issues: [on("kind_changed", "beat-4"), on("too_short", "beat-4")], reason: "this kind is not allowed here" },
      { code: "too_long", name: "151 frames", view: v, document: edited(v, { "beat-13": null, "beat-12": { end_frame: 820 }, "beat-14": { start_frame: 820 } }),
        issues: [on("too_long", "beat-12")] },
      { code: "action_not_allowed", name: "a generation the shot does not offer", view: offering(v, "beat-3", ["retime"]),
        document: edited(v, { "beat-3": generate(retake) }), issues: [on("action_not_allowed", "beat-3")], reason: "retake is not offered" },
      { code: "action_not_allowed", name: "an upload", view: offering(v, "beat-3", ["retake"]), facts: FACTS,
        document: edited(v, { "beat-3": fromUpload }), issues: [on("action_not_allowed", "beat-3")], reason: "takes no upload" },
      { code: "action_not_allowed", name: "a candidate", view: offering(v, "beat-3", ["upload", "retime", "delete"]), facts: FACTS,
        document: edited(v, { "beat-3": fromCandidate }), issues: [on("action_not_allowed", "beat-3")], reason: "takes no generated candidate" },
      { code: "action_not_allowed", name: "a changed span", view: offering(v, "beat-3", ["retake"]),
        document: edited(v, { "beat-3": { end_frame: 240 }, "beat-4": { start_frame: 240 } }), issues: [on("action_not_allowed", "beat-3")], reason: "may not be retimed" },
      { code: "action_not_allowed", name: "a changed offset alone", view: offering(l, "insert-2", ["upload", "delete"]),
        document: edited(l, { "insert-2": { media_offset_frames: 3 } }), issues: [on("action_not_allowed", "insert-2")], reason: "may not be retimed" },
      { code: "action_not_allowed", name: "a deletion", view: offering(v, "beat-3", ["retime"]),
        document: edited(v, { "beat-3": null, "beat-2": { end_frame: 200 }, "beat-4": { start_frame: 200 } }),
        issues: [on("action_not_allowed", "beat-3")], reason: "may not be deleted" },
      { code: "action_not_allowed", name: "a cover of a take that offers none", view: offering(l, "take-2", ["retime"]), facts: FACTS,
        document: edited(l, {}, [COVER]), issues: [on("action_not_allowed", "cover-1")], reason: "take-2 may not be covered" },
      { code: "not_movable", name: "a picture moved where pictures keep their start", view: kindRuled(l, "picture", { movable: false }),
        document: edited(l, { "insert-3": { start_frame: 1450 } }), issues: [on("not_movable", "insert-3")] },
      { code: "not_resizable", name: "a clip stretched where clips keep their length", view: kindRuled(l, "clip", { resizable: false }),
        document: edited(l, { "insert-2": { end_frame: 950 } }), issues: [on("not_resizable", "insert-2")] },
      { code: "overlap", name: "two pictures", view: v, document: edited(v, { "beat-3": { end_frame: 250 } }), issues: [on("overlap", "beat-4", 242, 250)] },
      { code: "tracks_overlap", name: "a clip over a take", view: ruled(l, { visual_covers_presenter: false }),
        document: edited(l, { "insert-2": { end_frame: 950 } }), issues: [on("tracks_overlap", "insert-2", 900, 950)] },
      { code: "uncovered", name: "visual coverage", view: v, document: edited(v, { "beat-3": { end_frame: 230 } }), issues: [hole(230, 242)] },
      { code: "uncovered", name: "union coverage", view: l, document: edited(l, { "insert-1": null }), issues: [hole(200, 500)] },
      { code: "first_shot_fixed", name: "another shot opens the video", view: offering(v, "beat-1", everyAction),
        document: edited(v, { "beat-1": null, "beat-2": { start_frame: 0, end_frame: 150 }, "beat-3": { start_frame: 150 } }),
        issues: [on("first_shot_fixed", "beat-1")] },
      { code: "first_shot_fixed", name: "the opening shot changes kind", view: v, document: edited(v, { "beat-1": { kind: "picture" } }),
        issues: [on("kind_changed", "beat-1"), on("first_shot_fixed", "beat-1")] },
      { code: "foreign_source_asset", name: "another insert's picture", view: l, document: edited(l, { "insert-1": fromSource("insert-3") }),
        issues: [on("foreign_source_asset", "insert-1")] },
      { code: "kind_asset_mismatch", name: "an upload on a clip", view: l, facts: FACTS, document: edited(l, { "insert-2": fromUpload }),
        issues: [on("kind_asset_mismatch", "insert-2")], reason: "only a picture takes an upload" },
      { code: "kind_asset_mismatch", name: "a generation on a take", view: offering(l, "take-2", ["cover", "retime", "retake"]),
        document: edited(l, { "take-2": generate(retake) }), issues: [on("kind_asset_mismatch", "take-2")], reason: "keeps its own recording" },
      { code: "kind_asset_mismatch", name: "a new visual shot of the presenter kind off a source asset", view: l,
        document: edited(l, {}, [{ ...COVER, kind: "presenter", ...generate(picture) }]), issues: [on("kind_asset_mismatch", "cover-1")], reason: "keeps its own recording" },
      { code: "kind_asset_mismatch", name: "animate on a picture", view: offering(v, "beat-3", ["animate"]),
        document: edited(v, { "beat-3": generate({ mode: "animate" }) }), issues: [on("kind_asset_mismatch", "beat-3")], reason: "only a clip is animated" },
      { code: "kind_asset_mismatch", name: "a clip candidate on a picture", view: v, facts: candidate("beat-3", "clip"),
        document: edited(v, { "beat-3": fromCandidate }), issues: [on("kind_asset_mismatch", "beat-3")], reason: "the candidate is a clip" },
      { code: "kind_asset_mismatch", name: "retake on a new shot", view: l, document: edited(l, {}, [{ ...COVER, ...generate(retake) }]),
        issues: [on("kind_asset_mismatch", "cover-1")], reason: "nothing to retake" },
      { code: "kind_asset_mismatch", name: "edit_picture on a new shot", view: l,
        document: edited(l, {}, [{ ...COVER, ...generate({ mode: "edit_picture", instruction: "Warmer light" }) }]),
        issues: [on("kind_asset_mismatch", "cover-1")], reason: "nothing to edit_picture" },
      { code: "kind_asset_mismatch", name: "animate on a new clip", view: l, document: edited(l, {}, [{ ...COVER, kind: "clip", ...generate({ mode: "animate" }) }]),
        issues: [on("kind_asset_mismatch", "cover-1")], reason: "nothing to animate" },
      { code: "candidate_for_other_shot", name: "a candidate of beat-4 on beat-3", view: v, facts: candidate("beat-4", "picture"),
        document: edited(v, { "beat-3": fromCandidate }), issues: [on("candidate_for_other_shot", "beat-3")] },
      { code: "unknown_asset", name: "a candidate facts do not hold", view: v, document: edited(v, { "beat-3": fromCandidate }), issues: [on("unknown_asset", "beat-3")] },
      { code: "unknown_asset", name: "an upload facts do not hold", view: v, document: edited(v, { "beat-3": fromUpload }), issues: [on("unknown_asset", "beat-3")] },
      { code: "unknown_asset", name: "a source shot the view does not have", view: v, document: edited(v, { "beat-3": fromSource("ghost") }),
        issues: [on("unknown_asset", "beat-3")] },
      { code: "unknown_asset", name: "issues of one code come in shot id order, not document order", view: v,
        document: edited(v, { "beat-3": fromCandidate, "beat-15": fromUpload }), issues: [on("unknown_asset", "beat-15"), on("unknown_asset", "beat-3")] },
      { code: "upload_shape_refused", name: "a wide upload in a tall frame", view: limited, facts: { candidates: {}, uploads: { [UPLOAD]: { width: 1920, height: 1080 } } },
        document: edited(v, { "beat-3": fromUpload }), issues: [on("upload_shape_refused", "beat-3")] },
      { code: "duplicate_picture_asset", name: "one upload on two pictures", view: v, facts: FACTS,
        document: edited(v, { "beat-3": fromUpload, "beat-4": fromUpload }), issues: [on("duplicate_picture_asset", "beat-4")] },
      { code: "too_many_generated", name: "nine retakes", view: v,
        document: edited(v, Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`beat-${i + 2}`, generate(retake)]))), issues: [{ code: "too_many_generated" }] },
      { code: "footage_exceeded", name: "the clip's own footage", view: l, document: edited(l, { "insert-2": { end_frame: 951 } }),
        issues: [on("footage_exceeded", "insert-2")], reason: "450 frames of footage" },
      { code: "footage_exceeded", name: "a candidate clip shorter than the shot", view: v, facts: candidate("beat-1", "clip", 80),
        document: edited(v, { "beat-1": fromCandidate }), issues: [on("footage_exceeded", "beat-1")], reason: "80 frames of footage" },
      { code: "footage_exceeded", name: "a reused source asset is measured by the shot it names", view: reusing,
        document: edited(l, { "insert-2": fromSource("take-1") }), issues: [on("footage_exceeded", "insert-2")], reason: "200 frames of footage" },
      { code: "presenter_out_of_sync", name: "an offset the start does not explain", view: l,
        document: edited(l, { "take-2": { end_frame: 1400, media_offset_frames: 5 }, "insert-3": { start_frame: 1400 } }),
        issues: [on("presenter_out_of_sync", "take-2")] },
      { code: "presenter_outside_recording", name: "one frame past the recording", view: l, document: edited(l, { "take-2": { end_frame: 1501 } }),
        issues: [on("presenter_outside_recording", "take-2")] },
    ];

    for (const row of rows) {
      const label = `${row.code}: ${row.name}`, facts = row.facts ?? NO_FACTS;
      expect(issuesOf(identityEditDocument(row.view), row.view, facts), label).toEqual([]);
      const result = validateEditDocument(row.document, row.view, facts);
      const raised = result.ok ? [] : result.issues;
      expect(issuesOf(row.document, row.view, facts), label).toEqual(row.issues);
      const own = raised.filter(issue => issue.code === row.code);
      expect(own.length, label).toBeGreaterThan(0);
      if (row.reason !== undefined) expect(own[0]!.message, label).toContain(row.reason);
    }
    // A code added to the validator without a row here fails this line.
    expect(new Set(rows.map(row => row.code))).toEqual(new Set(EDIT_ISSUE_CODES));
  });
});

describe("the summary of an edit", () => {
  it("diffEditDocument lists retimed, deleted, added, replaced and generated shots; a changed `media_offset_frames` alone is `retimed`; a new_picture on the opening clip is one generated entry of kind clip", () => {
    const view = faceless(), long = longFormShotsFixture();
    const picture = { mode: "new_picture" as const, description: "A chart of shipping lanes" };
    const document = edited(view, {
      "beat-2": { end_frame: 160 }, "beat-3": { start_frame: 160 }, "beat-6": null, "beat-8": fromCandidate, "beat-9": fromUpload,
      "beat-10": { asset: { from: "generate", operation: { mode: "retake" } } },
    }, [{ id: "extra-1", track: "visual", kind: "picture", start_frame: 410, end_frame: 452, asset: { from: "generate", operation: picture } }]);
    expect(diffEditDocument(document, view)).toEqual({
      retimed: ["beat-2", "beat-3"], deleted: ["beat-6"], added: ["extra-1"],
      replaced: [{ shot_id: "beat-8", from: "candidate" }, { shot_id: "beat-9", from: "upload" }],
      generated: [{ shot_id: "beat-10", kind: "picture", mode: "retake" }, { shot_id: "extra-1", kind: "picture", mode: "new_picture" }],
      changed: true,
    });
    expect(diffEditDocument(identityEditDocument(view), view)).toEqual(UNCHANGED);
    expect(validateEditDocument(edited(long, { "insert-2": { media_offset_frames: 3 } }), long, NO_FACTS))
      .toEqual({ ok: true, summary: { ...UNCHANGED, retimed: ["insert-2"], changed: true } });
    expect(validateEditDocument(applyShotChanges(identityEditDocument(view), [{ shot_id: "beat-1", operation: picture }]), view, NO_FACTS))
      .toEqual({ ok: true, summary: { ...UNCHANGED, generated: [{ shot_id: "beat-1", kind: "clip", mode: "new_picture" }], changed: true } });
  });

  it("`presenterVisibleFrames` of the 16:9 fixture is 1700, and 1500 after the cover of test 15", () => {
    const long = longFormShotsFixture();
    expect(presenterVisibleFrames(long)).toBe(1700);
    const picture = long.tracks.find(track => track.id === "visual")!.shots[0]!;
    const cover = { ...picture, id: COVER.id, start_frame: COVER.start_frame, end_frame: COVER.end_frame };
    expect(presenterVisibleFrames({ tracks: long.tracks.map(track => track.id === "visual" ? { ...track, shots: [...track.shots, cover] } : track) })).toBe(1500);
    expect(presenterVisibleFrames(faceless())).toBe(0);
  });
});
