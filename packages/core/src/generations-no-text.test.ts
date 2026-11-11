import { describe, expect, it } from "vitest";

import { GENERATION_NO_TEXT_CLAUSE, generateImageRequest, generateVideoRequest, withNoTextClause } from "./generations.js";

describe("the no-text clause (#1248)", () => {
  it("is added by default when the generation works from a reference", () => {
    expect(withNoTextClause("a regulator on a bench", { hasReference: true })).toBe(`a regulator on a bench\n${GENERATION_NO_TEXT_CLAUSE}`);
  });

  it("is off with keep_text", () => {
    expect(withNoTextClause("a regulator on a bench", { hasReference: true, keepText: true })).toBe("a regulator on a bench");
  });

  it("is off without a reference", () => {
    expect(withNoTextClause("a regulator on a bench", { hasReference: false })).toBe("a regulator on a bench");
  });

  it("is not doubled when the prompt already asks for no text", () => {
    expect(withNoTextClause("a bench. No text, no watermark.", { hasReference: true })).toBe("a bench. No text, no watermark.");
  });

  it("keep_text is accepted by both generation requests", () => {
    expect(generateImageRequest.safeParse({ prompt: "p", model: "flare", aspect_ratio: "9:16", keep_text: true }).success).toBe(true);
    expect(generateVideoRequest.safeParse({ prompt: "p", model: "seedance-2.0", mode: "text", aspect_ratio: "9:16", resolution: "480p",
      duration_s: 5, keep_text: true }).success).toBe(true);
  });
});
