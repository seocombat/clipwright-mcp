import { expect, it } from "vitest";
import { measureSpeechRhythm } from "./speech-rhythm.js";
import { speechRhythmResult } from "./speech-rhythm-contract.js";

it("accepts measured timing gaps and explicit absence", () => {
  for (const words of [undefined, [{ word: "Hi", startSec: 1, endSec: 2 }]]) {
    const result = measureSpeechRhythm(words, 3);
    expect(speechRhythmResult.parse(result)).toEqual(result);
  }
});

it("rejects incomplete available metrics and non-finite fractions", () => {
  expect(speechRhythmResult.safeParse({ status: "available" }).success).toBe(false);
  const result = measureSpeechRhythm([{ word: "Hi", startSec: 1, endSec: 2 }], 3);
  expect(speechRhythmResult.safeParse({ ...result, wordGapFraction: Infinity }).success).toBe(false);
});
