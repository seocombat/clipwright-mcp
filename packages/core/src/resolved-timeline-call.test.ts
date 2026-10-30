import { describe, expect, it } from "vitest";
import { LONG_FORM_RUN_ID, scriptInsertsTimelineFixture } from "./__fixtures__/long-form-timeline.fixture.js";
import { LONG_FORM_LAUNCH_TARIFF, calculateFaceCharge } from "./long-form-pricing.js";
import { faceBillingUnitsOf, freezeResolvedTimeline, type ResolvedTimelineContent } from "./resolved-timeline.js";

// The call artifact of a resolved timeline (#857 S5, D2, C7).

const hex = (seed: string): string => seed.repeat(64).slice(0, 64);
const audio = (seed: string) => ({ key: `runs/${LONG_FORM_RUN_ID}/narration/${hex(seed)}.wav`, sha256: hex(seed), bytes: 100 });
type Slots = ResolvedTimelineContent["slots"];

/** The script fixture's last take split by a call's gap: take 750–850, live 850–940, hold 940–1100, take 1100–1250. */
function withGap(call?: Record<string, unknown>): Record<string, unknown> {
  const { hash: _hash, ...content } = scriptInsertsTimelineFixture();
  const slots: Slots = [...content.slots.slice(0, 4),
    { position: 5, startFrame: 750, endFrame: 850, kind: "actor", requestHash: hex("0"), speechDurationSec: 4, audio: audio("7") },
    { position: 6, startFrame: 850, endFrame: 940, kind: "live", sourcePosition: 5, requestHash: hex("5") },
    { position: 7, startFrame: 940, endFrame: 1100, kind: "hold", sourcePosition: 6 },
    { position: 8, startFrame: 1100, endFrame: 1250, kind: "actor", requestHash: hex("1"), speechDurationSec: 6, audio: audio("4") }];
  return { ...content, outputFrames: 1250, fullSpeechDurationSec: 50, slots, ...(call ? { call } : {}) };
}

describe("a timeline's call", () => {
  it("is optional: a timeline without it keeps the hash it had before S5", () => {
    const before = freezeResolvedTimeline(withGap());
    expect(freezeResolvedTimeline({ ...withGap(), call: undefined }).hash).toBe(before.hash);
    expect(freezeResolvedTimeline(withGap({ ...audio("c"), startFrame: 879, endFrame: 1090 })).hash).not.toBe(before.hash);
  });

  /** Mutants: drop any check, and a resume plays a call outside its freeze, under the talking take, or from another run's bytes. */
  it.each([
    ["before the gap opens", { ...audio("c"), startFrame: 849, endFrame: 1090 }],
    ["past the hold", { ...audio("c"), startFrame: 879, endFrame: 1101 }],
    ["with no length", { ...audio("c"), startFrame: 900, endFrame: 900 }],
    ["under another run's key", { ...audio("c"), key: `runs/run_other/narration/${hex("c")}.wav`, startFrame: 879, endFrame: 1090 }],
  ])("refuses a call %s", (_label, call) => {
    expect(() => freezeResolvedTimeline(withGap(call))).toThrow("a call lies inside its hold's gap");
  });

  it("refuses a call on a timeline without a hold", () => {
    const { hash: _hash, ...content } = scriptInsertsTimelineFixture();
    expect(() => freezeResolvedTimeline({ ...content, call: { ...audio("c"), startFrame: 10, endFrame: 20 } })).toThrow("a call lies inside");
  });

  /** C7: the call adds no face seconds; the charge is the takes' and the live beat's, the same with and without it. */
  it("leaves the charge as it is", () => {
    const tariff = { ...LONG_FORM_LAUNCH_TARIFF, minimumCredits: 0 };
    const charge = (content: Record<string, unknown>) => calculateFaceCharge(faceBillingUnitsOf(freezeResolvedTimeline(content))
      .flatMap(unit => unit.faceIntervals), 25, tariff);
    expect(charge(withGap({ ...audio("c"), startFrame: 879, endFrame: 1090 }))).toEqual(charge(withGap()));
  });
});
