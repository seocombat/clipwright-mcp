import { describe, expect, it } from "vitest";
import { LONG_FORM_RUN_ID, scriptInsertsTimelineFixture, segmentsTimelineFixture, segmentWords } from "./__fixtures__/long-form-timeline.fixture.js";
import { longFormFrame, longFormRunShots, longFormWords } from "./edit-long-form.js";
import { plannedRunShots } from "./edit-shots.js";
import { presenterVisibleFrames } from "./edit-validate.js";
import { LONG_FORM_LAUNCH_TARIFF, calculateFaceCharge } from "./long-form-pricing.js";
import { faceBillingUnitsOf, freezeResolvedTimeline, readResolvedTimeline, type ResolvedTimelineContent } from "./resolved-timeline.js";

const hex = (seed: string): string => seed.repeat(64).slice(0, 64);
const audio = (seed: string) => ({ key: `runs/${LONG_FORM_RUN_ID}/narration/${hex(seed)}.wav`, sha256: hex(seed), bytes: 100 });

/** The script fixture with its last take (750–1000) split by a 10 s hold at 850: take 750–850, hold 850–1100, take 1100–1250. */
function withHold(edit: (slots: ResolvedTimelineContent["slots"]) => unknown[] = slots => slots): unknown {
  const { hash: _hash, ...content } = scriptInsertsTimelineFixture();
  const slots: ResolvedTimelineContent["slots"] = [...content.slots.slice(0, 4),
    { position: 5, startFrame: 750, endFrame: 850, kind: "actor", requestHash: hex("0"), speechDurationSec: 4, audio: audio("7") },
    { position: 6, startFrame: 850, endFrame: 1100, kind: "hold", sourcePosition: 5 },
    { position: 7, startFrame: 1100, endFrame: 1250, kind: "actor", requestHash: hex("1"), speechDurationSec: 6, audio: audio("4") }];
  return { ...content, outputFrames: 1250, fullSpeechDurationSec: 50, slots: edit(slots) };
}

describe("hold slots in the frozen timeline (reference-elements S3)", () => {
  /** Mutant: give every timeline a holds field, and every stored run fails its hash on resume. */
  it("keeps the hash of timelines frozen without a hold", () => {
    expect(scriptInsertsTimelineFixture().hash).toBe("51119f07a3d97a4653f69df6c0f7420f9307b3e4375e8a845851034f9e3ad603");
    expect(segmentsTimelineFixture().slots.every(slot => slot.kind !== "hold")).toBe(true);
  });

  /** Mutant: freeze the cutout into the slot, and every hold timeline stored since S3 fails its hash on resume (reference-elements S4, C3). */
  it("keeps the hash of a hold timeline frozen before the cutout, which is cut after the takes and never enters it", () => {
    expect(freezeResolvedTimeline(withHold()).hash).toBe("dc26a11962195e472e39f820f512896a2c1bb4725b9db70d68461033c15aeb97");
    const cutout = { key: `runs/${LONG_FORM_RUN_ID}/holds/${hex("9")}.png`, sha256: hex("9"), bytes: 100, width: 1080, height: 1920 };
    expect(() => freezeResolvedTimeline(withHold(slots => slots.map(slot => slot.kind === "hold" ? { ...slot, cutout } : slot)))).toThrow();
  });

  it("round-trips a hold, and it moves the hash", () => {
    const frozen = freezeResolvedTimeline(withHold());
    expect(readResolvedTimeline(JSON.parse(JSON.stringify(frozen)))).toEqual(frozen);
    expect(frozen.slots.map(slot => [slot.kind, slot.startFrame, slot.endFrame])).toEqual([["actor", 0, 200], ["media", 200, 450], ["actor", 450, 625],
      ["media", 625, 750], ["actor", 750, 850], ["hold", 850, 1100], ["actor", 1100, 1250]]);
  });

  /** Mutants: drop the source check, or allow a hold on a segments run, and a hold freezes an insert or a take that is not before it. */
  it.each([
    ["a source that is not the take before it", (slots: ResolvedTimelineContent["slots"]) => slots.map(slot => slot.kind === "hold" ? { ...slot, sourcePosition: 3 } : slot)],
    ["a source after it", (slots: ResolvedTimelineContent["slots"]) => slots.map(slot => slot.kind === "hold" ? { ...slot, sourcePosition: 7 } : slot)],
    ["an insert before it", (slots: ResolvedTimelineContent["slots"]) => [...slots.slice(0, 4),
      { ...slots[5]!, position: 5, startFrame: 750, endFrame: 1000, sourcePosition: 4 }, { ...slots[6]!, position: 6, startFrame: 1000, speechDurationSec: 10 }]],
    ["no frames", (slots: ResolvedTimelineContent["slots"]) => slots.map(slot => slot.kind === "hold" ? { ...slot, endFrame: 850 } : slot)],
  ])("refuses a hold with %s", (_label, edit) => {
    expect(() => freezeResolvedTimeline(withHold(edit))).toThrow();
  });

  it("refuses a hold on a segments timeline", () => {
    const { hash: _hash, ...content } = segmentsTimelineFixture();
    const [take1, insert2, take3] = content.slots;
    expect(() => freezeResolvedTimeline({ ...content, slots: [take1, insert2, { ...take3!, endFrame: 1000, speechDurationSec: 4.96 },
      { position: 4, startFrame: 1000, endFrame: 1728, kind: "hold", sourcePosition: 3 }] })).toThrow();
  });
});

describe("a hold is no face second (owner Q2, rule 5)", () => {
  /** Mutant: bill a hold as a take, and a 10 s freeze costs 100 credits of face the vendor never rendered. */
  it("changes the charge by exactly zero for a 10 s hold", () => {
    const tariff = { ...LONG_FORM_LAUNCH_TARIFF, minimumCredits: 0 };
    const held = freezeResolvedTimeline(withHold());
    const plain = scriptInsertsTimelineFixture();
    const charge = (timeline: ResolvedTimelineContent) =>
      calculateFaceCharge(faceBillingUnitsOf(timeline).flatMap(unit => unit.faceIntervals), timeline.fps, tariff);
    const hold = held.slots.find(slot => slot.kind === "hold")!;
    expect((hold.endFrame - hold.startFrame) / held.fps).toBe(10);
    expect(charge(held)).toEqual(charge(plain));
    expect(charge(held)).toMatchObject({ faceFrames: 625, billableFaceSeconds: 25, credits: 250 });
    expect(faceBillingUnitsOf(held).map(unit => unit.unitId)).toEqual(["segment:1", "segment:3", "segment:5", "segment:7"]);
    expect(calculateFaceCharge(faceBillingUnitsOf(held).flatMap(unit => unit.faceIntervals), held.fps, LONG_FORM_LAUNCH_TARIFF).credits)
      .toBe(calculateFaceCharge(faceBillingUnitsOf(plain).flatMap(unit => unit.faceIntervals), plain.fps, LONG_FORM_LAUNCH_TARIFF).credits);
  });

  /** Mutant: show the hold as a presenter shot, and the editor's face time runs ten seconds past the frames the run was billed for. */
  it("shows the hold in the editor as an inert picture, so its face time stays the billed one", () => {
    const held = freezeResolvedTimeline(withHold());
    const words = longFormWords(held, new Map([[`runs/${LONG_FORM_RUN_ID}/timings.json`, segmentWords("w", 80, 40)]]));
    const view = plannedRunShots.parse(longFormRunShots(held, words, { runId: LONG_FORM_RUN_ID, frame: longFormFrame("16:9"),
      editable: { state: "view_only", media_available_until: "2026-10-21T10:00:00.000Z", reason: "editing a long video comes later" },
      lineage: { source_run_id: null, root_run_id: LONG_FORM_RUN_ID, revisions: [] }, captions: false, contractVersion: "test",
      exposure: { descriptions: true, source_media: true }, previews: new Map(), background: null }));
    const shot = view.tracks.flatMap(track => track.shots).find(item => item.id === "hold-6")!;
    expect(shot).toMatchObject({ track: "visual", kind: "picture", start_frame: 850, end_frame: 1100, operations: [] });
    expect(presenterVisibleFrames(view)).toBe(625);
  });
});
