import { describe, expect, it } from "vitest";
import {
  buildActorGenderWarnings,
  buildSpeechModelWarnings,
  hasUncutBreakTag,
  composeRunWarnings as composeWith,
  DEFAULT_TTS_MODEL,
  DEFAULT_VOICE_BY_GENDER,
  DEFAULT_VOICE_PRESET,
  ELEVENLABS_TTS_MODELS,
  IMAGE_DEFAULT_VOICE_WARNING,
  makeUgcInput,
  MODEL_VOICE_MODEL,
  MODEL_VOICE_NAMES,
  offeredUgcInputShape,
  resolveTtsModel,
  resolveVoiceSelection,
  RUSSIAN_TTS_MODEL,
  speaksOwnVoices,
  speechBackendOf,
  speechModelRefusals,
  speechTextFor,
  STRESS_MARK,
  STRESS_MARK_MODELS,
  stressMarksFromCapitals,
  TTS_MODEL_BACKEND,
  TTS_MODEL_CHAR_CAP,
  TTS_MODELS,
  VOICE_PRESETS,
  voiceCatalogEntry,
} from "./index.js";
import { voiceGenderOf } from "./voice-admission.js";

const MARK = STRESS_MARK;
const RUSSIAN = "Привет, это проверка голоса";
const UKRAINIAN = "Привіт, це перевірка голосу";
const ENGLISH = "Hello, this is a voice check";
const RAW_VOICE_ID = "rawVoiceId123456";

/** Voice gender is not the subject here; the model is. */
const composeRunWarnings = (stored: unknown, input: unknown, preflight: unknown, skill: string) =>
  composeWith(stored, input, preflight, skill, voiceGenderOf);

describe("the speech model is a preset property", () => {
  it.each([4999, 5000])("accepts %i Russian characters beyond the old word ceiling", (length) => {
    const script = "слово ".repeat(834).slice(0, length);
    const result = makeUgcInput.safeParse({ script, voice: "owner_ru_clone" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.script).toBe(script);
  });

  it("reports the selected model, actual length and ceiling before synthesis", () => {
    const result = makeUgcInput.safeParse({
      script: "слово ".repeat(834).slice(0, 5001),
      voice: "owner_ru_clone",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["script"], message: expect.stringMatching(/5001.*eleven_v4.*5000/) }),
      ]));
    }
  });

  it("honors the explicit model override and raw voice model for long scripts", () => {
    const script = "слово ".repeat(1000);
    expect(makeUgcInput.safeParse({ script, voice: "owner_ru_clone", tts_model: "eleven_flash_v2_5" }).success).toBe(true);
    expect(makeUgcInput.safeParse({ script, voice_id: "rawVoiceId123456", tts_model: "eleven_turbo_v2_5" }).success).toBe(true);
    expect(makeUgcInput.safeParse({ script, voice_id: "rawVoiceId123456" }).success).toBe(false);
  });

  it("the default model is eleven_v3 and holds its 5000-character ceiling", () => {
    expect(DEFAULT_TTS_MODEL).toBe("eleven_v3");
    expect(makeUgcInput.safeParse({ script: "word ".repeat(1000) }).success).toBe(true);
    expect(makeUgcInput.safeParse({ script: `${"word ".repeat(1000)}w` }).success).toBe(false);
  });

  it("counts spaces, tags and surrogate pairs consistently at the v3 boundary", () => {
    const script = `[whispers] ${"я ".repeat(2493)}я😀`;
    expect(script.length).toBe(5000);
    expect(makeUgcInput.safeParse({ script, tts_model: "eleven_v3" }).success).toBe(true);
    expect(makeUgcInput.safeParse({ script: `${script}я`, tts_model: "eleven_v3" }).success).toBe(false);
  });

  it("the offered script describes every model ceiling, what is counted and the stress convention", () => {
    const description = offeredUgcInputShape.script.description;
    expect(description).toMatch(/eleven_v3.*5000/);
    expect(description).toMatch(/eleven_flash_v2_5.*10000/);
    expect(description).toMatch(/eleven_turbo_v2_5.*10000/);
    expect(description).toMatch(/eleven_v4: 5000 characters/);
    expect(description).toMatch(/gemini-3\.8-flash-tts: 5000 characters/);
    expect(description).toContain("spaces");
    expect(description).toContain("потОм");
    expect(description).toContain("eleven_v3, eleven_v4 and gemini-3.8-flash-tts receive it as the stress mark U+0301");
    expect(description).toContain("Break tags are cut from the text sent to eleven_v4 and gemini-3.8-flash-tts and are not counted there.");
  });

  it("eleven_v4 holds its 5000-character ceiling on the text sent, break tags cut", () => {
    const words = "слово ".repeat(834);
    expect(makeUgcInput.safeParse({ script: words.slice(0, 5000), tts_model: "eleven_v4" }).success).toBe(true);
    const over = makeUgcInput.safeParse({ script: words.slice(0, 5001), voice: "owner_ru_clone", tts_model: "eleven_v4" });
    expect(over.success).toBe(false);
    if (!over.success) {
      expect(over.error.issues[0]?.message).toMatch(/^script has 5001 characters; eleven_v4 allows at most 5000/);
      expect(over.error.issues[0]?.message).toMatch(/eleven_flash_v2_5 and eleven_turbo_v2_5 allow 10000/);
      expect(over.error.issues[0]?.message).toContain("(including spaces, audio tags and stress marks, break tags cut; emoji may count as two)");
    }
    // Mutant: `speechTextFor` leaves the tag in for eleven_v4 and the first parse fails on 5022 characters.
    const tagged = `${words.slice(0, 2500)} <break time="2.0s" /> ${words.slice(0, 2499)}`;
    expect(tagged.length).toBe(5022);
    expect(speechTextFor(tagged, "eleven_v4").length).toBe(5000);
    expect(makeUgcInput.safeParse({ script: tagged, tts_model: "eleven_v4" }).success).toBe(true);
    expect(makeUgcInput.safeParse({ script: tagged, tts_model: "eleven_v3" }).success).toBe(false);
  });

  it("eleven_v4 is a model a client may name and stays the last ElevenLabs model; another vendor's model follows it", () => {
    expect(ELEVENLABS_TTS_MODELS.at(-1)).toBe("eleven_v4");
    expect(TTS_MODELS).toEqual([...ELEVENLABS_TTS_MODELS, "gemini-3.8-flash-tts"]);
    expect(RUSSIAN_TTS_MODEL).toBe("eleven_v4");
    expect(makeUgcInput.safeParse({ script: "привет", tts_model: "eleven_v4" }).success).toBe(true);
    expect(resolveTtsModel({ voice: "george", tts_model: "eleven_v4", script: ENGLISH })).toBe("eleven_v4");
  });

  // Mutant: a default voice on another model splits the long-form estimate, which has no pinned actor, from the quote.
  it("the three default voices speak one model, so an unknown actor gender cannot change it", () => {
    const defaults = [DEFAULT_VOICE_PRESET, DEFAULT_VOICE_BY_GENDER.female, DEFAULT_VOICE_BY_GENDER.male];
    expect(new Set(defaults.map((name) => VOICE_PRESETS[name].model)).size).toBe(1);
    for (const gender of [undefined, "female", "male"] as const) {
      expect(resolveTtsModel({ script: RUSSIAN }, gender), String(gender)).toBe(DEFAULT_TTS_MODEL);
    }
  });

  // Mutant: a new Russian preset left on the default model fails here.
  it("a Russian preset speaks eleven_v4, every other preset the default, and each names its model", () => {
    for (const [name, preset] of Object.entries(VOICE_PRESETS)) {
      expect(preset.model, name).toBe(preset.language === "ru" ? "eleven_v4" : DEFAULT_TTS_MODEL);
      expect(resolveTtsModel({ voice: name, script: ENGLISH }), name).toBe(preset.model);
      expect(voiceCatalogEntry.safeParse({ name, ...preset }).success, name).toBe(true);
    }
    expect(Object.entries(VOICE_PRESETS).filter(([, preset]) => preset.language === "ru").map(([name]) => name))
      .toEqual(["owner_ru_clone", "daria_ru_female"]);
  });

  it("eleven_multilingual_v2 is removed from the contract", () => {
    expect(TTS_MODELS).not.toContain("eleven_multilingual_v2");
    expect(makeUgcInput.safeParse({ script: "hi", tts_model: "eleven_multilingual_v2" }).success).toBe(false);
  });

  // Mutant: the preset or the script read before the explicit field fails the first block.
  it("resolveTtsModel: an explicit field beats the preset, the slug and the script", () => {
    expect(resolveTtsModel({ voice: "owner_ru_clone", tts_model: "eleven_v3", script: RUSSIAN })).toBe("eleven_v3");
    expect(resolveTtsModel({ voice: "ru_female_any_catalog_slug", tts_model: "eleven_v3", script: RUSSIAN })).toBe("eleven_v3");
    expect(resolveTtsModel({ voice_id: RAW_VOICE_ID, tts_model: "eleven_v3", script: RUSSIAN })).toBe("eleven_v3");
    expect(resolveTtsModel({ voice: "owner_ru_clone", tts_model: "eleven_flash_v2_5", script: RUSSIAN })).toBe("eleven_flash_v2_5");
    expect(resolveTtsModel({ voice_id: RAW_VOICE_ID, tts_model: "eleven_turbo_v2_5", script: ENGLISH })).toBe("eleven_turbo_v2_5");
  });

  it("resolveTtsModel: a preset speaks its own model whatever the script", () => {
    expect(resolveTtsModel({ voice: "owner_ru_clone", script: ENGLISH })).toBe("eleven_v4");
    expect(resolveTtsModel({ voice: "daria_ru_female", script: RUSSIAN })).toBe("eleven_v4");
    for (const voice of ["george", "sarah", "eric"]) {
      expect(resolveTtsModel({ voice, script: RUSSIAN }), voice).toBe("eleven_v3");
    }
    expect(resolveTtsModel({ script: RUSSIAN })).toBe("eleven_v3");
  });

  // Mutants: a catalog branch that reads the script, and one that returns the default for every slug.
  it("resolveTtsModel: a catalog voice goes by its slug language, never by the script", () => {
    expect(resolveTtsModel({ voice: "ru_female_any_catalog_slug", script: ENGLISH })).toBe("eleven_v4");
    expect(resolveTtsModel({ voice: "ru_male_other", script: "" })).toBe("eleven_v4");
    expect(resolveTtsModel({ voice: "uk_female_any", script: UKRAINIAN })).toBe("eleven_v3");
    expect(resolveTtsModel({ voice: "bg_male_any", script: RUSSIAN })).toBe("eleven_v3");
    expect(resolveTtsModel({ voice: "es_female_any", script: RUSSIAN })).toBe("eleven_v3");
    expect(resolveTtsModel({ voice: "rumba_voice", script: RUSSIAN })).toBe("eleven_v3");
  });

  // Mutant: a raw id that never reads the script fails the first line.
  it("resolveTtsModel: a raw voice_id goes by the script family", () => {
    expect(resolveTtsModel({ voice_id: RAW_VOICE_ID, script: RUSSIAN })).toBe("eleven_v4");
    expect(resolveTtsModel({ voice_id: RAW_VOICE_ID, script: UKRAINIAN })).toBe("eleven_v4");
    expect(resolveTtsModel({ voice_id: RAW_VOICE_ID, script: ENGLISH })).toBe(DEFAULT_TTS_MODEL);
    expect(resolveTtsModel({ voice_id: RAW_VOICE_ID, script: "12 345" })).toBe(DEFAULT_TTS_MODEL);
    expect(resolveTtsModel({ voice_id: RAW_VOICE_ID, script: "hello привет" })).toBe(DEFAULT_TTS_MODEL);
  });

  it("resolveTtsModel takes the voice model by actor gender; an explicit voice beats gender", () => {
    expect(resolveTtsModel({ script: RUSSIAN }, "female")).toBe(VOICE_PRESETS.sarah.model);
    expect(resolveTtsModel({ script: RUSSIAN }, "male")).toBe(VOICE_PRESETS.george.model);
    expect(resolveTtsModel({ voice: "owner_ru_clone", script: ENGLISH }, "female")).toBe(VOICE_PRESETS.owner_ru_clone.model);
    expect(resolveTtsModel({ voice_id: RAW_VOICE_ID, script: ENGLISH }, "female")).toBe(DEFAULT_TTS_MODEL);
  });

  // Mutant: the schema reading `script` instead of the joined segments lets the long input through.
  it("a raw voice_id on segments takes its model and its cap from the joined lines", () => {
    const line = "слово ".repeat(417).trim();
    const segments = [{ kind: "actor", script: line }, { kind: "actor", script: `${line} ${"ы".repeat(2500)}` }];
    expect(segments.map((segment) => segment.script).join(" ").length).toBeGreaterThan(TTS_MODEL_CHAR_CAP.eleven_v4);
    const result = makeUgcInput.safeParse({ segments, voice_id: RAW_VOICE_ID });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/eleven_v4 allows at most 5000/);
    expect(makeUgcInput.safeParse({ segments, voice_id: RAW_VOICE_ID, tts_model: "eleven_flash_v2_5" }).success).toBe(true);
  });

  it("the character cap is per model: v3 refuses what 2.5 still accepts", () => {
    const words = Array.from({ length: 170 }, () => "слово").join(" ");
    const longScript = `${words} ${"ы".repeat(TTS_MODEL_CHAR_CAP.eleven_v3)}`;
    expect(longScript.length).toBeGreaterThan(TTS_MODEL_CHAR_CAP.eleven_v3);
    expect(longScript.length).toBeLessThanOrEqual(TTS_MODEL_CHAR_CAP.eleven_flash_v2_5);
    expect(makeUgcInput.safeParse({ script: longScript, voice: "george" }).success).toBe(false);
    expect(makeUgcInput.safeParse({ script: longScript, voice: "george", tts_model: "eleven_flash_v2_5" }).success).toBe(true);
    expect(makeUgcInput.safeParse({ script: longScript, voice: "owner_ru_clone" }).success).toBe(false);
  });

  it("tts_model is offered in tools/list with a description naming every model and the cheaper option", () => {
    const description = offeredUgcInputShape.tts_model.description;
    expect(description).toContain("eleven_v3 | eleven_flash_v2_5 | eleven_turbo_v2_5");
    expect(description).toContain("cheaper");
    expect(description).toContain("Russian");
  });

  it("the contract texts name both models that read stress marks and no longer send Russian to eleven_v3", () => {
    const texts = [offeredUgcInputShape.tts_model.description, offeredUgcInputShape.script.description].join("\n");
    expect(texts).toContain("eleven_v4 for the Russian presets and for catalog voices named ru_*");
    expect(texts).toContain("A raw voice_id speaks eleven_v4 when the script is mostly Cyrillic and eleven_v3 otherwise.");
    expect(texts).toContain("eleven_v4, eleven_v3 and gemini-3.8-flash-tts read stress marks");
    expect(texts).not.toMatch(/every preset speaks eleven_v3|only one that reads stress marks|use eleven_v3 for Russian/);
  });

  it("a script of nothing but break tags is refused for eleven_v4 at the input, per spoken unit", () => {
    const tag = '<break time="1s"/>';
    const refusal = "script has nothing to say on eleven_v4: break tags are cut from the text sent to it, and no words are left";
    for (const input of [
      { script: tag, tts_model: "eleven_v4" },
      { script: ` ${tag} ${tag}\n`, voice: "owner_ru_clone" },
      { segments: [{ kind: "actor", script: "Привет, это первая реплика" }, { kind: "actor", script: tag }], voice: "daria_ru_female" },
    ]) {
      const result = makeUgcInput.safeParse(input);
      expect(result.success, JSON.stringify(input)).toBe(false);
      if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain(refusal);
    }
    expect(makeUgcInput.safeParse({ script: tag, tts_model: "eleven_v3" }).success).toBe(true);
    expect(makeUgcInput.safeParse({ script: `слово ${tag}`, tts_model: "eleven_v4" }).success).toBe(true);
  });
});

describe("stress marked by a capital letter", () => {
  it.each([
    ["потОм", `пото${MARK}м`],
    ["зАмок висит, а замОк заперт", `за${MARK}мок висит, а замо${MARK}к заперт`],
    ["ЗАмок", `За${MARK}мок`],
    ["ВсЁ", "Всё"],
    ["Привет, Анна!", "Привет, Анна!"],
    ["СССР и ТВ", "СССР и ТВ"],
    ["ВАЖНО: ОАО", "ВАЖНО: ОАО"],
    ["МакДональдс", "МакДональдс"],
    ["ВУЗы, СМИшный, ОООшка", "ВУЗы, СМИшный, ОООшка"],
    ["ОМОНовцы и СУПЕРцена", "ОМОНовцы и СУПЕРцена"],
    ["зАмок-крепость", `за${MARK}мок-крепость`],
    [`пото${MARK}м`, `пото${MARK}м`],
    [`потО${MARK}м`, `пото${MARK}м`],
    [`${MARK}Анна`, `${MARK}Анна`],
    ["iPhone и hElLo", "iPhone и hElLo"],
  ])("%s → %s", (input, expected) => {
    expect(stressMarksFromCapitals(input)).toBe(expected);
  });

  it("converting twice changes nothing", () => {
    const once = stressMarksFromCapitals("ЗАмок стоИт, потОм");
    expect(stressMarksFromCapitals(once)).toBe(once);
  });

  it("converts for v3 and v4: 2.5 models get the text as sent", () => {
    expect(speechTextFor("потОм", "eleven_v3")).toBe(`пото${MARK}м`);
    expect(speechTextFor("потОм", "eleven_v4")).toBe(`пото${MARK}м`);
    expect(speechTextFor("потОм", "eleven_flash_v2_5")).toBe("потОм");
    expect(speechTextFor("потОм", "eleven_turbo_v2_5")).toBe("потОм");
  });

  it("the schema keeps the client's casing: the stage converts, not the input", () => {
    expect(makeUgcInput.parse({ script: "потОм" }).script).toBe("потОм");
  });

  it("the cap is measured on the text with stress marks", () => {
    const script = "потОм ".repeat(833);
    expect(script.length).toBeLessThanOrEqual(TTS_MODEL_CHAR_CAP.eleven_v3);
    const v3 = makeUgcInput.safeParse({ script });
    expect(v3.success).toBe(false);
    if (!v3.success) {
      expect(v3.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining(`script has ${833 * 7} characters`) }),
      ]));
    }
    expect(makeUgcInput.safeParse({ script, tts_model: "eleven_flash_v2_5" }).success).toBe(true);
  });
});

describe("break tags on a model that gives no pause for them", () => {
  const TAGGED = 'Первая часть фразы. <break time="2.0s" /> Вторая часть фразы.';

  it("eleven_v4 gets the text with the tag and the spaces around it as one space", () => {
    expect(speechTextFor(TAGGED, "eleven_v4")).toBe("Первая часть фразы. Вторая часть фразы.");
    expect(speechTextFor('раз<break time="200ms"/>два <break time="1s" />\tтри', "eleven_v4")).toBe("раз два три");
    expect(speechTextFor('первая строка\n<break time="1s"/>\nвторая', "eleven_v4")).toBe("первая строка\n \nвторая");
    expect(speechTextFor('<break time="1s"/> потОм', "eleven_v4")).toBe(` пото${MARK}м`);
  });

  // Mutant: one pass leaves a whole `<break time="1s" />` in the text, which the warning calls cut.
  it("a tag written inside a tag leaves no tag in the text sent to eleven_v4", () => {
    const nested = 'раз <break time="1s"<break time="1s"/>/> два';
    expect(speechTextFor(nested, "eleven_v4")).toBe("раз два");
    expect(hasUncutBreakTag(speechTextFor(nested, "eleven_v4"), "eleven_v4")).toBe(false);
    expect(hasUncutBreakTag(nested, "eleven_v4")).toBe(true);
    expect(hasUncutBreakTag(nested, "eleven_v3")).toBe(false);
  });

  // Mutant: a `[ \t]*` prefix in the cut is quadratic on the blanks and takes seconds here.
  it("a long run of blanks before deeply nested tags is cut in linear time", () => {
    const depth = 270;
    const hostile = `a${" ".repeat(4900)}b${'<break time="1s"'.repeat(depth)}${"/>".repeat(depth)}`;
    const started = performance.now();
    const spoken = speechTextFor(hostile, "eleven_v4");
    expect(performance.now() - started).toBeLessThan(500);
    expect(spoken).toBe(`a${" ".repeat(4900)}b `);
  });

  it.each(["eleven_v3", "eleven_flash_v2_5", "eleven_turbo_v2_5"] as const)("%s gets the tag as sent", (model) => {
    expect(speechTextFor(TAGGED, model)).toBe(TAGGED);
  });

  it.each(['<break time="bad" />', '<break time="0.2s">', '<break strength="strong" />', '<BREAK time="0.2s" />', "<x>"])(
    "eleven_v4 keeps markup that is not the exact timed tag: %s",
    (markup) => {
      expect(speechTextFor(`раз ${markup} два`, "eleven_v4")).toBe(`раз ${markup} два`);
      expect(buildSpeechModelWarnings({ tts_model: "eleven_v4", script: `раз ${markup} два` })).toEqual([]);
    },
  );

  it("quote and the run name the cut tag on eleven_v4, and only there", () => {
    const warnings = buildSpeechModelWarnings({ voice: "owner_ru_clone", tts_model: "eleven_v4", script: TAGGED });
    expect(warnings).toEqual([
      "break tags in the script are not sent to eleven_v4: the model gives no pause for them, so they are cut from the text",
    ]);
    expect(composeRunWarnings([], { script: TAGGED, voice: "owner_ru_clone", tts_model: "eleven_v4" }, {}, "make_ugc"))
      .toEqual(expect.arrayContaining(warnings));
    expect(buildSpeechModelWarnings({ voice: "owner_ru_clone", script: TAGGED })).toEqual(warnings);
    expect(buildSpeechModelWarnings({ voice: "owner_ru_clone", tts_model: "eleven_v3", script: TAGGED })).toEqual([]);
    expect(buildSpeechModelWarnings({ voice: "george", script: TAGGED })).toEqual([]);
    expect(buildSpeechModelWarnings({ tts_model: "eleven_flash_v2_5", script: "one <break time=\"1s\" /> two" })).toEqual([]);
  });

  it("eleven_v4 reads stress marks: marked Russian text without a tag is silent", () => {
    expect(buildSpeechModelWarnings({ tts_model: "eleven_v4", script: `пото${MARK}м зАмок` })).toEqual([]);
    expect(buildSpeechModelWarnings({ voice: "daria_ru_female", tts_model: "eleven_v4", script: "приду позже" })).toEqual([]);
  });
});

describe("speech model warnings", () => {
  it("are silent on the default even for Russian text with marks", () => {
    expect(buildSpeechModelWarnings({ script: `пото${MARK}м зАмок` })).toEqual([]);
    expect(buildSpeechModelWarnings({ voice: "daria_ru_female", script: "потОм" })).toEqual([]);
    expect(buildSpeechModelWarnings({ voice: "owner_ru_clone", tts_model: "eleven_v3", script: `пото${MARK}м зАмок` })).toEqual([]);
    expect(buildSpeechModelWarnings({ voice_id: RAW_VOICE_ID, script: `пото${MARK}м зАмок` })).toEqual([]);
  });

  it("a stress mark on a 2.5 model names the model and both models that read the mark", () => {
    const warnings = buildSpeechModelWarnings({ tts_model: "eleven_flash_v2_5", script: `пото${MARK}м` });
    expect(warnings).toEqual([
      "stress marks in the script (capital vowels or U+0301) are not read by eleven_flash_v2_5: they are sent " +
        "unchanged, and a U+0301 can break the word it sits in; eleven_v3, eleven_v4 and gemini-3.8-flash-tts read them",
    ]);
  });

  it("unmarked Cyrillic on a 2.5 model warns too", () => {
    const warnings = buildSpeechModelWarnings({ tts_model: "eleven_turbo_v2_5", script: "приду позже" });
    expect(warnings).toEqual([
      "Cyrillic script on eleven_turbo_v2_5: for Russian it places stress less reliably than eleven_v3 " +
        "and does not read stress marks; eleven_v3, eleven_v4 and gemini-3.8-flash-tts read them",
    ]);
  });

  // Mutant: naming every reader to a run with an explicit voice sends it to a model that refuses that voice.
  it.each([
    ["a preset", { voice: "george" }],
    ["a catalog voice", { voice: "es_female_lucia" }],
    ["a raw voice_id", { voice_id: RAW_VOICE_ID }],
  ])("with %s the warning names only readers that speak it: following it is not refused", (_name, voice) => {
    for (const script of [`пото${MARK}м`, "приду позже"]) {
      const [warning] = buildSpeechModelWarnings({ ...voice, tts_model: "eleven_flash_v2_5", script });
      expect(warning).toMatch(/; eleven_v3 and eleven_v4 read them$/);
    }
    for (const reader of ["eleven_v3", "eleven_v4"] as const) {
      expect(speechModelRefusals({ ...voice, tts_model: reader })).toEqual([]);
    }
    expect(speechModelRefusals({ ...voice, tts_model: "gemini-3.8-flash-tts" })).toHaveLength(1);
    expect(speechModelRefusals({ tts_model: "gemini-3.8-flash-tts" })).toEqual([]);
  });

  it("a capital stress in mixed text on a 2.5 model is called marking", () => {
    const warnings = buildSpeechModelWarnings({
      tts_model: "eleven_flash_v2_5",
      script: "Our new iPhone case потОм comes in many colors today",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/stress marks.*eleven_flash_v2_5/);
  });

  it("a mark after a Latin letter is an accent, not stress: Latin on 2.5 is silent", () => {
    expect(buildSpeechModelWarnings({ tts_model: "eleven_flash_v2_5", script: `cafe${MARK} au lait` })).toEqual([]);
  });

  it("a one-letter Cyrillic script on a 2.5 model warns too", () => {
    expect(buildSpeechModelWarnings({ tts_model: "eleven_flash_v2_5", script: "я" })).toHaveLength(1);
  });

  it("English text on a 2.5 model is a legitimate choice: silent", () => {
    expect(buildSpeechModelWarnings({ tts_model: "eleven_flash_v2_5", script: "see you later" })).toEqual([]);
  });

  it("the v3 cap refusal names the 2.5 models when the script fits them", () => {
    const result = makeUgcInput.safeParse({ script: "word ".repeat(1200) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/eleven_flash_v2_5 and eleven_turbo_v2_5 allow 10000/);
    }
  });

  it("an old run reads: a removed model or a script above the v3 cap does not make the input unreadable", () => {
    const legacyModel = composeRunWarnings([], { script: "приду позже", tts_model: "eleven_multilingual_v2" }, {}, "make_ugc");
    expect(legacyModel.join("\n")).not.toMatch(/could not be read|stress|Cyrillic script on/);
    const longOnPreset = composeRunWarnings([], { script: "word ".repeat(1500), voice: "sarah" }, {}, "make_ugc");
    expect(longOnPreset.join("\n")).not.toMatch(/could not be read/);
  });

  it("a run derives the same warning as quote", () => {
    const input = { script: `пото${MARK}м`, tts_model: "eleven_flash_v2_5" as const };
    const expected = buildSpeechModelWarnings(input);
    expect(expected).toHaveLength(1);
    expect(composeRunWarnings([], input, {}, "make_ugc")).toEqual(expect.arrayContaining(expected));
  });
});

describe("gemini-3.8-flash-tts: its own voices and no word timings (clipwright#453)", () => {
  const GOOGLE = "gemini-3.8-flash-tts" as const;
  const INSERT = { id: "a", media_url: "https://example.com/a.png", media_type: "image", anchor: { startWord: 0, endWord: 1 } };
  const messagesAt = (input: unknown, field: string): string[] => {
    const result = makeUgcInput.safeParse(input);
    return result.success ? [] : result.error.issues.filter((issue) => issue.path[0] === field).map((issue) => issue.message);
  };

  it("every model has a backend, and no preset, catalog voice or raw id names the Google model", () => {
    expect(TTS_MODEL_BACKEND).toEqual({
      eleven_v3: "elevenlabs",
      eleven_flash_v2_5: "elevenlabs",
      eleven_turbo_v2_5: "elevenlabs",
      eleven_v4: "elevenlabs",
      "gemini-3.8-flash-tts": "google",
    });
    expect(speechBackendOf("eleven_multilingual_v2")).toBeUndefined();
    // A second model on the google backend must join `speaksOwnVoices`, or admission lets presets through to it.
    for (const model of TTS_MODELS) expect(speaksOwnVoices(model), model).toBe(speechBackendOf(model) === "google");
    for (const input of [
      { script: RUSSIAN },
      { script: ENGLISH },
      { voice: "owner_ru_clone", script: RUSSIAN },
      { voice: "ru_female_any_catalog_slug", script: RUSSIAN },
      { voice_id: RAW_VOICE_ID, script: RUSSIAN },
    ]) {
      for (const gender of [undefined, "female", "male"] as const) {
        expect(speechBackendOf(resolveTtsModel(input, gender)), JSON.stringify(input)).toBe("elevenlabs");
      }
    }
    expect(resolveTtsModel({ tts_model: GOOGLE, script: RUSSIAN })).toBe(GOOGLE);
    expect(makeUgcInput.safeParse({ script: RUSSIAN, tts_model: GOOGLE }).success).toBe(true);
  });

  // Mutant: a default voice that does not read the model sends the preset george to the other vendor.
  it("the default voice follows the model and the actor's gender: kore for a female actor, charon otherwise", () => {
    expect(resolveVoiceSelection({ tts_model: GOOGLE }, "female")).toEqual({ kind: "model_voice", voice: "kore" });
    expect(resolveVoiceSelection({ tts_model: GOOGLE }, "male")).toEqual({ kind: "model_voice", voice: "charon" });
    expect(resolveVoiceSelection({ tts_model: GOOGLE })).toEqual({ kind: "model_voice", voice: "charon" });
    expect(resolveVoiceSelection({ tts_model: "eleven_v4" }, "female")).toEqual({ kind: "preset", preset: "sarah" });
    expect(resolveVoiceSelection({}, "female")).toEqual({ kind: "preset", preset: "sarah" });
  });

  it("an explicit voice is never replaced by the model's own: the selection keeps it and the input refuses it", () => {
    expect(resolveVoiceSelection({ voice: "sarah", tts_model: GOOGLE }, "male")).toEqual({ kind: "preset", preset: "sarah" });
    expect(resolveVoiceSelection({ voice_id: RAW_VOICE_ID, tts_model: GOOGLE })).toEqual({ kind: "raw", voiceId: RAW_VOICE_ID });
  });

  // Mutants: dropping any one row of `speechModelRefusals` passes that input to a paid run.
  it.each([
    ["voice", { script: ENGLISH, voice: "sarah" },
      `voice "sarah" is not spoken by gemini-3.8-flash-tts: choose one of its voices from list_voices with model=gemini-3.8-flash-tts, ` +
        "omit voice to get the model's default voice for the actor's gender, or choose another tts_model"],
    ["voice", { script: ENGLISH, voice: "es_female_lucia" },
      `voice "es_female_lucia" is not spoken by gemini-3.8-flash-tts: choose one of its voices from list_voices with model=gemini-3.8-flash-tts, ` +
        "omit voice to get the model's default voice for the actor's gender, or choose another tts_model"],
    ["voice_id", { script: ENGLISH, voice_id: RAW_VOICE_ID },
      "voice_id is not accepted with gemini-3.8-flash-tts: pass voice with a name from list_voices with model=gemini-3.8-flash-tts, " +
        "omit voice_id to get the model's default voice for the actor's gender, or choose another tts_model"],
    ["captions", { script: ENGLISH, captions: true },
      "captions are not available with gemini-3.8-flash-tts: it returns no word timings; pass captions=false"],
    ["segments", { segments: [{ kind: "actor", script: ENGLISH }] },
      "segments are not available with gemini-3.8-flash-tts: pass script for a single take, or choose another tts_model"],
    ["inserts", { script: ENGLISH, inserts: [INSERT] },
      "inserts are not available with gemini-3.8-flash-tts: it returns no word timings to anchor them; omit inserts, or choose another tts_model"],
  ])("%s is refused at the input with what to pass instead", (field, input, message) => {
    expect(messagesAt({ ...input, tts_model: GOOGLE }, field)).toEqual([message]);
    expect(speechModelRefusals({ ...input, tts_model: GOOGLE })).toEqual([{ field, message }]);
    expect(messagesAt({ ...input, tts_model: "eleven_v3" }, field)).toEqual([]);
    expect(speechModelRefusals({ ...input, tts_model: "eleven_v3" })).toEqual([]);
    expect(speechModelRefusals(input)).toEqual([]);
  });

  // Mutant: a voice name that does not derive the model leaves these on eleven_v3, where the adapter refuses the voice.
  it("a voice of the model selects it: by name alone, and with the model named (B1, B2)", () => {
    expect(MODEL_VOICE_NAMES).toHaveLength(30);
    for (const voice of MODEL_VOICE_NAMES) {
      for (const script of [RUSSIAN, ENGLISH]) {
        expect(resolveTtsModel({ voice, script }, "female"), voice).toBe(GOOGLE);
      }
      expect(resolveVoiceSelection({ voice }, "female"), voice).toEqual({ kind: "model_voice", voice });
      expect(resolveVoiceSelection({ voice, tts_model: GOOGLE }, "male"), voice).toEqual({ kind: "model_voice", voice });
      expect(makeUgcInput.safeParse({ script: ENGLISH, voice }).success, voice).toBe(true);
      expect(makeUgcInput.safeParse({ script: ENGLISH, voice, tts_model: GOOGLE }).success, voice).toBe(true);
      expect(speechModelRefusals({ voice, tts_model: GOOGLE })).toEqual([]);
    }
    expect(speaksOwnVoices(resolveTtsModel({ voice: "puck", script: ENGLISH }))).toBe(true);
    expect(MODEL_VOICE_MODEL).toBe(GOOGLE);
  });

  // Mutant: a Google name accepted on an ElevenLabs model reaches the worker, whose adapter has no such voice.
  it.each(ELEVENLABS_TTS_MODELS)("a voice of the model is refused with tts_model=%s, naming both ways out (B3)", (model) => {
    const message =
      `voice "kore" is a voice of gemini-3.8-flash-tts and is not spoken by ${model}: omit tts_model to speak it ` +
      `with gemini-3.8-flash-tts, or choose a voice from list_voices with model=${model}`;
    expect(messagesAt({ script: ENGLISH, voice: "kore", tts_model: model }, "voice")).toEqual([message]);
    expect(speechModelRefusals({ voice: "kore", tts_model: model, captions: true })).toEqual([{ field: "voice", message }]);
    expect(makeUgcInput.safeParse({ script: ENGLISH, voice: "kore" }).success).toBe(true);
    expect(makeUgcInput.safeParse({ script: ENGLISH, voice: "george", tts_model: model }).success).toBe(true);
  });

  // Mutant: refusals that read only `tts_model` let captions and inserts through on a model named by its voice.
  it("the model named by a voice refuses what the model named by tts_model refuses", () => {
    const other = "or choose a voice of another speech model from list_voices";
    expect(speechModelRefusals({ voice: "kore", captions: true, segments: [], inserts: [INSERT] })).toEqual([
      { field: "captions", message: "captions are not available with gemini-3.8-flash-tts: it returns no word timings; pass captions=false" },
      { field: "segments", message: `segments are not available with gemini-3.8-flash-tts: pass script for a single take, ${other}` },
      { field: "inserts", message: `inserts are not available with gemini-3.8-flash-tts: it returns no word timings to anchor them; omit inserts, ${other}` },
    ]);
    expect(messagesAt({ script: ENGLISH, voice: "kore", captions: true }, "captions")).toHaveLength(1);
    expect(messagesAt({ script: ENGLISH, voice: "george", captions: true }, "captions")).toEqual([]);
  });

  // Mutant: the remedy keeps tts_model, and the voice it sends the caller to is refused against that model.
  it("with tts_model named too, the way out of segments and inserts drops tts_model, and that way is accepted", () => {
    const way = "or choose a voice of another speech model from list_voices and omit tts_model";
    expect(speechModelRefusals({ voice: "kore", tts_model: GOOGLE, segments: [], inserts: [INSERT] })).toEqual([
      { field: "segments", message: `segments are not available with ${GOOGLE}: pass script for a single take, ${way}` },
      { field: "inserts", message: `inserts are not available with ${GOOGLE}: it returns no word timings to anchor them; omit inserts, ${way}` },
    ]);
    expect(speechModelRefusals({ voice: "george", tts_model: GOOGLE, segments: [] }).map((refusal) => refusal.field)).toEqual(["voice", "segments"]);
    expect(speechModelRefusals({ voice: "george", segments: [], inserts: [INSERT] })).toEqual([]);
  });

  it("the cap of a model named by its voice is checked on the client, and its remedy does not promise the voice elsewhere", () => {
    const [message] = messagesAt({ script: "слово ".repeat(834).slice(0, 5001), voice: "kore" }, "script");
    expect(message).toMatch(/^script has 5001 characters; gemini-3\.8-flash-tts allows at most 5000 characters/);
    expect(message).toMatch(/eleven_turbo_v2_5 allow 10000 but do not read Russian stress and do not speak the voices of gemini-3\.8-flash-tts$/);
    expect(messagesAt({ script: "word ".repeat(1200), voice: "george" }, "script")[0]).toMatch(/do not read Russian stress$/);
  });

  it("the captions refusal names captions=false and promises captions on no other model", () => {
    const [refusal] = speechModelRefusals({ tts_model: GOOGLE, captions: true });
    expect(refusal?.message).not.toMatch(/eleven|another tts_model/);
    expect(speechModelRefusals({ tts_model: GOOGLE, captions: false })).toEqual([]);
  });

  it("several refused fields are all named at once", () => {
    const refused = speechModelRefusals({ tts_model: GOOGLE, voice: "george", captions: true, inserts: [INSERT] });
    expect(refused.map((refusal) => refusal.field)).toEqual(["voice", "captions", "inserts"]);
  });

  // Mutant: the model left out of the stress-mark set gets the capital unchanged and a stress warning.
  it("gets the text as eleven_v4 does: break tag cut, U+0301 kept, a capital vowel turned into the mark", () => {
    const script = `Раз <break time="1s"/> потОм за${MARK}мок и cafe${MARK}`;
    expect(speechTextFor(script, GOOGLE)).toBe(`Раз пото${MARK}м за${MARK}мок и cafe${MARK}`);
    expect(speechTextFor(script, GOOGLE)).toBe(speechTextFor(script, "eleven_v4"));
    expect(STRESS_MARK_MODELS.has(GOOGLE)).toBe(true);
    expect(hasUncutBreakTag(script, GOOGLE)).toBe(true);

    const warnings = [
      "break tags in the script are not sent to gemini-3.8-flash-tts: the model gives no pause for them, so they are cut from the text",
    ];
    expect(buildSpeechModelWarnings({ tts_model: GOOGLE, script })).toEqual(warnings);
    const onRun = composeRunWarnings([], { script, tts_model: GOOGLE }, {}, "make_ugc");
    expect(onRun).toEqual(expect.arrayContaining(warnings));
    expect(onRun.join("\n")).not.toMatch(/stress/);
    expect(buildSpeechModelWarnings({ tts_model: GOOGLE, script: "приду позже" })).toEqual([]);
  });

  it("holds the 5000-character ceiling on the text sent, break tags cut", () => {
    const words = "слово ".repeat(834);
    expect(TTS_MODEL_CHAR_CAP[GOOGLE]).toBe(5000);
    expect(makeUgcInput.safeParse({ script: words.slice(0, 5000), tts_model: GOOGLE }).success).toBe(true);
    expect(messagesAt({ script: words.slice(0, 5001), tts_model: GOOGLE }, "script")[0])
      .toMatch(/^script has 5001 characters; gemini-3\.8-flash-tts allows at most 5000 characters/);
    expect(messagesAt({ script: '<break time="1s"/>', tts_model: GOOGLE }, "script")).toEqual([
      "script has nothing to say on gemini-3.8-flash-tts: break tags are cut from the text sent to it, and no words are left",
    ]);
  });

  it("an image without actor_gender is warned with the model's own default voice and where its voices are listed", () => {
    const image = "https://example.com/face.png";
    expect(buildActorGenderWarnings({ image, tts_model: GOOGLE })).toEqual([
      'no voice was chosen for the face in image: the default male voice "charon" of gemini-3.8-flash-tts is used; ' +
        "pass voice (from list_voices with model=gemini-3.8-flash-tts) or actor_gender to match the face",
    ]);
    expect(buildActorGenderWarnings({ image, voice: "kore" })).toEqual([]);
    expect(buildActorGenderWarnings({ image, actor_gender: "female", tts_model: GOOGLE })).toEqual([]);
    expect(buildActorGenderWarnings({ image, tts_model: "eleven_v4" })).toEqual([IMAGE_DEFAULT_VOICE_WARNING]);
    expect(buildActorGenderWarnings({ image })).toEqual([IMAGE_DEFAULT_VOICE_WARNING]);
  });

  it("the contract texts name the model's voices, its default voices and what it refuses", () => {
    const shape = offeredUgcInputShape;
    expect(shape.tts_model.description).toContain(
      "gemini-3.8-flash-tts speaks only its own voices (list_voices with model=gemini-3.8-flash-tts; without voice, " +
        "kore for a female actor and charon otherwise) and returns no word timings: " +
        "a preset or catalog voice, voice_id, captions=true, segments and inserts are refused with it before any charge.",
    );
    expect(shape.tts_model.description).toContain("gemini-3.8-flash-tts for its own voices, eleven_v3 for every other preset");
    expect(shape.actor_gender.description).toContain("(female: sarah, male: george; on gemini-3.8-flash-tts: kore and charon)");
    expect(shape.voice.description).toContain(
      "gemini-3.8-flash-tts speaks only its own voices (kind model_voice in list_voices, such as kore): naming one selects " +
        "that model, and a voice is refused with a tts_model that does not speak it, before any charge.",
    );
    expect(shape.voice_id.description).toContain("Refused with tts_model=gemini-3.8-flash-tts.");
  });
});
