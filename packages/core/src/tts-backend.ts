import type { VendorRefusalClass } from "./vendor-response.js";

// Vendor-neutral speech synthesis contract, apart from rendering since TTS and avatar vendors
// change independently. Adapters normalize timings to words so vendor formats never leak.

/** Timing of one word: the unit the caption pipeline thinks in. */
export interface WordTiming {
  word: string;
  startSec: number;
  endSec: number;
}

export interface SpeechRequest {
  text: string;
  /** Voice id in backend terms. Mapping our presets is the adapter's job. */
  voiceId: string;
  modelId: string;
  /** Our run_id, for idempotency and vendor-side tracing. */
  runId: string;
  pace?: number;
}

export interface SpeechResult {
  audio: Uint8Array;
  mimeType: string;
  durationSec: number;
  /** Word timings, even when the vendor gives per-character ones: aggregating is the */
  /** adapter's job. `null` means the backend gives none, visible in the type. */
  words: WordTiming[] | null;
}

export interface TtsCapabilities {
  /** Upper bound across models; the adapter checks the chosen model's limit. null: unknown. */
  maxChars: number | null;
  /** Whether it provides timings at all. */
  providesTimings: boolean;
  /** How many requests may run in parallel; depends on the vendor plan and binds before */
  /** render limits on multi-take runs. */
  maxConcurrency: number | null;
}

export interface TtsBackend {
  readonly name: string;
  readonly capabilities: TtsCapabilities;
  synthesize(req: SpeechRequest): Promise<SpeechResult>;

  /** The same required member as on `RenderBackend`: there are two contracts, and a */
  /** speech vendor implements THIS one. */
  classifyRefusal(error: unknown): VendorRefusalClass;
}

/** Joins per-character timings into words, shared by vendors with that format. Whitespace */
/** ends a word without joining it; empty words are never produced. */
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
