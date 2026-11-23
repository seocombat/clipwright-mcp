export interface WordTiming {
  word: string;
  startSec: number;
  endSec: number;
}

export interface SpeechRequest {
  text: string;
  voiceId: string;
  modelId: string;
  runId: string;
  pace?: number;
}

export interface SpeechResult {
  audio: Uint8Array;
  mimeType: string;
  durationSec: number;
  words: WordTiming[] | null;
  warnings: string[];
}

export interface TtsCapabilities {
  maxChars: number | null;
  providesTimings: boolean;
  maxConcurrency: number | null;
}

export interface TtsBackend {
  readonly name: string;
  readonly capabilities: TtsCapabilities;
  synthesize(req: SpeechRequest): Promise<SpeechResult>;

  classifyRefusal(error: unknown): "account_standing" | "vendor" | "unknown";
}

export function charTimingsToWords(
  characters: readonly string[],
  startTimes: readonly number[],
  endTimes: readonly number[],
): WordTiming[] {
  if (characters.length !== startTimes.length || characters.length !== endTimes.length) {
    throw new Error(
      `character/timing length mismatch: ${characters.length} chars, ` +
        `${startTimes.length} starts, ${endTimes.length} ends`,
    );
  }

  const words: WordTiming[] = [];
  let buf = "";
  let start = 0;
  let end = 0;

  const flush = (): void => {
    if (buf.length > 0) {
      words.push({ word: buf, startSec: start, endSec: end });
      buf = "";
    }
  };

  for (let i = 0; i < characters.length; i += 1) {
    const ch = characters[i] as string;
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (buf.length === 0) {
      start = startTimes[i] as number;
    }
    buf += ch;
    end = endTimes[i] as number;
  }
  flush();

  return words;
}

export const ALIGNMENT_TAIL_TOLERANCE_SEC = 0.1;

export function clampAlignmentTail(words: readonly WordTiming[], durationSec: number):
  { words: WordTiming[]; clippedSec: number } | null {
  let clippedSec = 0;
  const clamped: WordTiming[] = [];
  for (const word of words) {
    if (word.endSec <= durationSec) { clamped.push({ ...word }); continue; }
    const overshoot = word.endSec - durationSec;
    if (!(word.startSec < durationSec) || overshoot > ALIGNMENT_TAIL_TOLERANCE_SEC + 1e-9) return null;
    clippedSec = Math.max(clippedSec, overshoot);
    clamped.push({ ...word, endSec: durationSec });
  }
  return { words: clamped, clippedSec };
}
