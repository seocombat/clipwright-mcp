import { describe, expect, it } from "vitest";
import { measureSpeechRhythm } from "./speech-rhythm.js";
import type { WordTiming } from "./tts-backend.js";

const word = (word: string, startSec: number, endSec: number): WordTiming => ({ word, startSec, endSec });

describe("measureSpeechRhythm", () => {
  it("includes leading/trailing uncovered time and returns internal gaps in seconds", () => {
    expect(measureSpeechRhythm([word("Hello.", 1, 2), word("Next", 3, 4)], 5)).toEqual({
      status: "available", durationSec: 5, wordGapDurationSec: 3, wordGapFraction: 0.6,
      leadingGapSec: 1, trailingGapSec: 1, interWordGapsSec: [1],
      measuredSentenceGapCount: 1, sentenceGapMedianSec: 1,
    });
  });

  it("unions overlapping/nested intervals without double counting or inventing gaps", () => {
    expect(measureSpeechRhythm([word("A", 0, 4), word("B.", 1, 2), word("C", 3, 5)], 6)).toEqual({
      status: "available", durationSec: 6, wordGapDurationSec: 1, wordGapFraction: 1 / 6,
      leadingGapSec: 0, trailingGapSec: 1, interWordGapsSec: [0, 0],
      measuredSentenceGapCount: 1, sentenceGapMedianSec: 0,
    });
  });

  it("distinguishes a measured zero from no observable sentence boundary", () => {
    expect(measureSpeechRhythm([word("One", 0, 2)], 2)).toMatchObject({
      status: "available", wordGapFraction: 0, interWordGapsSec: [],
      measuredSentenceGapCount: 0, sentenceGapMedianSec: null,
    });
    expect(measureSpeechRhythm([word("End.", 0, 2)], 2)).toMatchObject({ measuredSentenceGapCount: 0, sentenceGapMedianSec: null });
  });

  it("recognizes terminal punctuation and closing quotes, taking the even median", () => {
    const words = [word("Really?!\"", 0, 1), word("Да…»", 2, 3), word("終。", 6, 7), word("Next", 9, 10), word("Last", 11, 12)];
    expect(measureSpeechRhythm(words, 12)).toMatchObject({ measuredSentenceGapCount: 3, sentenceGapMedianSec: 2 });
    expect(measureSpeechRhythm(words.slice(0, 3), 7)).toMatchObject({ measuredSentenceGapCount: 2, sentenceGapMedianSec: 2 });
  });

  it("does not treat commas, decimals, or internal punctuation as sentence endings", () => {
    expect(measureSpeechRhythm([word("3.14", 0, 1), word("hello,", 2, 3), word("what?ever", 4, 5), word("last", 6, 7)], 7))
      .toMatchObject({ measuredSentenceGapCount: 0, sentenceGapMedianSec: null });
  });

  it.each([null, undefined, []])("marks absent timings unavailable: %j", words => {
    expect(measureSpeechRhythm(words, 5)).toEqual({ status: "unavailable", reason: "missing_timings" });
  });

  it.each([0, -1, NaN, Infinity])("rejects invalid measured duration: %s", duration => {
    expect(measureSpeechRhythm([word("a", 0, 1)], duration)).toEqual({ status: "unavailable", reason: "invalid_duration" });
  });

  it.each([
    [word("a", -1, 1)], [word("a", 1, 1)], [word("a", 2, 1)],
    [word("a", NaN, 1)], [word("a", 0, Infinity)], [word("a", 0, 6)],
    [word(" ", 0, 1)], [word("a", 2, 3), word("b", 1, 2)],
  ])("rejects invalid timings without sorting or clipping: %j", (...words) => {
    expect(measureSpeechRhythm(words, 5)).toEqual({ status: "unavailable", reason: "invalid_timings" });
  });

  it("accepts equal starts, preserves input, and never sorts the caller's array", () => {
    const words = Object.freeze([Object.freeze(word("a.", 0, 2)), Object.freeze(word("b", 0, 3))]);
    expect(measureSpeechRhythm(words, 3)).toMatchObject({ wordGapFraction: 0, sentenceGapMedianSec: 0 });
  });
});
