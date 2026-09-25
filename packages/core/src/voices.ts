import { z } from "zod";
import type { Gender } from "./default-actor.js";

/** ElevenLabs speech models the contract lets callers name. `multilingual_v2` was dropped: */
/** it honored none of the stress-marking methods we measured. */
export const TTS_MODELS = ["eleven_v3", "eleven_flash_v2_5", "eleven_turbo_v2_5"] as const;
export type TtsModelId = (typeof TTS_MODELS)[number];
export const DEFAULT_TTS_MODEL: TtsModelId = "eleven_v3";

/** The v3 cap is the vendor's. For 2.5 the vendor allows 40,000; 10,000 is our run-length cap. */
export const TTS_MODEL_CHAR_CAP: Readonly<Record<TtsModelId, number>> = {
  eleven_v3: 5_000,
  eleven_flash_v2_5: 10_000,
  eleven_turbo_v2_5: 10_000,
};

/** Only v3 reads the U+0301 stress mark; flash misreads the same mark three times as often. */
export const STRESS_MARK = String.fromCharCode(0x0301);
export const STRESS_MARK_MODELS: ReadonlySet<TtsModelId> = new Set(["eleven_v3"]);

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

/** The text sent to the vendor: stress marking only for a model that reads it. */
export function speechTextFor(text: string, modelId: TtsModelId): string {
  return STRESS_MARK_MODELS.has(modelId) ? stressMarksFromCapitals(text) : text;
}

export const MAX_SCRIPT_CHARS = Math.max(...Object.values(TTS_MODEL_CHAR_CAP));
export const SCRIPT_LENGTH_DESCRIPTION =
  `Script limits by speech model: ${TTS_MODELS.map((model) => `${model}: ${TTS_MODEL_CHAR_CAP[model]} characters`).join("; ")}. ` +
  "Count includes spaces, audio tags and stress marks; emoji may count as two characters. " +
  "There is no word-count limit. Duration and price are estimates until measured.";

export const STRESS_MARKING_DESCRIPTION =
  "Russian stress: write the stressed vowel as a capital inside a lowercase word (\"потОм\", \"зАмок\") " +
  "and eleven_v3 receives it as the stress mark U+0301 (\"пото́м\"); a mark typed directly is kept. " +
  "A capital at the start of a word stays a capital, and a word with a second capital or a capital " +
  "consonant inside (all caps, \"ВУЗы\") is left as it is. A single capital vowel inside a word is always " +
  "read as stress, so write \"Яндекс Еда\", not \"ЯндексЕда\". " +
  "Tell users writing in Russian that they can mark stress this way. eleven_flash_v2_5 and " +
  "eleven_turbo_v2_5 cost less but misread stress marks: capitals reach them unchanged.";

/** Length is measured on the text sent to the vendor, stress marks included. */
export function ttsScriptLimitError(text: string, modelId: string): string | undefined {
  const model = TTS_MODELS.find((model) => model === modelId);
  if (!model) return `unsupported speech model: ${modelId}`;
  const limit = TTS_MODEL_CHAR_CAP[model];
  const length = speechTextFor(text, model).length;
  if (length > limit) {
    const cheaperCap = TTS_MODEL_CHAR_CAP.eleven_flash_v2_5;
    const remedy =
      model === "eleven_v3" && text.length <= cheaperCap
        ? `; eleven_flash_v2_5 and eleven_turbo_v2_5 allow ${cheaperCap} but do not read Russian stress`
        : "";
    return `script has ${length} characters; ${model} allows at most ${limit} characters (including spaces, tags and stress marks; emoji may count as two)${remedy}`;
  }
  return undefined;
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
    model: "eleven_v3",
  },
  // Every preset is v3: more expressive, and the only model that reads stress marks.
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
    model: "eleven_v3",
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
  model: z.enum(TTS_MODELS),
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

/** Shape of a raw vendor `voice_id`, deliberately loose (16–32 alphanumerics): the format is */
/** undocumented. A coarse input filter only; the worker's free preflight checks existence. */
export const VOICE_ID_PATTERN = /^[A-Za-z0-9]{16,32}$/;

/** Resolved voice selection. `preset` carries OUR name, mapped to a vendor id by the adapter; */
/** `raw` is already a vendor id. Core never knows vendor ids. */
export type VoiceSelection =
  | { kind: "preset"; preset: VoicePresetName }
  | { kind: "catalog"; slug: string }
  | { kind: "raw"; voiceId: string };

/** Priority: raw `voice_id` > `voice` > voice by actor gender > `DEFAULT_VOICE_PRESET`. */
/** Gender comes from `voiceGenderFor` (actors.ts); `makeUgcInput` enforces exclusivity. */
export function resolveVoiceSelection(
  input: {
    voice?: string | undefined;
    voice_id?: string | undefined;
  },
  gender?: Gender | undefined,
): VoiceSelection {
  if (input.voice_id !== undefined) {
    return { kind: "raw", voiceId: input.voice_id };
  }
  if (input.voice !== undefined) {
    // Not a preset, so a catalog slug: only the worker sidecar knows its id; a miss there refuses.
    if (!isVoicePresetName(input.voice)) return { kind: "catalog", slug: input.voice };
    return { kind: "preset", preset: input.voice };
  }
  return { kind: "preset", preset: defaultVoiceFor(gender) };
}

/** Model: explicit `tts_model` → the preset's model → default (a raw `voice_id` has no preset). */
/** A catalog voice speaks the default model, like the presets. */
export function resolveTtsModel(
  input: {
    voice?: string | undefined;
    voice_id?: string | undefined;
    tts_model?: TtsModelId | undefined;
  },
  gender?: Gender | undefined,
): TtsModelId {
  if (input.tts_model !== undefined) return input.tts_model;
  if (input.voice_id !== undefined) return DEFAULT_TTS_MODEL;
  const voice = input.voice ?? defaultVoiceFor(gender);
  return isVoicePresetName(voice) ? VOICE_PRESETS[voice].model : DEFAULT_TTS_MODEL;
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

/** A model that ignores stress marks on text where they matter. Silent on the v3 default. */
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
  if (STRESS_MARK_MODELS.has(model)) return [];
  // A mark after a Latin letter is a French or Spanish accent (NFD), not stress.
  const marked =
    CYRILLIC_STRESS_MARK.test(input.script) || stressMarksFromCapitals(input.script) !== input.script;
  if (marked) {
    return [
      `stress marks in the script (capital vowels or U+0301) are not read by ${model}: they are sent ` +
        "unchanged, and a U+0301 can break the word it sits in; use eleven_v3 for Russian",
    ];
  }
  const letters = scriptLetterCounts(input.script);
  if (detectScriptFamily(input.script) === "cyrillic" || (letters.cyrillic > 0 && letters.latin === 0)) {
    return [
      `Cyrillic script on ${model}: for Russian it places stress less reliably than eleven_v3 ` +
        "and does not read stress marks",
    ];
  }
  return [];
}
