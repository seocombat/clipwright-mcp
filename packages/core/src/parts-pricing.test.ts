import { describe, expect, it } from "vitest";
import * as core from "./index.js";

// What /pricing promises about the parts tariff (#800): its claims point at these cases.
describe("parts tariff, as the public pricing states it", () => {
  const tariff = core.PARTS_DURATION_TARIFF;
  const rate = (engine: core.PresenterEngine) => tariff.presenterCreditsPerSecond[engine] + tariff.productionCreditsPerSecond;

  it("a short video costs its presenter and production rates per second, at least the minimum once delivered", () => {
    for (const engine of core.PRESENTER_ENGINES) {
      expect(core.calculateDurationPartsCharge(35, engine, tariff, true).credits).toBe(35 * rate(engine));
      expect(core.calculateDurationPartsCharge(1, engine, tariff, true).credits).toBe(tariff.minimumCredits);
      expect(core.calculateDurationPartsCharge(1, engine, tariff, false).credits).toBe(rate(engine));
    }
  });

  it("a short video's fraction of a second rounds up, and a fraction or zero still bills one second", () => {
    expect(core.calculateDurationPartsCharge(27.0494, "heygen", tariff, false).billableFaceSeconds).toBe(28);
    expect(core.calculateDurationPartsCharge(0.2, "heygen", tariff, false).billableFaceSeconds).toBe(1);
    expect(core.calculateDurationPartsCharge(0, "heygen", tariff, false).billableFaceSeconds).toBe(1);
  });

  it("a long video counts overlapping presenter takes once and every second of the video", () => {
    const charge = core.calculatePartsCharge({ presenter: { heygen: [{ startFrame: 0, endFrame: 501 },
      { startFrame: 500, endFrame: 1000 }] }, outputFrames: 4500, fps: 25, liveAvatarStills: 0 }, core.PARTS_FACE_TARIFF, true);
    expect(charge.lines.map((line) => [line.unit, line.quantity])).toEqual([["face_second", 40], ["second", 180]]);
    expect(charge.credits).toBe(40 * core.PARTS_FACE_TARIFF.presenterCreditsPerSecond.heygen
      + 180 * core.PARTS_FACE_TARIFF.productionCreditsPerSecond);
  });

  /** Mutants (#1103): price a shot at the HeyGen rate, or drop a shot engine from the walk, and the line or its rate goes wrong. */
  it("a live shot is a line of its own at its engine's rate, beside the presenter's", () => {
    const charge = core.calculatePartsCharge({ presenter: { heygen: [{ startFrame: 0, endFrame: 150 }],
      shot_talking_action: [{ startFrame: 150, endFrame: 351 }], shot_action: [{ startFrame: 351, endFrame: 500 }] },
    outputFrames: 500, fps: 25, liveAvatarStills: 1 }, core.PARTS_FACE_TARIFF, true);
    expect(charge.lines.map((line) => [line.label, line.quantity, line.unit_credits])).toEqual([
      ["presenter, HeyGen Avatar IV", 6, 9], ["live shot, speaking while acting", 9, 30], ["live shot, acting under voice-over", 6, 30],
      ["production (voice and render)", 20, 1], ["live avatar on a call", 1, 400]]);
    expect(charge.credits).toBe(6 * 9 + 9 * 30 + 6 * 30 + 20 + 400);
    expect(charge.billableFaceSeconds).toBe(21);
  });

  /** Mutant: price a shot on a snapshot without shot rates by a fallback, and an old run is charged a rate it was never quoted. */
  it("a tariff snapshot from before live shots prices no shot", () => {
    const { shotCreditsPerSecond: _rates, ...old } = core.PARTS_FACE_TARIFF;
    expect(() => core.calculatePartsCharge({ presenter: { shot_action: [{ startFrame: 0, endFrame: 50 }] }, outputFrames: 50, fps: 25,
      liveAvatarStills: 0 }, old, true)).toThrow(RangeError);
    expect(core.calculatePartsCharge({ presenter: { heygen: [{ startFrame: 0, endFrame: 50 }] }, outputFrames: 50, fps: 25,
      liveAvatarStills: 0 }, old, true).credits).toBe(core.PARTS_FACE_TARIFF.minimumCredits);
  });
});
