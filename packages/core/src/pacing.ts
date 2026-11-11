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

/** A language whose words are longer than English ones is paced by characters, not words: a Turkish word is a fifth longer, so words/s ran */
/** its takes short. Delivered takes of Latin script read at 15.48 characters/s untrimmed (46 takes, median) and 16.95 trimmed (8). */
export const ESTIMATE_CHARS_PER_SECOND_LATIN = 15.5;
/** A take cut with pause_trim reads 9% faster: 16.95 against 15.48 characters/s. */
export const PAUSE_TRIM_PACE_FACTOR = 1.09;
/** The pace of a language against English, from the catalog sample of each (one sentence read by 10 voices, median characters/s over English's 15.1). */
export const LATIN_LANGUAGE_PACE: Readonly<Record<string, number>> = {
  cs: 0.82, da: 0.97, de: 0.93, es: 0.91, fi: 0.89, fil: 0.8, fr: 1.08, hr: 0.87, hu: 0.93, id: 0.86, it: 1, ms: 0.92, nl: 1.01,
  no: 0.91, pl: 0.9, pt: 0.92, ro: 0.84, sk: 0.9, sv: 0.91, tr: 0.86, vi: 1.05,
};

/** What a make_ugc quote knows about the take: the named voice (catalog names start with their language, `tr_male_…`) and a pause_trim. */
export type SpeechPace = { voice?: string | undefined; pauseTrim?: boolean };

/** The catalog language of a voice named in a pace and measured in LATIN_LANGUAGE_PACE; English and unknown voices have none. */
const measuredLanguageOf = (voice: string | undefined): string | undefined => {
  const language = voice === undefined ? undefined : /^([a-z]{2,3})_/.exec(voice)?.[1];
  return language !== undefined && Object.hasOwn(LATIN_LANGUAGE_PACE, language) ? language : undefined;
};

/** An ESTIMATE from the script's pace, not a fact: the charge follows the measured duration. Given `pace`, a take cut with pause_trim */
/** reads 9% faster and Latin script in a language measured above is timed by characters; any other take is timed by words as before. */
export function estimateDurationSec(script: string, model?: TtsModelId, pace?: SpeechPace): number {
  const trim = pace?.pauseTrim ? PAUSE_TRIM_PACE_FACTOR : 1;
  const language = measuredLanguageOf(pace?.voice);
  if (language !== undefined && detectScriptFamily(script) === "latin") {
    return Math.max(1, Math.round(Array.from(script.replace(/\s+/g, " ").trim()).length / (ESTIMATE_CHARS_PER_SECOND_LATIN * LATIN_LANGUAGE_PACE[language]! * trim)));
  }
  return Math.max(1, Math.round(countWords(script) / (estimateWordsPerSecond(script, model) * trim)));
}
