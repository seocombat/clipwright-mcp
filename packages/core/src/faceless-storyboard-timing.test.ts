import { describe, expect, it } from "vitest";
import { parseStoryboardProposal } from "./faceless-storyboard.js";
import { planStoryboardFrames } from "./faceless-storyboard-timing.js";

function fixture(count = 18, duration = 60.4) {
  const starts = Array.from({ length: count }, (_, i) => i === 0 ? 0 : 4 + (i - 1) * (duration - 4) / (count - 1));
  const words = starts.map((startSec, i) => ({ word: `word${i}`, startSec, endSec: starts[i + 1] ?? duration }));
  const proposal = parseStoryboardProposal({
    version: "faceless_storyboard_61_v1", premise: "A timing fixture", provenance: { kind: "fixture" },
    script: words.map(w => w.word).join(" "),
    beats: words.map((_, i) => ({ id: `beat-${i}`, wordStart: i, wordEnd: i + 1, reason: "action", mediaType: i === 0 ? "video" : "image", visualPrompt: `Scene ${i}` })),
    captionPhrases: words.map((_, i) => ({ wordStart: i, wordEnd: i + 1, accentWord: i })),
  });
  return { proposal, words };
}

describe("planStoryboardFrames", () => {
  it("covers 1522 frames with semantic boundaries, distinct images and alternating pans", () => {
    const { proposal, words } = fixture();
    const plan = planStoryboardFrames(proposal, words, 0);
    expect(plan.shots[0]).toMatchObject({ mediaType: "video", startFrame: 0, endFrame: 100, beatIds: ["beat-0"] });
    expect(plan.shots.at(-1)?.endFrame).toBe(1522);
    const images = plan.shots.filter(s => s.mediaType === "image");
    expect(images).toHaveLength(17);
    expect(new Set(images.map(s => s.id)).size).toBe(17);
    expect(plan.imageBudget).toEqual({ allowance: 24, remaining: 2 });
    expect(plan.captionPhrases).toEqual(proposal.captionPhrases);
    expect(plan.script).toBe(proposal.script);
    for (const [i, shot] of images.entries()) {
      expect(shot.startFrame).toBe(plan.shots[i]!.endFrame);
      expect(shot.endFrame - shot.startFrame).toBeGreaterThanOrEqual(25);
      expect(shot.endFrame - shot.startFrame).toBeLessThanOrEqual(150);
      expect(shot.motion).toBe(i % 2 === 0 ? "PAN_UP" : "PAN_DOWN");
    }
    for (const shot of plan.shots.slice(0, -1)) {
      expect(shot.cutAfterWord).toBeDefined();
      expect(Math.abs(shot.endFrame - words[shot.cutAfterWord!]!.endSec * 25)).toBeLessThanOrEqual(1);
      expect(shot.cutReason).toBe("action");
    }
    expect(plan.rejectedCandidates).toEqual([]);
    expect(planStoryboardFrames(proposal, words, 0)).toEqual(plan);
  });

  it.each([[0.02, 100], [0.5, 94], [0.04, 100]])("places a %s second opening pause at rounded midpoint %s", (gap, expected) => {
    const { proposal, words } = fixture();
    words[0]!.endSec = 4 - gap;
    expect(planStoryboardFrames(proposal, words, 0).shots[0]!.endFrame).toBe(expected);
  });

  it("adds the explicit narration offset after absolute-time rounding", () => {
    const { proposal, words } = fixture(18, 58.9);
    words[0]!.endSec = 2.5;
    words[1]!.startSec = 2.5;
    const plan = planStoryboardFrames(proposal, words, 38);
    expect(plan.narrationStartFrame).toBe(38);
    expect(plan.shots[0]!.endFrame).toBe(101);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])("rejects malformed narration offset %s", offset => {
    const { proposal, words } = fixture();
    expect(() => planStoryboardFrames(proposal, words, offset)).toThrow(/narration/);
  });

  it("rejects speech overrun and excessive tail", () => {
    const { proposal, words } = fixture();
    expect(() => planStoryboardFrames(proposal, words, 38)).toThrow(/narration/);
    words.at(-1)!.endSec = 60.37;
    expect(() => planStoryboardFrames(proposal, words, 0)).toThrow(/tail/);
  });

  it("rejects a proposed boundary inside another timed word", () => {
    const { proposal, words } = fixture();
    words[0]!.endSec = 5;
    expect(() => planStoryboardFrames(proposal, words, 0)).toThrow(/timing/);
  });

  it("rejects infeasible durations without merging the mandatory VIDEO boundary", () => {
    const { proposal, words } = fixture();
    words[0]!.endSec = 2;
    words[1]!.startSec = 2;
    expect(() => planStoryboardFrames(proposal, words, 0)).toThrow(/feasible/);
    const sparse = fixture(8);
    expect(() => planStoryboardFrames(sparse.proposal, sparse.words, 0)).toThrow(/feasible/);
  });

  it("drops emphasis before place or reveal when the 19-image cap binds", () => {
    const { proposal, words } = fixture(22);
    proposal.beats.forEach((b, i) => { b.reason = i === 5 || i === 10 ? "emphasis" : i % 2 ? "place" : "reveal"; });
    const plan = planStoryboardFrames(proposal, words, 0);
    expect(plan.shots.filter(s => s.mediaType === "image")).toHaveLength(19);
    expect(plan.imageBudget.remaining).toBe(0);
    expect(plan.rejectedCandidates.map(c => c.afterWord)).toEqual([4, 9]);
    expect(plan.rejectedCandidates.every(c => c.reason.length > 0)).toBe(true);
    expect(plan.shots.flatMap(s => s.beatIds)).toEqual(proposal.beats.map(b => b.id));
  });
});
