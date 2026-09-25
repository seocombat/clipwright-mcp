import { describe, expect, it } from "vitest";
import { assertStoryboardWords, parseStoryboardProposal, storyboardImageBudget } from "./faceless-storyboard.js";

const valid = {
  version: "faceless_storyboard_61_v1",
  premise: "Mira finds a light",
  script: "Mira finds a hidden light.",
  provenance: { kind: "fixture" },
  beats: [
    { id: "opening", wordStart: 0, wordEnd: 2, reason: "action", mediaType: "video", visualPrompt: "Mira looks up" },
    { id: "reveal", wordStart: 2, wordEnd: 5, reason: "reveal", mediaType: "image", visualPrompt: "A hidden light glows" },
  ],
  captionPhrases: [
    { wordStart: 0, wordEnd: 2, accentWord: 0 },
    { wordStart: 2, wordEnd: 5, accentWord: 3 },
  ],
};

const words = [
  { word: "Mira", startSec: 0, endSec: 0.2 },
  { word: "finds", startSec: 0.2, endSec: 0.4 },
  { word: "a", startSec: 0.4, endSec: 0.5 },
  { word: "hidden", startSec: 0.5, endSec: 0.8 },
  { word: "light", startSec: 0.8, endSec: 1 },
];

describe("parseStoryboardProposal", () => {
  it("accepts the exact five-word proposal", () => {
    expect(parseStoryboardProposal(valid)).toEqual(valid);
    expect(parseStoryboardProposal(valid).beats.map(b => [b.wordStart, b.wordEnd])).toEqual([[0, 2], [2, 5]]);
  });

  it.each([
    ["gap", { beats: [valid.beats[0], { ...valid.beats[1], wordStart: 3 }] }],
    ["overlap", { beats: [valid.beats[0], { ...valid.beats[1], wordStart: 1 }] }],
    ["video second", { beats: [{ ...valid.beats[0], mediaType: "image" }, { ...valid.beats[1], mediaType: "video" }] }],
    ["duplicate IDs", { beats: [valid.beats[0], { ...valid.beats[1], id: "opening" }] }],
    ["empty prompt", { beats: [valid.beats[0], { ...valid.beats[1], visualPrompt: "  " }] }],
    ["unknown field", { extra: true }],
    ["beyond script", { beats: [valid.beats[0], { ...valid.beats[1], wordEnd: 6 }] }],
    ["caption gap", { captionPhrases: [valid.captionPhrases[0], { ...valid.captionPhrases[1], wordStart: 3 }] }],
    ["caption accent outside phrase", { captionPhrases: [valid.captionPhrases[0], { ...valid.captionPhrases[1], accentWord: 5 }] }],
  ])("rejects %s", (_label, patch) => {
    expect(() => parseStoryboardProposal({ ...valid, ...patch })).toThrow();
  });

  it("rejects a VIDEO-only proposal without an IMAGE beat", () => {
    expect(() => parseStoryboardProposal({
      ...valid,
      beats: [{ ...valid.beats[0], wordEnd: 5 }],
    })).toThrow();
  });

  it("requires complete model provenance and forbids fixture metadata", () => {
    const model = { kind: "model", model: "story-v1", promptSha256: "a".repeat(64), responseSha256: "b".repeat(64) };
    expect(parseStoryboardProposal({ ...valid, provenance: model }).provenance).toEqual(model);
    expect(() => parseStoryboardProposal({ ...valid, provenance: { ...model, promptSha256: "bad" } })).toThrow();
    expect(() => parseStoryboardProposal({ ...valid, provenance: { kind: "fixture", model: "story-v1" } })).toThrow();
  });
});

describe("assertStoryboardWords", () => {
  it("accepts punctuation and case normalization", () => {
    expect(() => assertStoryboardWords(valid.script, words)).not.toThrow();
    expect(() => assertStoryboardWords("Don’t!", [{ word: "don't", startSec: 0, endSec: 0.5 }])).not.toThrow();
  });

  it.each([
    ["wrong token", [{ ...words[2]!, word: "the" }]],
    ["nonmonotone time", [{ ...words[2]!, startSec: 0.1 }]],
    ["NaN time", [{ ...words[2]!, endSec: Number.NaN }]],
  ])("rejects %s", (_label, altered) => {
    const timed = [...words];
    timed[2] = altered[0]!;
    expect(() => assertStoryboardWords(valid.script, timed)).toThrow();
  });
  it("rejects count mismatch and multiword timing entries", () => {
    expect(() => assertStoryboardWords(valid.script, words.slice(0, 4))).toThrow();
    expect(() => assertStoryboardWords(valid.script, [{ ...words[0]!, word: "Mira finds" }, ...words.slice(1)])).toThrow();
  });
});

describe("storyboardImageBudget", () => {
  it("reserves references, keyframe, and two replacements", () => {
    expect(storyboardImageBudget(19, 2)).toEqual({ allowance: 24, remaining: 0 });
    expect(() => storyboardImageBudget(20, 2)).toThrow(/allowance/);
    expect(() => storyboardImageBudget(19, 1)).toThrow();
    expect(() => storyboardImageBudget(-1, 2)).toThrow();
  });
});
