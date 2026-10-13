import { describe, expect, it } from "vitest";
import { editableContext, FACELESS_FIXTURE_RUN_ID, facelessPlanFixture, frozen } from "./__fixtures__/edit-views.fixture.js";
import { facelessRunShots as project } from "./edit-faceless.js";
import { FACELESS_EDIT_RULES } from "./edit-rules.js";
import { plannedRunShots } from "./edit-shots.js";

// The projection takes a frozen plan and context here: writing to either throws.
const facelessRunShots: typeof project = (plan, context) => project(frozen(plan), frozen(context));

describe("facelessRunShots", () => {
  it("the delivered-run fixture projects to a planned view of 17 shots, the first a clip, spans tiling 0 to outputFrames, word ranges partitioning the words, word times integer milliseconds", () => {
    const plan = facelessPlanFixture();
    const view = facelessRunShots(plan, editableContext());
    expect(plannedRunShots.parse(view)).toEqual(view);
    expect(view).toMatchObject({ planned: true, run_id: FACELESS_FIXTURE_RUN_ID, line: "faceless",
      frame: { width: 1080, height: 1920, aspect_ratio: "9:16" }, timebase: { fps: 25 }, duration_frames: 1041,
      captions: true, rules: FACELESS_EDIT_RULES, withheld: [], pricing: null, contract_version: "test" });
    expect(view.tracks.map(track => track.id)).toEqual(["visual"]);
    const shots = view.tracks[0]!.shots;
    expect(shots).toHaveLength(17);
    expect(shots.map(shot => shot.kind)).toEqual(["clip", ...Array<string>(16).fill("picture")]);
    expect(shots.map(shot => [shot.id, shot.index, shot.track])).toEqual(plan.shots.map((shot, i) => [shot.id, i, "visual"]));

    // The spans are the plan's own frames and tile the output.
    expect(shots.map(shot => [shot.start_frame, shot.end_frame])).toEqual(plan.shots.map(shot => [shot.startFrame, shot.endFrame]));
    expect([shots[0]!.start_frame, shots.at(-1)!.end_frame]).toEqual([0, plan.outputFrames]);
    expect(shots.slice(1).every((shot, i) => shot.start_frame === shots[i]!.end_frame)).toBe(true);

    // Each shot's words run from the cut before it to the cut after it.
    expect([shots[0]!.first_word, shots.at(-1)!.end_word]).toEqual([0, plan.words.length]);
    expect(shots.slice(1).every((shot, i) => shot.first_word === shots[i]!.end_word)).toBe(true);
    expect(shots.every(shot => shot.end_word! > shot.first_word!)).toBe(true);
    expect([shots[0]!.end_word, shots[1]!.first_word, shots[1]!.end_word]).toEqual([6, 6, 15]);

    const words = view.narration.words;
    expect(view.narration.offset_frames).toBe(plan.narrationStartFrame);
    expect(words).toHaveLength(99);
    expect(words.every(word => Number.isInteger(word.start_ms) && Number.isInteger(word.end_ms))).toBe(true);
    expect(words.slice(0, 2)).toEqual([{ index: 0, text: "In", start_ms: 43, end_ms: 171 }, { index: 1, text: "1945,", start_ms: 213, end_ms: 1493 }]);

    expect(shots[0]).toMatchObject({ description: "Scene 0", source: "generated", media_frames: 125, media_offset_frames: null,
      preview_url: `https://media.example.test/${FACELESS_FIXTURE_RUN_ID}/beat-1.mp4`, operations: ["retake", "animate", "new_picture", "retime"] });
    expect(shots[1]).toMatchObject({ description: "Scene 1", source: "generated", media_frames: null, media_offset_frames: null,
      preview_url: `https://media.example.test/${FACELESS_FIXTURE_RUN_ID}/beat-2.jpg`, operations: ["retake", "new_picture", "upload", "retime", "delete"] });

    // A plan that records no cut after a shot gives neither neighbour a word range.
    const { cutAfterWord, ...fourth } = plan.shots[3]!;
    expect(cutAfterWord).toBe(29);
    const uncut = { ...plan, shots: plan.shots.map((shot, i) => i === 3 ? fourth : shot) };
    const ranges = facelessRunShots(uncut, editableContext()).tracks[0]!.shots.map(shot => [shot.first_word, shot.end_word]);
    expect(ranges.slice(2, 6)).toEqual([[15, 22], [null, null], [null, null], [37, 41]]);
  });

  it("with exposure closed, descriptions and previews are null and withheld names both; a run that is not editable lists no operations; `media: null` gives source `unknown`", () => {
    const plan = facelessPlanFixture();
    const shotsOf = (context: Parameters<typeof editableContext>[0]) => {
      const view = facelessRunShots(plan, editableContext(context));
      expect(plannedRunShots.parse(view)).toEqual(view);
      return { view, shots: view.tracks[0]!.shots };
    };

    const closed = shotsOf({ exposure: { descriptions: false, source_media: false } });
    expect(closed.view.withheld).toEqual(["description", "source_media"]);
    expect(closed.shots.every(shot => shot.description === null && shot.preview_url === null)).toBe(true);
    // Closing one side leaves the other open.
    const noPrompts = shotsOf({ exposure: { descriptions: false, source_media: true } });
    expect(noPrompts.view.withheld).toEqual(["description"]);
    expect(noPrompts.shots.every(shot => shot.description === null && shot.preview_url !== null)).toBe(true);
    const noMedia = shotsOf({ exposure: { descriptions: true, source_media: false } });
    expect(noMedia.view.withheld).toEqual(["source_media"]);
    expect(noMedia.shots.every(shot => shot.description !== null && shot.preview_url === null)).toBe(true);

    const expired = shotsOf({ editable: { state: "expired", media_available_until: null, reason: "the source media was removed" } });
    expect(expired.view.editable.state).toBe("expired");
    expect(expired.shots.every(shot => shot.operations.length === 0)).toBe(true);

    const unrecorded = shotsOf({ media: null });
    expect(unrecorded.shots.every(shot => shot.source === "unknown" && shot.preview_url === null && shot.media_frames === null)).toBe(true);
    // The opener's actions follow its place; a picture of unknown origin offers none.
    expect(unrecorded.shots.map(shot => shot.operations)).toEqual([["retake", "animate", "new_picture", "retime"], ...Array<string[]>(16).fill([])]);

    const customer = new Map(editableContext().media);
    customer.set("beat-2", { source: "customer", previewUrl: null, mediaFrames: null });
    expect(shotsOf({ media: customer }).shots[1]).toMatchObject({ source: "customer", preview_url: null, operations: ["upload", "retime", "delete"] });
  });

  it("what the caller states arrives as stated: captions, pricing, paid edits, lineage, contract version and the narration offset, each unlike the fixture's; a picture reports no footage", () => {
    const plan = facelessPlanFixture();
    const lineage = { source_run_id: "run_source1", root_run_id: "run_root1", revisions: [{ run_id: "run_rev1", state: "succeeded" }] };
    const pricing = { tariff_id: "edit-v1", unit_credits: 30 }, paidEdits = { enabled: true, reason: null };
    const footage = new Map(editableContext().media);
    footage.set("beat-2", { source: "generated", previewUrl: null, mediaFrames: 99 });
    const stated = facelessRunShots({ ...plan, narrationStartFrame: 7 },
      editableContext({ captions: false, pricing, paidEdits, lineage, contractVersion: "2026-10-12", media: footage }));
    expect(plannedRunShots.parse(stated)).toEqual(stated);
    expect(stated).toMatchObject({ captions: false, pricing, paid_edits: paidEdits, lineage, contract_version: "2026-10-12" });
    expect(stated.narration.offset_frames).toBe(7);
    // Footage is a clip's; a picture reports none whatever the media record says.
    expect(stated.tracks[0]!.shots.slice(0, 2).map(shot => shot.media_frames)).toEqual([125, null]);
  });
});
