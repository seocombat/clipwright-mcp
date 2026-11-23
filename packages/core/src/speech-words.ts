import type { WordTiming } from "./tts-backend.js";

export const LEXICAL_WORD = /[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*/gu;

export function lexicalWords(text: string): string[] {
  return text.normalize("NFKC").match(LEXICAL_WORD) ?? [];
}

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
