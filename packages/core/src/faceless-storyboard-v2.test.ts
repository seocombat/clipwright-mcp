import { describe, expect, it } from "vitest";
import { parseStoryboardV2 } from "./faceless-storyboard-v2.js";

const words = Array.from({ length: 160 }, (_, i) => `word${i + 1}`);
const proposal = {
  version: "faceless_storyboard_61_v2",
  premise: "A synthetic story",
  script: words.join(" "),
  provenance: { kind: "model", model: "fixture-model", promptSha256: "a".repeat(64), responseSha256: "b".repeat(64) },
  beats: [
    { id: "a", wordStart: 0, wordEnd: 40, reason: "action", mediaType: "video", visualPrompt: "A door opens", phase: "setup" },
    { id: "b", wordStart: 40, wordEnd: 80, reason: "place", mediaType: "image", visualPrompt: "A long corridor", phase: "development" },
    { id: "c", wordStart: 80, wordEnd: 120, reason: "reveal", mediaType: "image", visualPrompt: "A bright window", phase: "climax" },
    { id: "d", wordStart: 120, wordEnd: 160, reason: "action", mediaType: "image", visualPrompt: "The door closes", phase: "resolution" },
  ],
  captionPhrases: [
    { wordStart: 0, wordEnd: 40, accentWord: 0 },
    { wordStart: 40, wordEnd: 80, accentWord: 40 },
    { wordStart: 80, wordEnd: 120, accentWord: 80 },
    { wordStart: 120, wordEnd: 160, accentWord: 120 },
  ],
};

describe("parseStoryboardV2", () => {
  it.each([
    [154, false], [155, true], [165, true], [166, false],
  ])("enforces the model script boundary at %i fully covered words", (count, accepted) => {
    const candidate = {
      ...proposal,
      script: Array.from({ length: count }, (_, i) => `word${i + 1}`).join(" "),
      beats: proposal.beats.map((beat, i) => i === 3 ? { ...beat, wordEnd: count } : beat),
      captionPhrases: proposal.captionPhrases.map((phrase, i) => i === 3 ? { ...phrase, wordEnd: count } : phrase),
    };
    if (accepted) expect(parseStoryboardV2(candidate).beats.at(-1)?.wordEnd).toBe(count);
    else expect(() => parseStoryboardV2(candidate)).toThrow(/155–165 spoken words/);
  });

  it("partitions every word into one beat and one caption phrase", () => {
    const result = parseStoryboardV2(proposal);
    expect(result.beats.at(-1)?.wordEnd).toBe(160);
    for (let i = 0; i < 160; i++) {
      expect(result.beats.filter(b => b.wordStart <= i && i < b.wordEnd)).toHaveLength(1);
      expect(result.captionPhrases.filter(p => p.wordStart <= i && i < p.wordEnd)).toHaveLength(1);
    }
  });

  it.each([
    ["beat gap", { beats: proposal.beats.map((b, i) => i === 1 ? { ...b, wordStart: 41 } : b) }],
    ["caption duplicate", { captionPhrases: proposal.captionPhrases.map((p, i) => i === 1 ? { ...p, wordStart: 39 } : p) }],
    ["second VIDEO", { beats: proposal.beats.map((b, i) => i === 1 ? { ...b, mediaType: "video" } : b) }],
    ["missing phase", { beats: proposal.beats.map((b, i) => i === 1 ? { id: b.id, wordStart: b.wordStart, wordEnd: b.wordEnd, reason: b.reason, mediaType: b.mediaType, visualPrompt: b.visualPrompt } : b) }],
    ["reordered phases", { beats: proposal.beats.map((b, i) => i === 2 ? { ...b, phase: "setup" } : b) }],
    ["unknown metadata", { referenceTranscript: "source words" }],
  ])("rejects %s", (_label, patch) => {
    expect(() => parseStoryboardV2({ ...proposal, ...patch })).toThrow();
  });

  it("keeps short scripts confined to fixtures", () => {
    const short = { ...proposal, script: "one two three four", beats: [
      { ...proposal.beats[0]!, wordEnd: 2 },
      { ...proposal.beats[1]!, wordStart: 2, wordEnd: 4 },
    ], captionPhrases: [{ wordStart: 0, wordEnd: 4, accentWord: 0 }] };
    expect(() => parseStoryboardV2(short)).toThrow();
    expect(parseStoryboardV2({ ...short, provenance: { kind: "fixture" } }).beats.at(-1)?.wordEnd).toBe(4);
  });
});
