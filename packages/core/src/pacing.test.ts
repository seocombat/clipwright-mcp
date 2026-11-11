import { describe, expect, it } from "vitest";

import { estimateDurationSec, LATIN_LANGUAGE_PACE } from "./pacing.js";

/** Delivered make_ugc takes of Latin script, read from the prod runs table on 2026-11-07 (#1250): the voice's language ("en" for an English */
/** voice), the script's words, its characters with spaces collapsed, whether pause_trim was set, and the measured seconds of the video. */
type Take = readonly [language: string, words: number, chars: number, trim: 0 | 1, measured: number];
const MEASURED: readonly Take[] = [
  ["en", 24, 113, 0, 7.1], ["en", 33, 193, 0, 12.1], ["en", 45, 229, 0, 14.7], ["en", 23, 111, 0, 7.8], ["en", 45, 229, 0, 14.7],
  ["en", 8, 58, 0, 3.3], ["en", 19, 99, 0, 5.9], ["en", 26, 145, 0, 8.7], ["en", 19, 99, 0, 6.1], ["en", 19, 99, 0, 6.1],
  ["en", 18, 88, 0, 5], ["en", 16, 101, 0, 5.9], ["en", 24, 132, 0, 8.9], ["en", 26, 141, 0, 8.5], ["en", 26, 142, 0, 9.2],
  ["en", 20, 112, 0, 7.3], ["es", 14, 81, 0, 7.4], ["en", 19, 99, 0, 6], ["en", 19, 99, 0, 6.4], ["en", 22, 127, 0, 8.1],
  ["en", 19, 99, 0, 6.1], ["en", 19, 99, 0, 6.5], ["en", 19, 99, 0, 6.5], ["en", 17, 87, 0, 5.7], ["en", 15, 85, 0, 6.1],
  ["en", 23, 121, 0, 8.9], ["en", 25, 146, 0, 10.7], ["en", 23, 121, 0, 8.9], ["en", 11, 70, 0, 3.9], ["en", 13, 80, 0, 5.3],
  ["en", 174, 970, 0, 67.6], ["en", 82, 465, 0, 32.1], ["en", 13, 80, 0, 5], ["en", 98, 543, 0, 31.8], ["en", 26, 160, 0, 11.1],
  ["en", 82, 458, 1, 27], ["en", 25, 137, 0, 8.9], ["en", 26, 142, 0, 9.2], ["en", 79, 462, 0, 29.5], ["en", 25, 137, 0, 8.9],
  ["en", 26, 160, 0, 11.1], ["en", 42, 225, 1, 14.2], ["en", 46, 238, 1, 14.9], ["en", 34, 159, 0, 9.7], ["en", 38, 255, 0, 16.5],
  ["en", 79, 462, 1, 28.1], ["en", 79, 462, 1, 25.7], ["en", 79, 462, 1, 25.7], ["tr", 40, 258, 1, 16.9], ["en", 25, 132, 0, 8.3],
  ["en", 12, 68, 0, 5.2], ["en", 12, 68, 0, 5.2], ["en", 12, 68, 0, 5.1], ["en", 21, 107, 1, 6.1],
];

/** A script of exactly `words` words and `chars` characters, spaces collapsed. */
function script(words: number, chars: number): string {
  const letters = chars - (words - 1), base = Math.floor(letters / words), extra = letters % words;
  return Array.from({ length: words }, (_, at) => "a".repeat(base + (at < extra ? 1 : 0))).join(" ");
}
const voiceOf = (language: string) => (language === "en" ? "en_male_dexter" : `${language}_male_x`);
const estimate = ([language, words, chars, trim]: Take, legacy = false) =>
  estimateDurationSec(script(words, chars), undefined, legacy ? undefined : { voice: voiceOf(language), pauseTrim: trim === 1 });
const errors = (takes: readonly Take[], legacy = false) => takes.map(take => (estimate(take, legacy) - take[4]) / take[4]);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const meanAbs = (values: number[]) => values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;

describe("estimateDurationSec against delivered takes (#1250)", () => {
  const trimmed = MEASURED.filter(take => take[3] === 1), untrimmed = MEASURED.filter(take => take[3] === 0);

  // Mutant: drop the pause_trim factor, and a trimmed take is quoted 17% long again (the table's old error).
  it("is pause_trim aware: trimmed takes land within 10% where words/s alone ran 17% long", () => {
    expect(median(errors(trimmed, true))).toBeGreaterThan(0.15);
    expect(Math.abs(median(errors(trimmed)))).toBeLessThan(0.1);
  });

  it("keeps the English untrimmed estimate unchanged (it ran long, never short) and the whole table's error no worse", () => {
    const english = untrimmed.filter(take => take[0] === "en");
    expect(errors(english)).toEqual(errors(english, true));
    expect(meanAbs(errors(MEASURED))).toBeLessThan(meanAbs(errors(MEASURED, true)));
  });

  // Mutant: drop the characters path for a language, and the Turkish take is quoted 11% short as before.
  it("times the Turkish take, which words/s quoted 11% short, within 10% of its delivered 16.9 s", () => {
    const turkish = MEASURED.filter(take => take[0] === "tr");
    expect(errors(turkish, true)[0]!).toBeLessThan(-0.1);
    expect(Math.abs(errors(turkish)[0]!)).toBeLessThan(0.1);
  });

  // Mutant: drop the language factor, and Turkish reads at English pace and quotes 14% shorter than the same characters in English would take.
  it("takes the same characters longer in Turkish than at the Latin default pace", () => {
    const text = script(40, 258);
    expect(estimateDurationSec(text, undefined, { voice: "tr_male_kadir_kayisci", pauseTrim: true })).toBe(18);
    expect(estimateDurationSec(text, undefined, { voice: "fr_female_x", pauseTrim: true })).toBe(14);
    expect(LATIN_LANGUAGE_PACE.tr).toBeLessThan(1);
  });

  it("reads English, an unknown prefix and a voice id by words as before, and Cyrillic too", () => {
    const text = script(26, 160);
    const legacy = estimateDurationSec(text);
    for (const voice of ["en_male_x", "sarah", "zz_male_x", undefined]) expect(estimateDurationSec(text, undefined, { voice })).toBe(legacy);
    const russian = "Привет, это тест длины сценария для озвучки на русском языке сегодня";
    expect(estimateDurationSec(russian, undefined, { voice: "ru_female_x" })).toBe(estimateDurationSec(russian));
  });
});
