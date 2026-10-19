import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FACELESS_EDIT_RULES, SHOT_SOURCES, editRules, facelessShotActions } from "./edit-rules.js";
import { parseCutStyle } from "./faceless-cut-style.js";
import { FACELESS_IMAGE_MAX_FRAMES, FACELESS_IMAGE_MIN_FRAMES, FACELESS_OPENER_MAX_FRAMES, FACELESS_OPENER_MIN_FRAMES,
  planPublicFacelessStory, type FacelessPublicStory } from "./faceless-public-plan.js";

describe("the faceless edit rules", () => {
  it("FACELESS_EDIT_RULES parses with editRules and carries the planner's four constants; facelessShotActions returns the three rows of its table and `[]` for an unknown source", () => {
    expect(editRules.parse(FACELESS_EDIT_RULES)).toEqual(FACELESS_EDIT_RULES);
    expect([FACELESS_IMAGE_MIN_FRAMES, FACELESS_IMAGE_MAX_FRAMES, FACELESS_OPENER_MIN_FRAMES, FACELESS_OPENER_MAX_FRAMES]).toEqual([25, 150, 75, 125]);
    expect(FACELESS_EDIT_RULES.kinds).toEqual({
      picture: { min_frames: FACELESS_IMAGE_MIN_FRAMES, max_frames: FACELESS_IMAGE_MAX_FRAMES, movable: true, resizable: true },
      clip: { min_frames: FACELESS_OPENER_MIN_FRAMES, max_frames: FACELESS_OPENER_MAX_FRAMES, movable: false, resizable: true },
    });
    expect(editRules.safeParse({ ...FACELESS_EDIT_RULES, kinds: {} }).success).toBe(true);
    expect(editRules.safeParse({ ...FACELESS_EDIT_RULES, kinds: { sticker: FACELESS_EDIT_RULES.kinds.picture } }).success).toBe(false);
    expect(editRules.safeParse({ ...FACELESS_EDIT_RULES, max_cuts_per_minute: 20 }).success).toBe(false);

    // The opener's row holds for any source; a picture's row follows where its image came from.
    for (const source of SHOT_SOURCES) expect(facelessShotActions({ index: 0, source })).toEqual(["retake", "animate", "new_picture", "retime"]);
    expect(facelessShotActions({ index: 1, source: "generated" })).toEqual(["retake", "new_picture", "upload", "retime", "delete"]);
    expect(facelessShotActions({ index: 16, source: "customer" })).toEqual(["upload", "retime", "delete"]);
    for (const source of ["candidate", "upload", "unknown"] as const) expect(facelessShotActions({ index: 1, source })).toEqual([]);
  });

  it("rules without cover_min_frames parse as null, so a view from a server that predates the field still opens", () => {
    const { cover_min_frames: _absent, ...older } = FACELESS_EDIT_RULES;
    expect(editRules.parse(older)).toEqual({ ...FACELESS_EDIT_RULES, cover_min_frames: null });
    expect(editRules.parse({ ...older, cover_min_frames: 25 }).cover_min_frames).toBe(25);
    expect(editRules.safeParse({ ...older, cover_min_frames: 0 }).success).toBe(false);
  });

  it("the planner holds a picture to the two image constants: after an 80-frame opener and four 140-frame pictures, a last picture of 25 or 150 frames plans and one of 24 or 151 does not", () => {
    const style = parseCutStyle(JSON.parse(readFileSync(new URL("./fixtures/cut-style-profile-v1.json", import.meta.url), "utf8")));
    // Gapless speech in 20-frame words. A 140-frame picture cannot take the last beat in: 164 frames is over the ceiling too.
    const planned = (lastWords: number[]) => {
      const beats = [Array<number>(4).fill(20), ...Array.from({ length: 4 }, () => Array<number>(7).fill(20)), lastWords];
      const lengths = beats.flat(), ends = lengths.map((_, i) => lengths.slice(0, i + 1).reduce((sum, frames) => sum + frames, 0));
      const words = lengths.map((frames, i) => ({ word: `word${i}`, startSec: (ends[i]! - frames) / 25, endSec: ends[i]! / 25 }));
      const starts = beats.map((_, i) => beats.slice(0, i).flat().length);
      const story: FacelessPublicStory = { script: words.map(word => word.word).join(" "), narrationStartFrame: 0,
        beats: beats.map((beat, i) => ({ id: `beat-${i}`, wordStart: starts[i]!, wordEnd: starts[i]! + beat.length,
          mediaType: i ? "image" as const : "video" as const, reason: "place", phase: "setup", visualPrompt: `Scene ${i}` })) };
      return planPublicFacelessStory(story, words, style, ends.at(-1)!).shots.map(shot => shot.endFrame - shot.startFrame);
    };
    expect(planned([12, 13])).toEqual([80, 140, 140, 140, 140, FACELESS_IMAGE_MIN_FRAMES]);
    expect(planned([25, 25, 25, 25, 25, 25])).toEqual([80, 140, 140, 140, 140, FACELESS_IMAGE_MAX_FRAMES]);
    expect(() => planned([12, 12])).toThrow("no feasible public storyboard within IMAGE duration bounds");
    expect(() => planned([25, 25, 25, 25, 25, 26])).toThrow("no feasible public storyboard within IMAGE duration bounds");
  });
});
