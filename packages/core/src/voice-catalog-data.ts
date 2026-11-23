import catalogJson from "./voice-catalog.generated.json" with { type: "json" };
import modelsJson from "./tts-model-languages.generated.json" with { type: "json" };
import { ttsModelLanguagesFile, voiceCatalogFile } from "./voice-catalog.js";

export const VOICE_CATALOG = voiceCatalogFile.parse(catalogJson);
export const TTS_MODEL_LANGUAGES = ttsModelLanguagesFile.parse(modelsJson);
