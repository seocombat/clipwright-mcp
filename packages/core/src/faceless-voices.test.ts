import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { makeFacelessInput } from "./faceless-public.js";
import {
  buildFacelessVoiceWarnings,
  DEFAULT_FACELESS_VOICE,
  FACELESS_SPEECH_MODEL,
  FACELESS_VOICE_NAMES,
  FACELESS_VOICES,
  isFacelessVoiceName,
} from "./faceless-voices.js";
import { makeUgcInput } from "./skills.js";
import { catalogVoiceRefusal, facelessVoiceRefusal, serverFacelessInput, serverUgcInput } from "./voice-admission.js";
import { VOICE_CATALOG } from "./voice-catalog-data.js";
import { CATALOG_LANGUAGES } from "./voice-catalog.js";
import { MODEL_VOICE_NAMES, TTS_MODELS, VOICE_NAME_PATTERN, VOICE_PRESET_NAMES } from "./voices.js";

const script = { input_mode: "script", script: "A clear story with spoken words.", duration_seconds: 30 };
const brief = { input_mode: "brief", brief: "Explain how the product works.", duration_seconds: 90 };
const LIVE_SLUG = VOICE_CATALOG.voices.find((entry) => entry.retired_at === undefined)!.slug;
const RETIRED = { ...VOICE_CATALOG.voices[0]!, slug: "es_female_retired_fixture", retired_at: "2026-09-20T10:00:00.000Z" };
const russian = FACELESS_VOICE_NAMES.find((name) => FACELESS_VOICES[name].language === "ru")!;
const english = FACELESS_VOICE_NAMES.find((name) => FACELESS_VOICES[name].language === "en")!;
const messageOf = (result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);

describe("FACELESS_VOICES — the listed set", () => {
  it("every name is a lowercase voice name that starts with narrator_ and names its language", () => {
    for (const name of FACELESS_VOICE_NAMES) {
      expect(name, name).toMatch(VOICE_NAME_PATTERN);
      expect(name, name).toBe(name.toLowerCase());
      expect(name.startsWith(`narrator_${FACELESS_VOICES[name].language}_`), name).toBe(true);
    }
  });

  it("no name is a preset, a model voice or a catalog slug, tombstones included", () => {
    const taken = new Set<string>([...VOICE_PRESET_NAMES, ...MODEL_VOICE_NAMES, ...VOICE_CATALOG.voices.map((entry) => entry.slug)]);
    expect(FACELESS_VOICE_NAMES.filter((name) => taken.has(name))).toEqual([]);
    // No catalog slug can become one later: a slug starts with its language code.
    expect((CATALOG_LANGUAGES as readonly string[]).includes("narrator")).toBe(false);
  });

  it("every voice has a catalog language, a gender and a description; the default is listed", () => {
    for (const name of FACELESS_VOICE_NAMES) {
      const voice = FACELESS_VOICES[name];
      expect(CATALOG_LANGUAGES, name).toContain(voice.language);
      expect(["female", "male"], name).toContain(voice.gender);
      expect(voice.description.trim().length, name).toBeGreaterThan(10);
    }
    expect(isFacelessVoiceName(DEFAULT_FACELESS_VOICE)).toBe(true);
    expect(isFacelessVoiceName("george")).toBe(false);
    expect(isFacelessVoiceName("toString")).toBe(false);
  });

  // Row by row: a listing filter reads language and gender, and two rows that trade them pass every rule above.
  it("lists each voice under the language and gender measured for it", () => {
    expect(Object.fromEntries(FACELESS_VOICE_NAMES.map((name) => [name, `${FACELESS_VOICES[name].language} ${FACELESS_VOICES[name].gender}`]))).toEqual({
      narrator_en_wise_lady: "en female", narrator_en_kind_girl: "en female", narrator_en_firm_lady: "en female",
      narrator_en_gentle_man: "en male", narrator_en_deep_gentleman: "en male", narrator_en_storyteller: "en male",
      narrator_ru_ambitious_woman: "ru female", narrator_ru_bright_queen: "ru female",
      narrator_ru_reliable_man: "ru male", narrator_ru_deep_man: "ru male",
      narrator_es_serene_woman: "es female", narrator_es_storyteller: "es male",
      narrator_pt_wise_lady: "pt female", narrator_pt_storyteller: "pt male",
      narrator_fr_classic_man: "fr male", narrator_it_calm_woman: "it female", narrator_it_classic_man: "it male",
    });
  });

  it("English and Russian are offered in both genders", () => {
    for (const language of ["en", "ru"]) {
      const genders = FACELESS_VOICE_NAMES.filter((name) => FACELESS_VOICES[name].language === language)
        .map((name) => FACELESS_VOICES[name].gender);
      expect(new Set(genders), language).toEqual(new Set(["female", "male"]));
    }
  });

  it("the faceless speech model is not a tts_model of make_ugc", () => {
    expect((TTS_MODELS as readonly string[]).includes(FACELESS_SPEECH_MODEL)).toBe(false);
    expect(makeUgcInput.safeParse({ script: "hello world", tts_model: FACELESS_SPEECH_MODEL }).success).toBe(false);
  });

  it("the module names no vendor: only our names, languages and descriptions", () => {
    const source = readFileSync(fileURLToPath(new URL("./faceless-voices.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/minimax/i);
    // A vendor system voice id is `Language_Name`: a capitalized language, then an underscore.
    expect(source.match(/\b[A-Z][a-z]+_[A-Za-z]/g) ?? []).toEqual([]);
  });
});

describe("makeFacelessInput — voice", () => {
  it("takes a voice name and keeps it; without the field the parsed input has no voice key", () => {
    expect(makeFacelessInput.parse({ ...script, voice: russian }).voice).toBe(russian);
    expect(makeFacelessInput.parse({ ...brief, voice: english }).voice).toBe(english);
    expect(Object.keys(makeFacelessInput.parse(script)).sort()).toEqual(["captions", "duration_seconds", "input_mode", "script"]);
  });

  it("refuses what is not a voice name, naming where names come from", () => {
    for (const voice of ["", "two words", "narrator/en", 7, null]) {
      const result = makeFacelessInput.safeParse({ ...script, voice });
      expect(result.success, String(voice)).toBe(false);
      expect(messageOf(result)?.join(), String(voice)).toMatch(/^voice: voice .*list_voices/);
    }
  });

  it("refuses voice_id in both modes with the registry's reason, whatever its value", () => {
    const reason =
      "voice_id: voice_id is not accepted by make_faceless: pass voice with a name from list_voices (skill=make_faceless), " +
      "or omit both for the default voice";
    for (const input of [script, brief]) {
      for (const voice_id of ["JBFqnCBsd6RMkjVDRZzb", "", null, 1]) {
        expect(messageOf(makeFacelessInput.safeParse({ ...input, voice_id }))).toEqual([reason]);
      }
      expect(messageOf(serverFacelessInput.safeParse({ ...input, voice: english, voice_id: "JBFqnCBsd6RMkjVDRZzb" }))).toEqual([reason]);
    }
  });
});

describe("serverFacelessInput — the voice name is checked before any charge", () => {
  it("accepts every listed faceless voice and an input without one", () => {
    for (const voice of FACELESS_VOICE_NAMES) {
      expect(serverFacelessInput.safeParse({ ...script, voice }).success, voice).toBe(true);
      expect(facelessVoiceRefusal(voice), voice).toBeUndefined();
    }
    expect(serverFacelessInput.parse(script)).toEqual(makeFacelessInput.parse(script));
    expect(serverFacelessInput.parse({ ...brief, voice: english })).toEqual(makeFacelessInput.parse({ ...brief, voice: english }));
  });

  it("refuses an unknown name and says which list to read", () => {
    expect(messageOf(serverFacelessInput.safeParse({ ...script, voice: "narrator_en_nobody" }))).toEqual([
      'voice: unknown voice "narrator_en_nobody": call list_voices with skill=make_faceless for the voice names make_faceless accepts',
    ]);
    expect(messageOf(serverFacelessInput.safeParse({ ...brief, voice: "narrator_en_nobody" }))?.[0]).toMatch(/^voice: unknown voice/);
  });

  it("refuses a make_ugc voice of every kind, naming the skill it belongs to", () => {
    const voices = [...VOICE_CATALOG.voices, RETIRED];
    for (const voice of ["george", "owner_ru_clone", "kore", LIVE_SLUG, RETIRED.slug]) {
      expect(facelessVoiceRefusal(voice, voices), voice).toBe(
        `voice "${voice}" is a make_ugc voice and make_faceless does not speak it: ` +
          "choose a voice from list_voices with skill=make_faceless, or omit voice for the default voice",
      );
    }
    for (const voice of ["george", "kore", LIVE_SLUG]) {
      expect(messageOf(serverFacelessInput.safeParse({ ...script, voice }))?.[0], voice).toMatch(/^voice: voice ".*" is a make_ugc voice/);
    }
  });
});

describe("make_ugc refuses a faceless voice before any charge", () => {
  it("names make_faceless as the skill that speaks it, not an unknown voice", () => {
    for (const voice of FACELESS_VOICE_NAMES) {
      const refusal =
        `voice "${voice}" is a make_faceless voice and make_ugc does not speak it: ` +
        "choose a voice from list_voices with skill=make_ugc, or omit voice for the default voice";
      expect(catalogVoiceRefusal(voice), voice).toBe(refusal);
      expect(messageOf(serverUgcInput.safeParse({ script: "hello world", voice })), voice).toEqual([`voice: ${refusal}`]);
    }
  });

  // The prefix alone does not make a name a faceless voice: an unlisted one is unknown to both skills.
  it("answers an unlisted narrator_ name as an unknown voice", () => {
    for (const voice of ["narrator_en_nobody", "narrator_", "narrator_en_wise_lady_2"]) {
      expect(catalogVoiceRefusal(voice), voice).toMatch(/^unknown voice/);
      expect(catalogVoiceRefusal(voice), voice).not.toContain("make_faceless voice");
    }
  });
});

describe("buildFacelessVoiceWarnings", () => {
  const latin = "A clear story with spoken words.";
  const cyrillic = "Каждое утро гавань просыпается раньше города.";

  const consequence =
    "the voice may mispronounce it, and the video may come out longer than its length limit and fail; " +
    "list_voices with skill=make_faceless names the voices of each language";

  it("names a chosen voice whose language is written in another alphabet than the script, in plain words", () => {
    expect(buildFacelessVoiceWarnings({ voice: russian, script: latin })).toEqual([
      `voice "${russian}" is a Russian voice, but the script is written in Latin letters: ${consequence}`,
    ]);
    expect(buildFacelessVoiceWarnings({ voice: english, script: cyrillic })).toEqual([
      `voice "${english}" is an English voice, but the script is written in Cyrillic letters: ${consequence}`,
    ]);
  });

  const conditional = (voice: string, named: string, letters: string) =>
    `voice "${voice}" is ${named}, but the brief is written in ${letters}: if the narration is written in the same language as ` +
    `the brief, ${named} may mispronounce it, and the video may come out longer than its length limit and fail; ` +
    "a brief may ask for the narration's language in words; list_voices with skill=make_faceless names the voices of each language";

  // Mutants: a brief judged by its dominant alphabet, a brief branch that reads `script`, a claim that the narration follows the brief.
  it("names a brief only when it holds no letter of the voice's alphabet, and only conditionally", () => {
    expect(buildFacelessVoiceWarnings({ voice: russian, brief: "A video in Russian about how tides work" })).toEqual([
      conditional(russian, "a Russian voice", "Latin letters"),
    ]);
    expect(buildFacelessVoiceWarnings({ voice: english, brief: cyrillic })).toEqual([
      conditional(english, "an English voice", "Cyrillic letters"),
    ]);
    expect(buildFacelessVoiceWarnings({ voice: russian, brief: "AI" })).toEqual([conditional(russian, "a Russian voice", "Latin letters")]);
    // One letter of the voice's alphabet is enough: the brief may be in that language, or ask for it.
    for (const mixed of ["Обзор iPhone 17 Pro Max", "A long English brief about harbors, tides and the moon, по-русски"]) {
      expect(buildFacelessVoiceWarnings({ voice: russian, brief: mixed }), mixed).toEqual([]);
      expect(buildFacelessVoiceWarnings({ voice: english, brief: mixed }), mixed).toEqual([]);
    }
    expect(buildFacelessVoiceWarnings({ voice: english, brief: "AI" })).toEqual([]);
    expect(buildFacelessVoiceWarnings({ voice: russian, brief: cyrillic })).toEqual([]);
    expect(buildFacelessVoiceWarnings({ voice: english, brief: latin })).toEqual([]);
    // Each count is tested at one: a single letter of the voice's alphabet silences the line, a single letter of the other raises it.
    expect(buildFacelessVoiceWarnings({ voice: russian, brief: "A video about how tides work, я" })).toEqual([]);
    expect(buildFacelessVoiceWarnings({ voice: english, brief: "Видео о приливах, a" })).toEqual([]);
    expect(buildFacelessVoiceWarnings({ voice: russian, brief: "2026: a" })).toEqual([conditional(russian, "a Russian voice", "Latin letters")]);
    expect(buildFacelessVoiceWarnings({ voice: english, brief: "2026: я" })).toHaveLength(1);
    expect(buildFacelessVoiceWarnings({ voice: english, brief: "2026: я" })[0]).toContain("the brief is written in Cyrillic letters");
  });

  it("judges a script by its dominant alphabet, as before, and never by the brief's rule", () => {
    const mixed = "Обзор iPhone 17 Pro Max";
    expect(buildFacelessVoiceWarnings({ voice: russian, script: mixed })).toEqual([
      `voice "${russian}" is a Russian voice, but the script is written in Latin letters: ${consequence}`,
    ]);
    expect(buildFacelessVoiceWarnings({ voice: russian, script: mixed, brief: cyrillic })).toEqual(
      buildFacelessVoiceWarnings({ voice: russian, script: mixed }),
    );
    expect(buildFacelessVoiceWarnings({ voice: english, script: "Я" })).toEqual([]);
  });

  // Mutant: any row of the language table with the other alphabet, or another name, fails for that language.
  it("every voice is silent on a sentence of its own language and named against the other alphabet", () => {
    const sample = {
      en: "Every morning the harbor wakes before the town does.",
      ru: "Каждое утро гавань просыпается раньше города.",
      es: "Cada mañana el puerto despierta antes que el pueblo.",
      pt: "Todas as manhãs o porto acorda antes da cidade.",
      fr: "Chaque matin, le port se réveille avant la ville.",
      it: "Ogni mattina il porto si sveglia prima della città.",
    } as const;
    const named = { en: "an English voice", ru: "a Russian voice", es: "a Spanish voice", pt: "a Portuguese voice",
      fr: "a French voice", it: "an Italian voice" } as const;
    expect(new Set(FACELESS_VOICE_NAMES.map((name) => FACELESS_VOICES[name].language))).toEqual(new Set(Object.keys(sample)));
    for (const voice of FACELESS_VOICE_NAMES) {
      const language = FACELESS_VOICES[voice].language;
      const other = language === "ru" ? { text: sample.en, letters: "Latin letters" } : { text: sample.ru, letters: "Cyrillic letters" };
      for (const mode of ["script", "brief"] as const) {
        expect(buildFacelessVoiceWarnings({ voice, [mode]: sample[language] }), `${voice} ${mode}`).toEqual([]);
        const [line, ...rest] = buildFacelessVoiceWarnings({ voice, [mode]: other.text });
        expect(rest, `${voice} ${mode}`).toEqual([]);
        expect(line, `${voice} ${mode}`).toContain(`voice "${voice}" is ${named[language]}, but the ${mode} is written in ${other.letters}`);
      }
    }
  });

  it("is one line that names no vendor and no model", () => {
    const [line] = buildFacelessVoiceWarnings({ voice: russian, brief: latin });
    expect(line).not.toMatch(/\n|minimax|speech-|narrator-v1|model/i);
  });

  it("is silent when the alphabets agree, when the text has no letters to judge, and without a text", () => {
    expect(buildFacelessVoiceWarnings({ voice: russian, script: cyrillic })).toEqual([]);
    expect(buildFacelessVoiceWarnings({ voice: english, script: latin })).toEqual([]);
    expect(buildFacelessVoiceWarnings({ voice: russian, script: "2026 — 100%" })).toEqual([]);
    expect(buildFacelessVoiceWarnings({ voice: russian, brief: "2026 — 100%" })).toEqual([]);
    expect(buildFacelessVoiceWarnings({ voice: russian })).toEqual([]);
  });

  it("never fires without a chosen voice: the default path stays as it was", () => {
    expect(buildFacelessVoiceWarnings({ script: cyrillic })).toEqual([]);
    expect(buildFacelessVoiceWarnings({ brief: cyrillic })).toEqual([]);
    expect(buildFacelessVoiceWarnings({ brief: latin })).toEqual([]);
    expect(buildFacelessVoiceWarnings({ voice: "george", script: cyrillic })).toEqual([]);
    expect(buildFacelessVoiceWarnings({ voice: "george", brief: cyrillic })).toEqual([]);
  });
});
