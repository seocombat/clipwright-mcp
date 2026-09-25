import { assertStoryboardWords, parseStoryboardProposal, storyboardImageBudget, type StoryboardProposal } from "./faceless-storyboard.js";

type WordTiming = { word: string; startSec: number; endSec: number };
type PhraseRange = { wordStart: number; wordEnd: number; accentWord: number };
type Cut = { afterWord: number; frame: number; reason: string };
type Candidate = Cut & { beatIndex: number; priority: number; rejection?: string };
type State = { score: number; penalty: number; previous: number };

export type StoryboardFramePlan = {
  version: "faceless_storyboard_61_v1";
  outputFrames: 1522;
  script: string;
  captionPhrases: PhraseRange[];
  narrationStartFrame: number;
  shots: Array<{
    id: string;
    mediaType: "video" | "image";
    startFrame: number;
    endFrame: number;
    motion?: "PAN_UP" | "PAN_DOWN";
    beatIds: string[];
    cutAfterWord?: number;
    cutReason?: string;
  }>;
  rejectedCandidates: Cut[];
  imageBudget: { allowance: 24; remaining: number };
};

const priority = { place: 4, reveal: 4, action: 3, emphasis: 1 };

function better(candidate: State, current: State | undefined): boolean {
  return !current || candidate.score > current.score ||
    (candidate.score === current.score && candidate.penalty < current.penalty);
}

export function planStoryboardFrames(
  input: StoryboardProposal,
  words: readonly WordTiming[],
  narrationStartFrame: number,
): StoryboardFramePlan {
  const proposal = parseStoryboardProposal(input);
  assertStoryboardWords(proposal.script, words);
  if (!Number.isSafeInteger(narrationStartFrame) || narrationStartFrame < 0 || narrationStartFrame >= 1522) {
    throw new Error("invalid narration start frame");
  }
  const speechEnd = narrationStartFrame / 25 + words[words.length - 1]!.endSec;
  if (speechEnd > 1522 / 25) throw new Error("narration exceeds output duration");
  if (1522 / 25 - speechEnd > 0.5 + 1e-9) throw new Error("narration leaves more than 0.5 seconds tail");

  const candidates: Candidate[] = proposal.beats.slice(1).map((beat, i) => {
    const afterWord = beat.wordStart - 1;
    const previous = words[afterWord]!;
    const next = words[afterWord + 1]!;
    const edgeSec = next.startSec > previous.endSec ? (previous.endSec + next.startSec) / 2 : next.startSec;
    const frame = narrationStartFrame + Math.round(edgeSec * 25);
    if (!Number.isSafeInteger(frame) || frame <= 0 || frame >= 1522) throw new Error("cut outside output");
    const time = (frame - narrationStartFrame) / 25;
    const inside = words.some(w => time - w.startSec > 1 / 25 + 1e-9 && w.endSec - time > 1 / 25 + 1e-9);
    return { afterWord, frame, reason: beat.reason, beatIndex: i + 1, priority: priority[beat.reason],
      ...(inside ? { rejection: "cut more than one frame inside timed word" } : {}) };
  });
  const opener = candidates[0]!;
  if (opener.rejection || opener.frame < 75 || opener.frame > 125) {
    throw new Error("no feasible storyboard: mandatory VIDEO boundary violates timing");
  }
  const nodes = [...candidates, { frame: 1522, beatIndex: proposal.beats.length, priority: 0, afterWord: words.length - 1, reason: "output end" }];
  const states: Array<Array<State | undefined>> = nodes.map(() => Array<State | undefined>(20));
  states[0]![0] = { score: opener.priority, penalty: 0, previous: -1 };
  for (let end = 1; end < nodes.length; end++) {
    const destination = nodes[end]!;
    if ("rejection" in destination && destination.rejection) continue;
    for (let start = 0; start < end; start++) {
      const duration = destination.frame - nodes[start]!.frame;
      if (duration < 25 || duration > 150) continue;
      for (let count = 1; count <= 19; count++) {
        const prior = states[start]![count - 1];
        if (!prior) continue;
        const state = { score: prior.score + destination.priority,
          penalty: prior.penalty + Math.abs(duration - 68.75), previous: start };
        if (better(state, states[end]![count])) states[end]![count] = state;
      }
    }
  }
  const last = nodes.length - 1;
  let imageCount = 0;
  let best: State | undefined;
  for (let count = 1; count <= 19; count++) {
    const state = states[last]![count];
    if (state && better(state, best)) { best = state; imageCount = count; }
  }
  if (!best) throw new Error("no feasible storyboard within scene duration and image budget limits");
  const chosen = [last];
  let cursor = last;
  for (let count = imageCount; count > 0; count--) {
    cursor = states[cursor]![count]!.previous;
    chosen.push(cursor);
  }
  chosen.reverse();
  const selected = new Set(chosen);
  const shots: StoryboardFramePlan["shots"] = [];
  let startFrame = 0;
  let beatStart = 0;
  for (const [shotIndex, nodeIndex] of chosen.entries()) {
    const node = nodes[nodeIndex]!;
    shots.push({ id: proposal.beats[beatStart]!.id, mediaType: shotIndex === 0 ? "video" : "image",
      startFrame, endFrame: node.frame,
      ...(shotIndex > 0 ? { motion: shotIndex % 2 === 1 ? "PAN_UP" as const : "PAN_DOWN" as const } : {}),
      beatIds: proposal.beats.slice(beatStart, node.beatIndex).map(b => b.id),
      ...(nodeIndex < last ? { cutAfterWord: node.afterWord, cutReason: node.reason } : {}),
    });
    startFrame = node.frame;
    beatStart = node.beatIndex;
  }
  return { version: proposal.version, outputFrames: 1522, script: proposal.script,
    captionPhrases: proposal.captionPhrases, narrationStartFrame, shots,
    rejectedCandidates: candidates.flatMap((candidate, i) => selected.has(i) ? [] : [{
      afterWord: candidate.afterWord, frame: candidate.frame,
      reason: candidate.rejection ?? `unselected ${candidate.reason} boundary under timing and image budget constraints`,
    }]), imageBudget: storyboardImageBudget(imageCount, 2) };
}
