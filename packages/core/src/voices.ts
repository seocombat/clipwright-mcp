import { z } from "zod";
import type { Gender } from "./default-actor.js";

/** Speech models the contract lets callers name. `multilingual_v2` was dropped: */
/** it honored none of the stress-marking methods we measured. */
export const TTS_MODELS = ["eleven_v3", "eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_v4", "gemini-3.8-flash-tts"] as const;
export type TtsModelId = (typeof TTS_MODELS)[number];
export const DEFAULT_TTS_MODEL: TtsModelId = "eleven_v3";
/** What Russian speech goes to when the client names no model; `resolveTtsModel` decides what is Russian. */
export const RUSSIAN_TTS_MODEL = "eleven_v4" satisfies TtsModelId;

/** The model spoken by Google's adapter; contract texts name it through this constant. */
export const GOOGLE_TTS_MODEL = "gemini-3.8-flash-tts" satisfies TtsModelId;

/** Whose adapter speaks each model. A model without a row does not compile. */
export type SpeechBackendName = "elevenlabs" | "google";
export const TTS_MODEL_BACKEND = {
  eleven_v3: "elevenlabs",
  eleven_flash_v2_5: "elevenlabs",
  eleven_turbo_v2_5: "elevenlabs",
  eleven_v4: "elevenlabs",
  "gemini-3.8-flash-tts": "google",
} as const satisfies Record<TtsModelId, SpeechBackendName>;

/** The models of one vendor: its voices, its listing and its catalog files know only these. */
export type ElevenLabsModelId = {
  [Model in TtsModelId]: (typeof TTS_MODEL_BACKEND)[Model] extends "elevenlabs" ? Model : never;
}[TtsModelId];
export const ELEVENLABS_TTS_MODELS = TTS_MODELS.filter(
  (model): model is ElevenLabsModelId => TTS_MODEL_BACKEND[model] === "elevenlabs",
);

/** Whose adapter speaks a model named by a string; `undefined` for a model the contract does not have. */
export function speechBackendOf(modelId: string): SpeechBackendName | undefined {
  const model = TTS_MODELS.find((known) => known === modelId);
  return model === undefined ? undefined : TTS_MODEL_BACKEND[model];
}

/** v3: the vendor's cap. 2.5: the vendor allows 40,000; 10,000 is our run-length cap. */
/** v4: the vendor declares 10,000; 5,000 is ours, above the longest measured call. */
export const TTS_MODEL_CHAR_CAP: Readonly<Record<TtsModelId, number>> = {
  eleven_v3: 5_000,
  eleven_flash_v2_5: 10_000,
  eleven_turbo_v2_5: 10_000,
  eleven_v4: 5_000,
  "gemini-3.8-flash-tts": 5_000,
};

/** What each model does with the text sent to it. The three sets below are read from this table. */
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

/** Models that read the U+0301 stress mark; flash misreads the same mark three times as often. */
export const STRESS_MARK = String.fromCharCode(0x0301);
export const STRESS_MARK_MODELS: ReadonlySet<TtsModelId> = modelsWhere((traits) => traits.readsStressMarks);
const listed = (names: readonly string[]): string => names.join(", ").replace(/, ([^,]+)$/, " and $1");
const STRESS_MARK_READERS = listed([...STRESS_MARK_MODELS]);

/** Models that accept a speed setting and ignore it: a request to them carries none. */
export const FIXED_PACE_MODELS: ReadonlySet<string> = modelsWhere((traits) => !traits.hasSpeedSetting);

/** Models that give no pause for a break tag: the tag is cut from the text sent to them. */
export const NO_BREAK_TAG_MODELS: ReadonlySet<TtsModelId> = modelsWhere((traits) => !traits.pausesOnBreakTags);

/** The one break form the pipeline knows; the cut here and the alignment parser share it. */
export const BREAK_TAG_SOURCE = String.raw`<break time="\d+(?:\.\d+)?(?:ms|s)"\s*\/>`;
const BREAK_TAG = new RegExp(BREAK_TAG_SOURCE);
const BREAK_TAG_ALL = new RegExp(BREAK_TAG_SOURCE, "g");
const isBlank = (ch: string | undefined): boolean => ch === " " || ch === "\t";

const CYRILLIC_WORD = new RegExp(`[Ѐ-ӿ${STRESS_MARK}]+`, "g");
const CYRILLIC_STRESS_MARK = new RegExp(`[Ѐ-ӿ]${STRESS_MARK}`);
const CYRILLIC_LOWERCASE = /[а-џ]/;
const CYRILLIC_UPPERCASE = /[Ѐ-Я]/;
const CYRILLIC_UPPER_VOWELS = "АЕЁИОУЫЭЮЯ";

/** Index of the stressed capital: exactly one capital after the first letter, a vowel. */
/** A second capital or a consonant capital is an abbreviation, not stress. */
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

/** Turns an inner capital vowel into a stress mark. A word-initial capital stays a capital; */
/** an existing mark is not doubled. */
export function stressMarksFromCapitals(text: string): string {
  return text.replace(CYRILLIC_WORD, (word) => {
    const i = stressCapitalIndex(word);
    if (i === -1) return word;
    const vowel = word[i]!;
    const mark = vowel === "Ё" || word[i + 1] === STRESS_MARK ? "" : STRESS_MARK;
    return word.slice(0, i) + vowel.toLowerCase() + mark + word.slice(i + 1);
  });
}

/** One pass, linear in the text: each tag with the blanks around it becomes one space. */
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

/** Cuts until no tag is left: one pass over a tag written inside a tag leaves a whole tag. */
function withoutBreakTags(text: string): string {
  let current = text;
  for (;;) {
    const cut = cutBreakTagsOnce(current);
    if (cut === current) return current;
    current = cut;
  }
}

/** A break tag still in text bound for a model that gives no pause for it. */
export function hasUncutBreakTag(text: string, modelId: string): boolean {
  return (NO_BREAK_TAG_MODELS as ReadonlySet<string>).has(modelId) && BREAK_TAG.test(text);
}

/** The text sent to the vendor: stress marking only for a model that reads it, and a break */
/** tag with the spaces around it becomes one space for a model that gives no pause for it. */
export function speechTextFor(text: string, modelId: TtsModelId): string {
  const spoken = NO_BREAK_TAG_MODELS.has(modelId) ? withoutBreakTags(text) : text;
  return STRESS_MARK_MODELS.has(modelId) ? stressMarksFromCapitals(spoken) : spoken;
}

const BREAK_TAG_CUT_MODELS = listed([...NO_BREAK_TAG_MODELS]);

export const MAX_SCRIPT_CHARS = Math.max(...Object.values(TTS_MODEL_CHAR_CAP));
export const SCRIPT_LENGTH_DESCRIPTION =
  `Script limits by speech model: ${TTS_MODELS.map((model) => `${model}: ${TTS_MODEL_CHAR_CAP[model]} characters`).join("; ")}. ` +
  "Count includes spaces, audio tags and stress marks; emoji may count as two characters. " +
  `Break tags are cut from the text sent to ${BREAK_TAG_CUT_MODELS} and are not counted there. ` +
  "There is no word-count limit. Duration and price are estimates until measured.";

export const STRESS_MARKING_DESCRIPTION =
  "Russian stress: write the stressed vowel as a capital inside a lowercase word (\"потОм\", \"зАмок\") " +
  `and ${STRESS_MARK_READERS} receive it as the stress mark U+0301 ("пото́м"); a mark typed directly is kept. ` +
  "A capital at the start of a word stays a capital, and a word with a second capital or a capital " +
  "consonant inside (all caps, \"ВУЗы\") is left as it is. A single capital vowel inside a word is always " +
  "read as stress, so write \"Яндекс Еда\", not \"ЯндексЕда\". " +
  "Tell users writing in Russian that they can mark stress this way. eleven_flash_v2_5 and " +
  "eleven_turbo_v2_5 cost less but misread stress marks: capitals reach them unchanged.";

/** Length is measured on the text sent to the vendor: stress marks in, cut break tags out. */
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

/** A spoken unit of nothing but break tags leaves a model that cuts them with no text to send. */
export function cutToNothingError(text: string, modelId: TtsModelId): string | undefined {
  if (text.trim() === "" || speechTextFor(text, modelId).trim() !== "") return undefined;
  return `script has nothing to say on ${modelId}: break tags are cut from the text sent to it, and no words are left`;
}

/** Voice preset catalog: OUR names and metadata, WITHOUT vendor ids. Names feed `tools/list` */
/** and SDK types; ids live only in the worker adapter. */
export interface VoicePreset {
  /** Voice language as a short BCP-47-like code (ru/en). */
  language: string;
  /** Voice gender. Omitted only when WE do not know it: vendor silence about our own */
  /** clone is not ignorance. */
  gender?: Gender;
  /** Human-readable description for list_voices. */
  description: string;
  /** The speech model the voice is tuned for; clients may override with `tts_model`. */
  model: TtsModelId;
}

/** The starter set of presets. Order matters only for presentation; the default is set */
/** separately by `DEFAULT_VOICE_PRESET`. */
export const VOICE_PRESETS = {
  owner_ru_clone: {
    language: "ru",
    // The gender is OUR fact about our own clone, not vendor metadata.
    gender: "male",
    description: "Клон голоса владельца (David-Dmitry-Ru); русский — на английском даёт акцент",
    model: RUSSIAN_TTS_MODEL,
  },
  // A Russian preset speaks `RUSSIAN_TTS_MODEL`, every other one the default; a test holds both.
  sarah: {
    language: "en",
    gender: "female",
    description: "Soft, natural female voice (English)",
    model: "eleven_v3",
  },
  george: {
    language: "en",
    gender: "male",
    description: "Warm British storyteller, narrative pacing (English)",
    model: "eleven_v3",
  },
  eric: {
    language: "en",
    gender: "male",
    description: "Smooth American, conversational tone (English)",
    model: "eleven_v3",
  },
  daria_ru_female: {
    language: "ru",
    gender: "female",
    description: "Женский повествовательный голос (русский)",
    model: RUSSIAN_TTS_MODEL,
  },
} as const satisfies Record<string, VoicePreset>;

/** Preset name tuple for `z.enum`, derived from `VOICE_PRESETS` keys so names and */
/** metadata cannot drift. */
export const VOICE_PRESET_NAMES = Object.keys(VOICE_PRESETS) as [
  keyof typeof VOICE_PRESETS,
  ...(keyof typeof VOICE_PRESETS)[],
];

export type VoicePresetName = keyof typeof VOICE_PRESETS;

/** The shape of a voice name, not a list: the catalog grows on the server without client releases. */
export const VOICE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function isVoicePresetName(name: string): name is VoicePresetName {
  return Object.hasOwn(VOICE_PRESETS, name);
}

/** The `/v1/voices` response as a schema, not a guess on both sides: the server sends a */
/** body parsed by it and the SDK parses with it. `Array.isArray` let any array through. */
export const voiceCatalogEntry = z.object({
  // Strings, not enums: an unfamiliar name or label does not break `listVoices`.
  name: z.string().min(1),
  kind: z.string().optional(),
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
  // The signature is temporary; a missing pair means the voice has no sample.
  preview_url: z.url().optional(),
  preview_expires_at: z.iso.datetime().optional(),
});
export type VoiceCatalogEntry = z.infer<typeof voiceCatalogEntry>;

export const voiceModelEntry = z.object({
  id: z.string().min(1),
  char_limit: z.number().int().positive(),
  languages: z.array(z.string()),
  /** Whether the vendor verifies any library voice for this model at all. An empty */
  /** `verified_models` on a model where this is `false` says nothing about the voice. */
  vendor_verifies_voices: z.boolean().optional(),
});

export const voicesResponse = z.object({
  voices: z.array(voiceCatalogEntry),
  models: z.array(voiceModelEntry).optional(),
});
export type VoicesResponse = z.infer<typeof voicesResponse>;

/** The voice when the actor's gender is unknown; the resolver fills it in, not the schema. */
export const DEFAULT_VOICE_PRESET = "george" as const;

/** The default voice follows the actor's gender. */
export const DEFAULT_VOICE_BY_GENDER = {
  female: "sarah",
  male: "george",
} as const satisfies Record<Gender, VoicePresetName>;

function defaultVoiceFor(gender: Gender | undefined): VoicePresetName {
  return gender === undefined ? DEFAULT_VOICE_PRESET : DEFAULT_VOICE_BY_GENDER[gender];
}

/** A voice a model owns. `gender` only where we know it: the vendor's page names none. */
export interface ModelVoice {
  /** The vendor's own one-word descriptor, as its page prints it. */
  description: string;
  gender?: Gender;
}

/** The voices of `MODEL_VOICE_MODEL` by OUR names, in the vendor page's order (docs/16). */
/** The worker adapter maps them to the vendor's names. */
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

/** The one model that speaks `MODEL_VOICES`: naming one of them selects it. */
export const MODEL_VOICE_MODEL = GOOGLE_TTS_MODEL;

export function isModelVoiceName(name: string): name is ModelVoiceName {
  return Object.hasOwn(MODEL_VOICES, name);
}

/** The default voice of a model that speaks only its own voices; an unknown gender speaks the male one. */
export const MODEL_DEFAULT_VOICE_BY_GENDER = {
  female: "kore",
  male: "charon",
} as const satisfies Record<Gender, ModelVoiceName>;

/** The model of `MODEL_VOICES` speaks only those: presets, catalog voices and raw ids do not carry over. */
export function speaksOwnVoices(modelId: string | undefined): boolean {
  return modelId === MODEL_VOICE_MODEL;
}

/** The voice a run speaks when it names none, with the gender that voice has. */
export function defaultVoiceOf(modelId: string | undefined, gender: Gender | undefined): { name: string; gender: Gender } {
  const voiceGender = gender ?? VOICE_PRESETS[DEFAULT_VOICE_PRESET].gender;
  const name = speaksOwnVoices(modelId) ? MODEL_DEFAULT_VOICE_BY_GENDER[voiceGender] : defaultVoiceFor(gender);
  return { name, gender: voiceGender };
}

/** Shape of a raw vendor `voice_id`, deliberately loose (16–32 alphanumerics): the format is */
/** undocumented. A coarse input filter only; the worker's free preflight checks existence. */
export const VOICE_ID_PATTERN = /^[A-Za-z0-9]{16,32}$/;

/** Resolved voice selection. `preset` carries OUR name, mapped to a vendor id by the adapter; */
/** `raw` is already a vendor id. Core never knows vendor ids. */
export type VoiceSelection =
  | { kind: "preset"; preset: VoicePresetName }
  | { kind: "catalog"; slug: string }
  | { kind: "raw"; voiceId: string }
  | { kind: "model_voice"; voice: ModelVoiceName };

/** Priority: raw `voice_id` > `voice` > voice by actor gender > `DEFAULT_VOICE_PRESET`. */
/** Gender comes from `voiceGenderFor` (actors.ts); `tts_model` is the run's model, which owns the default voice. */
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
    // Not a preset, so a catalog slug: only the worker sidecar knows its id; a miss there refuses.
    if (!isVoicePresetName(input.voice)) return { kind: "catalog", slug: input.voice };
    return { kind: "preset", preset: input.voice };
  }
  if (speaksOwnVoices(input.tts_model)) {
    return { kind: "model_voice", voice: MODEL_DEFAULT_VOICE_BY_GENDER[gender ?? VOICE_PRESETS[DEFAULT_VOICE_PRESET].gender] };
  }
  return { kind: "preset", preset: defaultVoiceFor(gender) };
}

/** A catalog slug is `language_gender_name`: the prefix is the voice's language. */
const RUSSIAN_CATALOG_SLUG_PREFIX = "ru_";

/** Model: explicit `tts_model` → a raw `voice_id` by the script family → the model of a model's own */
/** voice → the preset's model → a catalog voice by its slug language. `script` is the run's whole text. */
export function resolveTtsModel(
  input: {
    voice?: string | undefined;
    voice_id?: string | undefined;
    tts_model?: TtsModelId | undefined;
    script: string;
  },
  gender?: Gender | undefined,
): TtsModelId {
  if (input.tts_model !== undefined) return input.tts_model;
  if (input.voice_id !== undefined) {
    return detectScriptFamily(input.script) === "cyrillic" ? RUSSIAN_TTS_MODEL : DEFAULT_TTS_MODEL;
  }
  const voice = input.voice ?? defaultVoiceFor(gender);
  if (isModelVoiceName(voice)) return MODEL_VOICE_MODEL;
  if (isVoicePresetName(voice)) return VOICE_PRESETS[voice].model;
  return voice.startsWith(RUSSIAN_CATALOG_SLUG_PREFIX) ? RUSSIAN_TTS_MODEL : DEFAULT_TTS_MODEL;
}

/** Script family for the language warning: counts only Cyrillic vs Latin letters. Fewer than */
/** 2 letters or no side reaching this 60% dominance gives "neutral". */
export const SCRIPT_DOMINANCE_THRESHOLD = 0.6;

/** Letters of each script separately. `detectScriptFamily` sums them; apart they tell */
/** "few" from "none at all". */
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
  // Too few letters: nothing to judge the language by.
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

/** Maps our short preset language label to a script family. Covers only ru/en on purpose: */
/** any other label means "no data to compare" and silences the warning. */
const LANGUAGE_TO_SCRIPT_FAMILY: Record<string, "cyrillic" | "latin"> = {
  ru: "cyrillic",
  en: "latin",
};

/** QUOTE path only: a raw voice id is checked at run start, not at quote time. */
export const RAW_VOICE_ID_VALIDATION_WARNING =
  "raw voice_id is verified against your account at run start, not at quote time";

/** Voice warnings fire only when (i) the client chose explicitly, (ii) the claim rests on data */
/** present, (iii) never on the default happy path. A voice is never substituted, only failed. */
export function buildVoiceWarnings(input: {
  // Explicit `| undefined` for exactOptionalPropertyTypes callers passing z.infer fields;
  // undefined means the same as absent.
  voice?: string | undefined;
  voice_id?: string | undefined;
  script: string;
}): string[] {
  // A raw id is an explicit choice, but its existence is checked at run start,
  // so the quote warns about deferred validation.
  if (input.voice_id !== undefined) {
    return [RAW_VOICE_ID_VALIDATION_WARNING];
  }

  // No explicit voice: no language warnings ever. The gender-based voice is
  // covered by `buildActorGenderWarnings` (actors.ts).
  if (input.voice === undefined) {
    return [];
  }

  // Defensive: zod already narrowed voice, but a pure function does not rely on it.
  // An unknown name has no preset and so no data.
  if (!isVoicePresetName(input.voice)) {
    return [];
  }
  const preset: VoicePreset = VOICE_PRESETS[input.voice];

  // Compare only against a PRESENT usable label; a language outside ru/en means
  // no data, so stay silent instead of guessing.
  const voiceFamily = LANGUAGE_TO_SCRIPT_FAMILY[preset.language];
  if (voiceFamily === undefined) {
    return [];
  }

  // An explicit preset against the detected script family. A neutral or mixed
  // script contradicts nothing.
  const scriptFamily = detectScriptFamily(input.script);
  if (scriptFamily === "neutral" || scriptFamily === voiceFamily) {
    return [];
  }

  // "No letters at all" and "wrong language" call for different fixes: the text or
  // its delivery versus the voice choice.
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

/** A model that ignores stress marks or break tags on text that carries them. Silent on a */
/** model that reads both. */
export function buildSpeechModelWarnings(
  input: {
    voice?: string | undefined;
    voice_id?: string | undefined;
    tts_model?: TtsModelId | undefined;
    script: string;
  },
  gender?: Gender | undefined,
): string[] {
  const model = resolveTtsModel(input, gender);
  const breaks = hasUncutBreakTag(input.script, model)
    ? [`break tags in the script are not sent to ${model}: the model gives no pause for them, so they are cut from the text`]
    : [];
  if (STRESS_MARK_MODELS.has(model)) return breaks;
  // An explicit voice stays with its vendor: a reader of another vendor would refuse it.
  const keepsVoice = input.voice !== undefined || input.voice_id !== undefined;
  const readers = listed(
    [...STRESS_MARK_MODELS].filter((reader) => !keepsVoice || TTS_MODEL_BACKEND[reader] === TTS_MODEL_BACKEND[model]),
  );
  // A mark after a Latin letter is a French or Spanish accent (NFD), not stress.
  const marked =
    CYRILLIC_STRESS_MARK.test(input.script) || stressMarksFromCapitals(input.script) !== input.script;
  if (marked) {
    return [
      ...breaks,
      `stress marks in the script (capital vowels or U+0301) are not read by ${model}: they are sent ` +
        `unchanged, and a U+0301 can break the word it sits in; ${readers} read them`,
    ];
  }
  const letters = scriptLetterCounts(input.script);
  if (detectScriptFamily(input.script) === "cyrillic" || (letters.cyrillic > 0 && letters.latin === 0)) {
    return [
      ...breaks,
      `Cyrillic script on ${model}: for Russian it places stress less reliably than eleven_v3 ` +
        `and does not read stress marks; ${readers} read them`,
    ];
  }
  return breaks;
}
