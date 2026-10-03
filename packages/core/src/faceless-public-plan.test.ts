import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCutStyle } from "./faceless-cut-style.js";
import { FACELESS_OPENER_BOUNDS_ERROR, FACELESS_OPENER_MAX_FRAMES, FACELESS_OPENER_MIN_FRAMES, facelessSpeechLexicalWords, facelessSpeechWordSpans,
  parseFacelessPublicStory, planPublicFacelessStory, type FacelessPublicStory } from "./faceless-public-plan.js";
import * as publicCore from "./index.js";

const style = parseCutStyle(JSON.parse(readFileSync(new URL("./fixtures/cut-style-profile-v1.json", import.meta.url), "utf8")));

export function publicFixture(outputFrames = 750) {
  const count = outputFrames / 10;
  const words = Array.from({ length: count }, (_, i) => ({ word: `word${i}`, startSec: i * .4, endSec: i * .4 + .36 }));
  const starts = [0, 8, ...Array.from({ length: Math.ceil(count / 5) }, (_, i) => 13 + i * 5).filter(i => i < count)];
  const story: FacelessPublicStory = { script: words.map(w => w.word).join(" "), narrationStartFrame: 0,
    beats: starts.map((wordStart, i) => ({ id: `beat-${i}`, wordStart, wordEnd: starts[i + 1] ?? count,
      mediaType: i === 0 ? "video" : "image", reason: "place", phase: "setup", visualPrompt: `Scene ${i}` })),
  };
  return { story, words };
}

/** Gapless speech at a fixed pace: beat sizes in words, so each boundary sits at a known frame. */
function paced(beatWords: number[], framesPerWord: number, intro = 0) {
  const count = beatWords.reduce((sum, size) => sum + size, 0);
  const words = Array.from({ length: count }, (_, i) => ({ word: `word${i}`, startSec: i * framesPerWord / 25, endSec: (i + 1) * framesPerWord / 25 }));
  const starts = beatWords.map((_, i) => beatWords.slice(0, i).reduce((sum, size) => sum + size, 0));
  const story: FacelessPublicStory = { script: words.map(w => w.word).join(" "), narrationStartFrame: intro,
    beats: beatWords.map((size, i) => ({ id: `beat-${i}`, wordStart: starts[i]!, wordEnd: starts[i]! + size,
      mediaType: i === 0 ? "video" : "image", reason: "place", phase: "setup", visualPrompt: `Scene ${i}` })) };
  return { story, words, outputFrames: intro + Math.ceil(count * framesPerWord) };
}

/** Gapless speech from each beat's word lengths in frames, for boundaries and word gaps at chosen frames. */
function timed(beatWordFrames: number[][]) {
  const lengths = beatWordFrames.flat(), ends = lengths.map((_, i) => lengths.slice(0, i + 1).reduce((sum, frames) => sum + frames, 0));
  const words = lengths.map((frames, i) => ({ word: `word${i}`, startSec: (ends[i]! - frames) / 25, endSec: ends[i]! / 25 }));
  const starts = beatWordFrames.map((_, i) => beatWordFrames.slice(0, i).flat().length);
  const story: FacelessPublicStory = { script: words.map(w => w.word).join(" "), narrationStartFrame: 0,
    beats: beatWordFrames.map((beat, i) => ({ id: `beat-${i}`, wordStart: starts[i]!, wordEnd: starts[i]! + beat.length,
      mediaType: i === 0 ? "video" : "image", reason: "place", phase: "setup", visualPrompt: `Scene ${i}` })) };
  return { story, words, outputFrames: ends.at(-1)! };
}

describe("public faceless speech planner", () => {
  it("maps lexical words onto whitespace-free subtitle offsets", () => {
    expect(facelessSpeechWordSpans("Hello—Mira. Home")).toEqual([
      { word: "Hello—", start: 0, end: 6 },
      { word: "Mira.", start: 6, end: 11 },
      { word: "Home", start: 11, end: 15 },
    ]);
    expect(facelessSpeechLexicalWords("Hello—Mira. Home")).toEqual(["hello", "mira", "home"]);
  });
  it("rejects malformed semantic beats before speech is bought", () => {
    const { story } = publicFixture();
    expect(parseFacelessPublicStory(story, story.script)).toEqual(story);
    for (const edit of [
      (s: FacelessPublicStory) => { s.beats[0]!.mediaType = "image"; },
      (s: FacelessPublicStory) => { s.beats[1]!.wordStart++; },
      (s: FacelessPublicStory) => { s.beats[1]!.id = s.beats[0]!.id; },
      (s: FacelessPublicStory) => { s.beats[1]!.phase = "climax"; s.beats[2]!.phase = "setup"; },
      (s: FacelessPublicStory) => { s.beats.at(-1)!.wordEnd--; },
    ]) {
      const invalid = structuredClone(story); edit(invalid);
      expect(() => parseFacelessPublicStory(invalid, story.script)).toThrow();
    }
    expect(() => parseFacelessPublicStory({ ...story, script: `${story.script} changed` }, story.script)).toThrow();
    expect(() => parseFacelessPublicStory({ ...story, script: ` ${story.script}` }, story.script)).toThrow();
  });
  it("counts spoken words inside punctuation when validating beat coverage", () => {
    expect(parseFacelessPublicStory({ script: "Hello—Mira", narrationStartFrame: 0, beats: [
      { id: "hook", wordStart: 0, wordEnd: 1, mediaType: "video", phase: "setup", reason: "place", visualPrompt: "A city" },
      { id: "next", wordStart: 1, wordEnd: 2, mediaType: "image", phase: "development", reason: "action", visualPrompt: "Mira turns" },
    ] }).beats).toHaveLength(2);
  });
  it("exports the planner from the core package", () => {
    expect(publicCore).toHaveProperty("planPublicFacelessStory", planPublicFacelessStory);
    expect(publicCore).toMatchObject({ FACELESS_OPENER_MIN_FRAMES: 75, FACELESS_OPENER_MAX_FRAMES: 125,
      FACELESS_OPENER_BOUNDS_ERROR: "mandatory opening VIDEO requires 75–125 frames" });
  });
  it.each([
    [74, [14, 27, 27, 27, 27, 28], 4, false], [75, [15, 27, 27, 27, 27, 27], 0, true],
    [125, [25, 25, 25, 25, 25, 25], 0, true], [126, [25, 25, 25, 25, 25, 25], 1, false],
  ])("bounds the opener at 75–125 frames: a first boundary at frame %i", (frame, beatWords, intro, accepted) => {
    const { story, words, outputFrames } = paced(beatWords, 5, intro);
    if (accepted) expect(planPublicFacelessStory(story, words, style, outputFrames).shots[0]).toMatchObject({ endFrame: frame, beatIds: ["beat-0"] });
    else expect(() => planPublicFacelessStory(story, words, style, outputFrames)).toThrow(FACELESS_OPENER_BOUNDS_ERROR);
  });
  it("lets the opener absorb a short first beat up to the first boundary inside its bounds", () => {
    const { story, words, outputFrames } = paced([4, 3, 10, 10, 10, 10, 10, 10], 10.8);
    const plan = planPublicFacelessStory(story, words, style, outputFrames);
    expect(plan.narrationStartFrame).toBe(0);
    expect(plan.shots[0]).toMatchObject({ id: "beat-0", mediaType: "video", startFrame: 0, endFrame: 76, cutAfterWord: 6,
      beatIds: ["beat-0", "beat-1"], visualPrompts: ["Scene 0"] });
    expect(plan.shots[1]).toMatchObject({ id: "beat-2", mediaType: "image", startFrame: 76, visualPrompts: ["Scene 2"] });
    expect(plan.shots.flatMap(s => s.beatIds)).toEqual(story.beats.map(b => b.id));
  });
  it("never lets the opener absorb a kept beat or any beat after it", () => {
    const { story, words, outputFrames } = paced([4, 3, 10, 10, 10, 10, 10, 10], 10.8);
    expect(() => planPublicFacelessStory(story, words, style, outputFrames, { keepBeats: new Set([1]) })).toThrow(FACELESS_OPENER_BOUNDS_ERROR);
    // Beat 2 kept still lets the opener absorb beat 1; the first beat itself is never a kept beat.
    for (const keepBeats of [new Set([2]), new Set([0])]) {
      expect(planPublicFacelessStory(story, words, style, outputFrames, { keepBeats }).shots[0]).toMatchObject({ endFrame: 76, beatIds: ["beat-0", "beat-1"] });
    }
    const late = paced([4, 3, 10, 10, 10, 10, 10, 10], 10.8, 32);
    const plan = planPublicFacelessStory(late.story, late.words, style, late.outputFrames, { keepBeats: new Set([1]) });
    expect(plan.shots[0]).toMatchObject({ endFrame: 75, beatIds: ["beat-0"], cutAfterWord: 3 });
    expect(plan.shots[1]).toMatchObject({ mediaType: "image", startFrame: 75 });
    expect(plan.shots[1]!.beatIds[0]).toBe("beat-1");
  });
  it("ends the opener at the first boundary when an 8-word first beat already fits", () => {
    const { story, words, outputFrames } = paced([8, 10, 10, 10, 10, 10, 9], 10.8);
    expect(planPublicFacelessStory(story, words, style, outputFrames).shots[0]).toMatchObject({ endFrame: 86, cutAfterWord: 7,
      beatIds: ["beat-0"], visualPrompts: ["Scene 0"] });
  });
  it("refuses a plan with no beat boundary inside the opener bounds", () => {
    const { story, words, outputFrames } = paced([4, 10, 10, 10, 10, 10, 10, 3], 10.8);
    expect(() => planPublicFacelessStory(story, words, style, outputFrames)).toThrow(FACELESS_OPENER_BOUNDS_ERROR);
  });
  describe("word-gap opener (clipwright#449)", () => {
    const filler = Array.from({ length: 6 }, () => [20, 20, 20, 20, 20]);
    it("stays off by default and, when asked, ends the opener at the first in-bounds word gap inside beat 1", () => {
      // The first boundary sits at frame 68 and the next at 170; beat 1's gaps fall at 85, 102, 119, 136 and 153.
      const { story, words, outputFrames } = paced([4, 6, 6, 6, 6, 6, 6], 17);
      expect(() => planPublicFacelessStory(story, words, style, outputFrames)).toThrow(FACELESS_OPENER_BOUNDS_ERROR);
      const plan = planPublicFacelessStory(story, words, style, outputFrames, { openerWordGap: true });
      expect(plan.shots[0]).toMatchObject({ id: "beat-0", mediaType: "video", startFrame: 0, endFrame: 85, cutAfterWord: 4,
        beatIds: ["beat-0"], visualPrompts: ["Scene 0"] });
      expect(plan.shots[1]).toMatchObject({ id: "beat-1", mediaType: "image", startFrame: 85, endFrame: 170, cutAfterWord: 9,
        beatIds: ["beat-1"], visualPrompts: ["Scene 1"] });
      expect(plan.shots.flatMap(s => s.beatIds)).toEqual(story.beats.map(b => b.id));
      // A kept beat 1 changes nothing: the opener absorbs no beat, it only runs a word into the next one.
      expect(planPublicFacelessStory(story, words, style, outputFrames, { openerWordGap: true, keepBeats: new Set([1]) })).toEqual(plan);
    });
    it("changes no plan that a beat boundary already gives", () => {
      for (const { story, words, outputFrames } of [paced([4, 3, 10, 10, 10, 10, 10, 10], 10.8), paced([8, 10, 10, 10, 10, 10, 9], 10.8),
        { ...publicFixture(), outputFrames: 750 }]) {
        expect(planPublicFacelessStory(story, words, style, outputFrames, { openerWordGap: true }))
          .toEqual(planPublicFacelessStory(story, words, style, outputFrames));
      }
    });
    it("cuts inside a kept beat 1 the opener may not absorb, leaving it an IMAGE shot at the 25-frame minimum", () => {
      // Boundaries at 38 and 100; keeping beat 1 forbids the cut at 100, and its gaps fall at 50, 63, 75 and 88.
      const { story, words, outputFrames } = paced([3, 5, 8, 8, 8, 8, 8, 8], 12.5);
      const keepBeats = new Set([1]);
      expect(planPublicFacelessStory(story, words, style, outputFrames).shots[0]).toMatchObject({ endFrame: 100, beatIds: ["beat-0", "beat-1"] });
      expect(() => planPublicFacelessStory(story, words, style, outputFrames, { keepBeats })).toThrow(FACELESS_OPENER_BOUNDS_ERROR);
      const plan = planPublicFacelessStory(story, words, style, outputFrames, { keepBeats, openerWordGap: true });
      expect(plan.shots[0]).toMatchObject({ endFrame: 75, cutAfterWord: 5, beatIds: ["beat-0"], visualPrompts: ["Scene 0"] });
      expect(plan.shots[1]).toMatchObject({ id: "beat-1", mediaType: "image", startFrame: 75, endFrame: 100, beatIds: ["beat-1"] });
    });
    it.each([
      { name: "beat 1 is one word", beats: [[15, 15, 15, 15], [80], ...filler] },
      { name: "beat 1's only gap lies past frame 125", beats: [[15, 15, 15, 15], [70, 20], ...filler] },
      { name: "the first in-bounds gap leaves beat 1 under 25 frames", beats: [[15, 15, 15, 15], [50, 20], ...filler] },
      { name: "every gap of beat 1 lies before frame 75", beats: [[15, 15, 15], [10, 10, 9], [51, 20, 20], ...filler] },
    ])("still refuses with the opener error when $name", ({ beats }) => {
      const { story, words, outputFrames } = timed(beats);
      expect(() => planPublicFacelessStory(story, words, style, outputFrames, { openerWordGap: true })).toThrow(FACELESS_OPENER_BOUNDS_ERROR);
    });
    it("keeps the IMAGE duration bounds: a word-gap opener before an overlong beat is still infeasible", () => {
      const { story, words, outputFrames } = timed([[15, 15, 15, 15], [20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20], ...filler]);
      expect(() => planPublicFacelessStory(story, words, style, outputFrames, { openerWordGap: true }))
        .toThrow("no feasible public storyboard within IMAGE duration bounds");
    });
  });
  it.each([750, 2250])("plans %i frames without the Phase B word-count restriction", frames => {
    const { story, words } = publicFixture(frames);
    const plan = planPublicFacelessStory(story, words, style, frames);
    expect(plan.shots[0]).toMatchObject({ mediaType: "video", startFrame: 0, endFrame: 80 });
    expect(plan.shots.at(-1)?.endFrame).toBe(frames);
    expect(plan.shots.flatMap(s => s.beatIds)).toEqual(story.beats.map(b => b.id));
    expect(new Set(plan.shots.map(s => s.id)).size).toBe(plan.shots.length);
    for (const [i, shot] of plan.shots.entries()) {
      expect(shot.startFrame).toBe(i ? plan.shots[i - 1]!.endFrame : 0);
      expect(shot.endFrame - shot.startFrame).toBeGreaterThanOrEqual(i ? 25 : FACELESS_OPENER_MIN_FRAMES);
      expect(shot.endFrame - shot.startFrame).toBeLessThanOrEqual(i ? 150 : FACELESS_OPENER_MAX_FRAMES);
      if (shot.cutAfterWord !== undefined) {
        const word = words[shot.cutAfterWord]!;
        const next = words[shot.cutAfterWord + 1]!;
        expect(shot.endFrame).toBe(Math.round((word.endSec + next.startSec) / 2 * 25));
      }
    }
    expect(planPublicFacelessStory(story, words, style, frames)).toEqual(plan);
  });
  it("derives variable image counts and drops weak semantic cuts", () => {
    const short = publicFixture(); const long = publicFixture(2250);
    const a = planPublicFacelessStory(short.story, short.words, style, 750);
    expect(planPublicFacelessStory(long.story, long.words, style, 2250).shots.length).toBeGreaterThan(a.shots.length);
    short.story.beats[3]!.reason = "emphasis";
    expect(planPublicFacelessStory(short.story, short.words, style, 750).shots.some(s => s.cutAfterWord === short.story.beats[3]!.wordStart - 1)).toBe(false);
  });
  it("refuses missing, mismatched, overlapping or overlong speech and long silence", () => {
    const { story, words } = publicFixture();
    for (const broken of [[], words.slice(1), [{ ...words[0]!, word: "wrong" }, ...words.slice(1)],
      [{ ...words[0]!, endSec: 1 }, ...words.slice(1)], words.map(w => ({ ...w, startSec: w.startSec + 1, endSec: w.endSec + 1 })),
      words.map(w => ({ ...w, startSec: w.startSec / 2, endSec: w.endSec / 2 }))]) {
      expect(() => planPublicFacelessStory(story, broken, style, 750)).toThrow();
    }
  });
  it("requires valid output bounds, complete ordered beats and a feasible mandatory opener", () => {
    const { story, words } = publicFixture();
    for (const frames of [624, 2251, 750.5, NaN]) expect(() => planPublicFacelessStory(story, words, style, frames)).toThrow();
    for (const edit of [(s: FacelessPublicStory) => { s.beats[0]!.mediaType = "image"; },
      (s: FacelessPublicStory) => { s.beats[1]!.id = s.beats[0]!.id; },
      (s: FacelessPublicStory) => { s.beats[2]!.wordStart++; },
      (s: FacelessPublicStory) => { s.beats[0]!.wordEnd = 1; s.beats[1]!.wordStart = 1; }]) {
      const copy = structuredClone(story); edit(copy);
      expect(() => planPublicFacelessStory(copy, words, style, 750)).toThrow();
    }
  });
});

it("accepts public story intro hints through 125 frames and rejects 126", () => {
  const { story } = publicFixture();
  expect(parseFacelessPublicStory({ ...story, narrationStartFrame: 125 }).narrationStartFrame).toBe(125);
  expect(() => parseFacelessPublicStory({ ...story, narrationStartFrame: 126 })).toThrow();
});
