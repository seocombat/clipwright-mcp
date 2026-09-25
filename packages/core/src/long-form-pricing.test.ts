import { describe, expect, it } from "vitest";
import * as core from "./index.js";

describe("long-form launch tariff", () => {
  it("preserves legacy face-price explanations in the public final output", () => {
    const output = { video_url: "https://example.com/result.mp4", duration_seconds: 120,
      ai_generated: true, ai_disclosure: core.AI_DISCLOSURE_TEXT, face_duration_seconds: 60,
      full_speech_duration_seconds: 100, face_credits_per_second: 7, face_tariff_id: "historical-v1" };
    expect(core.run.shape.final_output.parse(output)).toEqual(output);
  });
  it("publishes immutable owner-approved authorization terms", () => {
    expect(core.LONG_FORM_LAUNCH_TARIFF).toEqual({ version: 2, pricingVersion: "long-form-v1",
      rateCreditsPerFaceSecond: 10, minimumCredits: 400, rounding: "ceil_aggregate_seconds",
      failurePolicy: "verified_delivery_only" });
    expect(Object.isFrozen(core.LONG_FORM_LAUNCH_TARIFF)).toBe(true);
  });
  it.each([[1, 400, true], [1000, 400, false], [1001, 410, false], [1500, 600, false]])(
    "charges %i face frames independently of a 300-second output", (endFrame, credits, minimumApplied) => {
      expect(core.calculateFaceCharge([{ startFrame: 0, endFrame }], 25, core.LONG_FORM_LAUNCH_TARIFF))
        .toEqual({ faceFrames: endFrame, billableFaceSeconds: Math.ceil(endFrame / 25), credits, minimumApplied });
    });
  it("unions overlaps and rounds once across disjoint intervals", () => {
    const intervals = [{ startFrame: 1000, endFrame: 1501 }, { startFrame: 0, endFrame: 501 },
      { startFrame: 500, endFrame: 1000 }];
    const before = structuredClone(intervals);
    expect(core.calculateFaceCharge(intervals, 25, core.LONG_FORM_LAUNCH_TARIFF))
      .toEqual({ faceFrames: 1501, billableFaceSeconds: 61, credits: 610, minimumApplied: false });
    expect(intervals).toEqual(before);
  });
  it("uses stored future terms and detaches parsed snapshots", () => {
    const input = { ...core.LONG_FORM_LAUNCH_TARIFF, pricingVersion: "future-rate", rateCreditsPerFaceSecond: 12 };
    const tariff = core.faceBillingTariffSchema.parse(input);
    input.rateCreditsPerFaceSecond = 99;
    expect(core.faceTariffRate(tariff)).toBe(12);
    expect(core.faceTariffPricingVersion(tariff)).toBe("future-rate");
    expect(core.faceTariffMinimum(tariff)).toBe(400);
    expect(core.isDeliveryOnlyFaceTariff(tariff)).toBe(true);
    expect(Object.isFrozen(tariff)).toBe(true);
  });
  it("rejects ledger overflow and invalid frame precision", () => {
    expect(() => core.calculateFaceCharge([{ startFrame: 0, endFrame: 214748365 }], 1,
      core.LONG_FORM_LAUNCH_TARIFF)).toThrow(RangeError);
    expect(() => core.calculateFaceCharge([{ startFrame: 0, endFrame: Number.MAX_SAFE_INTEGER + 1 }], 25,
      core.LONG_FORM_LAUNCH_TARIFF)).toThrow();
  });
  it("rounds exactly at safe-integer frame boundaries", () => {
    const fps = 4_503_599_627_370_495;
    const tariff = { version: 1 as const, id: "boundary", creditsPerSecond: 1,
      rounding: "ceil_aggregate_seconds" as const };
    expect(core.calculateFaceCharge([{ startFrame: 0, endFrame: fps * 2 }], fps, tariff))
      .toEqual({ faceFrames: fps * 2, billableFaceSeconds: 2, credits: 2, minimumApplied: false });
    expect(core.calculateFaceCharge([{ startFrame: 0, endFrame: fps * 2 + 1 }], fps, tariff).credits).toBe(3);
    expect(core.faceTariffMinimum(tariff)).toBe(0);
    expect(core.faceTariffPricingVersion(tariff)).toBe("boundary");
    expect(core.isDeliveryOnlyFaceTariff(tariff)).toBe(false);
  });
  it("preserves quote and final billing fields in detached immutable contracts", () => {
    const pricing = { pricingVersion: "long-form-v1", rateCreditsPerFaceSecond: 10, minimumCredits: 400 };
    const quote = { ...pricing, estimatedTotalDurationSec: 300, estimatedFaceSeconds: 60,
      estimatedCredits: 600, minimumApplied: false };
    const summary = { ...pricing, actualDurationSec: 300, actualBillableFaceSeconds: 60,
      finalCreditsCharged: 600, minimumApplied: false };
    expect(core.longFormQuoteSchema.parse(quote)).toEqual(quote);
    expect(core.longFormBillingSummarySchema.parse(summary)).toEqual(summary);
    expect(core.longFormQuoteSchema.safeParse({ ...quote, estimatedCredits: -1 }).success).toBe(false);
    expect(core.longFormBillingSummarySchema.safeParse({ ...summary, actualBillableFaceSeconds: 0.5 }).success).toBe(false);
  });
});
