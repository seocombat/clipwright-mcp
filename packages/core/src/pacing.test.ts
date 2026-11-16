import { describe, expect, it } from "vitest";

import { estimateDurationSec, LATIN_LANGUAGE_PACE, PAUSE_TRIM_PACE_FACTOR, sentenceBreaks } from "./pacing.js";

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
// The table names no voice, so an English take stands on an unmeasured one: a measured voice is timed by its own pace (#1520, below).
const voiceOf = (language: string) => `${language}_male_x`;
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

/** Delivered pause-trimmed English make_ugc takes on measured voices, prod runs of 2026-10-02..11-15 (#1520): the voice, the script's words, */
/** characters with spaces collapsed and sentence breaks, and the delivered narration in seconds. Fitted on these; held out by script, 4.4%. */
type VoicedTake = readonly [voice: string, words: number, chars: number, breaks: number, delivered: number];
const VOICED: readonly VoicedTake[] = [
  ["en_female_cassidy", 49, 242, 4, 14.1], ["en_female_cassidy", 49, 242, 4, 13.89], ["en_female_cassidy", 77, 389, 7, 21.63],
  ["en_female_cassidy", 68, 415, 6, 23.38], ["en_female_cassidy", 68, 415, 6, 23.87], ["en_female_cassidy", 104, 571, 9, 30.75],
  ["en_female_cassidy", 106, 592, 9, 32.84], ["en_male_dexter", 79, 462, 7, 25.73], ["en_male_liam", 95, 527, 8, 31.14],
  ["en_male_liam", 103, 547, 8, 32.15], ["en_male_liam", 113, 575, 7, 33.58], ["en_male_liam", 113, 575, 7, 32.8], ["en_male_liam", 113, 582, 7, 34.23],
  ["en_male_liam", 106, 588, 11, 35.66], ["en_male_mark", 45, 292, 9, 19.1], ["eric", 82, 458, 7, 26.78], ["eric", 82, 458, 7, 27.54],
  ["eric", 82, 458, 7, 27.75], ["george", 29, 145, 2, 8.24], ["george", 51, 254, 4, 15.38], ["george", 92, 494, 8, 32.44], ["george", 93, 497, 8, 30.27],
  ["george", 93, 497, 8, 33.2], ["george", 93, 497, 8, 32.31], ["george", 93, 497, 8, 32.99], ["george", 93, 497, 8, 30.32], ["george", 93, 497, 8, 30.52],
  ["sarah", 34, 177, 2, 11.34], ["sarah", 43, 239, 5, 16.12], ["sarah", 47, 268, 6, 18.01], ["sarah", 55, 283, 4, 16.98], ["sarah", 55, 283, 4, 16.85],
  ["sarah", 52, 283, 6, 19.27], ["sarah", 52, 283, 6, 19.4], ["sarah", 52, 283, 6, 19.29], ["sarah", 51, 292, 6, 20.06], ["sarah", 104, 571, 9, 34.56],
];

/** An English script of `words` words, `chars` characters and `breaks + 1` sentences of two words or more. */
function englishScript(words: number, chars: number, breaks: number): string {
  const sentences = breaks + 1, tokens = Array.from({ length: words }, (_, at): string => (at % 2 === 0 ? "the" : "word"));
  const cut = (at: number) => Math.round(((at + 1) * words) / sentences) - 1;
  for (let at = 0; at < sentences; at += 1) tokens[cut(at)] += ".";
  const short = chars - tokens.join(" ").length, last = tokens.length - 1;
  tokens[last] = "x".repeat(short) + tokens[last];
  return tokens.join(" ");
}
const voicedErrors = (legacy: boolean) => VOICED.map(([voice, words, chars, breaks, delivered]) =>
  (estimateDurationSec(englishScript(words, chars, breaks), "eleven_v4", legacy ? undefined : { voice, pauseTrim: true }) - delivered) / delivered);

describe("estimateDurationSec on a measured voice (#1520)", () => {
  it("builds the table's scripts as described", () => {
    const text = englishScript(52, 283, 6);
    expect([text.split(" ").length, text.length, sentenceBreaks(text)]).toEqual([52, 283, 6]);
  });

  // Mutant: drop the voice's own pace and the trimmed takes run back to 10% off on average, 16% short at worst.
  it("times delivered takes within 5% on average and never more than 6% short, where 2.6 words/s missed by 10% and 16%", () => {
    const voiced = voicedErrors(false), legacy = VOICED.map(([, words, , , delivered]) =>
      (Math.max(1, Math.round(words / (2.6 * PAUSE_TRIM_PACE_FACTOR))) - delivered) / delivered);
    expect(meanAbs(legacy)).toBeGreaterThan(0.1);
    expect(Math.min(...legacy)).toBeLessThan(-0.15);
    expect(meanAbs(voiced)).toBeLessThan(0.05);
    expect(Math.min(...voiced)).toBeGreaterThan(-0.06);
  });

  // Two bodies on one voice and nearly one length: the one with more sentences takes longer, as delivered (19.27 s against 16.98 s).
  it("quotes pilot 3's punchy body longer than a body of the same characters in fewer sentences", () => {
    const pilot3 = "Your laptop bag stays bone dry. Want to know why? This is the Ostra Commuter. Its flip lid locks shut, and opens with just one " +
      "thumb. It was tested upside down for a full twenty-four hours. Look, I flip it over: not one drip. Ostra Commuter: twenty-nine euros, " +
      "with free EU shipping.";
    const mug = "My coffee used to go cold on my desk every single morning. This mug keeps it hot for three hours. Just fill it, twist the lid " +
      "until it clicks, and forget about it. I timed it: at eleven o'clock it was still sixty degrees. Grab yours with the link below, twenty percent off this week.";
    const trimmed = { voice: "sarah", pauseTrim: true };
    expect([estimateDurationSec(pilot3, "eleven_v4", trimmed), estimateDurationSec(mug, "eleven_v4", trimmed)]).toEqual([19, 18]);
    // Codex r1: a caller that names no model speaks the default one, which the paces were measured on.
    expect([estimateDurationSec(pilot3, undefined, trimmed), estimateDurationSec(mug, undefined, trimmed)]).toEqual([19, 18]);
    // Words/s alone, as before: the reverse order, both off by a second or more.
    expect([estimateDurationSec(pilot3, "eleven_v3", trimmed), estimateDurationSec(mug, "eleven_v3", trimmed)]).toEqual([18, 19]);
  });

  it("counts a one-word answer as no break", () => {
    expect(sentenceBreaks("Drafting a tricky email? ChatGPT. Writing code? Cursor. Save this list.")).toBe(2);
  });

  // Codex r2, the class: every sentence end is pinned, each alone, and so is every place that is not a break.
  it.each([
    ["a full stop", "This is the mug. It keeps your coffee hot. Take it with you.", 2],
    ["an exclamation mark", "This is the mug! It keeps your coffee hot! Take it with you!", 2],
    ["a question mark", "Is this the mug? Does it keep coffee hot? Can you take it?", 2],
    ["the last sentence, a one-word sentence, a decimal and a site", "Hot for 3.5 hours. Really. Visit clipwright.io today", 1],
    ["a mark with no space after it", "Hot!Really?Yes.", 0],
  ])("breaks on %s as written", (_case, text, breaks) => {
    expect(sentenceBreaks(text)).toBe(breaks);
  });

  it("counts characters with runs of whitespace as one space, so line breaks in a script cost nothing", () => {
    const text = englishScript(52, 283, 6), spread = `  ${text.replaceAll(" ", " \n  ")}\n`, trimmed = { voice: "sarah", pauseTrim: true };
    expect(estimateDurationSec(spread, "eleven_v4", trimmed)).toBe(estimateDurationSec(text, "eleven_v4", trimmed));
  });

  it("keeps the old estimate off its fit: no pause_trim, another model, an unmeasured voice, a non-English script", () => {
    const text = englishScript(52, 283, 6), legacy = estimateDurationSec(text);
    expect(estimateDurationSec(text, "eleven_v4", { voice: "sarah" })).toBe(legacy);
    expect(estimateDurationSec(text, "eleven_v3", { voice: "sarah", pauseTrim: true })).toBe(Math.round(52 / (2.6 * PAUSE_TRIM_PACE_FACTOR)));
    expect(estimateDurationSec(text, "eleven_v4", { voice: "en_male_x", pauseTrim: true })).toBe(Math.round(52 / (2.6 * PAUSE_TRIM_PACE_FACTOR)));
    const spanish = "Mi café se enfriaba cada mañana en la mesa. Esta taza lo mantiene caliente tres horas.";
    expect(estimateDurationSec(spanish, "eleven_v4", { voice: "sarah", pauseTrim: true }))
      .toBe(estimateDurationSec(spanish, "eleven_v4", { voice: "en_male_x", pauseTrim: true }));
  });
});
