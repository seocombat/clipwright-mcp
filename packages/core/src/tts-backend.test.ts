import { describe, expect, it } from "vitest";

import { charTimingsToWords } from "./tts-backend.js";
import fixture from "./__fixtures__/elevenlabs-with-timestamps.json" with { type: "json" };

// The fixture is a real recorded `with-timestamps` response, not a hand-written mock: it catches
// data shapes we would not guess (a space between words is a character with its own timing).
describe("charTimingsToWords — a real ElevenLabs response", () => {
  const { characters, character_start_times_seconds, character_end_times_seconds } =
    fixture.alignment;

  const words = charTimingsToWords(
    characters,
    character_start_times_seconds,
    character_end_times_seconds,
  );

  it("the word count equals the token count of the source text", () => {
    // The text is rebuilt from characters, not stored apart, so fixture and expectation
    // cannot drift when the file is updated.
    const text = characters.join("").trim();
    const expectedTokens = text.split(/\s+/);
    expect(words.length).toBe(expectedTokens.length);
  });

  it("the first word starts exactly at character_start_times_seconds[0]", () => {
    expect(words[0]?.startSec).toBe(character_start_times_seconds[0]);
  });

  it("the last word ends no later than the last timing (non-strict <=)", () => {
    // A strict === would fail falsely if the response ends in whitespace: the flush drops
    // it, so the last word's endSec is below the last array element.
    const lastTiming = character_end_times_seconds.at(-1) as number;
    expect(words.at(-1)?.endSec).toBeLessThanOrEqual(lastTiming);
  });

  it("is monotonic: startSec <= endSec within a word, endSec <= the next startSec", () => {
    for (let i = 0; i < words.length; i += 1) {
      const w = words[i]!;
      expect(w.startSec).toBeLessThanOrEqual(w.endSec);
      const next = words[i + 1];
      if (next) {
        expect(w.endSec).toBeLessThanOrEqual(next.startSec);
      }
    }
  });

  it("no word contains whitespace", () => {
    for (const w of words) {
      expect(/\s/.test(w.word)).toBe(false);
    }
  });
});

describe("charTimingsToWords — edge cases", () => {
  it("empty input → empty array", () => {
    expect(charTimingsToWords([], [], [])).toEqual([]);
  });

  it("mismatched array lengths → throws a length-mismatch error", () => {
    expect(() => charTimingsToWords(["a", "b"], [0], [0.1, 0.2])).toThrow(
      "character/timing length mismatch",
    );
  });

  it("leading/trailing spaces do not produce empty words", () => {
    const chars = [" ", "h", "i", " "];
    const starts = [0, 0.1, 0.2, 0.3];
    const ends = [0.1, 0.2, 0.3, 0.4];
    const words = charTimingsToWords(chars, starts, ends);
    expect(words).toHaveLength(1);
    expect(words[0]?.word).toBe("hi");
  });
});
