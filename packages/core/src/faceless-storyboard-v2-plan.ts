import { assertStoryboardWords } from "./faceless-storyboard.js";
import type { StoryboardV2FramePlan } from "./faceless-storyboard-v2-timing.js";
import type { WordTiming } from "./tts-backend.js";

const phases = ["setup", "development", "climax", "resolution"];
const reasons = ["action", "place", "reveal", "emphasis"];
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) throw new Error("invalid storyboard v2 object or unknown fields");
  return value as Record<string, unknown>;
}
function uint(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function label(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function score(value: unknown): void {
  const s = record(value, ["semanticValue", "cutCost", "pacePenalty", "net"]);
  if (!finite(s.semanticValue) || !finite(s.cutCost) || !finite(s.pacePenalty) ||
      typeof s.net !== "number" || !Number.isFinite(s.net) ||
      Math.abs(s.net - (s.semanticValue - s.cutCost - s.pacePenalty)) > 1e-8) throw new Error("invalid storyboard v2 score");
}

export function parseStoryboardV2Plan(input: unknown, words: readonly WordTiming[]): StoryboardV2FramePlan {
  const raw = record(input, ["version", "outputFrames", "script", "narrationStartFrame", "captionPhrases", "shots", "rejectedCandidates", "scoreBreakdown"]);
  if (raw.version !== "faceless_storyboard_61_v2" || raw.outputFrames !== 1522 || !label(raw.script) ||
      !uint(raw.narrationStartFrame) || raw.narrationStartFrame > 50 ||
      !Array.isArray(raw.shots) || raw.shots.length < 2 ||
      !Array.isArray(raw.captionPhrases) || !raw.captionPhrases.length || !Array.isArray(raw.rejectedCandidates)) {
    throw new Error("invalid storyboard v2 frame plan");
  }
  assertStoryboardWords(raw.script, words);
  if (raw.narrationStartFrame + words.at(-1)!.endSec * 25 > 1522 + 1e-9 ||
      1522 - raw.narrationStartFrame - words.at(-1)!.endSec * 25 > 12.5 + 1e-9) throw new Error("invalid storyboard v2 narration tail");
  let captionEnd = 0;
  for (const phrase of raw.captionPhrases) {
    const p = record(phrase, ["wordStart", "wordEnd", "accentWord"]);
    if (!uint(p.wordStart) || !uint(p.wordEnd) || !uint(p.accentWord) || p.wordStart !== captionEnd || p.wordStart >= p.wordEnd ||
        p.wordEnd > words.length || p.accentWord < p.wordStart || p.accentWord >= p.wordEnd) throw new Error("invalid storyboard v2 caption");
    captionEnd = p.wordEnd;
  }
  if (captionEnd !== words.length) throw new Error("incomplete storyboard v2 captions");
  const ids = new Set<string>();
  const beatIds = new Set<string>();
  let end = 0;
  let previousWord = -1;
  let previousPhase = -1;
  let semanticValue = 0, cutCost = 0, pacePenalty = 0, total = 0, cuts = 0;
  for (const [i, value] of raw.shots.entries()) {
    const shot = record(value, ["id", "mediaType", "startFrame", "endFrame", "beatIds", "phase", "mergedPhases", "motion", "panExceptionReason", "cutAfterWord", "cutReason", "score"]);
    if (!label(shot.id) || ids.has(shot.id)) throw new Error("duplicate or invalid storyboard v2 shot ID");
    ids.add(shot.id);
    if (!uint(shot.startFrame) || !uint(shot.endFrame) || shot.startFrame !== end || shot.endFrame > 1522 ||
        shot.endFrame - shot.startFrame < (i ? 25 : 50) || shot.endFrame - shot.startFrame > (i ? 150 : 125) ||
        shot.mediaType !== (i ? "image" : "video") || (i ? !(typeof shot.motion === "string" && ["PAN_UP", "PAN_DOWN"].includes(shot.motion)) : shot.motion !== undefined) ||
        !Array.isArray(shot.beatIds) || !shot.beatIds.length || !shot.beatIds.every(label) ||
        !(typeof shot.phase === "string" && phases.includes(shot.phase)) || phases.indexOf(shot.phase as string) < previousPhase ||
        (shot.mergedPhases !== undefined && (!Array.isArray(shot.mergedPhases) || !shot.mergedPhases.length || !shot.mergedPhases.every(p => phases.includes(p)))) ||
        (shot.panExceptionReason !== undefined && (!i || !label(shot.panExceptionReason)))) throw new Error("invalid storyboard v2 shot coverage, duration, or fields");
    for (const beat of shot.beatIds as string[]) {
      if (beatIds.has(beat)) throw new Error("duplicate storyboard v2 beat ID");
      beatIds.add(beat);
    }
    previousPhase = phases.indexOf(shot.phase as string);
    end = shot.endFrame;
    score(shot.score);
    const s = shot.score as StoryboardV2FramePlan["shots"][number]["score"];
    semanticValue += s.semanticValue; cutCost += s.cutCost; pacePenalty += s.pacePenalty; total += s.net;
    if (i < raw.shots.length - 1) {
      if (!uint(shot.cutAfterWord) || shot.cutAfterWord <= previousWord || shot.cutAfterWord >= words.length - 1 ||
          !(typeof shot.cutReason === "string" && reasons.includes(shot.cutReason))) throw new Error("invalid storyboard v2 cut word or reason");
      const previous = words[shot.cutAfterWord]!;
      const next = words[shot.cutAfterWord + 1]!;
      const edgeSec = next.startSec > previous.endSec ? (previous.endSec + next.startSec) / 2 : next.startSec;
      const frame = raw.narrationStartFrame + Math.round(edgeSec * 25);
      const sec = (shot.endFrame - raw.narrationStartFrame) / 25;
      if (shot.endFrame !== frame || words.some(w => sec - w.startSec > 1 / 25 + 1e-9 && w.endSec - sec > 1 / 25 + 1e-9)) {
        throw new Error("storyboard v2 cut lies mid-word or differs from measured boundary");
      }
      previousWord = shot.cutAfterWord; cuts++;
    } else if (shot.cutAfterWord !== undefined || shot.cutReason !== undefined) throw new Error("final storyboard v2 shot cannot end in a cut");
  }
  if (end !== 1522) throw new Error("incomplete storyboard v2 output coverage");
  for (const value of raw.rejectedCandidates) {
    const candidate = record(value, ["afterWord", "frame", "beatId", "reason", "semanticValue", "cutCost", "pacePenalty", "net"]);
    if (!uint(candidate.afterWord) || candidate.afterWord >= words.length - 1 || !uint(candidate.frame) || candidate.frame > 1522 ||
        !label(candidate.beatId) || !label(candidate.reason) || !finite(candidate.semanticValue) || !finite(candidate.cutCost) ||
        (candidate.pacePenalty !== null && !finite(candidate.pacePenalty)) ||
        (candidate.net !== null && (typeof candidate.net !== "number" || !Number.isFinite(candidate.net))) ||
        ((candidate.pacePenalty === null) !== (candidate.net === null))) throw new Error("invalid storyboard v2 rejected candidate");
  }
  const summary = record(raw.scoreBreakdown, ["semanticValue", "cutCost", "pacePenalty", "total", "cuts"]);
  if (!finite(summary.semanticValue) || !finite(summary.cutCost) || !finite(summary.pacePenalty) ||
      typeof summary.total !== "number" || !Number.isFinite(summary.total) || !uint(summary.cuts) ||
      Math.abs(summary.semanticValue - semanticValue) > 1e-8 || Math.abs(summary.cutCost - cutCost) > 1e-8 ||
      Math.abs(summary.pacePenalty - pacePenalty) > 1e-8 || Math.abs(summary.total - total) > 1e-8 || summary.cuts !== cuts) {
    throw new Error("invalid storyboard v2 score breakdown");
  }
  return raw as StoryboardV2FramePlan;
}
