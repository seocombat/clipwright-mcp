import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildVoiceActorMatchWarnings,
  buildVoiceWarnings,
  DEFAULT_ACTOR_GENDER,
  DEFAULT_VOICE_BY_GENDER,
  DEFAULT_VOICE_PRESET,
  detectScriptFamily,
  makeUgcInput,
  makeUgcInputShape,
  MODEL_DEFAULT_VOICE_BY_GENDER,
  MODEL_VOICE_MODEL,
  MODEL_VOICE_NAMES,
  RAW_VOICE_ID_VALIDATION_WARNING,
  resolveVoiceSelection,
  VOICE_ID_PATTERN,
  VOICE_PRESET_NAMES,
  VOICE_PRESETS,
  voiceActorGenderWarning,
  voicesResponse,
  type VoicePresetName,
} from "@clipwright/core";
import {
  buildVoiceVerificationWarnings,
  catalogVoiceRefusal,
  serverUgcInput,
  voiceGenderOf,
} from "@clipwright/core/voice-admission";

import { VOICE_CATALOG } from "./voice-catalog-data.js";

const LIVE_SLUG = VOICE_CATALOG.voices.find((entry) => entry.retired_at === undefined)!.slug;
const TOMBSTONE = { ...VOICE_CATALOG.voices[0]!, slug: "es_female_retired_fixture", retired_at: "2026-09-20T10:00:00.000Z" };

/** Preset catalog. All five carry a gender: the vendor gives four, and we give our own */
/** clone's, since it is our voice. */
describe("VOICE_PRESETS — the starter set", () => {
  it("contains exactly the 5 presets", () => {
    expect(VOICE_PRESET_NAMES).toEqual([
      "owner_ru_clone",
      "sarah",
      "george",
      "eric",
      "daria_ru_female",
    ]);
  });

  it("the default is george (neutral English; the clone had an accent)", () => {
    expect(DEFAULT_VOICE_PRESET).toBe("george");
    expect(VOICE_PRESET_NAMES).toContain(DEFAULT_VOICE_PRESET);
  });

  // We speak about our own clone first-hand, whatever the vendor says.
  it("owner_ru_clone is labeled male: the gender of our clone is our fact", () => {
    expect(VOICE_PRESETS.owner_ru_clone.gender).toBe("male");
    expect(VOICE_PRESETS.owner_ru_clone.language).toBe("ru");
  });

  it("the clone matches the default actor, so there is nothing to dispute", () => {
    expect(VOICE_PRESETS.owner_ru_clone.gender).toBe(DEFAULT_ACTOR_GENDER);
  });

  it("the English presets carry a gender label", () => {
    expect(VOICE_PRESETS.sarah.gender).toBe("female");
    expect(VOICE_PRESETS.george.gender).toBe("male");
    expect(VOICE_PRESETS.eric.gender).toBe("male");
    expect(VOICE_PRESETS.daria_ru_female.gender).toBe("female");
  });
});

// `.refine()` drops `.shape`, so voice fields must live in makeUgcInputShape (which feeds
// tools/list) and the mutual exclusion in makeUgcInput.
describe("makeUgcInputShape — voice fields in the shape", () => {
  it("the shape contains voice and voice_id", () => {
    expect(makeUgcInputShape).toHaveProperty("voice");
    expect(makeUgcInputShape).toHaveProperty("voice_id");
  });
});

describe("makeUgcInput — voice selection validation", () => {
  it("voice and voice_id TOGETHER: parse fails", () => {
    const result = makeUgcInput.safeParse({
      script: "hello world",
      voice: "sarah",
      voice_id: "EXAVITQu4vr4xnSDxMaL",
    });
    expect(result.success).toBe(false);
  });

  it("unknown name: the client schema passes, the server one refuses pointing to list_voices", () => {
    const input = { script: "hello world", voice: "not_a_real_voice" };
    expect(makeUgcInput.safeParse(input).success).toBe(true);
    const result = serverUgcInput.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { path: ["voice"], message: 'unknown voice "not_a_real_voice": call list_voices for the voice names this API accepts' },
    ]);
  });

  it("the server admits a preset and a live catalog slug", () => {
    for (const voice of ["george", LIVE_SLUG]) {
      expect(serverUgcInput.safeParse({ script: "hello world", voice }).success, voice).toBe(true);
    }
  });

  it("catalogVoiceRefusal tells an unknown slug from a retired one", () => {
    const voices = [...VOICE_CATALOG.voices, TOMBSTONE];
    expect(catalogVoiceRefusal("sarah", voices)).toBeUndefined();
    expect(catalogVoiceRefusal(LIVE_SLUG, voices)).toBeUndefined();
    expect(catalogVoiceRefusal("es_female_never_existed", voices)).toMatch(/^unknown voice .*list_voices/);
    expect(catalogVoiceRefusal(TOMBSTONE.slug, voices)).toBe(
      'voice "es_female_retired_fixture" was retired from the catalog on 2026-09-20 and is no longer accepted; call list_voices to choose another voice',
    );
  });

  it("the voice name shape is checked on the client too", () => {
    for (const voice of ["", "es female", "../lucia"]) {
      expect(makeUgcInput.safeParse({ script: "hello world", voice }).success, voice).toBe(false);
    }
  });

  it("for a catalog voice without tts_model the server, not the client, checks the eleven_v3 cap", () => {
    const script = `${"я ".repeat(2500)}я`;
    expect(script.length).toBe(5001);
    expect(makeUgcInput.safeParse({ script, voice: LIVE_SLUG }).success).toBe(true);
    expect(makeUgcInput.safeParse({ script, voice: LIVE_SLUG, tts_model: "eleven_v3" }).success).toBe(false);
    const result = serverUgcInput.safeParse({ script, voice: LIVE_SLUG });
    expect(result.error?.issues).toMatchObject([{ path: ["script"], message: expect.stringMatching(/eleven_v3 allows at most 5000/) }]);
    expect(serverUgcInput.safeParse({ script: script.slice(1), voice: LIVE_SLUG }).success).toBe(true);
    expect(serverUgcInput.safeParse({ script, voice: LIVE_SLUG, tts_model: "eleven_flash_v2_5" }).success).toBe(true);
  });

  it("a voice-name refusal is not duplicated by a cap refusal", () => {
    const result = serverUgcInput.safeParse({ script: `${"я ".repeat(2500)}я`, voice: "es_female_never_existed" });
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["voice"]]);
  });

  it("resolveVoiceSelection returns a non-preset as a catalog slug instead of inventing a preset", () => {
    expect(resolveVoiceSelection({ voice: "es_female_lucia" })).toEqual({ kind: "catalog", slug: "es_female_lucia" });
  });

  // Mutants: the server calling a model's own voice unknown; a preset accepted on that model; that voice on eleven_v3.
  it("the server admits a model's own voice by name, with its model or without, and refuses it on another model (#453)", () => {
    const script = "hello world";
    for (const voice of MODEL_VOICE_NAMES) {
      expect(catalogVoiceRefusal(voice), voice).toBeUndefined();
      expect(serverUgcInput.safeParse({ script, voice }).success, voice).toBe(true);
      expect(serverUgcInput.safeParse({ script, voice, tts_model: MODEL_VOICE_MODEL }).success, voice).toBe(true);
    }
    const onOther = serverUgcInput.safeParse({ script, voice: "kore", tts_model: "eleven_v3" });
    expect(onOther.error?.issues).toMatchObject([
      { path: ["voice"], message: expect.stringMatching(/^voice "kore" is a voice of gemini-3\.8-flash-tts and is not spoken by eleven_v3/) },
    ]);
    const preset = serverUgcInput.safeParse({ script, voice: "george", tts_model: MODEL_VOICE_MODEL });
    expect(preset.error?.issues).toMatchObject([
      { path: ["voice"], message: expect.stringMatching(/^voice "george" is not spoken by gemini-3\.8-flash-tts: choose one of its voices from list_voices/) },
    ]);
    expect(serverUgcInput.safeParse({ script, voice: "Kore" }).error?.issues).toMatchObject([
      { path: ["voice"], message: 'unknown voice "Kore": call list_voices for the voice names this API accepts' },
    ]);
  });

  it("a model's own voice has a gender only where it is known, and a known one is matched against the actor", () => {
    expect(voiceGenderOf("kore")).toBe("female");
    expect(voiceGenderOf("charon")).toBe("male");
    for (const [gender, voice] of Object.entries(MODEL_DEFAULT_VOICE_BY_GENDER)) expect(voiceGenderOf(voice)).toBe(gender);
    expect(MODEL_VOICE_NAMES.filter((voice) => voiceGenderOf(voice) !== undefined)).toEqual(["charon", "kore"]);
    expect(buildVoiceActorMatchWarnings({ voice: "kore" }, voiceGenderOf)).toEqual([voiceActorGenderWarning("kore", "female", "male")]);
    expect(buildVoiceActorMatchWarnings({ voice: "charon" }, voiceGenderOf)).toEqual([]);
    expect(buildVoiceActorMatchWarnings({ voice: "puck" }, voiceGenderOf)).toEqual([]);
    expect(buildVoiceWarnings({ voice: "kore", script: "Привет, это проверка" })).toEqual([]);
    expect(buildVoiceVerificationWarnings({ voice: "kore", script: "hello world" })).toEqual([]);
  });

  it("an 8-character voice_id: format error", () => {
    const result = makeUgcInput.safeParse({
      script: "hello world",
      voice_id: "abcd1234",
    });
    expect(result.success).toBe(false);
  });

  it("a voice_id of 20 valid characters passes", () => {
    const result = makeUgcInput.safeParse({
      script: "hello world",
      voice_id: "EXAVITQu4vr4xnSDxMaL",
    });
    expect(result.success).toBe(true);
  });

  it("a preset alone passes", () => {
    const result = makeUgcInput.safeParse({ script: "hello world", voice: "george" });
    expect(result.success).toBe(true);
  });

  it("neither voice nor voice_id: parses, both undefined", () => {
    const result = makeUgcInput.safeParse({ script: "hello world" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.voice).toBeUndefined();
      expect(result.data.voice_id).toBeUndefined();
    }
  });
});

// The input `.refine` guarantees voice/voice_id exclusivity, so only the three priority
// branches are checked: raw id > preset name > default.
describe("resolveVoiceSelection — three priority branches", () => {
  it("neither voice nor voice_id: the default preset", () => {
    expect(resolveVoiceSelection({})).toEqual({
      kind: "preset",
      preset: DEFAULT_VOICE_PRESET,
    });
  });

  it("voice set: a preset with that name", () => {
    expect(resolveVoiceSelection({ voice: "george" })).toEqual({
      kind: "preset",
      preset: "george",
    });
  });

  it("voice_id set: raw with that id as-is", () => {
    expect(resolveVoiceSelection({ voice_id: "EXAVITQu4vr4xnSDxMaL" })).toEqual({
      kind: "raw",
      voiceId: "EXAVITQu4vr4xnSDxMaL",
    });
  });

  it("voice_id takes priority over voice (the escape hatch wins)", () => {
    expect(
      resolveVoiceSelection({ voice: "sarah", voice_id: "EXAVITQu4vr4xnSDxMaL" }),
    ).toEqual({ kind: "raw", voiceId: "EXAVITQu4vr4xnSDxMaL" });
  });
});

describe("resolveVoiceSelection — the default voice follows the actor's gender", () => {
  it("female → sarah, male → george, unknown gender → george", () => {
    expect(resolveVoiceSelection({}, "female")).toEqual({ kind: "preset", preset: "sarah" });
    expect(resolveVoiceSelection({}, "male")).toEqual({ kind: "preset", preset: "george" });
    expect(resolveVoiceSelection({}, undefined)).toEqual({ kind: "preset", preset: DEFAULT_VOICE_PRESET });
  });

  it("an explicit voice or voice_id beats gender", () => {
    expect(resolveVoiceSelection({ voice: "eric" }, "female")).toEqual({ kind: "preset", preset: "eric" });
    expect(resolveVoiceSelection({ voice_id: "EXAVITQu4vr4xnSDxMaL" }, "female")).toEqual({
      kind: "raw",
      voiceId: "EXAVITQu4vr4xnSDxMaL",
    });
  });

  it("each default voice's gender matches the gender it is chosen for", () => {
    for (const gender of ["female", "male"] as const) {
      expect(VOICE_PRESETS[DEFAULT_VOICE_BY_GENDER[gender]].gender).toBe(gender);
    }
  });
});

// Core holds NO vendor voice ids: none of the 20-alphanumeric runs they look like appear in
// voices.ts, except the VOICE_ID_PATTERN line, which describes the shape.
describe("voices.ts — zero vendor ids in core", () => {
  it("has no runs of 20 alphanumeric characters", () => {
    const src = readFileSync(fileURLToPath(new URL("./voices.ts", import.meta.url)), "utf8");
    const withoutPattern = src
      .split("\n")
      .filter((line) => !line.includes("VOICE_ID_PATTERN"))
      .join("\n");
    const matches = withoutPattern.match(/\b[A-Za-z0-9]{20}\b/g) ?? [];
    expect(matches).toEqual([]);
  });

  // The pattern itself must not hide an id literal.
  it("VOICE_ID_PATTERN is a loose 16–32 range, not a hard-coded length of 20", () => {
    expect(VOICE_ID_PATTERN.source).toBe("^[A-Za-z0-9]{16,32}$");
  });
});

// Deterministic script detector with a neutral band: ≥60% dominance picks a side;
// otherwise, or with too few letters, neutral.
describe("detectScriptFamily — Cyrillic vs Latin with a neutral band", () => {
  it("pure Cyrillic → cyrillic", () => {
    expect(detectScriptFamily("Привет как дела сегодня")).toBe("cyrillic");
  });

  it("pure Latin → latin", () => {
    expect(detectScriptFamily("Hello how are you today")).toBe("latin");
  });

  it("a 50/50 mix → neutral (neither side reaches 60%)", () => {
    // 4 Latin letters + 4 Cyrillic letters = 50/50.
    expect(detectScriptFamily("abcd абвг")).toBe("neutral");
  });

  it("empty string → neutral", () => {
    expect(detectScriptFamily("")).toBe("neutral");
  });

  it("digits and punctuation only → neutral (no letters)", () => {
    expect(detectScriptFamily("12345 !?.,-100%")).toBe("neutral");
  });

  it("a single letter among digits → neutral (too few letters)", () => {
    expect(detectScriptFamily("A 123 456")).toBe("neutral");
  });

  it("Latin dominance ≥60% with an admixture → latin", () => {
    // 8 Latin + 2 Cyrillic = 80% Latin.
    expect(detectScriptFamily("hello world яд")).toBe("latin");
  });
});

// Warnings require (i) an explicit request, (ii) data actually present, (iii) silence on
// the default happy path.
describe("buildVoiceWarnings — admissibility test", () => {
  // Ten representative DEFAULT inputs (no voice, English scripts) must each give an
  // EMPTY array: a warning on the default path carries no signal.
  it("10 default inputs (no voice, English script) → exactly [] each", () => {
    const defaultScripts = [
      "Hi",
      "Buy now and save.",
      "This product changed my morning routine completely.",
      "I was skeptical at first but the results speak for themselves.",
      "Three weeks in and I already feel the difference every single day.",
      "Here is exactly why thousands of creators switched to this workflow last month.",
      "Let me walk you through the five reasons this tool beats everything else on the market today.",
      "Honestly the setup took me under two minutes and the payoff has been enormous ever since I started.",
      "If you have ever struggled to stay consistent with your content this is the shortcut you have been waiting for.",
      "Picture this you wake up open your laptop and every clip you need for the whole week is already rendered and ready to publish.",
    ];
    expect(defaultScripts).toHaveLength(10);
    for (const script of defaultScripts) {
      expect(buildVoiceWarnings({ script })).toEqual([]);
    }
  });

  it("explicit owner_ru_clone (ru) + English script → one language warning", () => {
    const warnings = buildVoiceWarnings({
      voice: "owner_ru_clone",
      script: "This is a fully english marketing script about our product.",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("owner_ru_clone");
    expect(warnings[0]).toContain("ru");
    // This generator does not discuss voice gender: that is `buildActorGenderWarnings`.
    expect(warnings[0]).not.toMatch(/gender|пол/i);
  });

  it("explicit george (en) + English script → none (language matches)", () => {
    expect(
      buildVoiceWarnings({
        voice: "george",
        script: "This is a fully english marketing script about our product.",
      }),
    ).toEqual([]);
  });

  it("NO letters of the voice's script at all: a stronger text than \"looks different\"", () => {
    // On a corrupted script "looks latin" was literally true and useless.
    const warnings = buildVoiceWarnings({
      voice: "daria_ru_female",
      script: "This is a fully english marketing script about our product.",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("no cyrillic letters at all");
    expect(warnings[0]).toMatch(/\(\d+ latin letters\)/);
  });

  it("a few letters present: the OLD text, the two texts did not merge", () => {
    // Two Cyrillic letters mean "wrong language", not "no script"; pins `=== 0` against `< 3`.
    const warnings = buildVoiceWarnings({
      voice: "daria_ru_female",
      script: "hello world яд",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("looks latin");
    expect(warnings[0]).not.toContain("at all");
  });

  it("an en voice + all-Cyrillic text → \"no latin letters\", not a hard-coded literal", () => {
    const warnings = buildVoiceWarnings({
      voice: "george",
      script: "Это полностью русский рекламный сценарий про наш продукт.",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("no latin letters at all");
    expect(warnings[0]).toMatch(/\(\d+ cyrillic letters\)/);
  });

  it("a digits-only script → silent: nothing to judge the language by", () => {
    // `counts.cyrillic === 0` is literally true, but the neutral script is filtered earlier.
    expect(buildVoiceWarnings({ voice: "daria_ru_female", script: "15 3 8 2" })).toEqual([]);
  });

  it("explicit owner_ru_clone (ru) + Russian script → none (language matches)", () => {
    expect(
      buildVoiceWarnings({
        voice: "owner_ru_clone",
        script: "Это полностью русский рекламный скрипт о нашем продукте.",
      }),
    ).toEqual([]);
  });

  it("explicit preset + neutral/mixed script → none (no data)", () => {
    expect(
      buildVoiceWarnings({ voice: "owner_ru_clone", script: "12345 !?.,-100%" }),
    ).toEqual([]);
    expect(
      buildVoiceWarnings({ voice: "george", script: "abcd абвг" }),
    ).toEqual([]);
  });

  it("a preset without a usable language label → none (constructed case)", () => {
    // Every real preset is labeled ru/en, so an unknown name stands in: no data to compare,
    // so silence, not a crash. This also covers a language outside the labeled set.
    expect(
      buildVoiceWarnings({
        voice: "voice_without_language_label" as VoicePresetName,
        script: "This is a fully english script.",
      }),
    ).toEqual([]);
  });

  it("a raw voice_id → a deferred-validation warning (quote path, no preflight)", () => {
    const warnings = buildVoiceWarnings({
      voice_id: "EXAVITQu4vr4xnSDxMaL",
      script: "This is a fully english script.",
    });
    expect(warnings).toEqual([RAW_VOICE_ID_VALIDATION_WARNING]);
  });

  it("the language generator says nothing about gender: buildActorGenderWarnings does", () => {
    const samples = [
      buildVoiceWarnings({ script: "Hello english script here." }),
      buildVoiceWarnings({ voice: "owner_ru_clone", script: "English script here." }),
      buildVoiceWarnings({ voice: "sarah", script: "Это русский скрипт целиком." }),
      buildVoiceWarnings({ voice_id: "EXAVITQu4vr4xnSDxMaL", script: "x" }),
    ].flat();
    for (const w of samples) {
      expect(w).not.toMatch(/gender|пол/i);
    }
  });
});

/** The `/v1/voices` response schema shared by server and SDK. `Array.isArray` let any array */
/** through, and callers crashed on `.map`, far from the cause. */
describe("/v1/voices response schema", () => {
  it("a catalog built from VOICE_PRESETS passes the schema", () => {
    const body = {
      voices: Object.entries(VOICE_PRESETS).map(([name, preset]) => ({ name, ...preset })),
    };
    const parsed = voicesResponse.parse(body);
    expect(parsed.voices).toHaveLength(VOICE_PRESET_NAMES.length);
  });

  it("an array of NON-objects is refused: exactly the `Array.isArray` hole", () => {
    expect(voicesResponse.safeParse({ voices: ["george"] }).success).toBe(false);
  });

  it("an entry without a name is refused: the name is how a preset is chosen", () => {
    expect(
      voicesResponse.safeParse({ voices: [{ language: "en", description: "d" }] }).success,
    ).toBe(false);
  });

  it("an unfamiliar name, new fields and extra keys parse: the catalog grows without client releases", () => {
    const parsed = voicesResponse.parse({
      voices: [
        {
          name: "es_female_lucia",
          kind: "catalog",
          language: "es",
          locale: "es-ES",
          gender: "neutral",
          age: "middle_aged",
          description: "d",
          model: "eleven_v3",
          supported_models: ["eleven_v3"],
          verified_models: [],
          rank: 1,
        },
      ],
      models: [{ id: "eleven_v3", char_limit: 5000, languages: ["es"] }],
      next_cursor: null,
    });
    expect(parsed.voices[0]?.name).toBe("es_female_lucia");
    expect(parsed.models?.[0]?.char_limit).toBe(5000);
  });

  it("a missing `gender` is legal: the vendor does not always provide it", () => {
    const parsed = voicesResponse.parse({
      voices: [{ name: "owner_ru_clone", language: "ru", description: "клон", model: "eleven_v3" }],
    });
    expect(parsed.voices[0]?.gender).toBeUndefined();
  });
});

/** Missing verification is a signal only for a model the vendor verifies for someone; */
/** otherwise every run would get the warning. */
describe("buildVoiceVerificationWarnings", () => {
  const voice = (slug: string, verified: string[]) => ({
    slug,
    language: "ru" as const,
    locale: null,
    accent: null,
    gender_raw: "female",
    age_raw: null,
    use_case_raw: null,
    descriptive_raw: null,
    name: slug,
    description: null,
    category: null,
    verified_models: verified as ("eleven_v3" | "eleven_flash_v2_5" | "eleven_turbo_v2_5")[],
    notice_period_days: 365,
    featured: false,
    rank: 1,
    refreshed_at: "2026-09-16T00:00:00.000Z",
  });
  const catalog = [
    voice("ru_female_both", ["eleven_flash_v2_5", "eleven_turbo_v2_5"]),
    voice("ru_female_flash_only", ["eleven_flash_v2_5"]),
  ];
  const script = "Привет, это проверка голоса";

  it("a model verified for NOBODY stays silent, as the voice's own model and eleven_v3 do", () => {
    // Removing the `vendorVerifiedModels` check turns this red.
    expect(buildVoiceVerificationWarnings({ voice: "ru_female_both", script }, undefined, catalog)).toEqual([]);
    expect(buildVoiceVerificationWarnings({ voice: "ru_female_both", tts_model: "eleven_v3", script }, undefined, catalog)).toEqual([]);
  });

  it("a model verified for a neighbor but not this voice: a warning", () => {
    const warnings = buildVoiceVerificationWarnings(
      { voice: "ru_female_flash_only", tts_model: "eleven_turbo_v2_5", script },
      undefined,
      catalog,
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("ru_female_flash_only");
    expect(warnings[0]).toContain("eleven_turbo_v2_5");
    expect(warnings[0]).toContain("eleven_flash_v2_5");
  });

  it("a match is silent, and so are a preset and a raw voice_id", () => {
    const asked = { voice: "ru_female_flash_only", tts_model: "eleven_flash_v2_5", script } as const;
    expect(buildVoiceVerificationWarnings(asked, undefined, catalog)).toEqual([]);
    expect(buildVoiceVerificationWarnings({ voice: "george", script }, undefined, catalog)).toEqual([]);
    expect(buildVoiceVerificationWarnings({ voice_id: "abcdefghijklmnop", script }, undefined, catalog)).toEqual([]);
  });
});
