import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { TTS_MODEL_LANGUAGES, VOICE_CATALOG } from "./voice-catalog-data.js";
import {
  CATALOG_GENDERS,
  CATALOG_LANGUAGES,
  CATALOG_VOICES_PER_GENDER,
  normalizeVoiceLabel,
} from "./voice-catalog.js";
import { vendorVerifiedModels } from "./voice-listing.js";
import {
  DEFAULT_TTS_MODEL,
  MODEL_VOICE_NAMES,
  resolveTtsModel,
  RUSSIAN_TTS_MODEL,
  VOICE_NAME_PATTERN,
  VOICE_PRESET_NAMES,
} from "./voices.js";

// Guards on the generated voice catalog, without network access.

const raw = readFileSync(new URL("./voice-catalog.generated.json", import.meta.url), "utf8");
const live = VOICE_CATALOG.voices.filter((entry) => entry.retired_at === undefined);

describe("normalizeVoiceLabel — normalization on read", () => {
  it("hyphens and case are unified, an empty label becomes absent", () => {
    expect(normalizeVoiceLabel("middle-aged")).toBe("middle_aged");
    expect(normalizeVoiceLabel("middle_aged")).toBe("middle_aged");
    expect(normalizeVoiceLabel("Female")).toBe("female");
    expect(normalizeVoiceLabel("neutral")).toBe("neutral");
    expect(normalizeVoiceLabel("")).toBeUndefined();
    expect(normalizeVoiceLabel("  ")).toBeUndefined();
    expect(normalizeVoiceLabel(null)).toBeUndefined();
  });
});

describe("generated voice catalog — no vendor details in core", () => {
  it("core has no preview_url and no tokens shaped like a vendor id", () => {
    expect(raw).not.toContain("preview_url");
    expect(raw.match(/\b[A-Za-z0-9]{20}\b/g) ?? []).toEqual([]);
  });

  it("the file is canonical: schema key order, slugs ascending", () => {
    expect(raw).toBe(`${JSON.stringify(VOICE_CATALOG, null, 2)}\n`);
    const slugs = VOICE_CATALOG.voices.map((entry) => entry.slug);
    expect(slugs).toEqual([...slugs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
});

describe("generated voice catalog — slugs", () => {
  it("no slug appears twice, tombstones included", () => {
    const slugs = VOICE_CATALOG.voices.map((entry) => entry.slug);
    expect(slugs.filter((slug, index) => slugs.indexOf(slug) !== index)).toEqual([]);
  });

  it("catalog slugs do not overlap preset names", () => {
    const presets = new Set<string>(VOICE_PRESET_NAMES);
    expect(VOICE_CATALOG.voices.filter((entry) => presets.has(entry.slug)).map((entry) => entry.slug)).toEqual([]);
  });

  // A name means one voice: a model's own voice sharing a name with a preset or a slug would be two.
  it("a model's own voice names overlap neither preset names nor catalog slugs, tombstones included (B5)", () => {
    const taken = new Set<string>([...VOICE_PRESET_NAMES, ...VOICE_CATALOG.voices.map((entry) => entry.slug)]);
    expect(MODEL_VOICE_NAMES.length).toBe(30);
    expect(new Set(MODEL_VOICE_NAMES).size).toBe(MODEL_VOICE_NAMES.length);
    expect(MODEL_VOICE_NAMES.filter((name) => taken.has(name))).toEqual([]);
    expect(MODEL_VOICE_NAMES.filter((name) => !VOICE_NAME_PATTERN.test(name) || name !== name.toLowerCase())).toEqual([]);
    // A catalog slug is `language_gender_name`, and no model voice name carries an underscore.
    expect(MODEL_VOICE_NAMES.filter((name) => name.includes("_"))).toEqual([]);
  });

  it("a live voice's slug names its language and gender", () => {
    const wrong = live.filter((entry) => !entry.slug.startsWith(`${entry.language}_${entry.gender_raw}_`));
    expect(wrong.map((entry) => entry.slug)).toEqual([]);
  });

  // `resolveTtsModel` reads the language off the slug: the two must say the same for every live voice.
  it("a live voice's slug starts with ru_ exactly when its language is ru", () => {
    const russian = live.filter((entry) => entry.language === "ru");
    expect(russian.length).toBeGreaterThan(0);
    expect(live.filter((entry) => entry.slug.startsWith("ru_")).map((entry) => entry.slug)).toEqual(
      russian.map((entry) => entry.slug),
    );
    for (const entry of live) {
      const model = resolveTtsModel({ voice: entry.slug, script: "" });
      expect(model, entry.slug).toBe(entry.language === "ru" ? RUSSIAN_TTS_MODEL : DEFAULT_TTS_MODEL);
      expect(TTS_MODEL_LANGUAGES.models.find((row) => row.id === model)?.languages, entry.slug).toContain(entry.language);
    }
  });
});

describe("generated voice catalog — languages and quota", () => {
  it("CATALOG_LANGUAGES has no repeats and matches the live catalog's languages", () => {
    expect(new Set(CATALOG_LANGUAGES).size).toBe(CATALOG_LANGUAGES.length);
    expect([...new Set(live.map((entry) => entry.language))].sort()).toEqual([...CATALOG_LANGUAGES].sort());
  });

  it("every catalog language is supported by eleven_v3 in the model snapshot", () => {
    const v3 = TTS_MODEL_LANGUAGES.models.find((model) => model.id === "eleven_v3")?.languages ?? [];
    expect(v3.length).toBeGreaterThan(0);
    const languages = new Set([...CATALOG_LANGUAGES, ...VOICE_CATALOG.voices.map((entry) => entry.language)]);
    expect([...languages].filter((language) => !v3.includes(language))).toEqual([]);
  });

  it("live voices stay within the per-gender quota, and every shortfall is recorded exactly", () => {
    const expected: Record<string, Partial<Record<string, number>>> = {};
    for (const language of CATALOG_LANGUAGES) {
      for (const gender of CATALOG_GENDERS) {
        const count = live.filter((entry) => entry.language === language && entry.gender_raw === gender).length;
        expect(count, `${language} ${gender}`).toBeLessThanOrEqual(CATALOG_VOICES_PER_GENDER);
        if (count < CATALOG_VOICES_PER_GENDER) {
          expected[language] = { ...expected[language], [gender]: CATALOG_VOICES_PER_GENDER - count };
        }
      }
    }
    expect(VOICE_CATALOG.shortfall).toEqual(expected);
  });

  it("only female and male voices enter the catalog", () => {
    expect(live.filter((entry) => !(CATALOG_GENDERS as readonly (string | null)[]).includes(entry.gender_raw))).toEqual([]);
  });

  /** Measured, not guessed: no live voice has vendor verification for `eleven_v3`, so its */
  /** absence says nothing about a voice. */
  it("the vendor verifies no live library voice for eleven_v3", () => {
    // If it starts to, this turns red and the default decision gets revisited.
    expect(live.filter((entry) => entry.verified_models.includes("eleven_v3"))).toEqual([]);
    expect(vendorVerifiedModels(VOICE_CATALOG.voices)).toEqual(["eleven_flash_v2_5", "eleven_turbo_v2_5"]);
  });

  it("every live voice has non-empty verification, or there would be nothing to list", () => {
    expect(live.filter((entry) => entry.verified_models.length === 0)).toEqual([]);
  });
});
