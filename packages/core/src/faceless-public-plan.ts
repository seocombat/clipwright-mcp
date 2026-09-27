import { z } from "zod";
import { FACELESS_MIN_OUTPUT_FRAMES } from "./faceless-price.js";
import { parseCutStyle, type CutStyleProfile } from "./faceless-cut-style.js";
import { assertStoryboardWords } from "./faceless-storyboard.js";
import { facelessCutScore } from "./faceless-storyboard-v2-timing.js";
import type { WordTiming } from "./tts-backend.js";

const index = z.number().int().nonnegative().safe();
const phrase = z.strictObject({ wordStart: index, wordEnd: index, accentWord: index });
const storySchema = z.strictObject({
  script: z.string().trim().min(1),
  narrationStartFrame: index.max(125),
  beats: z.array(z.strictObject({
    id: z.string().trim().min(1), wordStart: index, wordEnd: index,
    mediaType: z.enum(["video", "image"]),
    reason: z.enum(["place", "reveal", "action", "emphasis"]),
    phase: z.enum(["setup", "development", "climax", "resolution"]),
    visualPrompt: z.string().trim().min(1),
  })).min(2),
  captionPhrases: z.array(phrase).min(1).optional(),
});
export type FacelessPublicStory = z.infer<typeof storySchema>;
const lexicalWordPattern = /[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*/gu;
export function facelessSpeechWordSpans(script: string): Array<{ word: string; start: number; end: number }> {
  const matches = [...script.matchAll(lexicalWordPattern)];
  const normalizedCount = script.normalize("NFKC").match(lexicalWordPattern)?.length ?? 0;
  if (!matches.length || matches.length !== normalizedCount) throw new Error("unsupported faceless script word boundaries");
  const compactOffset = Array<number>(script.length + 1).fill(0);
  for (let i = 0; i < script.length; i++) compactOffset[i + 1] = compactOffset[i]! + (/\s/u.test(script[i]!) ? 0 : 1);
  return matches.map((match, index) => {
    const first = index === 0 ? 0 : match.index;
    const last = matches[index + 1]?.index ?? script.length;
    return { word: script.slice(first, last).replace(/\s/gu, ""), start: compactOffset[first]!, end: compactOffset[last]! };
  });
}
export function facelessSpeechLexicalWords(script: string): string[] {
  return facelessSpeechWordSpans(script).map(({ word }) => {
    const normalized = word.normalize("NFKC").match(lexicalWordPattern);
    if (normalized?.length !== 1) throw new Error("unsupported faceless lexical word");
    return normalized[0]!.replace(/[’]/gu, "'").normalize("NFD")
      .replace(/\p{M}/gu, "").toLocaleLowerCase("und");
  });
}
export function parseFacelessPublicStory(input: unknown, expectedScript?: string): FacelessPublicStory {
  if (expectedScript !== undefined && (typeof input !== "object" || input === null ||
      (input as { script?: unknown }).script !== expectedScript)) throw new Error("faceless story changed supplied script");
  const story = storySchema.parse(input);
  const wordCount = facelessSpeechWordSpans(story.script).length;
  const phases = ["setup", "development", "climax", "resolution"] as const;
  let nextWord = 0, lastPhase = 0;
  const ids = new Set<string>();
  for (const [index, beat] of story.beats.entries()) {
    const phase = phases.indexOf(beat.phase);
    if (ids.has(beat.id) || beat.wordStart !== nextWord || beat.wordEnd <= beat.wordStart || beat.wordEnd > wordCount ||
        beat.mediaType !== (index === 0 ? "video" : "image") || phase < lastPhase) {
      throw new Error("faceless story beats must cover all words in phase order with one opening video");
    }
    ids.add(beat.id); nextWord = beat.wordEnd; lastPhase = phase;
  }
  if (nextWord !== wordCount) throw new Error("faceless story beats do not cover all words");
  if (story.captionPhrases) {
    let end = 0;
    for (const phrase of story.captionPhrases) {
      if (phrase.wordStart !== end || phrase.wordEnd <= end || phrase.wordEnd > wordCount ||
          phrase.accentWord < end || phrase.accentWord >= phrase.wordEnd) throw new Error("invalid faceless caption phrase");
      end = phrase.wordEnd;
    }
    if (end !== wordCount) throw new Error("faceless caption phrases do not cover all words");
  }
  return story;
}
type Score = ReturnType<typeof facelessCutScore>;
export type FacelessPublicPlan = {
  version: "faceless_public_v1";
  outputFrames: number;
  script: string;
  words: WordTiming[];
  narrationStartFrame: number;
  captionPhrases: z.infer<typeof phrase>[];
  shots: Array<{
    id: string; mediaType: "video" | "image"; startFrame: number; endFrame: number;
    beatIds: string[]; visualPrompts: string[]; phase: FacelessPublicStory["beats"][number]["phase"];
    motion?: "PAN_UP" | "PAN_DOWN"; cutAfterWord?: number; score: Score;
  }>;
};

export function planPublicFacelessStory(
  input: FacelessPublicStory, words: readonly WordTiming[], inputStyle: CutStyleProfile, outputFrames: number,
): FacelessPublicPlan {
  if (!Number.isSafeInteger(outputFrames) || outputFrames < FACELESS_MIN_OUTPUT_FRAMES || outputFrames > 2250) {
    throw new Error("public faceless output must be 625–2250 frames");
  }
  const story = parseFacelessPublicStory(input);
  const style = parseCutStyle(inputStyle);
  assertStoryboardWords(story.script, words);
  const speechEnd = story.narrationStartFrame + words.at(-1)!.endSec * 25;
  if (speechEnd > outputFrames + 1e-9 || outputFrames - speechEnd > 12.5 + 1e-9 ||
      story.narrationStartFrame + words[0]!.startSec * 25 > 125) throw new Error("speech duration outside public output bounds");
  const phases = { setup: 0, development: 1, climax: 2, resolution: 3 };
  const ids = new Set<string>();
  let nextWord = 0;
  for (const [i, beat] of story.beats.entries()) {
    if (ids.has(beat.id) || beat.wordStart !== nextWord || beat.wordEnd <= beat.wordStart || beat.wordEnd > words.length ||
        beat.mediaType !== (i === 0 ? "video" : "image") ||
        (i > 0 && phases[beat.phase] < phases[story.beats[i - 1]!.phase])) {
      throw new Error("story beats require unique IDs, ordered phases, complete word coverage and one opening VIDEO");
    }
    nextWord = beat.wordEnd; ids.add(beat.id);
  }
  if (nextWord !== words.length) throw new Error("story beats must cover every word");
  const captionPhrases = story.captionPhrases ?? story.beats.map(b => ({ wordStart: b.wordStart, wordEnd: b.wordEnd, accentWord: b.wordStart }));
  nextWord = 0;
  for (const p of captionPhrases) {
    if (p.wordStart !== nextWord || p.wordEnd <= p.wordStart || p.wordEnd > words.length ||
        p.accentWord < p.wordStart || p.accentWord >= p.wordEnd) throw new Error("caption phrases must partition all words");
    nextWord = p.wordEnd;
  }
  if (nextWord !== words.length) throw new Error("caption phrases must cover all words");

  const nodes = story.beats.slice(1).map((beat, i) => {
    const afterWord = beat.wordStart - 1;
    const frame = story.narrationStartFrame + Math.round((words[afterWord]!.endSec + words[afterWord + 1]!.startSec) / 2 * 25);
    return { beatIndex: i + 1, afterWord, frame };
  });
  if (nodes[0]!.frame < 50 || nodes[0]!.frame > 125) throw new Error("mandatory opening VIDEO requires 50–125 frames");
  nodes.push({ beatIndex: story.beats.length, afterWord: words.length - 1, frame: outputFrames });
  const final = nodes.length - 1;
  type State = { total: number; path: number[]; scores: Score[] };
  const states: Array<State | undefined> = Array(nodes.length);
  const openerScore = facelessCutScore(story.beats[1]!.reason, 0, { p25: 0, p75: 0 });
  states[0] = { total: openerScore.net, path: [0], scores: [openerScore] };
  for (let end = 1; end <= final; end++) {
    for (let start = 0; start < end; start++) {
      const prior = states[start];
      const duration = nodes[end]!.frame - nodes[start]!.frame;
      if (!prior || duration < 25 || duration > 150) continue;
      const phase = story.beats[nodes[start]!.beatIndex]!.phase;
      const phaseRange = style.pacing.by_phase[phase];
      const range = phaseRange && phaseRange.n > 0 ? phaseRange : style.pacing.global_image_frames;
      const score = facelessCutScore(end === final ? null : story.beats[nodes[end]!.beatIndex]!.reason, duration, range);
      const candidate = { total: prior.total + score.net, path: [...prior.path, end], scores: [...prior.scores, score] };
      const best = states[end];
      const firstDifference = best ? candidate.path.findIndex((v, i) => v !== best.path[i]) : -1;
      if (!best || candidate.total > best.total + 1e-9 || (Math.abs(candidate.total - best.total) <= 1e-9 &&
          (candidate.path.length < best.path.length || (candidate.path.length === best.path.length && firstDifference >= 0 &&
            candidate.path[firstDifference]! < best.path[firstDifference]!)))) states[end] = candidate;
    }
  }
  const selected = states[final];
  if (!selected) throw new Error("no feasible public storyboard within IMAGE duration bounds");
  let startFrame = 0; let beatStart = 0;
  const shots = selected.path.map((nodeIndex, i): FacelessPublicPlan["shots"][number] => {
    const node = nodes[nodeIndex]!;
    const included = story.beats.slice(beatStart, node.beatIndex);
    const hold = style.motion.pan_transition_n > 0 && style.motion.pan_flip_probability !== null && style.motion.pan_flip_probability < .5;
    const shot: FacelessPublicPlan["shots"][number] = {
      id: included[0]!.id, mediaType: i ? "image" : "video", startFrame, endFrame: node.frame,
      beatIds: included.map(b => b.id), visualPrompts: included.map(b => b.visualPrompt), phase: included[0]!.phase,
      ...(i ? { motion: hold || i % 2 === 1 ? "PAN_UP" as const : "PAN_DOWN" as const } : {}),
      ...(nodeIndex < final ? { cutAfterWord: node.afterWord } : {}), score: selected.scores[i]!,
    };
    startFrame = node.frame; beatStart = node.beatIndex;
    return shot;
  });
  return { version: "faceless_public_v1", outputFrames, script: story.script, words: words.map(w => ({ ...w })),
    narrationStartFrame: story.narrationStartFrame, captionPhrases, shots };
}
