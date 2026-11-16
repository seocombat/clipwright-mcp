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

  /** #1452, owner 12.11. Mutants: bill the held still as presenter seconds, or drop it from production, and one line goes wrong; subtract
   *  without rounding, and 9.4 s holding 2.4 s bills an eighth presenter second. */
  it("a short video holding its last frame past the take bills the hold as production seconds only", () => {
    const held = core.calculateDurationPartsCharge(40, "heygen", tariff, true, 5);
    expect(held.lines.map((line) => [line.unit, line.quantity])).toEqual([["face_second", 35], ["second", 40]]);
    expect([held.credits, core.calculateDurationPartsCharge(35, "heygen", tariff, true).credits]).toEqual([35 * 9 + 40, 350]);
    expect(core.calculateDurationPartsCharge(9.4, "heygen", tariff, false, 2.4).billableFaceSeconds).toBe(7);
    expect(() => core.calculateDurationPartsCharge(3, "heygen", tariff, true, 4)).toThrow(RangeError);
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

// #1535, owner 14.11 ~23:30: a live shot on Gemini Omni 1.2 at 20 a second, a new tariff name; Wan 3.0 stays 30 and parts-v2 stays as it was.
describe("parts-v3: the Omni live-shot second", () => {
  const omni = core.PARTS_OMNI_FACE_TARIFF;
  const shotLine = (engine: core.ShotEngine) => core.calculatePartsCharge({ presenter: { [engine]: [{ startFrame: 0, endFrame: 4 * 25 }] },
    outputFrames: 4 * 25, fps: 25, liveAvatarStills: 0 }, omni, false).lines[0]!;

  /** The pilot's examples. Mutants: Omni at Wan's 30, Wan lowered to 20, or the two rates swapped. */
  it("prices 4 s on Omni at 80 and 4 s on Wan 3.0 at 120", () => {
    expect(shotLine("shot_omni")).toEqual({ label: "live shot, Gemini Omni 1.2", unit: "face_second", quantity: 4, unit_credits: 20, credits: 80 });
    expect(shotLine("shot_action")).toMatchObject({ quantity: 4, unit_credits: 30, credits: 120 });
    expect(shotLine("shot_talking_action")).toMatchObject({ unit_credits: 30, credits: 120 });
  });

  /** Mutant: the Omni rate added to parts-v2, which changes every snapshot, quote and /pricing line of an account outside the list. */
  it("leaves parts-v2 byte for byte, and names the new tariff", () => {
    expect(JSON.stringify(core.PARTS_FACE_TARIFF)).toBe(JSON.stringify({ version: 3, pricingVersion: "parts-v2",
      presenterCreditsPerSecond: { heygen: 9, omnihuman: 22 }, shotCreditsPerSecond: { shot_talking_action: 30, shot_action: 30 },
      productionCreditsPerSecond: 1, liveAvatarStillCredits: 400, minimumCredits: 50, rounding: "ceil_aggregate_seconds",
      failurePolicy: "verified_delivery_only" }));
    expect(omni).toEqual({ ...core.PARTS_FACE_TARIFF, pricingVersion: "parts-v3",
      shotCreditsPerSecond: { shot_talking_action: 30, shot_action: 30, shot_omni: 20 } });
    expect(core.partsFaceTariffSchema.parse(omni)).toEqual(omni);
    expect(core.partsFaceTariffFor(false, "720p")).toEqual(core.PARTS_FACE_TARIFF);
    expect(core.FACE_BILLING_TARIFFS).toEqual([core.PARTS_FACE_TARIFF]);
  });

  /** Mutant: an Omni second on parts-v2 priced by a fallback rate the run was never quoted. */
  it("prices no Omni second on parts-v2", () => {
    expect(() => core.calculatePartsCharge({ presenter: { shot_omni: [{ startFrame: 0, endFrame: 50 }] }, outputFrames: 50, fps: 25,
      liveAvatarStills: 0 }, core.PARTS_FACE_TARIFF, true)).toThrow("no rate for shot_omni");
  });
});

// #1539 C4, owner 15.11: the method ad. parts-v3 plus the Seedance 2.5 second by the video's resolution; Omni stays 20, the video 1.
describe("parts-v4: the method tariff", () => {
  const at720 = core.partsMethodFaceTariff("720p");
  const seconds = (engine: core.TakeEngine, from: number, to: number) => ({ [engine]: [{ startFrame: from * 25, endFrame: to * 25 }] });

  /** Mutants: the Seedance second at Omni's 20, at the 1080p rate on a 720p run, a no-text second at its text rate, or a parts-v3 rate moved. */
  it("adds the method's seconds to parts-v3: at 720p Seedance 89, no text 42, Omni no text 12; at 1080p no saving; no price at 4k", () => {
    expect(at720).toEqual({ ...core.PARTS_OMNI_FACE_TARIFF, pricingVersion: "parts-v4",
      shotCreditsPerSecond: { shot_talking_action: 30, shot_action: 30, shot_omni: 20, shot_seedance: 89, shot_omni_no_text: 12, shot_seedance_no_text: 42 } });
    expect(core.partsMethodFaceTariff("1080p").shotCreditsPerSecond).toMatchObject({ shot_omni: 20, shot_omni_no_text: 20, shot_seedance: 217,
      shot_seedance_no_text: 217 });
    expect(() => core.partsMethodFaceTariff("4k")).toThrow("no method shot second at 4k");
    expect(core.partsFaceTariffSchema.parse(at720)).toEqual(at720);
    expect(core.partsFaceTariffFor(true, "1080p")).toEqual(core.partsMethodFaceTariff("1080p"));
    // parts-v3 stays byte for byte for the runs admitted on it.
    expect(core.PARTS_OMNI_FACE_TARIFF.shotCreditsPerSecond).toEqual({ shot_talking_action: 30, shot_action: 30, shot_omni: 20 });
    expect(core.PRE_PRODUCTION_CREDITS).toBe(270);
  });

  /** The owner's example: a 19 s ad on Omni is 669 with its pre-production; Seedance seconds on their own line. */
  it("prices a 19 s Omni ad at 19 × 20 + 19, and the Seedance seconds of a mixed one at 89 on their own line", () => {
    const omni = core.calculatePartsCharge({ presenter: seconds("shot_omni", 0, 19), outputFrames: 19 * 25, fps: 25, liveAvatarStills: 0 }, at720, true);
    expect(omni.credits + core.PRE_PRODUCTION_CREDITS).toBe(669);
    const mixed = core.calculatePartsCharge({ presenter: { ...seconds("shot_omni", 0, 12), ...seconds("shot_seedance", 12, 19) }, outputFrames: 19 * 25,
      fps: 25, liveAvatarStills: 0 }, at720, true);
    expect(mixed.lines).toEqual([
      { label: "live shot, Gemini Omni 1.2", unit: "face_second", quantity: 12, unit_credits: 20, credits: 240 },
      { label: "live shot, Seedance 2.5", unit: "face_second", quantity: 7, unit_credits: 89, credits: 623 },
      { label: "production (voice and render)", unit: "second", quantity: 19, unit_credits: 1, credits: 19 }]);
    // A mixed ad: each model with and without text on its own line.
    const four = core.calculatePartsCharge({ presenter: { ...seconds("shot_omni", 0, 4), ...seconds("shot_omni_no_text", 4, 8),
      ...seconds("shot_seedance", 8, 11), ...seconds("shot_seedance_no_text", 11, 15) }, outputFrames: 15 * 25, fps: 25, liveAvatarStills: 0 }, at720, true);
    expect(four.lines.map(line => [line.label, line.quantity, line.unit_credits])).toEqual([["live shot, Gemini Omni 1.2", 4, 20],
      ["live shot, Seedance 2.5", 3, 89], ["live shot, Gemini Omni 1.2, no text in frame", 4, 12], ["live shot, Seedance 2.5, no text in frame", 4, 42],
      ["production (voice and render)", 15, 1]]);
    expect(four.credits).toBe(80 + 267 + 48 + 168 + 15);
    // A snapshot from before the method seconds prices none of them (Codex no-text r1).
    for (const engine of ["shot_omni_no_text", "shot_seedance_no_text"] as const) {
      expect(() => core.calculatePartsCharge({ presenter: seconds(engine, 0, 2), outputFrames: 50, fps: 25, liveAvatarStills: 0 },
        core.PARTS_OMNI_FACE_TARIFF, true)).toThrow(`no rate for ${engine}`);
    }
    expect(() => core.calculatePartsCharge({ presenter: seconds("shot_seedance", 0, 2), outputFrames: 50, fps: 25, liveAvatarStills: 0 },
      core.PARTS_OMNI_FACE_TARIFF, true)).toThrow("no rate for shot_seedance");
  });
});
