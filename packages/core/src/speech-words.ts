import type { WordTiming } from "./tts-backend.js";

export const LEXICAL_WORD = /[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*/gu;

export function lexicalWords(text: string): string[] {
  return text.normalize("NFKC").match(LEXICAL_WORD) ?? [];
}

const AUDIO_TAG = /\[[^[\]]+\]/gu;
const tagSpans = (text: string): [number, number][] => [...text.matchAll(AUDIO_TAG)].filter(match => {
  const inner = match[0].slice(1, -1), length = inner.replace(/\s+/gu, " ").length;
  return length <= 40 && (inner.match(/\s+/gu)?.length ?? 0) <= 3;
}).map(match => [match.index, match.index + match[0].length]);
const blank = (char: string | undefined) => char === " " || char === "\t";
const PAUSE_MARK = /[.,!?;:…]/u;

export function withoutAudioTags(text: string): string {
  const spans = tagSpans(text);
  if (!spans.length) return text;
  const parts: string[] = [];
  let at = 0;
  const last = () => parts.at(-1)?.at(-1);
  for (const [start, end] of spans) {
    if (start > at) parts.push(text.slice(at, start));
    at = end;
    if (!parts.length || blank(last())) while (blank(text[at])) at++;
    const next = text[at];
    if (next !== undefined && PAUSE_MARK.test(next)) {
      while (parts.length) {
        const part = parts.pop()!;
        let cut = part.length;
        while (cut > 0 && blank(part[cut - 1])) cut--;
        if (cut > 0) { parts.push(cut === part.length ? part : part.slice(0, cut)); break; }
      }
    } else if (next !== undefined && !/\s/u.test(next) && parts.length && !/\s/u.test(last()!)) parts.push(" ");
  }
  parts.push(text.slice(at));
  return parts.join("").trim();
}

export function withoutAudioTagWords<W>(words: readonly W[], textOf: (word: W) => string, withText: (word: W, text: string) => W): W[] {
  const texts = words.map(word => textOf(word)), spans = tagSpans(texts.join(" "));
  if (!spans.length) return [...words];
  const out: W[] = [];
  let from = 0, span = 0;
  for (const [at, word] of words.entries()) {
    const text = texts[at]!, to = from + text.length;
    while (span < spans.length && spans[span]![1] <= from) span++;
    let kept = "", cursor = from;
    for (let s = span; s < spans.length && spans[s]![0] < to; s++) {
      const [start, end] = spans[s]!;
      if (start > cursor) kept += text.slice(cursor - from, start - from);
      kept += " ";
      cursor = Math.max(cursor, Math.min(end, to));
    }
    if (cursor === from && kept === "") { out.push(word); from = to + 1; continue; }
    kept = `${kept}${text.slice(cursor - from)}`.trim().replace(/\s+/gu, " ");
    if (lexicalWords(kept).length) out.push(withText(word, kept));
    from = to + 1;
  }
  return out;
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
