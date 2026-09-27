import { describe, expect, it } from "vitest";
import { FACELESS_MIN_OUTPUT_FRAMES, facelessQuote, quoteFaceless } from "./faceless-price.js";
import { facelessPlannerInput } from "./faceless-public.js";
import { run } from "./runs.js";

// A delivered video may run 25 s since the owner's decision of 2026-09-27; the selection stays 30–90 s.
describe("25-second delivered output", () => {
  it("prices, parses and decodes 625 frames and refuses 624", () => {
    expect(FACELESS_MIN_OUTPUT_FRAMES).toBe(625);
    const quote = quoteFaceless({ outputFrames: 625, captions: true });
    expect(quote).toMatchObject({ outputFrames: 625, baseCredits: 200, totalCredits: 350 });
    expect(() => quoteFaceless({ outputFrames: 624, captions: true })).toThrow();
    expect(facelessQuote.safeParse({ ...quote, outputFrames: 624 }).success).toBe(false);
    const planner = { script: "one two", outputFrames: 625, captions: true, words: [{ word: "one", startSec: 0, endSec: .4 }] };
    expect(facelessPlannerInput.safeParse(planner).success).toBe(true);
    expect(facelessPlannerInput.safeParse({ ...planner, outputFrames: 624 }).success).toBe(false);
    const finished = { run_id: "run_abc", skill: "make_faceless", state: "succeeded", credits_reserved: 350, credits_charged: 350,
      faceless_billing: quote, warnings: [], error: null,
      final_output: { video_url: "https://example.com/video.mp4", duration_seconds: 25,
        ai_generated: true, ai_disclosure: "AI-generated video" },
      created_at: "2026-09-27T10:00:00Z", finished_at: "2026-09-27T10:01:00Z" };
    expect(run.safeParse(finished).success).toBe(true);
    expect(run.safeParse({ ...finished, faceless_billing: { ...quote, outputFrames: 624 } }).success).toBe(false);
  });
});

describe("quoteFaceless", () => {
  it.each([[750, 350], [1522, 350], [2250, 420]])("quotes %i frames at %i credits", (outputFrames, totalCredits) => {
    expect(quoteFaceless({ outputFrames, captions: true }).totalCredits).toBe(totalCredits);
  });

  it("does not change price when captions are off", () => {
    expect(quoteFaceless({ outputFrames: 750, captions: false })).toEqual({
      outputFrames: 750, baseCredits: 200, openerCredits: 150, totalCredits: 350,
      tariffId: "faceless-image-i2v-v1", captions: false,
    });
  });

  it.each([624, 2251, 750.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid frame count %s", (outputFrames) => {
    expect(() => quoteFaceless({ outputFrames, captions: true })).toThrow();
  });
});
