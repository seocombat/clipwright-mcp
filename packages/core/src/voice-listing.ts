import { z } from "zod";

import {
  CATALOG_LANGUAGES,
  normalizeVoiceLabel,
  VOICES_QUERY_FIELDS,
  voicesQueryShape,
  type CatalogFileVoice,
  type TtsModelLanguagesFile,
  type VoiceCatalogFile,
  type VoicesQuery,
} from "./voice-catalog.js";
import { TTS_MODEL_LANGUAGES, VOICE_CATALOG } from "./voice-catalog-data.js";
import { FACELESS_SPEECH_MODEL, FACELESS_VOICE_NAMES, FACELESS_VOICES } from "./faceless-voices.js";
import { measuredPaceOf, VOICE_PACE } from "./voice-pace.js";
import { verifiedVoiceModels } from "./voice-verified-models.js";
import {
  ELEVENLABS_TTS_MODELS,
  GOOGLE_TTS_MODEL,
  MODEL_VOICE_NAMES,
  MODEL_VOICES,
  resolveTtsModel,
  TTS_MODEL_CHAR_CAP,
  TTS_MODELS,
  VOICE_PRESETS,
  type VoiceCatalogEntry,
  type VoicePreset,
} from "./voices.js";

export { TTS_MODEL_LANGUAGES, VOICE_CATALOG } from "./voice-catalog-data.js";

const isLive = (voice: CatalogFileVoice): boolean => voice.retired_at === undefined;

export const MEASURED_MODEL_LANGUAGES: Readonly<Record<string, readonly string[]>> = {
  [GOOGLE_TTS_MODEL]: ["en", "ru"],
};

function labelValues(voices: readonly CatalogFileVoice[], raw: (voice: CatalogFileVoice) => string | null) {
  const values = voices.filter(isLive).map((voice) => normalizeVoiceLabel(raw(voice)));
  return [...new Set(values.filter((value) => value !== undefined))].sort() as [string, ...string[]];
}

export function serverVoicesQueryFor(voices: readonly CatalogFileVoice[] = VOICE_CATALOG.voices) {
  return z.object({
    ...voicesQueryShape,
    age: z.enum(labelValues(voices, (voice) => voice.age_raw)).optional(),
    use_case: z.enum(labelValues(voices, (voice) => voice.use_case_raw)).optional(),
  });
}
export const serverVoicesQuery = serverVoicesQueryFor();

const presentText = (raw: string | null): string | undefined => raw?.trim() || undefined;

export function listVoices(
  query: VoicesQuery,
  catalog: VoiceCatalogFile = VOICE_CATALOG,
  modelLanguages: TtsModelLanguagesFile = TTS_MODEL_LANGUAGES,
  servicePresets: Readonly<Record<string, VoicePreset>> = {},
): {
  voices: VoiceCatalogEntry[];
  models: { id: string; char_limit: number; languages: string[]; vendor_verifies_voices: boolean }[];
} {
  const languagesOf = (id: string): string[] =>
    modelLanguages.models.find((model) => model.id === id)?.languages ?? [...(MEASURED_MODEL_LANGUAGES[id] ?? [])];
  const supportedModels = (language: string) => ELEVENLABS_TTS_MODELS.filter((id) => languagesOf(id).includes(language));

  const presets: VoiceCatalogEntry[] = [...Object.entries(VOICE_PRESETS), ...Object.entries(servicePresets)].map(([name, { tempo: _tempo, ...preset }]: [string, VoicePreset]) => ({
    name,
    kind: "preset",
    skill: "make_ugc",
    ...preset,
    supported_models: supportedModels(preset.language),
  }));
  const modelVoices: VoiceCatalogEntry[] = MODEL_VOICE_NAMES.map((name) => {
    const model = resolveTtsModel({ voice: name, script: "" });
    return { name, kind: "model_voice", skill: "make_ugc", ...MODEL_VOICES[name], model, supported_models: [model] };
  });
  const facelessVoices: VoiceCatalogEntry[] = FACELESS_VOICE_NAMES.map((name) => ({
    name,
    kind: "faceless_voice",
    skill: "make_faceless",
    ...FACELESS_VOICES[name],
    model: FACELESS_SPEECH_MODEL,
    supported_models: [FACELESS_SPEECH_MODEL],
  }));
  const languageRank = (voice: CatalogFileVoice) => CATALOG_LANGUAGES.indexOf(voice.language);
  const catalogVoices: VoiceCatalogEntry[] = catalog.voices
    .filter(isLive)
    .sort((a, b) => languageRank(a) - languageRank(b) || a.rank - b.rank || (a.slug < b.slug ? -1 : 1))
    .map((voice) => ({
      name: voice.slug,
      kind: "catalog",
      skill: "make_ugc",
      language: voice.language,
      locale: presentText(voice.locale),
      accent: presentText(voice.accent),
      gender: normalizeVoiceLabel(voice.gender_raw),
      age: normalizeVoiceLabel(voice.age_raw),
      use_case: normalizeVoiceLabel(voice.use_case_raw),
      description: presentText(voice.description) ?? voice.name,
      model: resolveTtsModel({ voice: voice.slug, script: "" }),
      supported_models: supportedModels(voice.language),
      verified_models: voice.verified_models,
    }));

  const filters: VoicesQuery = { ...query, skill: query.skill ?? "make_ugc" };
  const matches = (entry: VoiceCatalogEntry): boolean =>
    VOICES_QUERY_FIELDS.every((field) => {
      const wanted = filters[field];
      if (wanted === undefined) return true;
      if (field === "model") return entry.supported_models?.includes(wanted) === true;
      if (field === "language" && entry.language === undefined) return languagesOf(entry.model).includes(wanted);
      return entry[field] === wanted;
    });

  const withPace = (entry: VoiceCatalogEntry): VoiceCatalogEntry => {
    const measured = entry.model === VOICE_PACE.model ? measuredPaceOf(entry.name) : undefined;
    return measured ? { ...entry, words_per_second: measured.words_per_second } : entry;
  };

  return {
    voices: [...presets, ...modelVoices, ...facelessVoices, ...catalogVoices].filter(matches).map(withPace),
    models: TTS_MODELS.map((id) => ({
      id,
      char_limit: TTS_MODEL_CHAR_CAP[id],
      languages: languagesOf(id),
      vendor_verifies_voices: verifiedVoiceModels(catalog.voices).includes(id),
    })),
  };
}
