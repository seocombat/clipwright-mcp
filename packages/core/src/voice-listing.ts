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
import {
  resolveTtsModel,
  TTS_MODEL_CHAR_CAP,
  TTS_MODELS,
  VOICE_PRESETS,
  type VoiceCatalogEntry,
} from "./voices.js";

// A subpath, not the barrel: the list reads the catalog, which SDK clients do not need.
// A weekly worker probe checks the same data against the vendor.
export { TTS_MODEL_LANGUAGES, VOICE_CATALOG } from "./voice-catalog-data.js";

const isLive = (voice: CatalogFileVoice): boolean => voice.retired_at === undefined;

/** Models for which the vendor verifies ANY library voice at all. Derived from the */
/** catalog, not listed. */
export function vendorVerifiedModels(
  voices: readonly CatalogFileVoice[] = VOICE_CATALOG.voices,
): readonly (typeof TTS_MODELS)[number][] {
  return TTS_MODELS.filter((model) =>
    voices.some((voice) => isLive(voice) && voice.verified_models.includes(model)),
  );
}

function labelValues(voices: readonly CatalogFileVoice[], raw: (voice: CatalogFileVoice) => string | null) {
  const values = voices.filter(isLive).map((voice) => normalizeVoiceLabel(raw(voice)));
  return [...new Set(values.filter((value) => value !== undefined))].sort() as [string, ...string[]];
}

/** The server's `/v1/voices` query: an unfamiliar label is refused with the allowed list, not an empty result. */
export function serverVoicesQueryFor(voices: readonly CatalogFileVoice[] = VOICE_CATALOG.voices) {
  return z.object({
    ...voicesQueryShape,
    age: z.enum(labelValues(voices, (voice) => voice.age_raw)).optional(),
    use_case: z.enum(labelValues(voices, (voice) => voice.use_case_raw)).optional(),
  });
}
export const serverVoicesQuery = serverVoicesQueryFor();

const presentText = (raw: string | null): string | undefined => raw?.trim() || undefined;

/** Presets, then live catalog voices by language and rank; a field the voice lacks matches nothing. */
export function listVoices(
  query: VoicesQuery,
  catalog: VoiceCatalogFile = VOICE_CATALOG,
  modelLanguages: TtsModelLanguagesFile = TTS_MODEL_LANGUAGES,
): {
  voices: VoiceCatalogEntry[];
  models: { id: string; char_limit: number; languages: string[]; vendor_verifies_voices: boolean }[];
} {
  const languagesOf = (id: string): string[] => modelLanguages.models.find((model) => model.id === id)?.languages ?? [];
  const supportedModels = (language: string) => TTS_MODELS.filter((id) => languagesOf(id).includes(language));

  const presets: VoiceCatalogEntry[] = Object.entries(VOICE_PRESETS).map(([name, preset]) => ({
    name,
    kind: "preset",
    ...preset,
    supported_models: supportedModels(preset.language),
  }));
  const languageRank = (voice: CatalogFileVoice) => CATALOG_LANGUAGES.indexOf(voice.language);
  const catalogVoices: VoiceCatalogEntry[] = catalog.voices
    .filter(isLive)
    .sort((a, b) => languageRank(a) - languageRank(b) || a.rank - b.rank || (a.slug < b.slug ? -1 : 1))
    .map((voice) => ({
      name: voice.slug,
      kind: "catalog",
      language: voice.language,
      locale: presentText(voice.locale),
      accent: presentText(voice.accent),
      gender: normalizeVoiceLabel(voice.gender_raw),
      age: normalizeVoiceLabel(voice.age_raw),
      use_case: normalizeVoiceLabel(voice.use_case_raw),
      description: presentText(voice.description) ?? voice.name,
      model: resolveTtsModel({ voice: voice.slug }),
      supported_models: supportedModels(voice.language),
      verified_models: voice.verified_models,
    }));

  const matches = (entry: VoiceCatalogEntry): boolean =>
    VOICES_QUERY_FIELDS.every((field) => {
      const wanted = query[field];
      if (wanted === undefined) return true;
      if (field === "model") return entry.supported_models?.includes(wanted) === true;
      return entry[field] === wanted;
    });

  return {
    voices: [...presets, ...catalogVoices].filter(matches),
    models: TTS_MODELS.map((id) => ({
      id,
      char_limit: TTS_MODEL_CHAR_CAP[id],
      languages: languagesOf(id),
      vendor_verifies_voices: vendorVerifiedModels(catalog.voices).includes(id),
    })),
  };
}
