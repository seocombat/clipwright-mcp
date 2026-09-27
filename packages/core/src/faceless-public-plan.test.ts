import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCutStyle } from "./faceless-cut-style.js";
import { facelessSpeechLexicalWords, facelessSpeechWordSpans, parseFacelessPublicStory, planPublicFacelessStory, type FacelessPublicStory } from "./faceless-public-plan.js";
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
      expect(shot.endFrame - shot.startFrame).toBeGreaterThanOrEqual(i ? 25 : 50);
      expect(shot.endFrame - shot.startFrame).toBeLessThanOrEqual(i ? 150 : 125);
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
