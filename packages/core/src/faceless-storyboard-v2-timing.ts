import { assertStoryboardWords } from "./faceless-storyboard.js";
import { parseStoryboardV2, type StoryboardV2Proposal } from "./faceless-storyboard-v2.js";
import type { CutStyleProfile } from "./faceless-cut-style.js";
import type { WordTiming } from "./tts-backend.js";

type Phase = StoryboardV2Proposal["beats"][number]["phase"];
type Score = { semanticValue: number; cutCost: number; pacePenalty: number; net: number };
type Candidate = { beatIndex: number; afterWord: number; frame: number; reason: string; invalidReason?: string };
type State = { total: number; semantic: number; cutCost: number; pacePenalty: number; cuts: number; path: number[]; previous: number; edge: Score };

export type StoryboardV2FramePlan = {
  version: "faceless_storyboard_61_v2";
  outputFrames: 1522;
  script: string;
  captionPhrases: StoryboardV2Proposal["captionPhrases"];
  narrationStartFrame: number;
  shots: Array<{
    id: string; mediaType: "video" | "image"; startFrame: number; endFrame: number;
    beatIds: string[]; phase: Phase; mergedPhases?: Phase[];
    motion?: "PAN_UP" | "PAN_DOWN"; panExceptionReason?: string;
    cutAfterWord?: number; cutReason?: string; score: Score;
  }>;
  /** Rejected scores are local incoming-edge estimates, not alternate complete-path scores.
   * Null pacePenalty/net means no feasible incoming edge was reachable. */
  rejectedCandidates: Array<{ afterWord: number; frame: number; beatId: string; reason: string; semanticValue: number; cutCost: number; pacePenalty: number | null; net: number | null }>;
  scoreBreakdown: { semanticValue: number; cutCost: number; pacePenalty: number; total: number; cuts: number };
};

const semantic = { place: 4, reveal: 4, action: 3, emphasis: 1 } as const;
const CUT_COST = 2;
const OUTPUT_FRAMES = 1522;
const FPS = 25;

function better(a: State, b: State | undefined): boolean {
  if (!b) return true;
  if (Math.abs(a.total - b.total) > 1e-9) return a.total > b.total;
  if (a.cuts !== b.cuts) return a.cuts < b.cuts;
  for (let i = 0; i < a.path.length; i++) {
    if (a.path[i] !== b.path[i]) return a.path[i]! < b.path[i]!;
  }
  return false;
}

export function planStoryboardV2(
  input: StoryboardV2Proposal,
  words: readonly WordTiming[],
  narrationStartFrame: number,
  style: CutStyleProfile,
): StoryboardV2FramePlan {
  const proposal = parseStoryboardV2(input);
  assertStoryboardWords(proposal.script, words);
  if (!Number.isSafeInteger(narrationStartFrame) || narrationStartFrame < 0 || narrationStartFrame > 50) {
    throw new Error("invalid narration start frame");
  }
  const speechEndFrame = narrationStartFrame + words.at(-1)!.endSec * FPS;
  if (speechEndFrame > OUTPUT_FRAMES + 1e-9) throw new Error("narration exceeds output duration");
  if (OUTPUT_FRAMES - speechEndFrame > 12.5 + 1e-9) throw new Error("narration leaves more than 0.5 seconds tail");

  const candidates: Candidate[] = proposal.beats.slice(1).map((beat, i) => {
    const afterWord = beat.wordStart - 1;
    const previous = words[afterWord]!;
    const next = words[afterWord + 1]!;
    const edgeSec = next.startSec > previous.endSec ? (previous.endSec + next.startSec) / 2 : next.startSec;
    const frame = narrationStartFrame + Math.round(edgeSec * FPS);
    const time = (frame - narrationStartFrame) / FPS;
    const inside = words.some(w => time - w.startSec > 1 / FPS + 1e-9 && w.endSec - time > 1 / FPS + 1e-9);
    return { beatIndex: i + 1, afterWord, frame, reason: beat.reason,
      ...(frame <= 0 || frame >= OUTPUT_FRAMES ? { invalidReason: "candidate lies outside output frames" } : {}),
      ...(inside ? { invalidReason: "candidate lies more than one frame inside a timed word" } : {}) };
  });
  const opener = candidates[0]!;
  if (opener.invalidReason || opener.frame < 50 || opener.frame > 125) {
    throw new Error(`no feasible storyboard: mandatory VIDEO boundary violates timing${opener.invalidReason ? ` (${opener.invalidReason})` : ""}`);
  }
  const nodes: Candidate[] = [...candidates, { beatIndex: proposal.beats.length, afterWord: words.length - 1, frame: OUTPUT_FRAMES, reason: "output end" }];
  const final = nodes.length - 1;
  const states: Array<State | undefined> = Array(nodes.length);
  const openerValue = semantic[proposal.beats[1]!.reason];
  states[0] = { total: openerValue - CUT_COST, semantic: openerValue, cutCost: CUT_COST, pacePenalty: 0,
    cuts: 1, path: [0], previous: -1, edge: { semanticValue: openerValue, cutCost: CUT_COST, pacePenalty: 0, net: openerValue - CUT_COST } };

  function pacePenalty(start: number, end: number): number {
    const phase = proposal.beats[nodes[start]!.beatIndex]!.phase;
    const phaseRange = style.pacing.by_phase[phase];
    const range = phaseRange && phaseRange.n > 0 ? phaseRange : style.pacing.global_image_frames;
    const duration = nodes[end]!.frame - nodes[start]!.frame;
    const distance = duration < range.p25! ? range.p25! - duration : duration > range.p75! ? duration - range.p75! : 0;
    return 0.25 * distance / 25;
  }

  for (let end = 1; end <= final; end++) {
    const destination = nodes[end]!;
    if (destination.invalidReason) continue;
    const value = end === final ? 0 : semantic[proposal.beats[destination.beatIndex]!.reason];
    const cost = end === final ? 0 : CUT_COST;
    for (let start = 0; start < end; start++) {
      const prior = states[start];
      if (!prior) continue;
      const duration = destination.frame - nodes[start]!.frame;
      if (duration < 25 || duration > 150) continue;
      const penalty = pacePenalty(start, end);
      const edge = { semanticValue: value, cutCost: cost, pacePenalty: penalty, net: value - cost - penalty };
      const next: State = { total: prior.total + edge.net, semantic: prior.semantic + value,
        cutCost: prior.cutCost + cost, pacePenalty: prior.pacePenalty + penalty,
        cuts: prior.cuts + (end === final ? 0 : 1), path: [...prior.path, end], previous: start, edge };
      if (better(next, states[end])) states[end] = next;
    }
  }
  const best = states[final];
  if (!best) throw new Error("no feasible storyboard within VIDEO and IMAGE duration bounds");
  const selected = new Set(best.path);
  const shots: StoryboardV2FramePlan["shots"] = [];
  let startFrame = 0;
  let beatStart = 0;
  for (const [shotIndex, nodeIndex] of best.path.entries()) {
    const node = nodes[nodeIndex]!;
    const current = states[nodeIndex]!;
    const included = proposal.beats.slice(beatStart, node.beatIndex);
    const phases = [...new Set(included.map(b => b.phase))];
    const holdMotion = style.motion.pan_transition_n > 0 && style.motion.pan_flip_probability !== null && style.motion.pan_flip_probability < 0.5;
    const motion = shotIndex === 0 ? undefined : holdMotion ? "PAN_UP" : shotIndex % 2 === 1 ? "PAN_UP" : "PAN_DOWN";
    shots.push({ id: included[0]!.id, mediaType: shotIndex === 0 ? "video" : "image", startFrame, endFrame: node.frame,
      beatIds: included.map(b => b.id), phase: included[0]!.phase,
      ...(phases.length > 1 ? { mergedPhases: phases } : {}),
      ...(motion ? { motion } : {}),
      ...(holdMotion && shotIndex > 1 ? { panExceptionReason: "style profile favors holding PAN direction" } : {}),
      ...(nodeIndex < final ? { cutAfterWord: node.afterWord, cutReason: node.reason } : {}),
      score: current.edge });
    startFrame = node.frame;
    beatStart = node.beatIndex;
  }
  const rejectedCandidates = candidates.flatMap((candidate, index) => {
    if (selected.has(index)) return [];
    let possiblePenalty: number | null = null;
    if (!candidate.invalidReason) {
      for (let start = 0; start < index; start++) {
        if (!states[start]) continue;
        const duration = candidate.frame - nodes[start]!.frame;
        if (duration < 25 || duration > 150) continue;
        const penalty = pacePenalty(start, index);
        possiblePenalty = possiblePenalty === null ? penalty : Math.min(possiblePenalty, penalty);
      }
    }
    const value = semantic[proposal.beats[candidate.beatIndex]!.reason];
    const reason = candidate.invalidReason ?? (possiblePenalty === null
      ? "no reachable preceding IMAGE shot within 25–150 frames"
      : value < CUT_COST ? "semantic value does not cover fixed cut cost"
      : "lower total path score or deterministic tie break after IMAGE duration and pace costs");
    return [{ afterWord: candidate.afterWord, frame: candidate.frame, beatId: proposal.beats[candidate.beatIndex]!.id,
      reason, semanticValue: value, cutCost: CUT_COST, pacePenalty: possiblePenalty,
      net: possiblePenalty === null ? null : value - CUT_COST - possiblePenalty }];
  });
  return { version: proposal.version, outputFrames: OUTPUT_FRAMES, script: proposal.script,
    captionPhrases: proposal.captionPhrases, narrationStartFrame, shots, rejectedCandidates,
    scoreBreakdown: { semanticValue: best.semantic, cutCost: best.cutCost,
      pacePenalty: best.pacePenalty, total: best.total, cuts: best.cuts } };
}
