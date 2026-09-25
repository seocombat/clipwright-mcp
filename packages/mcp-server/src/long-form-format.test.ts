import { expect, it } from "vitest";
import { runRead } from "@clipwright/core";
import { formatGetRun } from "./format.js";

it("shows the actual face seconds and authorized price after completion", () => {
  const billing = { pricingVersion: "long-form-v1", rateCreditsPerFaceSecond: 10, minimumCredits: 400,
    actualDurationSec: 300, actualBillableFaceSeconds: 60, finalCreditsCharged: 600, minimumApplied: false };
  const result = formatGetRun(runRead.parse({ run_id: "run_long", skill: "make_ugc", state: "succeeded",
    credits_reserved: 600, credits_charged: 600, error: null,
    created_at: "2026-09-20T00:00:00.000Z", finished_at: "2026-09-20T00:05:00.000Z",
    final_output: { video_url: "https://example.com/final.mp4", duration_seconds: 300,
      ai_generated: true, ai_disclosure: "AI-generated", long_form_billing: billing } }));
  expect(JSON.parse(result.content[0]!.text).long_form_billing).toEqual(billing);
});
