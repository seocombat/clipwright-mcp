import { describe, expect, it } from "vitest";
import { LONG_FORM_RUN_ID, scriptInsertsTimelineFixture, segmentWords } from "./__fixtures__/long-form-timeline.fixture.js";
import { longFormFrame, longFormRunShots, longFormWords } from "./edit-long-form.js";
import { plannedRunShots } from "./edit-shots.js";
import { presenterVisibleFrames } from "./edit-validate.js";
import { faceBillingPlanContentSchema } from "./face-billing.js";
import { LONG_FORM_LAUNCH_TARIFF, calculateFaceCharge } from "./long-form-pricing.js";
import { faceBillingUnitsOf, freezeResolvedTimeline, readResolvedTimeline, type ResolvedTimelineContent } from "./resolved-timeline.js";

const hex = (seed: string): string => seed.repeat(64).slice(0, 64);
const audio = (seed: string) => ({ key: `runs/${LONG_FORM_RUN_ID}/narration/${hex(seed)}.wav`, sha256: hex(seed), bytes: 100 });
type Slots = ResolvedTimelineContent["slots"];

/** The script fixture's last take split by the reference's listening beat: take 750–850, live 850–940 (3.6 s), hold 940–1100, take 1100–1250. */
function withLive(edit: (slots: Slots) => unknown[] = slots => slots): unknown {
  const { hash: _hash, ...content } = scriptInsertsTimelineFixture();
  const slots: Slots = [...content.slots.slice(0, 4),
    { position: 5, startFrame: 750, endFrame: 850, kind: "actor", requestHash: hex("0"), speechDurationSec: 4, audio: audio("7") },
    { position: 6, startFrame: 850, endFrame: 940, kind: "live", sourcePosition: 5, requestHash: hex("5") },
    { position: 7, startFrame: 940, endFrame: 1100, kind: "hold", sourcePosition: 6 },
    { position: 8, startFrame: 1100, endFrame: 1250, kind: "actor", requestHash: hex("1"), speechDurationSec: 6, audio: audio("4") }];
  return { ...content, outputFrames: 1250, fullSpeechDurationSec: 50, slots: edit(slots) };
}
const map = (kind: string, change: Record<string, unknown>) => (slots: Slots) => slots.map(slot => slot.kind === kind ? { ...slot, ...change } : slot);

describe("the live listening slot (S4d, D1)", () => {
  it("round-trips between the take it continues and the hold that freezes it", () => {
    const frozen = freezeResolvedTimeline(withLive());
    expect(readResolvedTimeline(JSON.parse(JSON.stringify(frozen)))).toEqual(frozen);
    expect(frozen.slots.slice(4).map(slot => [slot.kind, slot.startFrame, slot.endFrame])).toEqual([["actor", 750, 850], ["live", 850, 940],
      ["hold", 940, 1100], ["actor", 1100, 1250]]);
  });

  /** Mutants: drop any of the live slot's checks, and a listening take continues an insert, freezes nowhere, or bills a request twice. */
  it.each([
    ["a source that is not the take before it", map("live", { sourcePosition: 3 })],
    ["no hold after it", (slots: Slots) => [...slots.slice(0, 6), { ...slots[7]!, position: 7, startFrame: 940, speechDurationSec: 12 }]],
    ["a hold after it that freezes another slot", map("hold", { sourcePosition: 5 })],
    ["the request of a take", map("live", { requestHash: hex("0") })],
  ])("refuses a live slot with %s", (_label, edit) => {
    expect(() => freezeResolvedTimeline(withLive(edit))).toThrow();
  });

  it("refuses a live slot on a timeline frozen from segments", () => {
    expect(() => freezeResolvedTimeline({ ...(withLive() as object), mode: "segments" })).toThrow();
  });
});

describe("the live take is face seconds; the hold is none (S4d, C9)", () => {
  const tariff = { ...LONG_FORM_LAUNCH_TARIFF, minimumCredits: 0 };
  const charge = (units: ReturnType<typeof faceBillingUnitsOf>, fps: number) => calculateFaceCharge(units.flatMap(unit => unit.faceIntervals), fps, tariff);

  /** Mutants: bill the live slot as a hold, or the hold as a take, and the 3.6 s listening beat is free or the freeze is billed. */
  it("bills the 90 live frames on top of the takes, and the 160 held frames not at all", () => {
    const timeline = freezeResolvedTimeline(withLive());
    const units = faceBillingUnitsOf(timeline);
    expect(units.map(unit => [unit.unitId, unit.optional ?? false])).toEqual([["segment:1", false], ["segment:3", false], ["segment:5", false],
      ["live:6", true], ["segment:8", false]]);
    expect(units.find(unit => unit.unitId === "live:6")).toMatchObject({ requestHash: hex("5"), faceIntervals: [{ startFrame: 850, endFrame: 940 }] });
    // 625 take frames plus 90 live frames at 25 fps: 28.6 s, billed as 29 s at 10 credits.
    expect(charge(units, timeline.fps)).toMatchObject({ faceFrames: 715, billableFaceSeconds: 29, credits: 290 });
    expect(charge(units.filter(unit => !unit.optional), timeline.fps)).toMatchObject({ faceFrames: 625, credits: 250 });
    expect(faceBillingPlanContentSchema.parse({ version: 1, fps: 25, outputFrames: 1250, fullSpeechDurationSec: 50, units })).toBeTruthy();
  });

  /** Mutant: leave the live slot off the presenter track, and the editor's face time falls short of the billed frames. */
  it("shows the live slot in the editor as presenter time, inert", () => {
    const timeline = freezeResolvedTimeline(withLive());
    const words = longFormWords(timeline, new Map([[`runs/${LONG_FORM_RUN_ID}/timings.json`, segmentWords("w", 80, 40)]]));
    const view = plannedRunShots.parse(longFormRunShots(timeline, words, { runId: LONG_FORM_RUN_ID, frame: longFormFrame("16:9"),
      editable: { state: "view_only", media_available_until: "2026-10-21T10:00:00.000Z", reason: "editing a long video comes later" },
      lineage: { source_run_id: null, root_run_id: LONG_FORM_RUN_ID, revisions: [] }, captions: false, contractVersion: "test",
      exposure: { descriptions: true, source_media: true }, previews: new Map(), background: null }));
    expect(view.tracks.flatMap(track => track.shots).find(item => item.id === "live-6")).toMatchObject({ track: "presenter", kind: "presenter",
      start_frame: 850, end_frame: 940, operations: [] });
    expect(presenterVisibleFrames(view)).toBe(715);
  });
});
