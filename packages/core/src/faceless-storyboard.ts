import { z } from "zod";
// Keep these private shapes compatible with the Remotion caption contract.
type WordTiming = { word: string; startSec: number; endSec: number };
type PhraseRange = { wordStart: number; wordEnd: number; accentWord: number };

const tokenPattern = /[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*/gu;
const nonblank = z.string().trim().min(1);
const index = z.number().int().nonnegative();
const sha256 = z.string().regex(/^[0-9a-fA-F]{64}$/);
const range = {
  wordStart: index,
  wordEnd: index,
};

const proposalSchema = z.strictObject({
  version: z.literal("faceless_storyboard_61_v1"),
  premise: nonblank,
  script: nonblank,
  provenance: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("fixture") }),
    z.strictObject({
      kind: z.literal("model"),
      model: nonblank,
      promptSha256: sha256,
      responseSha256: sha256,
    }),
  ]),
  beats: z.array(z.strictObject({
    id: nonblank,
    ...range,
    reason: z.enum(["action", "place", "reveal", "emphasis"]),
    mediaType: z.enum(["video", "image"]),
    visualPrompt: nonblank,
  })).min(2),
  captionPhrases: z.array(z.strictObject({
    ...range,
    accentWord: index,
  })).min(1),
});

export type StoryboardProposal = Omit<z.infer<typeof proposalSchema>, "captionPhrases"> & {
  captionPhrases: PhraseRange[];
};

function tokens(input: string): string[] {
  return input.normalize("NFKC").match(tokenPattern) ?? [];
}

function lexical(input: string): string {
  return input.normalize("NFKC").replace(/[’]/gu, "'").normalize("NFD")
    .replace(/\p{M}/gu, "").toLocaleLowerCase("und");
}

export function parseStoryboardProposal(input: unknown): StoryboardProposal {
  const proposal = proposalSchema.parse(input);
  const wordCount = tokens(proposal.script).length;
  if (wordCount === 0) throw new Error("storyboard script has no words");

  let nextWord = 0;
  const ids = new Set<string>();
  for (const [position, beat] of proposal.beats.entries()) {
    if (ids.has(beat.id)) throw new Error("storyboard beat IDs must be unique");
    ids.add(beat.id);
    if (beat.wordStart !== nextWord || beat.wordEnd <= beat.wordStart || beat.wordEnd > wordCount) {
      throw new Error("storyboard beats must partition script words");
    }
    if (beat.mediaType !== (position === 0 ? "video" : "image")) {
      throw new Error("storyboard requires one first VIDEO beat and later IMAGE beats");
    }
    nextWord = beat.wordEnd;
  }
  if (nextWord !== wordCount) throw new Error("storyboard beats must partition script words");

  nextWord = 0;
  for (const phrase of proposal.captionPhrases) {
    if (phrase.wordStart !== nextWord || phrase.wordEnd <= phrase.wordStart || phrase.wordEnd > wordCount) {
      throw new Error("storyboard caption phrases must partition script words");
    }
    if (phrase.accentWord < phrase.wordStart || phrase.accentWord >= phrase.wordEnd) {
      throw new Error("storyboard caption accent must belong to its phrase");
    }
    nextWord = phrase.wordEnd;
  }
  if (nextWord !== wordCount) throw new Error("storyboard caption phrases must partition script words");
  return proposal;
}

export function assertStoryboardWords(script: string, words: readonly WordTiming[]): void {
  const scriptWords = tokens(script);
  if (scriptWords.length === 0 || scriptWords.length !== words.length) {
    throw new Error("storyboard word count mismatch");
  }
  for (let i = 0; i < words.length; i++) {
    const timed = words[i]!;
    const measured = tokens(timed.word);
    if (measured.length !== 1 || lexical(measured[0]!) !== lexical(scriptWords[i]!)) {
      throw new Error(`storyboard word ${i} differs from script`);
    }
    if (!Number.isFinite(timed.startSec) || !Number.isFinite(timed.endSec) ||
        timed.startSec < 0 || timed.endSec <= timed.startSec ||
        (i > 0 && timed.startSec < words[i - 1]!.endSec)) {
      throw new Error(`storyboard word ${i} has invalid timing`);
    }
  }
}

export function storyboardImageBudget(sceneCount: number, replacementCount: number): { allowance: 24; remaining: number } {
  if (!Number.isSafeInteger(sceneCount) || sceneCount < 0 ||
      !Number.isSafeInteger(replacementCount) || replacementCount < 2) {
    throw new Error("storyboard image allowance requires valid scenes and two reserved replacements");
  }
  const remaining = 24 - 2 - 1 - sceneCount - replacementCount;
  if (remaining < 0) throw new Error("storyboard image allowance exceeded");
  return { allowance: 24, remaining };
}
