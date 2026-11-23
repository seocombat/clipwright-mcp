import { isEnglishScript, measuredPaceOf, VOICE_PACE } from "./voice-pace.js";
import { DEFAULT_TTS_MODEL, detectScriptFamily, GOOGLE_TTS_MODEL, type TtsModelId } from "./voices.js";

export const WORDS_PER_SECOND_MIN = 2;
export const WORDS_PER_SECOND_MAX = 4;

export function countWords(script: string): number {
  return script.trim().split(/\s+/).filter(Boolean).length;
}

export const ESTIMATE_WORDS_PER_SECOND = 2.6;

export const ESTIMATE_WORDS_PER_SECOND_CYRILLIC = 2.3;

export const ESTIMATE_WORDS_PER_SECOND_CYRILLIC_V4 = 2.18;

export const ESTIMATE_WORDS_PER_SECOND_CYRILLIC_GOOGLE = 2.2;

const CYRILLIC_WORDS_PER_SECOND_BY_MODEL: Partial<Record<TtsModelId, number>> = {
  eleven_v4: ESTIMATE_WORDS_PER_SECOND_CYRILLIC_V4,
  [GOOGLE_TTS_MODEL]: ESTIMATE_WORDS_PER_SECOND_CYRILLIC_GOOGLE,
};

export function estimateWordsPerSecond(script: string, model?: TtsModelId): number {
  if (detectScriptFamily(script) !== "cyrillic") return ESTIMATE_WORDS_PER_SECOND;
  const measured =
    model !== undefined && Object.hasOwn(CYRILLIC_WORDS_PER_SECOND_BY_MODEL, model)
      ? CYRILLIC_WORDS_PER_SECOND_BY_MODEL[model]
      : undefined;
  return measured ?? ESTIMATE_WORDS_PER_SECOND_CYRILLIC;
}

export const ESTIMATE_CHARS_PER_SECOND_LATIN = 15.5;
export const PAUSE_TRIM_PACE_FACTOR = 1.09;
export const LATIN_LANGUAGE_PACE: Readonly<Record<string, number>> = {
  cs: 0.82, da: 0.97, de: 0.93, es: 0.91, fi: 0.89, fil: 0.8, fr: 1.08, hr: 0.87, hu: 0.93, id: 0.86, it: 1, ms: 0.92, nl: 1.01,
  no: 0.91, pl: 0.9, pt: 0.92, ro: 0.84, sk: 0.9, sv: 0.91, tr: 0.86, vi: 1.05,
};

export type SpeechPace = { voice?: string | undefined; pauseTrim?: boolean };

const measuredLanguageOf = (voice: string | undefined): string | undefined => {
  const language = voice === undefined ? undefined : /^([a-z]{2,3})_/.exec(voice)?.[1];
  return language !== undefined && Object.hasOwn(LATIN_LANGUAGE_PACE, language) ? language : undefined;
};

export const MEASURED_VOICE_CHARS_PER_WORD = 5.77;
export const SENTENCE_BREAK_SEC = 0.62;

export function sentenceBreaks(script: string): number {
  const sentences = script.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, -1).filter(sentence => countWords(sentence) >= 2).length;
}

function measuredVoiceSec(script: string, model: TtsModelId | undefined, pace: SpeechPace | undefined): number | undefined {
  const measured = pace?.pauseTrim ? measuredPaceOf(pace.voice) : undefined;
  if (!measured || (model ?? DEFAULT_TTS_MODEL) !== VOICE_PACE.model || !isEnglishScript(script, detectScriptFamily(script) === "latin")) return undefined;
  const chars = Array.from(script.replace(/\s+/g, " ").trim()).length;
  return Math.max(1, Math.ceil(chars / (measured.words_per_second * MEASURED_VOICE_CHARS_PER_WORD) + SENTENCE_BREAK_SEC * sentenceBreaks(script) - 1e-9));
}

export function estimateDurationSec(script: string, model?: TtsModelId, pace?: SpeechPace): number {
  const voiced = measuredVoiceSec(script, model, pace);
  if (voiced !== undefined) return voiced;
  const trim = pace?.pauseTrim ? PAUSE_TRIM_PACE_FACTOR : 1;
  const language = measuredLanguageOf(pace?.voice);
  if (language !== undefined && detectScriptFamily(script) === "latin") {
    return Math.max(1, Math.round(Array.from(script.replace(/\s+/g, " ").trim()).length / (ESTIMATE_CHARS_PER_SECOND_LATIN * LATIN_LANGUAGE_PACE[language]! * trim)));
  }
  return Math.max(1, Math.round(countWords(script) / (estimateWordsPerSecond(script, model) * trim)));
}
