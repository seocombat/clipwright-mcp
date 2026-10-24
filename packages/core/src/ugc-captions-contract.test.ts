import { describe, expect, it } from "vitest";
import v4 from "./__fixtures__/eleven-v4-alignment.json" with { type: "json" };
import {
  CAPTION_PRESET_IDS, CAPTION_PRESETS, CAPTION_STYLES, captionEmphasisOf, captionPresetOf, compositionVersionOf, makeUgcInput, storedUgcInput,
  UGC_COMPOSITION_VERSION,
} from "./skills.js";
import { ALIGNMENT_TAIL_TOLERANCE_SEC, charTimingsToWords, clampAlignmentTail } from "./tts-backend.js";
import { measureSpeechRhythm } from "./speech-rhythm.js";
import { lexicalTokens, quoteOccurrences } from "./semantic-inserts.js";

// Captions over UGC and inserts, keyword emphasis, and the speech-model alignment tail (#778, #779).

const script = "Missed calls cost you money. Our receptionist answers every call, books the job and never sleeps.";
const insert = { id: "calls", media_url: "https://example.com/a.png", media_type: "image" as const, anchor: { quote: "Missed calls" } };

describe("caption contract", () => {
  it("offers 23 presets with one-line descriptions, hormozi first as the default, and minimal as an alias", () => {
    expect(CAPTION_PRESET_IDS).toHaveLength(23);
    expect(CAPTION_PRESET_IDS[0]).toBe("hormozi");
    expect(CAPTION_PRESET_IDS).toEqual(expect.arrayContaining(["tiktok", "youtube", "instagram", "minimalist", "neon", "genz", "headline", "promo",
      "highlighter", "punch"]));
    for (const id of CAPTION_PRESET_IDS) expect(CAPTION_PRESETS[id]).toMatch(/^[^\n]{20,240}$/);
    expect(CAPTION_STYLES).toEqual([...CAPTION_PRESET_IDS, "minimal"]);
    expect(captionPresetOf("hormozi")).toBe("hormozi");
    expect(captionPresetOf("minimal")).toBe("minimalist");
    expect(captionPresetOf("tiktok")).toBe("tiktok");
    for (const style of CAPTION_STYLES) expect(makeUgcInput.safeParse({ script, captions: true, caption_style: style }).success).toBe(true);
  });

  it("accepts captions together with inserts", () => {
    expect(makeUgcInput.safeParse({ script, captions: true, inserts: [insert], broll_policy: "anyone" }).success).toBe(true);
  });

  it("refuses captions with explicit segments before any charge", () => {
    const parsed = makeUgcInput.safeParse({ segments: [{ kind: "actor", script }], captions: true });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map(issue => issue.path.join("."))).toContain("captions");
  });

  it("accepts emphasis quoted from the script, matched as an insert quote is", () => {
    expect(makeUgcInput.safeParse({ script, captions: true, caption_emphasis: ["MISSED CALLS", "never sleeps!", "money"] }).success).toBe(true);
  });

  it("refuses an emphasis quote absent from the script, naming it", () => {
    const parsed = makeUgcInput.safeParse({ script, captions: true, caption_emphasis: ["money", "free trial"] });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual([expect.objectContaining({ path: ["caption_emphasis", 1], message: expect.stringContaining("free trial") })]);
  });

  it("accepts exactly 20 emphasis items and refuses 21 (#778 r2)", () => {
    expect(makeUgcInput.safeParse({ script, captions: true, caption_emphasis: Array(20).fill("money") }).success).toBe(true);
    expect(makeUgcInput.safeParse({ script, captions: true, caption_emphasis: Array(21).fill("money") }).success).toBe(false);
  });

  it("accepts a quote of exactly 40 characters and refuses 41, in both item forms (#778 r2)", () => {
    const long = `${script} ${"x".repeat(40)} ${"y".repeat(41)}`;
    expect(makeUgcInput.safeParse({ script: long, captions: true, caption_emphasis: ["x".repeat(40)] }).success).toBe(true);
    expect(makeUgcInput.safeParse({ script: long, captions: true, caption_emphasis: ["y".repeat(41)] }).success).toBe(false);
    expect(makeUgcInput.safeParse({ script: long, captions: true, caption_emphasis: [{ quote: "y".repeat(41) }] }).success).toBe(false);
  });

  it("refuses emphasis without captions, and over the count or length limits", () => {
    expect(makeUgcInput.safeParse({ script, caption_emphasis: ["money"] }).error?.issues[0]?.path).toEqual(["caption_emphasis"]);
    expect(makeUgcInput.safeParse({ script, captions: true, caption_emphasis: Array(21).fill("money") }).success).toBe(false);
    expect(makeUgcInput.safeParse({ script, captions: true, caption_emphasis: ["m".repeat(41)] }).success).toBe(false);
  });

  it("accepts an emphasis item as a plain quote or { quote, look }, with the same quote-must-occur rule", () => {
    const parsed = makeUgcInput.parse({ script, captions: true,
      caption_emphasis: ["money", { quote: "never sleeps" }, { quote: "Missed calls", look: "punch" }, { quote: "books the job", look: "pill" },
        { quote: "receptionist", look: "color" }] });
    expect(parsed.caption_emphasis!.map(captionEmphasisOf)).toEqual([{ quote: "money", look: undefined }, { quote: "never sleeps", look: undefined },
      { quote: "Missed calls", look: "punch" }, { quote: "books the job", look: "pill" }, { quote: "receptionist", look: "color" }]);
    const absent = makeUgcInput.safeParse({ script, captions: true, caption_emphasis: [{ quote: "free trial", look: "pill" }] });
    expect(absent.error?.issues).toEqual([expect.objectContaining({ path: ["caption_emphasis", 0], message: expect.stringContaining("free trial") })]);
    expect(makeUgcInput.safeParse({ script, captions: true, caption_emphasis: [{ quote: "money", look: "glow" }] }).success).toBe(false);
    expect(makeUgcInput.safeParse({ script, captions: true, caption_emphasis: [{ quote: "money", extra: 1 }] }).success).toBe(false);
  });

  it("refuses caption_mode highlights without caption_emphasis or without captions, before any charge", () => {
    for (const body of [{ script, captions: true, caption_mode: "highlights" }, { script, caption_mode: "highlights", caption_emphasis: ["money"] }]) {
      const parsed = makeUgcInput.safeParse(body);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toContain("caption_mode");
    }
    expect(makeUgcInput.safeParse({ script, captions: true, caption_mode: "highlights", caption_emphasis: ["money"] }).success).toBe(true);
    expect(makeUgcInput.parse({ script, captions: true }).caption_mode).toBeUndefined();
  });

  it("finds every occurrence of a quote", () => {
    expect(quoteOccurrences(lexicalTokens("call me, call you"), "Call")).toEqual([{ startWord: 0, endWord: 1 }, { startWord: 2, endWord: 3 }]);
    expect(quoteOccurrences(lexicalTokens("call me"), "!!!")).toEqual([]);
  });

  it("reads composition version 2 only from a stored input that carries it", () => {
    expect(UGC_COMPOSITION_VERSION).toBe(2);
    expect(compositionVersionOf({ composition_version: 2 })).toBe(2);
    expect(compositionVersionOf({ script })).toBe(1);
    expect(compositionVersionOf(null)).toBe(1);
    expect(storedUgcInput.parse({ script, composition_version: 2 }).composition_version).toBe(2);
    expect(storedUgcInput.safeParse({ script, composition_version: 3 }).success).toBe(false);
  });
});

describe("speech-model alignment tail (#779)", () => {
  const fresh = charTimingsToWords(v4.fresh.characters, v4.fresh.character_start_times_seconds, v4.fresh.character_end_times_seconds);

  it("a recorded eleven_v4 take ends 80 ms past its decoded audio, which the old 1 ms tolerance refused", () => {
    expect(fresh.at(-1)!.endSec - v4.fresh.decodedDurationSec).toBeCloseTo(0.08, 6);
    expect(measureSpeechRhythm(fresh, v4.fresh.decodedDurationSec)).toEqual({ status: "unavailable", reason: "invalid_timings" });
  });

  it("pulls the tail back to the decoded end, and the clamped take measures", () => {
    const tail = clampAlignmentTail(fresh, v4.fresh.decodedDurationSec)!;
    expect(tail.clippedSec).toBeCloseTo(0.08, 6);
    expect(tail.words.at(-1)!.endSec).toBe(v4.fresh.decodedDurationSec);
    expect(tail.words.slice(0, -1)).toEqual(fresh.slice(0, -1));
    expect(measureSpeechRhythm(tail.words, v4.fresh.decodedDurationSec)).toMatchObject({ status: "available" });
  });

  it("a recovered take, its ends stored as durations, has the same tail and clamps the same way", () => {
    const { character_start_times_seconds: starts, character_durations_seconds: durations } = v4.recoveredHistory;
    const words = charTimingsToWords(v4.recoveredHistory.characters, starts, starts.map((start, i) => start + durations[i]!));
    const tail = clampAlignmentTail(words, v4.recoveredHistory.decodedDurationSec)!;
    expect(tail.clippedSec).toBeCloseTo(0.08, 6);
    expect(measureSpeechRhythm(tail.words, v4.recoveredHistory.decodedDurationSec)).toMatchObject({ status: "available" });
  });

  it("accepts and pulls back a tail of exactly 100 ms, and refuses 101 ms (#778 r2)", () => {
    const ending = (endSec: number) => [{ word: "a", startSec: 0, endSec: 1 }, { word: "b", startSec: 1, endSec }];
    expect(clampAlignmentTail(ending(2.1), 2)).toEqual({ words: ending(2), clippedSec: expect.closeTo(0.1, 9) });
    expect(clampAlignmentTail(ending(2.101), 2)).toBeNull();
    expect(clampAlignmentTail(ending(2.105), 2)).toBeNull();
  });

  it("refuses a tail longer than the tolerance and a word that starts after the audio", () => {
    const words = [{ word: "a", startSec: 0, endSec: 1 }, { word: "b", startSec: 1, endSec: 2 }];
    expect(clampAlignmentTail(words, 2 - ALIGNMENT_TAIL_TOLERANCE_SEC - 0.01)).toBeNull();
    expect(clampAlignmentTail(words, 1)).toBeNull();
    expect(clampAlignmentTail(words, 2)).toEqual({ words, clippedSec: 0 });
  });
});
