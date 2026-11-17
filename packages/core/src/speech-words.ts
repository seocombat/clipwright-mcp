import type { WordTiming } from "./tts-backend.js";

// The one word of a narration (#1650): letters, digits and marks, with apostrophes inside. A hyphen, a dot or a dash separates two words, so
// "twenty-one", "a.m." and "pre-ground" are two words each. The voice's timed words, a storyboard's ranges and a cut's beats all count these.

/** A narration word, global: `match` and `matchAll` only, never `exec` or `test`, which would keep its position between calls. */
export const LEXICAL_WORD = /[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*/gu;

/** The narration words of a text, after NFKC. */
export function lexicalWords(text: string): string[] {
  return text.normalize("NFKC").match(LEXICAL_WORD) ?? [];
}

/** A vendor's timed words cut into narration words: each piece keeps the punctuation after it and a share of the word's time by its letters; a
 *  word with no letters (a lone dash) joins the word before it, or the next one at the start, and gives up its time. Idempotent. */
export function lexicalWordTimings(words: readonly WordTiming[]): WordTiming[] {
  const out: WordTiming[] = [];
  let lead = "";
  for (const timed of words) {
    const text = timed.word.normalize("NFKC"), matches = [...text.matchAll(LEXICAL_WORD)];
    if (!matches.length) {
      const last = out.at(-1);
      if (last) last.word += text; else lead += text;
      continue;
    }
    const letters = matches.reduce((sum, match) => sum + match[0].length, 0), span = timed.endSec - timed.startSec;
    let before = 0;
    matches.forEach((match, at) => {
      const from = at === 0 ? 0 : match.index, to = matches[at + 1]?.index ?? text.length, after = before + match[0].length;
      out.push({ word: (at === 0 ? lead : "") + text.slice(from, to),
        startSec: at === 0 ? timed.startSec : timed.startSec + span * before / letters,
        endSec: at === matches.length - 1 ? timed.endSec : timed.startSec + span * after / letters });
      before = after;
    });
    lead = "";
  }
  return out;
}
