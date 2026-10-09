import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCutStyle } from "./faceless-cut-style.js";
import { parseStoryboardV2 } from "./faceless-storyboard-v2.js";
import { parseStoryboardV2Plan } from "./faceless-storyboard-v2-plan.js";
import { facelessCutScore, planStoryboardV2 } from "./faceless-storyboard-v2-timing.js";

const style = parseCutStyle(JSON.parse(readFileSync(new URL("./fixtures/cut-style-profile-v1.json", import.meta.url), "utf8")));

function fixture(reasons: Array<"action" | "place" | "reveal" | "emphasis"> = []) {
  const words = Array.from({ length: 160 }, (_, i) => ({ word: `word${i}`, startSec: i * 0.371, endSec: i * 0.371 + 0.3 }));
  const starts = [0, 9, ...Array.from({ length: 25 }, (_, i) => 15 + i * 6)].filter(x => x < words.length);
  const beats = starts.map((wordStart, i) => ({ id: `beat-${i}`, wordStart, wordEnd: starts[i + 1] ?? 160,
    reason: reasons[i] ?? "place", mediaType: i === 0 ? "video" : "image", phase: i < 10 ? "setup" : i < 20 ? "development" : "climax", visualPrompt: `Scene ${i}` }));
  const proposal = parseStoryboardV2({ version: "faceless_storyboard_61_v2", premise: "Timed original story", script: words.map(w => w.word).join(" "),
    provenance: { kind: "fixture" }, beats, captionPhrases: [{ wordStart: 0, wordEnd: 160, accentWord: 0 }] });
  return { words, proposal };
}

function tieFixture(localStarts: number[], localReasons: Array<"action" | "place">) {
  const words = Array.from({ length: 160 }, (_, i) => ({ word: `word${i}`, startSec: i * 0.38, endSec: i * 0.38 + 0.28 }));
  const starts = [0, 10, ...localStarts, ...Array.from({ length: 13 }, (_, i) => 30 + i * 10)];
  const beats = starts.map((wordStart, i) => ({ id: `beat-${i}`, wordStart, wordEnd: starts[i + 1] ?? 160,
    reason: i >= 2 && i < 2 + localReasons.length ? localReasons[i - 2]! : "place" as const,
    mediaType: i === 0 ? "video" as const : "image" as const,
    phase: wordStart >= 120 ? "climax" as const : "setup" as const, visualPrompt: `Scene ${i}` }));
  const proposal = parseStoryboardV2({ version: "faceless_storyboard_61_v2", premise: "Alternative paths",
    script: words.map(w => w.word).join(" "), provenance: { kind: "fixture" }, beats,
    captionPhrases: [{ wordStart: 0, wordEnd: 160, accentWord: 0 }] });
  const wideStyle = parseCutStyle({ ...style, pacing: { ...style.pacing,
    global_image_frames: { p25: 25, p50: 75, p75: 150, n: 1 }, by_phase: {} } });
  return { words, proposal, wideStyle };
}

it("prices a second above the pace band by the caller's penalty and a second below it by the base penalty", () => {
  const band = { p25: 43, p75: 75 }, pace = (frames: number, over?: number) => facelessCutScore(null, frames, band, over).pacePenalty;
  // 25 frames outside the band on either side is one second.
  expect([pace(100), pace(18), pace(60)]).toEqual([0.25, 0.25, 0]);
  expect([pace(100, 2), pace(18, 2), pace(60, 2)]).toEqual([2, 0.25, 0]);
});

describe("planStoryboardV2", () => {
  it("covers exactly 1522 frames with more than 19 distinct images on timed semantic cuts", () => {
    const { words, proposal } = fixture();
    const plan = planStoryboardV2(proposal, words, 38, style);
    expect(plan.outputFrames).toBe(1522);
    expect(plan.shots[0]).toMatchObject({ mediaType: "video", startFrame: 0, endFrame: 121, beatIds: ["beat-0"] });
    expect(plan.shots.at(-1)?.endFrame).toBe(1522);
    expect(plan.shots.every((shot, i) => i === 0 || shot.startFrame === plan.shots[i - 1]!.endFrame)).toBe(true);
    expect(plan.shots.filter(s => s.mediaType === "image").length).toBeGreaterThan(19);
    expect(plan.shots.every((s, i) => i === 0 ? s.endFrame - s.startFrame >= 50 && s.endFrame - s.startFrame <= 125 : s.endFrame - s.startFrame >= 25 && s.endFrame - s.startFrame <= 150)).toBe(true);
    expect(new Set(plan.shots.map(s => s.id)).size).toBe(plan.shots.length);
    expect(plan.shots.flatMap(s => s.beatIds)).toEqual(proposal.beats.map(b => b.id));
    expect(plan.shots.slice(1).every((s, i) => s.motion === (i % 2 === 0 ? "PAN_UP" : "PAN_DOWN"))).toBe(true);
    expect(plan.scoreBreakdown.total).toBeTypeOf("number");
    expect(planStoryboardV2(proposal, words, 38, style)).toEqual(plan);
  });

  it("skips weak emphasis when the fixed cut cost exceeds its value", () => {
    const { words, proposal } = fixture();
    proposal.beats[5]!.reason = "emphasis";
    const plan = planStoryboardV2(proposal, words, 38, style);
    expect(plan.rejectedCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ afterWord: proposal.beats[5]!.wordStart - 1, semanticValue: 1, cutCost: 2 })]));
    expect(plan.shots.flatMap(s => s.beatIds)).toContain("beat-5");
    expect(plan.shots.some(s => s.cutAfterWord === proposal.beats[5]!.wordStart - 1)).toBe(false);
  });

  it("selects one place cut over two action cuts when total scores tie", () => {
    const { words, proposal, wideStyle } = tieFixture([18, 20, 22], ["action", "place", "action"]);
    const plan = planStoryboardV2(proposal, words, 0, wideStyle);
    const selected = plan.shots.flatMap(s => s.cutAfterWord === undefined ? [] : [s.cutAfterWord]);
    expect(selected).toContain(19);
    expect(selected).not.toContain(17);
    expect(selected).not.toContain(21);
    expect(plan.rejectedCandidates.filter(c => [17, 21].includes(c.afterWord)).map(c => c.semanticValue)).toEqual([3, 3]);
  });

  it("selects the earlier candidate when score and cut count tie", () => {
    const { words, proposal, wideStyle } = tieFixture([18, 20], ["action", "action"]);
    const plan = planStoryboardV2(proposal, words, 0, wideStyle);
    const selected = plan.shots.flatMap(s => s.cutAfterWord === undefined ? [] : [s.cutAfterWord]);
    expect(selected).toContain(17);
    expect(selected).not.toContain(19);
  });

  it("uses observed phase pace, falls back to global pace, and reconciles scores", () => {
    const { words, proposal, wideStyle } = tieFixture([18, 20], ["action", "action"]);
    const pacedStyle = parseCutStyle({ ...wideStyle, pacing: { ...wideStyle.pacing,
      global_image_frames: { p25: 25, p50: 40, p75: 50, n: 1 },
      by_phase: { setup: { p25: 25, p50: 75, p75: 150, n: 1 },
        climax: { p25: null, p50: null, p75: null, n: 0 } } } });
    const plan = planStoryboardV2(proposal, words, 0, pacedStyle);
    const setup = plan.shots.find(s => s.mediaType === "image" && s.phase === "setup" && s.endFrame - s.startFrame === 95);
    const climax = plan.shots.find(s => s.mediaType === "image" && s.phase === "climax" && s.endFrame - s.startFrame === 95);
    expect(setup?.score.pacePenalty).toBe(0);
    expect(climax?.score.pacePenalty).toBeCloseTo(0.45);
    expect(plan.scoreBreakdown.total).toBeCloseTo(plan.shots.reduce((sum, s) => sum + s.score.net, 0));
    expect(plan.scoreBreakdown.pacePenalty).toBeCloseTo(plan.shots.reduce((sum, s) => sum + s.score.pacePenalty, 0));
  });

  it("records a justified PAN exception when measured motion favors holding direction", () => {
    const { words, proposal } = fixture();
    const holdStyle = parseCutStyle({ ...style, motion: { ...style.motion, pan_flip_probability: 0 } });
    const plan = planStoryboardV2(proposal, words, 38, holdStyle);
    expect(plan.shots[2]).toMatchObject({ motion: "PAN_UP", panExceptionReason: expect.stringMatching(/style profile/i) });
  });

  it("allows a late reveal to start a local cluster of short shots", () => {
    const { words, proposal } = fixture();
    const firstLate = proposal.beats.findIndex(b => b.wordStart === 123);
    proposal.beats[firstLate - 1]!.wordEnd = 120;
    proposal.beats.splice(firstLate, proposal.beats.length - firstLate,
      ...Array.from({ length: 14 }, (_, i) => {
        const wordStart = 120 + i * 3;
        return { id: `late-${i}`, wordStart, wordEnd: Math.min(160, wordStart + 3),
          reason: i === 0 ? "reveal" as const : "place" as const,
          mediaType: "image" as const, phase: "climax" as const, visualPrompt: `Late ${i}` };
      }).filter(b => b.wordStart < 160));
    const climaxRange = { p25: 25, p50: 30, p75: 35, n: 14 };
    const localStyle = parseCutStyle({ ...style, pacing: { ...style.pacing,
      by_phase: { climax: climaxRange } } });
    const plan = planStoryboardV2(proposal, words, 38, localStyle);
    const early = plan.shots.filter(s => s.mediaType === "image" && s.phase !== "climax");
    const late = plan.shots.filter(s => s.mediaType === "image" && s.phase === "climax");
    expect(late.some(s => s.endFrame - s.startFrame <= 40)).toBe(true);
    expect(early.some(s => s.endFrame - s.startFrame > 40)).toBe(true);
    expect(plan.shots.some(s => s.cutReason === "reveal")).toBe(true);
  });

  it("refuses an infeasible mandatory opener with a reason", () => {
    const { words, proposal } = fixture();
    proposal.beats[0]!.wordEnd = 14;
    proposal.beats[1]!.wordStart = 14;
    expect(() => planStoryboardV2(proposal, words, 38, style)).toThrow(/mandatory VIDEO boundary violates timing/);
  });

  it("keeps an early sentence boundary as a two-second video hook", () => {
    const { words, proposal } = fixture();
    const scale = 60.6 / words.at(-1)!.endSec;
    const timed = words.map(word => ({ ...word, startSec: word.startSec * scale, endSec: word.endSec * scale }));
    proposal.beats[0]!.wordEnd = 7;
    proposal.beats[1]!.wordStart = 7;
    const plan = planStoryboardV2(proposal, timed, 0, style);
    expect(plan.shots[0]).toMatchObject({ mediaType: "video", cutAfterWord: 6 });
    expect(plan.shots[0]!.endFrame).toBeGreaterThanOrEqual(50);
    expect(plan.shots[0]!.endFrame).toBeLessThan(75);
    expect(parseStoryboardV2Plan(plan, timed)).toEqual(plan);
  });

  it("refuses valid timing when no complete IMAGE path can reach the output", () => {
    const { words, proposal } = fixture();
    const starts = [0, 9, 40, 80, 120];
    proposal.beats.splice(0, proposal.beats.length, ...starts.map((wordStart, i) => ({
      id: `sparse-${i}`, wordStart, wordEnd: starts[i + 1] ?? 160,
      reason: "place" as const, mediaType: i === 0 ? "video" as const : "image" as const,
      phase: i === 0 ? "setup" as const : "development" as const, visualPrompt: `Sparse ${i}`,
    })));
    expect(() => planStoryboardV2(proposal, words, 38, style)).toThrow(/no feasible storyboard within VIDEO and IMAGE duration bounds/);
  });
});

it.each([-1, 51])('rejects frame %s with feasible timing', start => {
 const { words, proposal } = fixture();
 const scale = (1516 - start) / (words.at(-1)!.endSec * 25);
 const adjusted = words.map(w => ({ ...w, startSec: w.startSec * scale, endSec: w.endSec * scale }));
 proposal.beats[0]!.wordEnd = start === 51 ? 5 : 10;
 proposal.beats[1]!.wordStart = proposal.beats[0]!.wordEnd;
 expect(() => planStoryboardV2(proposal, adjusted, start, style)).toThrow(/invalid narration start frame/);
});
