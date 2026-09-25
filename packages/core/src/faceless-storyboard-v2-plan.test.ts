import { describe, expect, it } from "vitest";
import { parseStoryboardV2Plan } from "./faceless-storyboard-v2-plan.js";

function fixture() {
  const bounds = [0, 100, ...Array.from({ length: 21 }, (_, i) => 100 + Math.round((i + 1) * 1422 / 21))];
  const words = Array.from({ length: 22 }, (_, i) => ({ word: `word${i}`, startSec: bounds[i]! / 25,
    endSec: bounds[i + 1]! / 25 }));
  const shots = words.map((_, i) => ({ id: `scene-${i}`, mediaType: i ? "image" : "video",
    startFrame: bounds[i]!, endFrame: bounds[i + 1]!, beatIds: [`scene-${i}`],
    phase: i < 10 ? "setup" : "development", ...(i ? { motion: i % 2 ? "PAN_UP" : "PAN_DOWN" } : {}),
    ...(i < 21 ? { cutAfterWord: i, cutReason: "action" } : {}),
    score: { semanticValue: i < 21 ? 3 : 0, cutCost: i < 21 ? 2 : 0,
      pacePenalty: 0, net: i < 21 ? 1 : 0 } }));
  const plan = { version: "faceless_storyboard_61_v2", outputFrames: 1522, script: words.map(w => w.word).join(" "),
    narrationStartFrame: 0, captionPhrases: words.map((_, i) => ({ wordStart: i, wordEnd: i + 1, accentWord: i })),
    shots, rejectedCandidates: [], scoreBreakdown: { semanticValue: 63, cutCost: 42, pacePenalty: 0, total: 21, cuts: 21 } };
  return { plan, words };
}

function feasibleNarrationStartFixture(start: number) {
  const bounds = [0, 125, ...Array.from({ length: 21 }, (_, i) => 125 + Math.round((i + 1) * 1397 / 21))];
  const words = Array.from({ length: 22 }, (_, i) => ({
    word: `word${i}`,
    startSec: i === 0 ? 0 : (bounds[i]! - start) / 25,
    endSec: (bounds[i + 1]! - start) / 25,
  }));
  const { plan } = fixture();
  plan.narrationStartFrame = start;
  plan.shots.forEach((shot, i) => {
    shot.startFrame = bounds[i]!;
    shot.endFrame = bounds[i + 1]!;
  });
  return { plan, words };
}

describe("parseStoryboardV2Plan", () => {
  it("accepts a feasible narration start at the last permitted frame 50", () => {
    const { plan, words } = feasibleNarrationStartFixture(50);
    expect(parseStoryboardV2Plan(plan, words).narrationStartFrame).toBe(50);
  });

  it.each([51, -1])("rejects feasible cuts with narration starting at frame %i", start => {
    const { plan, words } = feasibleNarrationStartFixture(start);
    expect(() => parseStoryboardV2Plan(plan, words)).toThrow(/frame plan/);
  });

  it("accepts 21 distinct IMAGE shots without a v1 image budget", () => {
    const { plan, words } = fixture();
    expect(parseStoryboardV2Plan(plan, words).shots.filter(s => s.mediaType === "image")).toHaveLength(21);
  });
  it.each(["duplicate", "gap", "wrong end", "unknown field", "mid-word", "caption gap", "repeated beat", "array motion", "array phase", "array cut reason"])("rejects %s", kind => {
    const { plan, words } = fixture();
    if (kind === "duplicate") plan.shots[2]!.id = plan.shots[1]!.id;
    if (kind === "gap") plan.shots[2]!.startFrame++;
    if (kind === "wrong end") plan.shots.at(-1)!.endFrame--;
    if (kind === "unknown field") Object.assign(plan.shots[2]!, { unknown: true });
    if (kind === "mid-word") words[1]!.endSec += 1;
    if (kind === "caption gap") plan.captionPhrases.splice(1, 1);
    if (kind === "repeated beat") plan.shots[2]!.beatIds = plan.shots[1]!.beatIds;
    if (kind === "array motion") Object.assign(plan.shots[2]!, { motion: ["PAN_UP"] });
    if (kind === "array phase") Object.assign(plan.shots[2]!, { phase: ["setup"] });
    if (kind === "array cut reason") Object.assign(plan.shots[2]!, { cutReason: ["action"] });
    expect(() => parseStoryboardV2Plan(plan, words)).toThrow(kind === "duplicate" ? /duplicate/i : undefined);
  });
});
