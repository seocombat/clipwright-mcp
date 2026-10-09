import { serverUgcInputWith } from "./skills.js";
import type { Gender } from "./default-actor.js";
import { makeFacelessInput } from "./faceless-public.js";
import { isFacelessVoiceName } from "./faceless-voices.js";
import { normalizeVoiceLabel, type CatalogFileVoice } from "./voice-catalog.js";
import { VOICE_CATALOG } from "./voice-catalog-data.js";
import { vendorVerifiedModels } from "./voice-listing.js";
import {
  isModelVoiceName,
  isVoicePresetName,
  MODEL_VOICES,
  resolveTtsModel,
  VOICE_PRESETS,
  type ModelVoice,
  type TtsModelId,
} from "./voices.js";

// A subpath, not the barrel: the catalog weighs hundreds of kilobytes and SDK clients do not need it.

/** Why the API refuses a voice name; `undefined` for a preset, a model's own voice or a live catalog voice. */
export function catalogVoiceRefusal(
  voice: string,
  voices: readonly CatalogFileVoice[] = VOICE_CATALOG.voices,
): string | undefined {
  if (isVoicePresetName(voice) || isModelVoiceName(voice)) return undefined;
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

/** Why `make_faceless` refuses a voice name; `undefined` for one of its own voices. */
/** A retired catalog slug still reads as a `make_ugc` voice: the name was never a faceless one. */
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

/** API input of `make_faceless`: the client schema checks the form of `voice`, the server its name. */
export const serverFacelessInput = makeFacelessInput.refine(
  (input) => input.voice === undefined || facelessVoiceRefusal(input.voice) === undefined,
  { path: ["voice"], error: (issue) => facelessVoiceRefusal((issue.input as { voice: string }).voice)! },
);

/** Voice gender by name: our fact for a preset, the vendor label for a catalog voice. */
/** A raw `voice_id` has no gender, so `undefined`, not a guess. */
export function voiceGenderOf(
  voice: string,
  voices: readonly CatalogFileVoice[] = VOICE_CATALOG.voices,
): Gender | undefined {
  if (isVoicePresetName(voice)) return VOICE_PRESETS[voice].gender;
  if (isModelVoiceName(voice)) {
    const own: ModelVoice = MODEL_VOICES[voice];
    return own.gender;
  }
  const entry = voices.find((item) => item.slug === voice && item.retired_at === undefined);
  const label = normalizeVoiceLabel(entry?.gender_raw);
  return label === "female" || label === "male" ? label : undefined;
}

/** Warns only where MISSING verification means something: for `eleven_v3` no voice */
/** has it at all. */
export function buildVoiceVerificationWarnings(
  input: { voice?: string | undefined; voice_id?: string | undefined; tts_model?: TtsModelId | undefined; script: string },
  gender?: Gender | undefined,
  voices: readonly CatalogFileVoice[] = VOICE_CATALOG.voices,
): string[] {
  const slug = input.voice;
  if (slug === undefined || isVoicePresetName(slug)) return [];
  const entry = voices.find((voice) => voice.slug === slug && voice.retired_at === undefined);
  if (entry === undefined) return [];

  const model = resolveTtsModel(input, gender);
  if (!vendorVerifiedModels(voices).includes(model)) return [];
  if (entry.verified_models.includes(model)) return [];

  const verified = entry.verified_models.join(", ");
  return [
    `voice "${slug}" is not among the voices the vendor verified for ${model}` +
      `${verified === "" ? "" : ` (it verified ${verified})`}; the run will still use ${model} as asked`,
  ];
}
