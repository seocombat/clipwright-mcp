import { expect, it } from "vitest";
import { quoteResponse } from "./skills.js";
import { run } from "./runs.js";

it("preserves the launch estimate through the public quote schema", () => {
  const pricing = { pricingVersion: "long-form-v1", rateCreditsPerFaceSecond: 10, minimumCredits: 400,
    estimatedTotalDurationSec: 300, estimatedFaceSeconds: 60, estimatedCredits: 600, minimumApplied: false };
  const parsed = quoteResponse.parse({ skill: "make_ugc", credits_estimate: 600, duration_estimate_sec: 300,
    contract_version: "test", source: null, actor: null, resolved_aspect_ratio: "9:16",
    tts_model: "eleven_v3", long_form_pricing: pricing });
  expect(parsed.long_form_pricing).toEqual(pricing);
});

it("preserves actual face usage and stored pricing through the run output schema", () => {
  const billing = { pricingVersion: "long-form-v1", rateCreditsPerFaceSecond: 10, minimumCredits: 400,
    actualDurationSec: 300, actualBillableFaceSeconds: 20, finalCreditsCharged: 400, minimumApplied: true };
  const parsed = run.parse({ run_id: "run_priced", skill: "make_ugc", state: "succeeded", credits_reserved: 600, credits_charged: 400,
    error: null, created_at: "2026-09-20T00:00:00.000Z", finished_at: "2026-09-20T00:05:00.000Z",
    final_output: { video_url: "https://example.com/final.mp4", duration_seconds: 300,
      ai_generated: true, ai_disclosure: "AI-generated", long_form_billing: billing } });
  expect(parsed.final_output?.long_form_billing).toEqual(billing);
});
