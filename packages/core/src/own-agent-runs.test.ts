import { describe, expect, it } from "vitest";
import { filmStillsInput, filmVoiceInput, OWN_VOICE_MAX_CHARS, ownFilmFrames, ownFilmSeconds, ownVoiceCeilingSeconds } from "./own-agent-runs.js";
import { OWN_VOICE_MAX_SECONDS } from "./own-agent-price.js";

// #1337: what an own-agent run holds before it is made: a take at the slowest pace, a film at its voice plus the tail, at most 24 stills.

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

  /** #1376, Codex r2. Mutant: the voice plus the tail without the frames, 3.21 s where the film runs 81 frames, 3.24 s. */
  it("names the film's length as its frames run: 2.41 s of voice is 3.24 s of film", () => {
    expect([ownFilmSeconds(2.41), ownFilmSeconds(39.6), ownFilmSeconds(45)]).toEqual([3.24, 40.4, 45.8]);
  });

  /** #1356 C4, C5. Mutants: keep the old bound of eight, let a 25th moment through, or require `at` when the storyboard can name the moments. */
  it("takes one to 24 moments, anchors or seconds, or none for the storyboard's events", () => {
    const base = { draft_id: `fdr_${"a".repeat(32)}`, revision: 1, voice_run_id: "run_v1" };
    expect(filmStillsInput.safeParse({ ...base, at: [] }).success).toBe(false);
    expect(filmStillsInput.safeParse({ ...base, at: Array.from({ length: 24 }, (_, i) => i) }).success).toBe(true);
    expect(filmStillsInput.safeParse({ ...base, at: Array.from({ length: 25 }, (_, i) => i) }).success).toBe(false);
    expect(filmStillsInput.parse({ ...base, at: ["hook", 2.5] })).toEqual({ ...base, at: ["hook", 2.5], sheet: false });
    expect(filmStillsInput.parse(base)).toEqual({ ...base, sheet: false });
  });
});
