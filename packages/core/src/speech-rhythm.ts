import type { WordTiming } from "./tts-backend.js";

export interface SpeechRhythmMetrics {
  status: "available";
  durationSec: number;
  /** Time outside the union of word intervals, including leading/trailing gaps. */
  wordGapDurationSec: number;
  /** Uncovered duration divided by measured full duration; not acoustic silence. */
  wordGapFraction: number;
  leadingGapSec: number;
  trailingGapSec: number;
  /** One gap per adjacent pair; earlier overlapping words can cover that gap. */
  interWordGapsSec: number[];
  measuredSentenceGapCount: number;
  /** Seconds; null when no punctuation boundary has a following timed word. */
  sentenceGapMedianSec: number | null;
}

export type SpeechRhythmResult = SpeechRhythmMetrics | {
  status: "unavailable";
  reason: "missing_timings" | "invalid_duration" | "invalid_timings" | "unsupported_mode";
};

/** A punctuation heuristic, not linguistic sentence segmentation or pause detection. */
const SENTENCE_END = /[.!?…。！？][\s"'’”»›)\]}]*$/u;

export function measureSpeechRhythm(
  words: readonly WordTiming[] | null | undefined,
  durationSec: number,
): SpeechRhythmResult {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { status: "unavailable", reason: "invalid_duration" };
  }
  if (!words?.length) return { status: "unavailable", reason: "missing_timings" };
  let previousStart = -Infinity;
  for (const word of words) {
    if (!word || typeof word.word !== "string" || !word.word.trim() ||
        !Number.isFinite(word.startSec) || !Number.isFinite(word.endSec) ||
        word.startSec < 0 || word.endSec <= word.startSec ||
        word.endSec > durationSec || word.startSec < previousStart) {
      return { status: "unavailable", reason: "invalid_timings" };
    }
    previousStart = word.startSec;
  }

  const leadingGapSec = words[0]!.startSec;
  let coveredUntil = words[0]!.endSec;
  let wordGapDurationSec = leadingGapSec;
  const interWordGapsSec: number[] = [];
  const sentenceGaps: number[] = [];
  for (let index = 1; index < words.length; index++) {
    const current = words[index]!;
    const gap = Math.max(0, current.startSec - coveredUntil);
    interWordGapsSec.push(gap);
    wordGapDurationSec += gap;
    if (SENTENCE_END.test(words[index - 1]!.word)) sentenceGaps.push(gap);
    coveredUntil = Math.max(coveredUntil, current.endSec);
  }
  const trailingGapSec = durationSec - coveredUntil;
  wordGapDurationSec += trailingGapSec;
  sentenceGaps.sort((left, right) => left - right);
  const middle = Math.floor(sentenceGaps.length / 2);
  const sentenceGapMedianSec = sentenceGaps.length === 0 ? null
    : sentenceGaps.length % 2 ? sentenceGaps[middle]!
    : (sentenceGaps[middle - 1]! + sentenceGaps[middle]!) / 2;

  return {
    status: "available", durationSec, wordGapDurationSec,
    wordGapFraction: Math.min(1, wordGapDurationSec / durationSec),
    leadingGapSec, trailingGapSec, interWordGapsSec,
    measuredSentenceGapCount: sentenceGaps.length, sentenceGapMedianSec,
  };
}
