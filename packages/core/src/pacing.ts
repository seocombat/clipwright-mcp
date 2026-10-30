import { detectScriptFamily, GOOGLE_TTS_MODEL, type TtsModelId } from "./voices.js";

/** Speech pacing: 2–4 words per second. */
export const WORDS_PER_SECOND_MIN = 2;
export const WORDS_PER_SECOND_MAX = 4;

export function countWords(script: string): number {
  return script.trim().split(/\s+/).filter(Boolean).length;
}

/** Average pace for duration ESTIMATES: two live ElevenLabs renders (Sarah), 74 words → 27.1 s and 32 words → 13.07 s. */
/** The earlier 3 words/s missed by −18.9% against the ±15% gate. */
export const ESTIMATE_WORDS_PER_SECOND = 2.6;

/** Russian on eleven_v3 reads slower: 153 words in 66.13 s, 2.31 words/s (#164). */
/** The speech-duration floor uses ESTIMATE_WORDS_PER_SECOND; only a measurement may raise it. */
export const ESTIMATE_WORDS_PER_SECOND_CYRILLIC = 2.3;

/** Cyrillic on eleven_v4: 153 words in 70.32 s, one take at Stability 0.5 (#452). */
export const ESTIMATE_WORDS_PER_SECOND_CYRILLIC_V4 = 2.18;

/** Cyrillic on gemini-3.8-flash-tts: 153 words in 71.04 s and 65.68 s, mean 2.24, rounded down (#453). */
export const ESTIMATE_WORDS_PER_SECOND_CYRILLIC_GOOGLE = 2.2;

/** Cyrillic pace for models with their own measurement; any other model reads at the script family's pace. */
const CYRILLIC_WORDS_PER_SECOND_BY_MODEL: Partial<Record<TtsModelId, number>> = {
  eleven_v4: ESTIMATE_WORDS_PER_SECOND_CYRILLIC_V4,
  [GOOGLE_TTS_MODEL]: ESTIMATE_WORDS_PER_SECOND_CYRILLIC_GOOGLE,
};

/** Only make_ugc admission names the model; without it the script family alone sets the pace. */
export function estimateWordsPerSecond(script: string, model?: TtsModelId): number {
  if (detectScriptFamily(script) !== "cyrillic") return ESTIMATE_WORDS_PER_SECOND;
  const measured =
    model !== undefined && Object.hasOwn(CYRILLIC_WORDS_PER_SECOND_BY_MODEL, model)
      ? CYRILLIC_WORDS_PER_SECOND_BY_MODEL[model]
      : undefined;
  return measured ?? ESTIMATE_WORDS_PER_SECOND_CYRILLIC;
}

/** An ESTIMATE from the script's pace, not a fact: the charge follows the measured duration. */
export function estimateDurationSec(script: string, model?: TtsModelId): number {
  const words = countWords(script);
  return Math.max(1, Math.round(words / estimateWordsPerSecond(script, model)));
}
