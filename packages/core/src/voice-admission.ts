import { z } from "zod";

import { serverUgcInputWith } from "./skills.js";
import type { Gender } from "./default-actor.js";
import { makeFacelessInput } from "./faceless-public.js";
import { isFacelessVoiceName } from "./faceless-voices.js";
import { filmVoiceInput } from "./own-agent-runs.js";
import { normalizeVoiceLabel, type CatalogFileVoice } from "./voice-catalog.js";
import { VOICE_CATALOG } from "./voice-catalog-data.js";
import { verifiedVoiceModels } from "./voice-verified-models.js";
import {
  isModelVoiceName,
  isVoicePresetName,
  MODEL_VOICES,
  resolveTtsModel,
  voicePresetOf,
  withPublishedPresetsOnly,
  type ModelVoice,
  type TtsModelId,
} from "./voices.js";

export function catalogVoiceRefusal(
  voice: string,
  voices: readonly CatalogFileVoice[] = VOICE_CATALOG.voices,
  options: { serviceVoices?: boolean } = {},
): string | undefined {
  if (isVoicePresetName(voice) || isModelVoiceName(voice)) return undefined;
  if (options.serviceVoices === true && voicePresetOf(voice) !== undefined) return undefined;
  if (isFacelessVoiceName(voice)) {
    return (
      `voice "${voice}" is a make_faceless voice and make_ugc does not speak it: ` +
      "choose a voice from list_voices with skill=make_ugc, or omit voice for the default voice"
    );
  }
  const entry = voices.find((item) => item.slug === voice);
  if (entry === undefined) {
    return `unknown voice "${voice}": call list_voices for the voice names this API accepts`;
  }
  if (entry.retired_at !== undefined) {
    return (
      `voice "${voice}" was retired from the catalog on ${entry.retired_at.slice(0, 10)} ` +
      "and is no longer accepted; call list_voices to choose another voice"
    );
  }
  return undefined;
}

export const serverUgcInput = serverUgcInputWith((voice) => catalogVoiceRefusal(voice));

export function inPresetView<T extends z.ZodType>(schema: T, view: "published" | "all") {
  return z.unknown().transform((raw, context): z.output<T> => {
    const parsed = view === "published" ? withPublishedPresetsOnly(() => schema.safeParse(raw)) : schema.safeParse(raw);
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues) context.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: issue.path });
    return z.NEVER;
  });
}

export function facelessVoiceRefusal(
  voice: string,
  voices: readonly CatalogFileVoice[] = VOICE_CATALOG.voices,
): string | undefined {
  if (isFacelessVoiceName(voice)) return undefined;
  if (isVoicePresetName(voice) || isModelVoiceName(voice) || voices.some((item) => item.slug === voice)) {
    return (
      `voice "${voice}" is a make_ugc voice and make_faceless does not speak it: ` +
      "choose a voice from list_voices with skill=make_faceless, or omit voice for the default voice"
    );
  }
  return `unknown voice "${voice}": call list_voices with skill=make_faceless for the voice names make_faceless accepts`;
}

export const serverFacelessInput = makeFacelessInput.refine(
  (input) => input.voice === undefined || facelessVoiceRefusal(input.voice) === undefined,
  { path: ["voice"], error: (issue) => facelessVoiceRefusal((issue.input as { voice: string }).voice)! },
);

export function filmVoiceRefusal(voice: string, options: { serviceVoices?: boolean } = {}): string | undefined {
  if (options.serviceVoices === true && !isVoicePresetName(voice) && voicePresetOf(voice) !== undefined) return undefined;
  return facelessVoiceRefusal(voice);
}

export function serverFilmVoiceInputWith(voiceRefusal: (voice: string) => string | undefined) {
  return filmVoiceInput.refine((input) => input.voice === undefined || voiceRefusal(input.voice) === undefined,
    { path: ["voice"], error: (issue) => voiceRefusal((issue.input as { voice: string }).voice)! });
}

export function voiceGenderOf(
  voice: string,
  voices: readonly CatalogFileVoice[] = VOICE_CATALOG.voices,
): Gender | undefined {
  const preset = voicePresetOf(voice);
  if (preset !== undefined) return preset.gender;
  if (isModelVoiceName(voice)) {
    const own: ModelVoice = MODEL_VOICES[voice];
    return own.gender;
  }
  const entry = voices.find((item) => item.slug === voice && item.retired_at === undefined);
  const label = normalizeVoiceLabel(entry?.gender_raw);
  return label === "female" || label === "male" ? label : undefined;
}

export function buildVoiceVerificationWarnings(
  input: { voice?: string | undefined; voice_id?: string | undefined; tts_model?: TtsModelId | undefined; script: string },
  gender?: Gender | undefined,
  voices: readonly CatalogFileVoice[] = VOICE_CATALOG.voices,
): string[] {
  const slug = input.voice;
  if (slug === undefined || voicePresetOf(slug) !== undefined) return [];
  const entry = voices.find((voice) => voice.slug === slug && voice.retired_at === undefined);
  if (entry === undefined) return [];

  const model = resolveTtsModel(input, gender);
  if (!verifiedVoiceModels(voices).includes(model)) return [];
  if (entry.verified_models.includes(model)) return [];

  const verified = entry.verified_models.join(", ");
  return [
    `voice "${slug}" is not among the voices the vendor verified for ${model}` +
      `${verified === "" ? "" : ` (it verified ${verified})`}; the run will still use ${model} as asked`,
  ];
}
