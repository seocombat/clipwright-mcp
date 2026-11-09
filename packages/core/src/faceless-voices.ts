import type { Gender } from "./default-actor.js";
import { scriptLanguageOf } from "./caption-language.js";
import { countWords, estimateWordsPerSecond } from "./pacing.js";
import type { CatalogLanguage } from "./voice-catalog.js";
import { detectScriptFamily, scriptLetterCounts } from "./voices.js";

/** Our label for the speech model that reads `make_faceless` narration. Not a `tts_model`: `make_ugc` does not speak it. */
export const FACELESS_SPEECH_MODEL = "narrator-v1";

/** A narration voice of `make_faceless` by OUR name; our service holds its measured pace. */
export interface FacelessVoice {
  language: CatalogLanguage;
  gender: Gender;
  description: string;
}

/** The voices `make_faceless` speaks, each measured live. Every name starts */
/** with `narrator_`, which no preset, model voice or catalog slug does. */
export const FACELESS_VOICES = {
  narrator_en_wise_lady: { language: "en", gender: "female", description: "Wise, genial middle-aged woman with a British accent" },
  narrator_en_kind_girl: { language: "en", gender: "female", description: "Kind, calm young woman with an American accent" },
  narrator_en_firm_lady: { language: "en", gender: "female", description: "Mature, commanding middle-aged woman with an American accent" },
  narrator_en_gentle_man: { language: "en", gender: "male", description: "Gentle, warm man with an American accent" },
  narrator_en_deep_gentleman: { language: "en", gender: "male", description: "Deep-voiced, thoughtful gentleman with a British accent" },
  narrator_en_storyteller: { language: "en", gender: "male", description: "Senior storyteller with a friendly Southern American accent" },
  narrator_en_brisk_man: { language: "en", gender: "male", description: "Brisk, confident professional man with an American accent" },
  narrator_ru_ambitious_woman: { language: "ru", gender: "female", description: "Warm, thoughtful young woman (Russian)" },
  narrator_ru_bright_queen: { language: "ru", gender: "female", description: "Bright, playful young woman (Russian)" },
  narrator_ru_reliable_man: { language: "ru", gender: "male", description: "Steady, reliable middle-aged man (Russian)" },
  narrator_ru_deep_man: { language: "ru", gender: "male", description: "Deep-voiced man (Russian)" },
  narrator_es_serene_woman: { language: "es", gender: "female", description: "Soothing, serene young woman (Spanish)" },
  narrator_es_storyteller: { language: "es", gender: "male", description: "Middle-aged narrator for storytelling (Spanish)" },
  narrator_pt_wise_lady: { language: "pt", gender: "female", description: "Smooth, wise middle-aged woman (Portuguese)" },
  narrator_pt_storyteller: { language: "pt", gender: "male", description: "Middle-aged narrator for storytelling (Portuguese)" },
  narrator_fr_classic_man: { language: "fr", gender: "male", description: "Classic narrator for storytelling (French)" },
  narrator_it_calm_woman: { language: "it", gender: "female", description: "Calm, diligent woman (Italian)" },
  narrator_it_classic_man: { language: "it", gender: "male", description: "Classic middle-aged narrator (Italian)" },
  narrator_tr_confident_woman: { language: "tr", gender: "female", description: "Clear, confident middle-aged woman (Turkish)" },
  narrator_tr_mature_man: { language: "tr", gender: "male", description: "Deep, mature, soft-spoken man for social video (Turkish)" },
} as const satisfies Record<string, FacelessVoice>;
export type FacelessVoiceName = keyof typeof FACELESS_VOICES;
export const FACELESS_VOICE_NAMES = Object.keys(FACELESS_VOICES) as [FacelessVoiceName, ...FacelessVoiceName[]];

/** The voice a run speaks when it names none; an explainer speaks the fastest voice of its script's language instead (#1216). */
export const DEFAULT_FACELESS_VOICE = "narrator_en_wise_lady" satisfies FacelessVoiceName;

export function isFacelessVoiceName(name: string): name is FacelessVoiceName {
  return Object.hasOwn(FACELESS_VOICES, name);
}

/** Whole-take words per second of the voices measured live. A voice absent here is unmeasured. */
export const FACELESS_MEASURED_WORDS_PER_SECOND: Partial<Record<FacelessVoiceName, number>> = {
  narrator_en_wise_lady: 3.095, narrator_en_kind_girl: 3.125, narrator_en_firm_lady: 3.074, narrator_en_gentle_man: 3.324,
  narrator_en_deep_gentleman: 3.119, narrator_en_storyteller: 2.848, narrator_en_brisk_man: 3.606,
  narrator_tr_confident_woman: 2.418, narrator_tr_mature_man: 2.277,
};

/** The voice a run speaks when it names none: an explainer's script is read by the fastest measured voice of its language,
 *  every other format and a language without a measured voice by the default. */
export function facelessDefaultVoiceName(input: { format?: string | undefined; script?: string | undefined } | undefined): FacelessVoiceName {
  if (input?.format !== "explainer" || input.script === undefined) return DEFAULT_FACELESS_VOICE;
  const language = scriptLanguageOf(input.script);
  let fastest: FacelessVoiceName | undefined;
  for (const name of FACELESS_VOICE_NAMES) {
    const pace = FACELESS_MEASURED_WORDS_PER_SECOND[name];
    if (FACELESS_VOICES[name].language !== language || pace === undefined) continue;
    if (fastest === undefined || pace > FACELESS_MEASURED_WORDS_PER_SECOND[fastest]!) fastest = name;
  }
  return fastest ?? DEFAULT_FACELESS_VOICE;
}

/** The words per second a script's length is estimated at: the measured pace of the voice that will speak it (the named one, else the default for
 *  the format and the script's language), the flat estimate when that voice is unmeasured or reads another alphabet than the script. */
export function facelessSpeechWordsPerSecond(input: { voice?: string | undefined; format?: string | undefined; script: string }): number {
  const voice = input.voice !== undefined && isFacelessVoiceName(input.voice) ? input.voice : facelessDefaultVoiceName(input);
  const alphabet = detectScriptFamily(input.script);
  const matches = alphabet === "neutral" || alphabet === VOICE_LANGUAGE[FACELESS_VOICES[voice].language].alphabet;
  return (matches ? FACELESS_MEASURED_WORDS_PER_SECOND[voice] : undefined) ?? estimateWordsPerSecond(input.script);
}

/** A faceless script's estimated narration length in seconds at its voice's pace; an estimate, as `estimateDurationSec` is. */
export function facelessEstimatedSeconds(input: { voice?: string | undefined; format?: string | undefined; script: string }): number {
  return Math.max(1, Math.round(countWords(input.script) / facelessSpeechWordsPerSecond(input)));
}

type FacelessVoiceLanguage = (typeof FACELESS_VOICES)[FacelessVoiceName]["language"];

/** How a warning names each offered language, and its alphabet; a language without a row does not compile. */
const VOICE_LANGUAGE = {
  en: { voice: "an English voice", alphabet: "latin" },
  ru: { voice: "a Russian voice", alphabet: "cyrillic" },
  es: { voice: "a Spanish voice", alphabet: "latin" },
  pt: { voice: "a Portuguese voice", alphabet: "latin" },
  fr: { voice: "a French voice", alphabet: "latin" },
  it: { voice: "an Italian voice", alphabet: "latin" },
  tr: { voice: "a Turkish voice", alphabet: "latin" },
} as const satisfies Record<FacelessVoiceLanguage, { voice: string; alphabet: "cyrillic" | "latin" }>;

const ALPHABET_LETTERS = { cyrillic: "Cyrillic letters", latin: "Latin letters" } as const;

const LIST_HINT = "list_voices with skill=make_faceless names the voices of each language";

/** Fires only for a voice the client named. A script is judged by the alphabet most of its letters say; a brief */
/** only when it holds no letter of the voice's alphabet, since it may ask for another language. */
export function buildFacelessVoiceWarnings(input: {
  voice?: string | undefined;
  script?: string | undefined;
  brief?: string | undefined;
}): string[] {
  if (input.voice === undefined || !isFacelessVoiceName(input.voice)) return [];
  const language = VOICE_LANGUAGE[FACELESS_VOICES[input.voice].language];
  const named = `voice "${input.voice}" is ${language.voice}, but`;
  if (input.script !== undefined) {
    const alphabet = detectScriptFamily(input.script);
    if (alphabet === "neutral" || alphabet === language.alphabet) return [];
    return [
      `${named} the script is written in ${ALPHABET_LETTERS[alphabet]}: the voice may mispronounce it, and the video may ` +
        `come out longer than its length limit and fail; ${LIST_HINT}`,
    ];
  }
  if (input.brief === undefined) return [];
  const letters = scriptLetterCounts(input.brief);
  const other = language.alphabet === "cyrillic" ? "latin" : "cyrillic";
  if (letters[language.alphabet] > 0 || letters[other] === 0) return [];
  return [
    `${named} the brief is written in ${ALPHABET_LETTERS[other]}: if the narration is written in the same language as ` +
      `the brief, ${language.voice} may mispronounce it, and the video may come out longer than its length limit and fail; ` +
      `a brief may ask for the narration's language in words; ${LIST_HINT}`,
  ];
}
