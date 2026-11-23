import { z } from "zod";
import type { Gender } from "./default-actor.js";

export const TTS_MODELS = ["eleven_v3", "eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_v4", "gemini-3.8-flash-tts"] as const;
export type TtsModelId = (typeof TTS_MODELS)[number];
export const DEFAULT_TTS_MODEL: TtsModelId = "eleven_v4";
export const RUSSIAN_TTS_MODEL = "eleven_v4" satisfies TtsModelId;
export const RETIRED_TTS_MODELS: Readonly<Partial<Record<TtsModelId, TtsModelId>>> = { eleven_v3: DEFAULT_TTS_MODEL };

export const GOOGLE_TTS_MODEL = "gemini-3.8-flash-tts" satisfies TtsModelId;

export type SpeechBackendName = "elevenlabs" | "google";
export const TTS_MODEL_BACKEND = {
  eleven_v3: "elevenlabs",
  eleven_flash_v2_5: "elevenlabs",
  eleven_turbo_v2_5: "elevenlabs",
  eleven_v4: "elevenlabs",
  "gemini-3.8-flash-tts": "google",
} as const satisfies Record<TtsModelId, SpeechBackendName>;

export type ElevenLabsModelId = {
  [Model in TtsModelId]: (typeof TTS_MODEL_BACKEND)[Model] extends "elevenlabs" ? Model : never;
}[TtsModelId];
export const ELEVENLABS_TTS_MODELS = TTS_MODELS.filter(
  (model): model is ElevenLabsModelId => TTS_MODEL_BACKEND[model] === "elevenlabs",
);

export function speechBackendOf(modelId: string): SpeechBackendName | undefined {
  const model = TTS_MODELS.find((known) => known === modelId);
  return model === undefined ? undefined : TTS_MODEL_BACKEND[model];
}

export const TTS_MODEL_CHAR_CAP: Readonly<Record<TtsModelId, number>> = {
  eleven_v3: 5_000,
  eleven_flash_v2_5: 10_000,
  eleven_turbo_v2_5: 10_000,
  eleven_v4: 5_000,
  "gemini-3.8-flash-tts": 5_000,
};

interface SpeechTextTraits {
  readsStressMarks: boolean;
  pausesOnBreakTags: boolean;
  hasSpeedSetting: boolean;
}
export const TTS_MODEL_TEXT_TRAITS: Readonly<Record<TtsModelId, SpeechTextTraits>> = {
  eleven_v3: { readsStressMarks: true, pausesOnBreakTags: true, hasSpeedSetting: true },
  eleven_flash_v2_5: { readsStressMarks: false, pausesOnBreakTags: true, hasSpeedSetting: true },
  eleven_turbo_v2_5: { readsStressMarks: false, pausesOnBreakTags: true, hasSpeedSetting: true },
  eleven_v4: { readsStressMarks: true, pausesOnBreakTags: false, hasSpeedSetting: false },
  "gemini-3.8-flash-tts": { readsStressMarks: true, pausesOnBreakTags: false, hasSpeedSetting: false },
};
const modelsWhere = (holds: (traits: SpeechTextTraits) => boolean): ReadonlySet<TtsModelId> =>
  new Set(TTS_MODELS.filter((model) => holds(TTS_MODEL_TEXT_TRAITS[model])));

export const STRESS_MARK = String.fromCharCode(0x0301);
export const STRESS_MARK_MODELS: ReadonlySet<TtsModelId> = modelsWhere((traits) => traits.readsStressMarks);
const listed = (names: readonly string[]): string => names.join(", ").replace(/, ([^,]+)$/, " and $1");
const STRESS_MARK_READERS = listed([...STRESS_MARK_MODELS].filter((model) => RETIRED_TTS_MODELS[model] === undefined));

export const FIXED_PACE_MODELS: ReadonlySet<string> = modelsWhere((traits) => !traits.hasSpeedSetting);
export const NO_BREAK_TAG_MODELS: ReadonlySet<TtsModelId> = modelsWhere((traits) => !traits.pausesOnBreakTags);

export const BREAK_TAG_SOURCE = String.raw`<break time="\d+(?:\.\d+)?(?:ms|s)"\s*\/>`;
const BREAK_TAG = new RegExp(BREAK_TAG_SOURCE);
const BREAK_TAG_ALL = new RegExp(BREAK_TAG_SOURCE, "g");
const isBlank = (ch: string | undefined): boolean => ch === " " || ch === "\t";

const CYRILLIC_WORD = new RegExp(`[Ѐ-ӿ${STRESS_MARK}]+`, "g");
const CYRILLIC_STRESS_MARK = new RegExp(`[Ѐ-ӿ]${STRESS_MARK}`);
const CYRILLIC_LOWERCASE = /[а-џ]/;
const CYRILLIC_UPPERCASE = /[Ѐ-Я]/;
const CYRILLIC_UPPER_VOWELS = "АЕЁИОУЫЭЮЯ";

function stressCapitalIndex(word: string): number {
  if (!CYRILLIC_LOWERCASE.test(word)) return -1;
  let start = 0;
  while (word[start] === STRESS_MARK) start += 1;
  let found = -1;
  for (let i = start + 1; i < word.length; i += 1) {
    const ch = word[i]!;
    if (!CYRILLIC_UPPERCASE.test(ch)) continue;
    if (found !== -1 || !CYRILLIC_UPPER_VOWELS.includes(ch)) return -1;
    found = i;
  }
  return found;
}

export function stressMarksFromCapitals(text: string): string {
  return text.replace(CYRILLIC_WORD, (word) => {
    const i = stressCapitalIndex(word);
    if (i === -1) return word;
    const vowel = word[i]!;
    const mark = vowel === "Ё" || word[i + 1] === STRESS_MARK ? "" : STRESS_MARK;
    return word.slice(0, i) + vowel.toLowerCase() + mark + word.slice(i + 1);
  });
}

function cutBreakTagsOnce(text: string): string {
  let out = "";
  let from = 0;
  for (const match of text.matchAll(BREAK_TAG_ALL)) {
    let start = match.index;
    while (start > from && isBlank(text[start - 1])) start -= 1;
    let end = match.index + match[0].length;
    while (isBlank(text[end])) end += 1;
    out += `${text.slice(from, start)} `;
    from = end;
  }
  return from === 0 ? text : out + text.slice(from);
}

function withoutBreakTags(text: string): string {
  let current = text;
  for (;;) {
    const cut = cutBreakTagsOnce(current);
    if (cut === current) return current;
    current = cut;
  }
}

export function hasUncutBreakTag(text: string, modelId: string): boolean {
  return (NO_BREAK_TAG_MODELS as ReadonlySet<string>).has(modelId) && BREAK_TAG.test(text);
}

export function speechTextFor(text: string, modelId: TtsModelId): string {
  const spoken = NO_BREAK_TAG_MODELS.has(modelId) ? withoutBreakTags(text) : text;
  return STRESS_MARK_MODELS.has(modelId) ? stressMarksFromCapitals(spoken) : spoken;
}

const BREAK_TAG_CUT_MODELS = listed([...NO_BREAK_TAG_MODELS]);

export const MAX_SCRIPT_CHARS = Math.max(...Object.values(TTS_MODEL_CHAR_CAP));
export const SCRIPT_LIMITS_BY_MODEL =
  `Script limits by speech model: ${TTS_MODELS.map((model) => `${model}: ${TTS_MODEL_CHAR_CAP[model]} characters`).join("; ")}.`;
export const SCRIPT_LENGTH_DESCRIPTION = `${SCRIPT_LIMITS_BY_MODEL} ` +
  "Count includes spaces, audio tags and stress marks; emoji may count as two characters. " +
  `Break tags are cut from the text sent to ${BREAK_TAG_CUT_MODELS} and are not counted there. ` +
  "There is no word-count limit. Duration and price are estimates until measured.";

export const STRESS_MARKING_DESCRIPTION =
  "Russian stress: write the stressed vowel as a capital inside a lowercase word (\"потОм\", \"зАмок\") " +
  `and ${STRESS_MARK_READERS} receive it as the stress mark U+0301 ("пото́м"); a mark typed directly is kept. ` +
  "A capital at the start of a word stays a capital, and a word with a second capital or a capital " +
  "consonant inside (all caps, \"ВУЗы\") is left as it is. A single capital vowel inside a word is always " +
  "read as stress, so write \"Яндекс Еда\", not \"ЯндексЕда\". " +
  "eleven_flash_v2_5 and " +
  "eleven_turbo_v2_5 cost less but misread stress marks: capitals reach them unchanged.";

export function ttsScriptLimitError(text: string, modelId: string): string | undefined {
  const model = TTS_MODELS.find((model) => model === modelId);
  if (!model) return `unsupported speech model: ${modelId}`;
  const limit = TTS_MODEL_CHAR_CAP[model];
  const length = speechTextFor(text, model).length;
  if (length > limit) {
    const cheaperCap = TTS_MODEL_CHAR_CAP.eleven_flash_v2_5;
    const otherVoices = speaksOwnVoices(model) ? ` and do not speak the voices of ${model}` : "";
    const remedy =
      limit < cheaperCap && text.length <= cheaperCap
        ? `; eleven_flash_v2_5 and eleven_turbo_v2_5 allow ${cheaperCap} but do not read Russian stress${otherVoices}`
        : "";
    const counted = NO_BREAK_TAG_MODELS.has(model)
      ? "including spaces, audio tags and stress marks, break tags cut"
      : "including spaces, tags and stress marks";
    return `script has ${length} characters; ${model} allows at most ${limit} characters (${counted}; emoji may count as two)${remedy}`;
  }
  return undefined;
}

export function cutToNothingError(text: string, modelId: TtsModelId): string | undefined {
  if (text.trim() === "" || speechTextFor(text, modelId).trim() !== "") return undefined;
  return `script has nothing to say on ${modelId}: break tags are cut from the text sent to it, and no words are left`;
}

export interface VoicePreset {
  language: string;
  gender?: Gender;
  description: string;
  model: TtsModelId;
  tempo?: number;
}

export const VOICE_PRESETS = {
  sarah: {
    language: "en",
    gender: "female",
    description: "Soft, natural female voice (English)",
    model: DEFAULT_TTS_MODEL,
  },
  george: {
    language: "en",
    gender: "male",
    description: "Warm British storyteller, narrative pacing (English)",
    model: DEFAULT_TTS_MODEL,
  },
  eric: {
    language: "en",
    gender: "male",
    description: "Smooth American, conversational tone (English)",
    model: DEFAULT_TTS_MODEL,
  },
  daria_ru_female: {
    language: "ru",
    gender: "female",
    description: "Женский повествовательный голос (русский)",
    model: RUSSIAN_TTS_MODEL,
  },
} as const satisfies Record<string, VoicePreset>;

export const VOICE_PRESET_NAMES = Object.keys(VOICE_PRESETS) as [
  keyof typeof VOICE_PRESETS,
  ...(keyof typeof VOICE_PRESETS)[],
];

export type VoicePresetName = keyof typeof VOICE_PRESETS;

export const VOICE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function isVoicePresetName(name: string): name is VoicePresetName {
  return Object.hasOwn(VOICE_PRESETS, name);
}

const servicePresets = new Map<string, VoicePreset>();
let publishedOnly = false;

export function addServiceVoicePresets(presets: Readonly<Record<string, VoicePreset>>): void {
  for (const [name, preset] of Object.entries(presets)) {
    if (isVoicePresetName(name) || isModelVoiceName(name)) throw new Error(`voice preset "${name}" is already published`);
    servicePresets.set(name, preset);
  }
}

export function voicePresetOf(name: string): VoicePreset | undefined {
  return isVoicePresetName(name) ? VOICE_PRESETS[name] : publishedOnly ? undefined : servicePresets.get(name);
}

export function withPublishedPresetsOnly<T>(read: () => T): T {
  const prior = publishedOnly;
  publishedOnly = true;
  try {
    return read();
  } finally {
    publishedOnly = prior;
  }
}

export const voiceCatalogEntry = z.object({
  name: z.string().min(1),
  kind: z.string().optional(),
  skill: z.string().optional(),
  language: z.string().min(1).optional(),
  locale: z.string().optional(),
  accent: z.string().optional(),
  gender: z.string().optional(),
  age: z.string().optional(),
  use_case: z.string().optional(),
  description: z.string().min(1),
  model: z.string().min(1),
  supported_models: z.array(z.string()).optional(),
  verified_models: z.array(z.string()).optional(),
  words_per_second: z.number().positive().optional()
    .describe("Measured English pace on eleven_v4, which has no speed setting; analyze_reference measures a presenter the same way."),
  preview_url: z.url().optional(),
  preview_expires_at: z.iso.datetime().optional(),
});
export type VoiceCatalogEntry = z.infer<typeof voiceCatalogEntry>;

export const voiceModelEntry = z.object({
  id: z.string().min(1),
  char_limit: z.number().int().positive(),
  languages: z.array(z.string()),
  vendor_verifies_voices: z.boolean().optional(),
});

export const voicesResponse = z.object({
  voices: z.array(voiceCatalogEntry),
  models: z.array(voiceModelEntry).optional(),
});
export type VoicesResponse = z.infer<typeof voicesResponse>;

export const DEFAULT_VOICE_PRESET = "george" as const;

export const DEFAULT_VOICE_BY_GENDER = {
  female: "sarah",
  male: "george",
} as const satisfies Record<Gender, VoicePresetName>;

function defaultVoiceFor(gender: Gender | undefined): VoicePresetName {
  return gender === undefined ? DEFAULT_VOICE_PRESET : DEFAULT_VOICE_BY_GENDER[gender];
}

export interface ModelVoice {
  description: string;
  gender?: Gender;
}

export const MODEL_VOICES = {
  zephyr: { description: "Bright" },
  puck: { description: "Upbeat" },
  charon: { description: "Informative", gender: "male" },
  kore: { description: "Firm", gender: "female" },
  fenrir: { description: "Excitable" },
  leda: { description: "Youthful" },
  orus: { description: "Firm" },
  aoede: { description: "Breezy" },
  callirrhoe: { description: "Easy-going" },
  autonoe: { description: "Bright" },
  enceladus: { description: "Breathy" },
  iapetus: { description: "Clear" },
  umbriel: { description: "Easy-going" },
  algieba: { description: "Smooth" },
  despina: { description: "Smooth" },
  erinome: { description: "Clear" },
  algenib: { description: "Gravelly" },
  rasalgethi: { description: "Informative" },
  laomedeia: { description: "Upbeat" },
  achernar: { description: "Soft" },
  alnilam: { description: "Firm" },
  schedar: { description: "Even" },
  gacrux: { description: "Mature" },
  pulcherrima: { description: "Forward" },
  achird: { description: "Friendly" },
  zubenelgenubi: { description: "Casual" },
  vindemiatrix: { description: "Gentle" },
  sadachbia: { description: "Lively" },
  sadaltager: { description: "Knowledgeable" },
  sulafat: { description: "Warm" },
} as const satisfies Record<string, ModelVoice>;
export type ModelVoiceName = keyof typeof MODEL_VOICES;
export const MODEL_VOICE_NAMES = Object.keys(MODEL_VOICES) as [ModelVoiceName, ...ModelVoiceName[]];

export const MODEL_VOICE_MODEL = GOOGLE_TTS_MODEL;

export function isModelVoiceName(name: string): name is ModelVoiceName {
  return Object.hasOwn(MODEL_VOICES, name);
}

export const MODEL_DEFAULT_VOICE_BY_GENDER = {
  female: "kore",
  male: "charon",
} as const satisfies Record<Gender, ModelVoiceName>;

export function speaksOwnVoices(modelId: string | undefined): boolean {
  return modelId === MODEL_VOICE_MODEL;
}

export function defaultVoiceOf(modelId: string | undefined, gender: Gender | undefined): { name: string; gender: Gender } {
  const voiceGender = gender ?? VOICE_PRESETS[DEFAULT_VOICE_PRESET].gender;
  const name = speaksOwnVoices(modelId) ? MODEL_DEFAULT_VOICE_BY_GENDER[voiceGender] : defaultVoiceFor(gender);
  return { name, gender: voiceGender };
}

export function pacedVoiceOf(input: { voice?: string | undefined; voice_id?: string | undefined }, modelId: string | undefined,
  gender: Gender | undefined): string | undefined {
  return input.voice ?? (input.voice_id === undefined ? defaultVoiceOf(modelId, gender).name : undefined);
}

export const VOICE_ID_PATTERN = /^[A-Za-z0-9]{16,32}$/;

export type VoiceSelection =
  | { kind: "preset"; preset: string }
  | { kind: "catalog"; slug: string }
  | { kind: "raw"; voiceId: string }
  | { kind: "model_voice"; voice: ModelVoiceName };

export function resolveVoiceSelection(
  input: {
    voice?: string | undefined;
    voice_id?: string | undefined;
    tts_model?: string | undefined;
  },
  gender?: Gender | undefined,
): VoiceSelection {
  if (input.voice_id !== undefined) {
    return { kind: "raw", voiceId: input.voice_id };
  }
  if (input.voice !== undefined) {
    if (isModelVoiceName(input.voice)) return { kind: "model_voice", voice: input.voice };
    if (voicePresetOf(input.voice) === undefined) return { kind: "catalog", slug: input.voice };
    return { kind: "preset", preset: input.voice };
  }
  if (speaksOwnVoices(input.tts_model)) {
    return { kind: "model_voice", voice: MODEL_DEFAULT_VOICE_BY_GENDER[gender ?? VOICE_PRESETS[DEFAULT_VOICE_PRESET].gender] };
  }
  return { kind: "preset", preset: defaultVoiceFor(gender) };
}

const RUSSIAN_CATALOG_SLUG_PREFIX = "ru_";

export function resolveTtsModel(
  input: {
    voice?: string | undefined;
    voice_id?: string | undefined;
    tts_model?: TtsModelId | undefined;
    script: string;
  },
  gender?: Gender | undefined,
): TtsModelId {
  if (input.tts_model !== undefined) return RETIRED_TTS_MODELS[input.tts_model] ?? input.tts_model;
  if (input.voice_id !== undefined) {
    return detectScriptFamily(input.script) === "cyrillic" ? RUSSIAN_TTS_MODEL : DEFAULT_TTS_MODEL;
  }
  const voice = input.voice ?? defaultVoiceFor(gender);
  if (isModelVoiceName(voice)) return MODEL_VOICE_MODEL;
  const preset = voicePresetOf(voice);
  if (preset !== undefined) return preset.model;
  return voice.startsWith(RUSSIAN_CATALOG_SLUG_PREFIX) ? RUSSIAN_TTS_MODEL : DEFAULT_TTS_MODEL;
}

export function ttsModelBeforeV4Default(
  input: { voice?: string | undefined; voice_id?: string | undefined; tts_model?: TtsModelId | undefined; script: string },
  gender?: Gender | undefined,
): TtsModelId {
  if (input.tts_model !== undefined) return input.tts_model;
  const model = resolveTtsModel(input, gender);
  if (model !== DEFAULT_TTS_MODEL) return model;
  const voice = input.voice ?? defaultVoiceFor(gender);
  const preset = voicePresetOf(voice);
  const russian = input.voice_id !== undefined ? detectScriptFamily(input.script) === "cyrillic"
    : preset !== undefined ? preset.language === "ru" : voice.startsWith(RUSSIAN_CATALOG_SLUG_PREFIX);
  return russian ? RUSSIAN_TTS_MODEL : "eleven_v3";
}

export const SCRIPT_DOMINANCE_THRESHOLD = 0.6;

export function scriptLetterCounts(script: string): {
  cyrillic: number;
  latin: number;
} {
  let cyrillic = 0;
  let latin = 0;
  for (const ch of script) {
    if (ch >= "Ѐ" && ch <= "ӿ") {
      cyrillic += 1;
    } else if ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z")) {
      latin += 1;
    }
  }
  return { cyrillic, latin };
}

export function detectScriptFamily(
  script: string,
): "cyrillic" | "latin" | "neutral" {
  const { cyrillic, latin } = scriptLetterCounts(script);
  const total = cyrillic + latin;
  if (total < 2) {
    return "neutral";
  }
  if (cyrillic / total >= SCRIPT_DOMINANCE_THRESHOLD) {
    return "cyrillic";
  }
  if (latin / total >= SCRIPT_DOMINANCE_THRESHOLD) {
    return "latin";
  }
  return "neutral";
}

const LANGUAGE_TO_SCRIPT_FAMILY: Record<string, "cyrillic" | "latin"> = {
  ru: "cyrillic",
  en: "latin",
};

export const RAW_VOICE_ID_VALIDATION_WARNING =
  "raw voice_id is verified against your account at run start, not at quote time";

export function buildVoiceWarnings(input: {
  voice?: string | undefined;
  voice_id?: string | undefined;
  script: string;
}): string[] {
  if (input.voice_id !== undefined) {
    return [RAW_VOICE_ID_VALIDATION_WARNING];
  }

  if (input.voice === undefined) {
    return [];
  }

  const preset = voicePresetOf(input.voice);
  if (preset === undefined) {
    return [];
  }

  const voiceFamily = LANGUAGE_TO_SCRIPT_FAMILY[preset.language];
  if (voiceFamily === undefined) {
    return [];
  }

  const scriptFamily = detectScriptFamily(input.script);
  if (scriptFamily === "neutral" || scriptFamily === voiceFamily) {
    return [];
  }

  const counts = scriptLetterCounts(input.script);
  if (counts[voiceFamily] === 0) {
    return [
      `voice "${input.voice}" is labeled ${preset.language}, but the script contains ` +
        `no ${voiceFamily} letters at all (${counts[scriptFamily]} ${scriptFamily} letters); ` +
        `it will be voiced in a ${preset.language} voice`,
    ];
  }

  return [
    `voice "${input.voice}" is labeled ${preset.language}, but the script looks ${scriptFamily}; it will be voiced in a ${preset.language} voice`,
  ];
}

export function buildSpeechModelWarnings(
  input: {
    voice?: string | undefined;
    voice_id?: string | undefined;
    tts_model?: TtsModelId | undefined;
    script: string;
  },
  gender?: Gender | undefined,
  model: TtsModelId = resolveTtsModel(input, gender),
): string[] {
  const retired = input.tts_model !== undefined && input.tts_model !== model && RETIRED_TTS_MODELS[input.tts_model] !== undefined
    ? [`tts_model ${input.tts_model} is no longer used for speech: this run speaks ${model}`]
    : [];
  const breaks = hasUncutBreakTag(input.script, model)
    ? [`break tags in the script are not sent to ${model}: the model gives no pause for them, so they are cut from the text`]
    : [];
  const first = [...retired, ...breaks];
  if (STRESS_MARK_MODELS.has(model)) return first;
  const keepsVoice = input.voice !== undefined || input.voice_id !== undefined;
  const readerModels = [...STRESS_MARK_MODELS].filter((reader) => RETIRED_TTS_MODELS[reader] === undefined &&
    (!keepsVoice || TTS_MODEL_BACKEND[reader] === TTS_MODEL_BACKEND[model]));
  const readers = `${listed(readerModels)} ${readerModels.length === 1 ? "reads" : "read"}`;
  const marked =
    CYRILLIC_STRESS_MARK.test(input.script) || stressMarksFromCapitals(input.script) !== input.script;
  if (marked) {
    return [
      ...first,
      `stress marks in the script (capital vowels or U+0301) are not read by ${model}: they are sent ` +
        `unchanged, and a U+0301 can break the word it sits in; ${readers} them`,
    ];
  }
  const letters = scriptLetterCounts(input.script);
  if (detectScriptFamily(input.script) === "cyrillic" || (letters.cyrillic > 0 && letters.latin === 0)) {
    return [
      ...first,
      `Cyrillic script on ${model}: for Russian it places stress less reliably than eleven_v3 ` +
        `and does not read stress marks; ${readers} them`,
    ];
  }
  return first;
}
