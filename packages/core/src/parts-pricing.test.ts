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
});
