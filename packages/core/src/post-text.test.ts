import { describe, expect, it } from "vitest";
import { POST_TEXT_MAX_CHARS, postText, postTextFor } from "./post-text.js";
import { run } from "./runs.js";

// #1366: the lines to publish with a delivered film. They ride on the run's answer only when they are 1–3 lines in the script's language.

const script = "Three mistakes people make with collagen cream. Mistake one: using it only in the morning.";
const russian = "Три ошибки с кремом. Ошибка первая: только утром.";

describe("post text (#1366)", () => {
  /** Mutants: a fourth line kept; blank lines counted as lines; the lines left untrimmed. */
  it("keeps one to three trimmed lines and drops blank ones", () => {
    expect(postTextFor("  Three mistakes with collagen cream.  \n\n Fix them tonight. \n", script))
      .toBe("Three mistakes with collagen cream.\nFix them tonight.");
    expect(postTextFor("One.\nTwo.\nThree.\nFour.", script)).toBeUndefined();
    expect(postTextFor(" \n \n", script)).toBeUndefined();
  });

  /** Mutants: the language check dropped, so an English caption rides on a Russian film; Latin scripts with diacritics told apart. */
  it("refuses lines written in another script than the film's", () => {
    expect(postTextFor("Three mistakes with collagen cream.", russian)).toBeUndefined();
    expect(postTextFor("Три ошибки, которые старят кожу.", russian)).toBe("Три ошибки, которые старят кожу.");
    expect(postTextFor("Trzy błędy z kremem.", "Three mistakes with cream.")).toBe("Trzy błędy z kremem.");
  });

  /** Mutant: the length cap dropped, so a paragraph rides as a caption. */
  it("refuses text past its length", () => {
    expect(postTextFor("a".repeat(POST_TEXT_MAX_CHARS + 1), script)).toBeUndefined();
  });

  /** Mutants: post_text missing from the run's answer, or made required, so a film delivered without lines no longer parses. */
  it("is an optional field of a delivered run's answer, held to the same shape", () => {
    const delivered = { run_id: "run_a1", skill: "make_faceless", state: "succeeded", credits_reserved: 500, credits_charged: 500, error: null,
      created_at: "2026-11-10T00:00:00.000Z", finished_at: "2026-11-10T00:05:00.000Z",
      final_output: { video_url: "https://example.com/v.mp4", duration_seconds: 30, ai_generated: true, ai_disclosure: "AI-generated" } };
    expect(run.parse(delivered).final_output).not.toHaveProperty("post_text");
    const withLines = { ...delivered, final_output: { ...delivered.final_output, post_text: "Line one.\nLine two." } };
    expect(run.parse(withLines).final_output?.post_text).toBe("Line one.\nLine two.");
    expect(run.safeParse({ ...delivered, final_output: { ...delivered.final_output, post_text: "1\n2\n3\n4" } }).success).toBe(false);
    expect(postText.safeParse("Line one.\n\nLine two.").success).toBe(false);
  });
});
