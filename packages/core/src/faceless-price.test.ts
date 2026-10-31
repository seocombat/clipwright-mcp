import { describe, expect, it } from "vitest";
import { FACELESS_MAX_OUTPUT_FRAMES, FACELESS_MIN_OUTPUT_FRAMES, FACELESS_PUBLIC_MAX_GENERATED_IMAGES, FACELESS_SLOWEST_CHARACTERS_PER_SECOND,
  FACELESS_SPEECH_MAX_CHARACTERS, facelessMaxEstimateFrames, facelessMaxGeneratedImages, facelessMaxOutputFrames, facelessQuote,
  quoteFaceless } from "./faceless-price.js";
import { facelessPlannerInput } from "./faceless-public.js";
import { run } from "./runs.js";

// A delivered video may run 25 s since the owner's decision of 2026-09-27; the selection stays 30–90 s.
describe("25-second delivered output", () => {
  it("prices, parses and decodes 625 frames and refuses 624", () => {
    expect(FACELESS_MIN_OUTPUT_FRAMES).toBe(625);
    const quote = quoteFaceless({ outputFrames: 625, captions: true });
    // 16 pictures at 7, 25 production seconds, the opening clip at 49.
    expect(quote).toMatchObject({ outputFrames: 625, baseCredits: 137, totalCredits: 186, images: 16 });
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

// The output may run a quarter past the selection (owner, 2026-10-07, #529); the script estimate keeps the selection plus 5 s.
describe("faceless length ceilings", () => {
  it.each([[750, 937, 875], [751, 938, 876], [1000, 1250, 1125], [1250, 1562, 1375], [1800, 2250, 1925], [2125, 2250, 2250],
    [2250, 2250, 2250]])("a selection of %i frames delivers up to %i and admits an estimate up to %i", (selected, output, estimate) => {
    expect(facelessMaxOutputFrames(selected)).toBe(output);
    expect(facelessMaxEstimateFrames(selected)).toBe(estimate);
  });

  // A paid take past the quarter is delivered at its length (owner, 2026-10-31): 2500 characters at 13 a second plus a 5 s lead.
  it("delivers up to 198 s, and the run's bill may name it while a quote stays on the selection", () => {
    expect(FACELESS_SPEECH_MAX_CHARACTERS / FACELESS_SLOWEST_CHARACTERS_PER_SECOND + 5).toBeCloseTo(197.31, 2);
    expect(FACELESS_MAX_OUTPUT_FRAMES).toBe(4950);
    const quote = quoteFaceless({ outputFrames: 2250, captions: true });
    expect(() => quoteFaceless({ outputFrames: 2251, captions: true })).toThrow();
    expect(facelessQuote.safeParse({ ...quote, outputFrames: 2251 }).success).toBe(false);
    const finished = { run_id: "run_abc", skill: "make_faceless", state: "succeeded", credits_reserved: 356, credits_charged: 356,
      warnings: [], error: null, final_output: { video_url: "https://example.com/video.mp4", duration_seconds: 198,
        ai_generated: true, ai_disclosure: "AI-generated video" }, created_at: "2026-10-31T10:00:00Z", finished_at: "2026-10-31T10:05:00Z" };
    for (const [outputFrames, parses] of [[4950, true], [4951, false]] as const) {
      expect(run.safeParse({ ...finished, faceless_billing: { ...quote, outputFrames } }).success).toBe(parses);
      const planner = { script: "one two", outputFrames, captions: true, words: [{ word: "one", startSec: 0, endSec: .4 }] };
      expect(facelessPlannerInput.safeParse(planner).success).toBe(parses);
    }
  });
});

describe("facelessMaxGeneratedImages", () => {
  it.each([[750, Infinity, 19], [1000, Infinity, 24], [1349, Infinity, 30], [1350, 31, 31], [2250, Infinity, 49], [2250, 31, 31], [750, 13, 13]])(
    "a selection of %i frames under ceiling %s plans at most %i pictures", (selected, ceiling, pictures) => {
      expect(facelessMaxGeneratedImages(selected, ceiling)).toBe(pictures);
    });
  it("defaults to no ceiling and names the public one", () => {
    expect(facelessMaxGeneratedImages(2250)).toBe(49);
    expect(FACELESS_PUBLIC_MAX_GENERATED_IMAGES).toBe(31);
  });
});

describe("quoteFaceless", () => {
  // Every picture the selection may generate at 7, every second at 1 rounded up once, the opening clip at 49 (#800).
  it.each([[750, 212], [938, 241], [1522, 327], [2250, 356]])("quotes %i frames at %i credits", (outputFrames, totalCredits) => {
    expect(quoteFaceless({ outputFrames, captions: true }).totalCredits).toBe(totalCredits);
  });

  it("does not change price when captions are off", () => {
    expect(quoteFaceless({ outputFrames: 750, captions: false })).toEqual({
      outputFrames: 750, baseCredits: 163, openerCredits: 49, totalCredits: 212,
      tariffId: "faceless-parts-v1", captions: false, images: 19, imageCredits: 7,
    });
  });

  it.each([624, 2251, 750.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid frame count %s", (outputFrames) => {
    expect(() => quoteFaceless({ outputFrames, captions: true })).toThrow();
  });
});
