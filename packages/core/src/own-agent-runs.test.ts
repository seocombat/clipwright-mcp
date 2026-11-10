import { describe, expect, it } from "vitest";
import { filmStillsInput, filmVoiceInput, OWN_VOICE_MAX_CHARS, ownFilmFrames, ownVoiceCeilingSeconds } from "./own-agent-runs.js";
import { OWN_VOICE_MAX_SECONDS } from "./own-agent-price.js";

// #1337: what an own-agent run holds before it is made: a take at the slowest pace, a film at its voice plus the tail, at most 8 stills.

describe("own-agent run bounds", () => {
  /** Mutants: hold a take at an average pace, or let the longest text hold past the longest take the tariff prices. */
  it("holds a take at 13 characters a second plus two, within the longest take for the longest text", () => {
    expect(ownVoiceCeilingSeconds("x".repeat(130))).toBe(12);
    expect(ownVoiceCeilingSeconds("x".repeat(OWN_VOICE_MAX_CHARS))).toBeLessThanOrEqual(OWN_VOICE_MAX_SECONDS);
    expect(filmVoiceInput.safeParse({ text: "x".repeat(OWN_VOICE_MAX_CHARS + 1) }).success).toBe(false);
  });

  /** Mutant: cut the film at the last word, and the tail the kit holds after it is lost. */
  it("cuts the film 0.8 s after the voice, at 25 fps, rounded up", () => {
    expect([ownFilmFrames(45), ownFilmFrames(2.41)]).toEqual([1145, 81]);
  });

  it("takes one to eight moments, anchors or seconds", () => {
    const base = { draft_id: `fdr_${"a".repeat(32)}`, revision: 1, voice_run_id: "run_v1" };
    expect(filmStillsInput.safeParse({ ...base, at: [] }).success).toBe(false);
    expect(filmStillsInput.safeParse({ ...base, at: Array.from({ length: 9 }, (_, i) => i) }).success).toBe(false);
    expect(filmStillsInput.parse({ ...base, at: ["hook", 2.5] })).toEqual({ ...base, at: ["hook", 2.5], sheet: false });
  });
});
