import { describe, expect, it } from "vitest";

import { assertStoryboardWords } from "./faceless-storyboard.js";
import { facelessSpeechWordSpans } from "./faceless-public-plan.js";
import { lexicalWords, lexicalWordTimings } from "./speech-words.js";
import { charTimingsToWords } from "./tts-backend.js";

/** #1650: make_voice timed the vendor's space-split words, check_cut counted narration words. Both now count narration words. */

/** The words a vendor alignment gives for a text: one timing per character, split on spaces, as make_voice delivered them before. */
const spoken = (text: string) => charTimingsToWords([...text], [...text].map((_, i) => i * 0.05), [...text].map((_, i) => i * 0.05 + 0.04));

const SCRIPTS: Record<string, string> = {
  english: "At twenty-one I open at 7 a.m. — pre-ground coffee? Don't. It's the baker's well-known trick–really—every day.",
  russian: "В двадцать-один, т.е. в 9 ч. утра — кофе-машина? Нет. Северо-запад—бизнес-ланч, «и т.д.»",
  spanish: "¿Por qué? Veintiuno — café molido; no-sé... ¡Ya! El señor-presidente lo dijo.",
  french: "Aujourd'hui, c'est-à-dire l’après-midi, vingt-et-un croissants.",
  turkish: "İstanbul'da saat 7'de — çay-simit, gün-be-gün, vs. gibi.",
};

describe("the narration words of a voice", () => {
  // Mutants: a hyphen, dot or dash left inside one timed word; a letterless dash kept as a word of its own; the pieces' time not the word's.
  it.each(Object.entries(SCRIPTS))("%s: the voice's words are the text's words, one by one, inside each spoken word's time", (_, text) => {
    const vendor = spoken(text), words = lexicalWordTimings(vendor);
    expect(vendor.length).toBeLessThan(lexicalWords(text).length);
    expect(words.map(word => lexicalWords(word.word))).toEqual(lexicalWords(text).map(word => [word]));
    expect(() => assertStoryboardWords(text, words)).not.toThrow();
    // As many as the done-for-you narration times from the text itself.
    expect(words).toHaveLength(facelessSpeechWordSpans(text).length);
    for (const [at, word] of words.entries()) {
      expect(word.endSec).toBeGreaterThan(word.startSec);
      if (at) expect(word.startSec).toBeGreaterThanOrEqual(words[at - 1]!.endSec - 1e-9);
      expect(vendor.some(one => word.startSec >= one.startSec - 1e-9 && word.endSec <= one.endSec + 1e-9)).toBe(true);
    }
  });

  it("splits a word by its letters, keeps its punctuation, and is idempotent", () => {
    const words = lexicalWordTimings([{ word: "twenty-one,", startSec: 1, endSec: 1.9 }, { word: "—", startSec: 1.9, endSec: 2 },
      { word: "a.m.", startSec: 2, endSec: 2.4 }]);
    const twenty = 1 + (1.9 - 1) * 6 / 9, a = 2 + (2.4 - 2) / 2;
    expect(words).toEqual([{ word: "twenty-", startSec: 1, endSec: twenty }, { word: "one,—", startSec: twenty, endSec: 1.9 },
      { word: "a.", startSec: 2, endSec: a }, { word: "m.", startSec: a, endSec: 2.4 }]);
    expect(lexicalWordTimings(words)).toEqual(words);
    // A dash before the first word goes with it.
    expect(lexicalWordTimings([{ word: "—", startSec: 0, endSec: 0.1 }, { word: "Go", startSec: 0.1, endSec: 0.3 }]))
      .toEqual([{ word: "—Go", startSec: 0.1, endSec: 0.3 }]);
  });

  // Mutant: the refusal names no word and no count, as the live acceptance saw it.
  it("a refusal names both counts and the first word that differs", () => {
    const text = "Open at twenty-one sharp";
    expect(() => assertStoryboardWords(text, spoken(text))).toThrow(
      "storyboard word count mismatch: the voice has 4 words and its text 5; word 2 is the first that differs: \"twenty-one\" in the voice, \"twenty\" in the text");
    expect(() => assertStoryboardWords("Open at nine", [...lexicalWordTimings(spoken("Open at ten"))])).toThrow(
      "storyboard word 2 differs from script: \"ten\" in the voice, \"nine\" in the text");
  });
});
