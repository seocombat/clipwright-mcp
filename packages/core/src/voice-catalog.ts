import { z } from "zod";

import { ELEVENLABS_TTS_MODELS, TTS_MODELS, VOICE_NAME_PATTERN } from "./voices.js";

/** Voice catalog languages: the ONLY list; everything else is derived from it. */
export const CATALOG_LANGUAGES = [
  "bg", "cs", "da", "de", "el", "en", "es", "fi", "fil", "fr", "hi", "hr", "hu", "id", "it", "ja",
  "ko", "ms", "nl", "no", "pl", "pt", "ro", "ru", "sk", "sv", "ta", "tr", "uk", "vi", "zh",
] as const;
export type CatalogLanguage = (typeof CATALOG_LANGUAGES)[number];

export const CATALOG_GENDERS = ["female", "male"] as const;
export type CatalogGender = (typeof CATALOG_GENDERS)[number];
export const CATALOG_VOICES_PER_GENDER = 5;

/** The vendor label as is: `null` and `""` stay distinct until read. */
const rawLabel = z.string().nullable();

/** An entry of the generated file; not to be confused with `voiceCatalogEntry`, the `/v1/voices` response. */
export const catalogFileVoice = z.strictObject({
  slug: z.string().regex(VOICE_NAME_PATTERN),
  language: z.enum(CATALOG_LANGUAGES),
  locale: rawLabel,
  accent: rawLabel,
  gender_raw: rawLabel,
  age_raw: rawLabel,
  use_case_raw: rawLabel,
  descriptive_raw: rawLabel,
  name: z.string().min(1),
  description: rawLabel,
  category: rawLabel,
  verified_models: z.array(z.enum(TTS_MODELS)),
  notice_period_days: z.number().int(),
  featured: z.boolean(),
  rank: z.number().int().positive(),
  retired_at: z.iso.datetime().optional(),
  refreshed_at: z.iso.datetime(),
});
export type CatalogFileVoice = z.infer<typeof catalogFileVoice>;

export const catalogShortfall = z.strictObject({
  female: z.number().int().positive().optional(),
  male: z.number().int().positive().optional(),
});

export const voiceCatalogFile = z.strictObject({
  shortfall: z.partialRecord(z.enum(CATALOG_LANGUAGES), catalogShortfall),
  voices: z.array(catalogFileVoice),
});
export type VoiceCatalogFile = z.infer<typeof voiceCatalogFile>;

export const ttsModelLanguagesFile = z.strictObject({
  models: z.array(z.strictObject({ id: z.enum(ELEVENLABS_TTS_MODELS), languages: z.array(z.string().min(1)) })),
});
export type TtsModelLanguagesFile = z.infer<typeof ttsModelLanguagesFile>;

/** `/v1/voices` filters: request parsing, the MCP `inputSchema` and SDK parameters. `age` and */
/** `use_case` labels come from catalog data, so the server knows their allowed set. */
export const voicesQueryShape = {
  language: z
    .enum(CATALOG_LANGUAGES)
    .optional()
    .describe(
      "Native language of the voice. A filter, not a limit: any voice speaks any supported language. " +
        "A voice with no language of its own (kind model_voice) matches the languages measured on its model",
    ),
  gender: z.enum(CATALOG_GENDERS).optional().describe("Gender label of the voice"),
  age: z
    .string()
    .min(1)
    .optional()
    .describe("Age label as list_voices prints it (young, middle_aged, old); an unknown value is refused with the allowed list"),
  use_case: z
    .string()
    .min(1)
    .optional()
    .describe("Use case label as list_voices prints it (narrative_story, social_media, …); an unknown value is refused with the allowed list"),
  model: z
    .enum(TTS_MODELS)
    .optional()
    .describe(
      "Only voices this speech model speaks: presets and catalog voices whose language it supports, " +
        "or the model's own voices (kind model_voice)",
    ),
};
export const voicesQuery = z.object(voicesQueryShape);
export type VoicesQuery = z.infer<typeof voicesQuery>;
export const VOICES_QUERY_FIELDS = Object.keys(voicesQueryShape) as (keyof VoicesQuery)[];

/** Label normalization on read: `middle-aged` → `middle_aged`, empty → no label. */
export function normalizeVoiceLabel(raw: string | null | undefined): string | undefined {
  const value = raw?.trim().toLowerCase().replaceAll("-", "_");
  return value === undefined || value === "" ? undefined : value;
}
