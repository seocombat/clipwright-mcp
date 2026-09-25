import { serverUgcInputWith } from "./skills.js";
import type { Gender } from "./default-actor.js";
import { normalizeVoiceLabel, type CatalogFileVoice } from "./voice-catalog.js";
import { VOICE_CATALOG } from "./voice-catalog-data.js";
import { vendorVerifiedModels } from "./voice-listing.js";
import { isVoicePresetName, resolveTtsModel, VOICE_PRESETS, type TtsModelId } from "./voices.js";

// A subpath, not the barrel: the catalog weighs hundreds of kilobytes and SDK clients do not need it.

/** Why the API refuses a voice name; `undefined` for a preset or a live catalog voice. */
export function catalogVoiceRefusal(
  voice: string,
  voices: readonly CatalogFileVoice[] = VOICE_CATALOG.voices,
): string | undefined {
  if (isVoicePresetName(voice)) return undefined;
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

/** Voice gender by name: our fact for a preset, the vendor label for a catalog voice. */
/** A raw `voice_id` has no gender, so `undefined`, not a guess. */
export function voiceGenderOf(
  voice: string,
  voices: readonly CatalogFileVoice[] = VOICE_CATALOG.voices,
): Gender | undefined {
  if (isVoicePresetName(voice)) return VOICE_PRESETS[voice].gender;
  const entry = voices.find((item) => item.slug === voice && item.retired_at === undefined);
  const label = normalizeVoiceLabel(entry?.gender_raw);
  return label === "female" || label === "male" ? label : undefined;
}

/** Warns only where MISSING verification means something: for `eleven_v3` no voice */
/** has it at all. */
export function buildVoiceVerificationWarnings(
  input: { voice?: string | undefined; voice_id?: string | undefined; tts_model?: TtsModelId | undefined },
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
