import { describe, expect, it } from "vitest";
import {
  buildSpeechModelWarnings,
  composeRunWarnings as composeWith,
  DEFAULT_TTS_MODEL,
  makeUgcInput,
  offeredUgcInputShape,
  resolveTtsModel,
  speechTextFor,
  STRESS_MARK,
  stressMarksFromCapitals,
  TTS_MODEL_CHAR_CAP,
  TTS_MODELS,
  VOICE_PRESETS,
  voiceCatalogEntry,
} from "./index.js";
import { voiceGenderOf } from "./voice-admission.js";

const MARK = STRESS_MARK;

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
        expect.objectContaining({ path: ["script"], message: expect.stringMatching(/5001.*eleven_v3.*5000/) }),
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
    expect(description).toContain("spaces");
    expect(description).toContain("потОм");
  });

  it("every preset speaks v3, and each names its model", () => {
    for (const [name, preset] of Object.entries(VOICE_PRESETS)) {
      expect(preset.model, name).toBe("eleven_v3");
      expect(voiceCatalogEntry.safeParse({ name, ...preset }).success, name).toBe(true);
    }
  });

  it("eleven_multilingual_v2 is removed from the contract", () => {
    expect(TTS_MODELS).not.toContain("eleven_multilingual_v2");
    expect(makeUgcInput.safeParse({ script: "hi", tts_model: "eleven_multilingual_v2" }).success).toBe(false);
  });

  it("resolveTtsModel: explicit field → preset → default for a raw voice_id", () => {
    expect(resolveTtsModel({ voice: "owner_ru_clone" })).toBe("eleven_v3");
    expect(resolveTtsModel({ voice: "owner_ru_clone", tts_model: "eleven_flash_v2_5" })).toBe("eleven_flash_v2_5");
    expect(resolveTtsModel({ voice_id: "rawVoiceId123456" })).toBe(DEFAULT_TTS_MODEL);
    expect(resolveTtsModel({ voice_id: "rawVoiceId123456", tts_model: "eleven_turbo_v2_5" })).toBe("eleven_turbo_v2_5");
    expect(resolveTtsModel({})).toBe(VOICE_PRESETS.george.model);
  });

  it("resolveTtsModel takes the voice model by actor gender; an explicit voice beats gender", () => {
    expect(resolveTtsModel({}, "female")).toBe(VOICE_PRESETS.sarah.model);
    expect(resolveTtsModel({}, "male")).toBe(VOICE_PRESETS.george.model);
    expect(resolveTtsModel({ voice: "owner_ru_clone" }, "female")).toBe(VOICE_PRESETS.owner_ru_clone.model);
    expect(resolveTtsModel({ voice_id: "rawVoiceId123456" }, "female")).toBe(DEFAULT_TTS_MODEL);
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

  it("converts only for v3: 2.5 models get the text as sent", () => {
    expect(speechTextFor("потОм", "eleven_v3")).toBe(`пото${MARK}м`);
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

describe("speech model warnings", () => {
  it("are silent on the default even for Russian text with marks", () => {
    expect(buildSpeechModelWarnings({ script: `пото${MARK}м зАмок` })).toEqual([]);
    expect(buildSpeechModelWarnings({ voice: "daria_ru_female", script: "потОм" })).toEqual([]);
  });

  it("a stress mark on a 2.5 model names the model", () => {
    const warnings = buildSpeechModelWarnings({ tts_model: "eleven_flash_v2_5", script: `пото${MARK}м` });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/stress marks.*eleven_flash_v2_5/);
  });

  it("unmarked Cyrillic on a 2.5 model warns too", () => {
    const warnings = buildSpeechModelWarnings({ tts_model: "eleven_turbo_v2_5", script: "приду позже" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Cyrillic script on eleven_turbo_v2_5/);
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
