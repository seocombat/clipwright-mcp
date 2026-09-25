import { describe, expect, it } from "vitest";

import { TTS_MODEL_LANGUAGES, VOICE_CATALOG } from "./voice-catalog-data.js";
import {
  CATALOG_GENDERS,
  CATALOG_LANGUAGES,
  voicesQuery,
  type CatalogFileVoice,
  type TtsModelLanguagesFile,
  type VoiceCatalogFile,
} from "./voice-catalog.js";
import { listVoices, serverVoicesQuery, serverVoicesQueryFor } from "./voice-listing.js";
import { TTS_MODEL_CHAR_CAP, TTS_MODELS, VOICE_PRESET_NAMES, VOICE_PRESETS, type VoiceCatalogEntry } from "./voices.js";

// The `/v1/voices` list: contents, order, filters.

const all = listVoices({});
const fixture = (over: Partial<CatalogFileVoice>): CatalogFileVoice => ({ ...VOICE_CATALOG.voices[0]!, ...over });
const withVoices = (...extra: CatalogFileVoice[]): VoiceCatalogFile => ({
  ...VOICE_CATALOG,
  voices: [...VOICE_CATALOG.voices, ...extra],
});
const withoutLanguage = (model: string, language: string): TtsModelLanguagesFile => ({
  models: TTS_MODEL_LANGUAGES.models.map((entry) =>
    entry.id === model ? { ...entry, languages: entry.languages.filter((code) => code !== language) } : entry,
  ),
});
const field = (entry: VoiceCatalogEntry, name: string): unknown => (entry as Record<string, unknown>)[name];

describe("listVoices — contents and order", () => {
  it("presets first, then live catalog voices by language and rank", () => {
    expect(all.voices.slice(0, VOICE_PRESET_NAMES.length).map((entry) => entry.name)).toEqual(VOICE_PRESET_NAMES);
    const catalog = all.voices.slice(VOICE_PRESET_NAMES.length);
    expect(catalog.every((entry) => entry.kind === "catalog")).toBe(true);
    const rankOf = new Map(VOICE_CATALOG.voices.map((voice) => [voice.slug, voice.rank]));
    const keys = catalog.map((entry) => [CATALOG_LANGUAGES.indexOf(entry.language as never), rankOf.get(entry.name)!]);
    expect(keys).toEqual([...keys].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!));
    expect(catalog).toHaveLength(VOICE_CATALOG.voices.filter((voice) => voice.retired_at === undefined).length);
  });

  it("a retired voice is not listed", () => {
    const retired = fixture({ slug: "es_female_retired_fixture", retired_at: "2026-09-20T10:00:00.000Z" });
    expect(listVoices({}, withVoices(retired)).voices.map((entry) => entry.name)).not.toContain(retired.slug);
  });

  it("labels are normalized on read; an empty label means an absent field", () => {
    const voice = fixture({
      slug: "bg_female_fixture",
      rank: 99,
      age_raw: "Middle-Aged",
      use_case_raw: "",
      gender_raw: null,
      locale: "",
      description: null,
    });
    const entry = listVoices({}, withVoices(voice)).voices.find((row) => row.name === voice.slug)!;
    expect(entry).toMatchObject({ kind: "catalog", age: "middle_aged", description: voice.name, model: "eleven_v3" });
    expect(entry.gender).toBeUndefined();
    expect(entry.use_case).toBeUndefined();
    expect(entry.locale).toBeUndefined();
  });

  it("a catalog voice has no sample and no token shaped like a vendor id", () => {
    const text = JSON.stringify(all);
    expect(text).not.toContain("preview_url");
    expect(text.match(/\b[A-Za-z0-9]{20}\b/g) ?? []).toEqual([]);
  });

  it("a preset carries its metadata and has no vendor-verified models", () => {
    for (const name of VOICE_PRESET_NAMES) {
      const entry = all.voices.find((row) => row.name === name)!;
      expect(entry).toMatchObject({ kind: "preset", ...VOICE_PRESETS[name] });
      expect(entry.verified_models).toBeUndefined();
    }
  });

  it("supported_models are the models whose languages include the voice's language", () => {
    const listed = listVoices({}, VOICE_CATALOG, withoutLanguage("eleven_flash_v2_5", "bg")).voices;
    expect(listed.find((entry) => entry.language === "bg")?.supported_models).toEqual(["eleven_v3", "eleven_turbo_v2_5"]);
    expect(listed.find((entry) => entry.language === "cs")?.supported_models).toEqual([...TTS_MODELS]);
  });

  it("models[] lists every contract model with its TTS_MODEL_CHAR_CAP and snapshot languages", () => {
    expect(all.models.map((model) => model.id)).toEqual([...TTS_MODELS]);
    for (const model of all.models) {
      expect(model.char_limit).toBe(TTS_MODEL_CHAR_CAP[model.id as (typeof TTS_MODELS)[number]]);
      expect(model.languages).toEqual(TTS_MODEL_LANGUAGES.models.find((entry) => entry.id === model.id)?.languages);
    }
  });
});

describe("listVoices — filters", () => {
  it.each([
    ["language", "es"],
    ["gender", "female"],
    ["age", "young"],
    ["use_case", "social_media"],
  ])("%s=%s narrows the list to exactly the matches", (name, value) => {
    const filtered = listVoices({ [name]: value }).voices;
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(all.voices.length);
    expect(filtered).toEqual(all.voices.filter((entry) => field(entry, name) === value));
  });

  it("model keeps the voices whose language the model knows", () => {
    const models = withoutLanguage("eleven_flash_v2_5", "bg");
    const filtered = listVoices({ model: "eleven_flash_v2_5" }, VOICE_CATALOG, models).voices;
    expect(filtered.some((entry) => entry.language === "bg")).toBe(false);
    expect(filtered.length).toBe(all.voices.filter((entry) => entry.language !== "bg").length);
  });

  it("a voice without the field matches no filter value", () => {
    const voice = fixture({ slug: "bg_x_nogender", gender_raw: null, age_raw: null });
    for (const gender of CATALOG_GENDERS) {
      expect(listVoices({ gender }, withVoices(voice)).voices.map((entry) => entry.name)).not.toContain(voice.slug);
    }
    expect(listVoices({ age: "young" }).voices.some((entry) => entry.kind === "preset")).toBe(false);
  });

  it.each([
    ["gender", "gender_raw", " Female ", "female"],
    ["age", "age_raw", "Middle-Aged", "middle_aged"],
    ["use_case", "use_case_raw", "Social-Media", "social_media"],
  ])("%s: raw label %j matches the filter after normalization", (name, rawField, raw, value) => {
    const voice = fixture({ slug: `bg_female_norm_${name}`, [rawField]: raw });
    const listed = listVoices({ [name]: value }, withVoices(voice)).voices;
    expect(listed.map((entry) => entry.name)).toContain(voice.slug);
    expect(field(listed.find((entry) => entry.name === voice.slug)!, name)).toBe(value);
  });

  it("filters combine", () => {
    const filtered = listVoices({ language: "ru", gender: "female" }).voices;
    expect(filtered.every((entry) => entry.language === "ru" && entry.gender === "female")).toBe(true);
    expect(filtered.map((entry) => entry.name)).toContain("daria_ru_female");
  });
});

describe("serverVoicesQuery — allowed values", () => {
  it("an unfamiliar label is refused with the allowed list, not an empty result", () => {
    const result = serverVoicesQuery.safeParse({ use_case: "podcast" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('"narrative_story"');
    expect(serverVoicesQuery.safeParse({ age: "teen" }).error?.issues[0]?.message).toContain('"middle_aged"');
  });

  it("the label set comes from data: a new catalog label is allowed without a code change", () => {
    const voices = [...VOICE_CATALOG.voices, fixture({ slug: "bg_female_podcast", use_case_raw: "Podcast" })];
    expect(serverVoicesQueryFor(voices).safeParse({ use_case: "podcast" }).success).toBe(true);
  });

  it("the client schema passes any non-empty label and checks language and model against the contract", () => {
    expect(voicesQuery.safeParse({ use_case: "podcast", age: "teen" }).success).toBe(true);
    expect(voicesQuery.safeParse({ language: "xx" }).success).toBe(false);
    expect(voicesQuery.safeParse({ model: "eleven_multilingual_v2" }).success).toBe(false);
  });
});
