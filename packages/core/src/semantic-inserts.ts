import type { WordTiming } from "./tts-backend.js";

export type SemanticInsertInstruction = {
  insertId: string;
  mediaId: string;
  anchor: { startWord: number; endWord: number } | { quote: string; occurrence?: number };
  coverWords?: number;
};

export interface SemanticInsertAnchor {
  insertId: string;
  mediaId: string;
  startWord: number;
  endWord: number;
  coverWord?: number;
}

/** The first word NOT covered by the insert. The default is read here and only here, or */
/** "coverage equals the anchor" would drift between readers. */
export function coverWordOf(anchor: { endWord: number; coverWord?: number | undefined }): number {
  return anchor.coverWord ?? anchor.endWord;
}

export interface SemanticInsertPlan {
  sourceTokens: readonly string[];
  inserts: readonly SemanticInsertAnchor[];
}

export type SemanticInsertShot = {
  kind: "actor";
  fromFrame: number;
  durationInFrames: number;
} | {
  kind: "media";
  fromFrame: number;
  durationInFrames: number;
  insertId: string;
  mediaId: string;
};

export interface SemanticInsertResolution {
  totalFrames: number;
  shots: SemanticInsertShot[];
  warnings: string[];
}

function tokenize(text: string): string[] {
  const normalized = text.normalize("NFD").toLowerCase()
    .replace(/([аеиоуыэюя]\u0308?)\u0301/gu, "$1").normalize("NFC")
    .replace(/[’ʼ]/gu, "'");
  return normalized.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['-][\p{L}\p{N}][\p{L}\p{N}\p{M}]*|[.,](?<=\p{N}[.,])\p{N}+)*/gu) ?? [];
}

function orderedAnchors(plan: SemanticInsertPlan): SemanticInsertAnchor[] {
  if (plan.sourceTokens.length === 0 || plan.sourceTokens.some(token =>
    typeof token !== "string" || tokenize(token).length !== 1 || tokenize(token)[0] !== token)) {
    throw new Error("Semantic plan requires normalized source tokens");
  }
  const ids = new Set<string>();
  for (const anchor of plan.inserts) {
    if (typeof anchor.insertId !== "string" || !anchor.insertId.trim() ||
        typeof anchor.mediaId !== "string" || !anchor.mediaId.trim() || ids.has(anchor.insertId)) {
      throw new Error("Semantic inserts require unique nonempty insert IDs and media IDs");
    }
    ids.add(anchor.insertId);
    if (!Number.isSafeInteger(anchor.startWord) || !Number.isSafeInteger(anchor.endWord) ||
        anchor.startWord < 0 || anchor.endWord <= anchor.startWord || anchor.endWord > plan.sourceTokens.length) {
      throw new Error("Semantic insert word range is invalid");
    }
    if (anchor.coverWord !== undefined && (!Number.isSafeInteger(anchor.coverWord) ||
        anchor.coverWord < anchor.endWord || anchor.coverWord > plan.sourceTokens.length)) {
      throw new Error("Semantic insert coverage word is invalid");
    }
  }
  const ordered = plan.inserts.map(anchor => ({ ...anchor })).sort((a, b) => a.startWord - b.startWord);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i]!.startWord < coverWordOf(ordered[i - 1]!)) throw new Error("Semantic insert word ranges overlap");
  }
  return ordered;
}

export function planSemanticInserts(script: string, instructions: readonly SemanticInsertInstruction[]): SemanticInsertPlan {
  for (const chunk of script.match(/\S+/gu) ?? []) {
    const tokens = tokenize(chunk);
    if (tokens.length > 1 || (tokens.length === 0 && !/^\p{P}+$/u.test(chunk))) {
      throw new Error("Unsupported script tokenization: each whitespace chunk must contain at most one lexical word");
    }
  }
  const sourceTokens = tokenize(script);
  function quoteRange(anchor: { quote: string; occurrence?: number }) {
    const quoteTokens = tokenize(anchor.quote);
    if (quoteTokens.length === 0) throw new Error("Semantic insert quote is empty");
    const matches: number[] = [];
    for (let i = 0; i <= sourceTokens.length - quoteTokens.length; i++) {
      if (quoteTokens.every((token, offset) => token === sourceTokens[i + offset])) matches.push(i);
    }
    if (anchor.occurrence === undefined && matches.length > 1) throw new Error("Semantic insert quote is ambiguous");
    const occurrence = anchor.occurrence ?? 0;
    if (!Number.isSafeInteger(occurrence) || occurrence < 0 || occurrence >= matches.length) {
      throw new Error("Semantic insert quote occurrence does not match source text");
    }
    const startWord = matches[occurrence]!;
    return { startWord, endWord: startWord + quoteTokens.length };
  }
  const inserts = instructions.map(({ insertId, mediaId, anchor, coverWords }): SemanticInsertAnchor => {
    const range = "startWord" in anchor
      ? { startWord: anchor.startWord, endWord: anchor.endWord }
      : quoteRange(anchor);
    if (coverWords === undefined) return { insertId, mediaId, ...range };
    const anchored = range.endWord - range.startWord;
    if (!Number.isSafeInteger(coverWords) || coverWords < anchored) {
      throw new Error(`Semantic insert covers ${coverWords} words, fewer than the ${anchored} words it anchors`);
    }
    const coverWord = range.startWord + coverWords;
    return { insertId, mediaId, ...range, ...(coverWord === range.endWord ? {} : { coverWord }) };
  });
  const plan = { sourceTokens, inserts };
  return { sourceTokens, inserts: orderedAnchors(plan) };
}

/** The number of PAID actor shots, a pure function of word indexes, so input is refused */
/** before speech synthesis rather than in the worker after payment. */
export function countActorShots(plan: SemanticInsertPlan): number {
  const anchors = orderedAnchors(plan);
  if (anchors.length === 0) return 1;
  let shots = anchors[0]!.startWord > 0 ? 1 : 0;
  for (let i = 1; i < anchors.length; i++) {
    if (coverWordOf(anchors[i - 1]!) < anchors[i]!.startWord) shots++;
  }
  return shots + (coverWordOf(anchors[anchors.length - 1]!) < plan.sourceTokens.length ? 1 : 0);
}

export function resolveSemanticInserts(input: {
  plan: SemanticInsertPlan;
  words: readonly WordTiming[];
  durationSec: number;
  fps: number;
}): SemanticInsertResolution {
  const { plan, words, durationSec, fps } = input;
  const anchors = orderedAnchors(plan);
  if (!Number.isFinite(durationSec) || durationSec <= 0 || !Number.isSafeInteger(fps) || fps <= 0) {
    throw new Error("Semantic resolution requires a measured duration and positive integer fps");
  }
  const totalFrames = Math.round(durationSec * fps);
  if (!Number.isSafeInteger(totalFrames) || totalFrames <= 0) throw new Error("Measured duration has no representable frames");
  const lexicalWords: WordTiming[] = [];
  let previousEnd = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const tokens = tokenize(word.word);
    const punctuationOnly = /^\p{P}+$/u.test(word.word);
    if (!Number.isFinite(word.startSec) || !Number.isFinite(word.endSec) || word.startSec < previousEnd ||
        word.endSec < word.startSec || (!punctuationOnly && word.endSec === word.startSec) || word.endSec > durationSec) {
      throw new Error("Alignment timings are invalid, overlap, or exceed measured duration");
    }
    previousEnd = word.endSec;
    if (punctuationOnly) continue;
    if (tokens.length !== 1 || tokens[0] !== plan.sourceTokens[lexicalWords.length]) {
      throw new Error("Alignment text does not match source tokens");
    }
    lexicalWords.push(word);
  }
  if (lexicalWords.length !== plan.sourceTokens.length) throw new Error("Alignment does not cover the source tokens exactly");
  const shots: SemanticInsertShot[] = [];
  let cursor = 0;
  let rounded = Math.abs(totalFrames - durationSec * fps) > 1e-8;
  for (const anchor of anchors) {
    // A pause belongs to the owner of the preceding word: the window ends at the START of
    // the first uncovered word, or the gap would become a paid sliver.
    const cover = coverWordOf(anchor);
    const head = anchor.startWord === 0;
    const tail = cover >= lexicalWords.length;
    const start = lexicalWords[anchor.startWord]!.startSec * fps;
    const end = tail ? totalFrames : lexicalWords[cover]!.startSec * fps;
    const fromFrame = head ? 0 : Math.round(start);
    const endFrame = tail ? totalFrames : Math.round(end);
    if (fromFrame < cursor || endFrame <= fromFrame || endFrame > totalFrames) {
      throw new Error("Semantic insert frame range collides or has no positive duration");
    }
    if (!head) rounded ||= Math.abs(fromFrame - start) > 1e-8;
    if (!tail) rounded ||= Math.abs(endFrame - end) > 1e-8;
    if (fromFrame > cursor) shots.push({ kind: "actor", fromFrame: cursor, durationInFrames: fromFrame - cursor });
    shots.push({ kind: "media", fromFrame, durationInFrames: endFrame - fromFrame, insertId: anchor.insertId, mediaId: anchor.mediaId });
    cursor = endFrame;
  }
  if (cursor < totalFrames) shots.push({ kind: "actor", fromFrame: cursor, durationInFrames: totalFrames - cursor });
  const warnings: string[] = [];
  if (rounded) warnings.push("Semantic insert boundaries or measured duration were rounded to the nearest frame.");
  if (lexicalWords.length !== words.length) warnings.push("Punctuation-only alignment entries were excluded from semantic word anchors.");
  return { totalFrames, shots, warnings };
}

export function selectTimelineInput<T>(segments: readonly T[] | undefined, planner: () => SemanticInsertPlan):
  { kind: "explicit"; segments: readonly T[] } | { kind: "semantic"; plan: SemanticInsertPlan } {
  return segments !== undefined ? { kind: "explicit", segments } : { kind: "semantic", plan: planner() };
}
