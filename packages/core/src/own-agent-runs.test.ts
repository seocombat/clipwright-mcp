import { describe, expect, it } from "vitest";
import { filmStillsInput, filmVoiceInput, OWN_VOICE_MAX_CHARS, ownFilmFrames, ownFilmSeconds, ownVoiceCeilingSeconds, takeCheckInput } from "./own-agent-runs.js";
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

describe("check_take against a picture (faceless DIY F2)", () => {
  const direction = { start: "The fox sits by the lamp.", changes: [{ at_s: 1.2, cause: "the lamp flickers", result: "the fox turns its head" }],
    end: "The fox looks at the lens.", locks: ["one fox"] };
  const picture = { run_id: "run_take1", against: "picture", direction, look: { words: "painted folk horror", palette: ["#0d1418", "#2b414a", "#c9862e"] } };
  const issues = (body: Record<string, unknown>) => (takeCheckInput.safeParse(body).error?.issues ?? []).map(i => `${i.path.join(".")}: ${i.message}`);

  // Mutants: the object direction accepted in motion mode, the text one in picture mode, an ad-only field let through, look made optional.
  it("refuses each mode's fields in the other mode and reads the picture direction with its defaults", () => {
    expect(takeCheckInput.parse(picture).direction).toEqual({ ...direction, camera: "as made" });
    expect(takeCheckInput.parse({ ...picture, picture: { upload_id: `upl_${"a".repeat(32)}` } }).picture).toEqual({ upload_id: `upl_${"a".repeat(32)}` });
    expect(issues({ ...picture, direction: "A fox turns." })).toEqual(["direction: with against picture, direction is an object of start, changes, " +
      "camera, end and locks"]);
    const { look: _l, ...noLook } = picture;
    expect(issues(noLook)).toEqual(["look: with against picture, name the look"]);
    for (const [key, value] of [["product_image", "https://example.com/a.png"], ["moves", [1]], ["format", "product"]] as const)
      expect(issues({ ...picture, [key]: value }), key).toEqual([`${key}: ${key} goes with a motion check, not against picture`]);
    expect(issues({ ...picture, ad_id: `ad_${"a".repeat(32)}`, slot: "hook" })).toEqual(["ad_id: ad_id goes with a motion check, not against picture",
      "slot: slot goes with a motion check, not against picture"]);
    expect(issues({ run_id: "run_take1", direction })).toEqual(["direction: direction is the shot's prompt as text; the object form goes with against picture"]);
    expect(issues({ run_id: "run_take1", direction: "A fox turns.", look: picture.look, picture: { run_id: "run_img" } }))
      .toEqual(["look: look goes with against picture", "picture: picture goes with against picture"]);
    expect(takeCheckInput.safeParse({ run_id: "run_take1", direction: "A fox turns.", against: "motion" }).success).toBe(true);
    expect(takeCheckInput.safeParse({ ...picture, direction: { ...direction, changes: [] } }).success).toBe(false);
    expect(takeCheckInput.safeParse({ ...picture, look: { words: "x", palette: ["#000000", "#ffffff"] } }).success).toBe(false);
  });
});
