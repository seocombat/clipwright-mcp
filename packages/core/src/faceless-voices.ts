import type { Gender } from "./default-actor.js";
import type { CatalogLanguage } from "./voice-catalog.js";
import { detectScriptFamily, scriptLetterCounts } from "./voices.js";

/** Our label for the speech model that reads `make_faceless` narration. Not a `tts_model`: `make_ugc` does not speak it. */
export const FACELESS_SPEECH_MODEL = "narrator-v1";

/** A narration voice of `make_faceless` by OUR name; the worker holds its vendor id and measured pace. */
export interface FacelessVoice {
  language: CatalogLanguage;
  gender: Gender;
  description: string;
}

/** The voices `make_faceless` speaks, each measured live (docs/70, "Voice choice"). Every name starts */
/** with `narrator_`, which no preset, model voice or catalog slug does. */
export const FACELESS_VOICES = {
  narrator_en_wise_lady: { language: "en", gender: "female", description: "Wise, genial middle-aged woman with a British accent" },
  narrator_en_kind_girl: { language: "en", gender: "female", description: "Kind, calm young woman with an American accent" },
  narrator_en_firm_lady: { language: "en", gender: "female", description: "Mature, commanding middle-aged woman with an American accent" },
  narrator_en_gentle_man: { language: "en", gender: "male", description: "Gentle, warm man with an American accent" },
  narrator_en_deep_gentleman: { language: "en", gender: "male", description: "Deep-voiced, thoughtful gentleman with a British accent" },
  narrator_en_storyteller: { language: "en", gender: "male", description: "Senior storyteller with an American accent and a cool, detached tone" },
  narrator_ru_ambitious_woman: { language: "ru", gender: "female", description: "Demanding, ambitious woman (Russian)" },
  narrator_ru_bright_queen: { language: "ru", gender: "female", description: "Bright, haughty woman (Russian)" },
  narrator_ru_reliable_man: { language: "ru", gender: "male", description: "Steady, reliable middle-aged man (Russian)" },
  narrator_ru_deep_man: { language: "ru", gender: "male", description: "Deep-voiced man (Russian)" },
  narrator_es_serene_woman: { language: "es", gender: "female", description: "Soothing, serene young woman (Spanish)" },
  narrator_es_storyteller: { language: "es", gender: "male", description: "Middle-aged narrator for storytelling (Spanish)" },
  narrator_pt_wise_lady: { language: "pt", gender: "female", description: "Smooth, wise middle-aged woman (Portuguese)" },
  narrator_pt_storyteller: { language: "pt", gender: "male", description: "Middle-aged narrator for storytelling (Portuguese)" },
  narrator_fr_classic_man: { language: "fr", gender: "male", description: "Classic narrator for storytelling (French)" },
  narrator_it_calm_woman: { language: "it", gender: "female", description: "Calm, diligent woman (Italian)" },
  narrator_it_classic_man: { language: "it", gender: "male", description: "Classic middle-aged narrator (Italian)" },
} as const satisfies Record<string, FacelessVoice>;
export type FacelessVoiceName = keyof typeof FACELESS_VOICES;
export const FACELESS_VOICE_NAMES = Object.keys(FACELESS_VOICES) as [FacelessVoiceName, ...FacelessVoiceName[]];

/** The voice a run speaks when it names none. */
export const DEFAULT_FACELESS_VOICE = "narrator_en_wise_lady" satisfies FacelessVoiceName;

export function isFacelessVoiceName(name: string): name is FacelessVoiceName {
  return Object.hasOwn(FACELESS_VOICES, name);
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
} as const satisfies Record<FacelessVoiceLanguage, { voice: string; alphabet: "cyrillic" | "latin" }>;

const ALPHABET_LETTERS = { cyrillic: "Cyrillic letters", latin: "Latin letters" } as const;

const LIST_HINT = "list_voices with skill=make_faceless names the voices of each language";

/** Fires only for a voice the client named. A script is judged by the alphabet most of its letters say; a brief */
/** only when it holds no letter of the voice's alphabet, since it may ask for another language (docs/70, "Voice choice"). */
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
