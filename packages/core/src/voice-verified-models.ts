import type { CatalogFileVoice } from "./voice-catalog.js";
import { VOICE_CATALOG } from "./voice-catalog-data.js";
import { TTS_MODELS } from "./voices.js";

export function verifiedVoiceModels(
  voices: readonly CatalogFileVoice[] = VOICE_CATALOG.voices,
): readonly (typeof TTS_MODELS)[number][] {
  return TTS_MODELS.filter((model) =>
    voices.some((voice) => voice.retired_at === undefined && voice.verified_models.includes(model)),
  );
}
