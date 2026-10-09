import { afterEach, describe, expect, it, vi } from "vitest";

import {
  UNREADABLE_CREATE_ACTOR_INPUT_WARNING,
  UNREADABLE_RUN_INPUT_WARNING,
  composeRunWarnings as composeWith,
  derivedRunWarnings as derivedWith,
  type VoiceGenderResolver,
} from "./run-static-warnings.js";
import { buildFacelessVoiceWarnings, FACELESS_VOICE_NAMES, FACELESS_VOICES } from "./faceless-voices.js";
import { makeUgcInput } from "./skills.js";
import { dispositionWarnings } from "./contract-dispositions.js";
import { resolveAspectRatio } from "./aspect.js";
import {
  parseRunPreflight,
  VOICE_CATALOG_INCOMPLETE_WARNING,
} from "./run-preflight.js";
import { catalogVoiceRefusal, voiceGenderOf } from "./voice-admission.js";
import { VOICE_CATALOG } from "./voice-catalog-data.js";
import { buildSpeechModelWarnings, buildVoiceWarnings } from "./voices.js";
import {
  actorGenderIgnoredWarning,
  buildActorGenderWarnings,
  buildVoiceActorMatchWarnings,
  IMAGE_DEFAULT_VOICE_WARNING,
  voiceActorGenderWarning,
} from "./actors.js";
import { createActorInput } from "./account-actors.js";

/** The voice-gender resolver is not under test here: the catalog supplies it. */
const VOICE_GENDER: VoiceGenderResolver = (voice) => voiceGenderOf(voice);
const derivedRunWarnings = (input: unknown, preflight: Parameters<typeof derivedWith>[1], skill: string) =>
  derivedWith(input, preflight, skill, VOICE_GENDER);
const composeRunWarnings = (stored: unknown, input: unknown, preflight: unknown, skill: string) =>
  composeWith(stored, input, preflight, skill, VOICE_GENDER);

/** The input as stored in the column: parsed, with defaults filled in. */
const stored = (extra: Record<string, unknown> = {}) =>
  makeUgcInput.parse({ script: "привет", ...extra });

/** No probe facts recorded: these cases derive from the input ITSELF. */
const NO_FACTS = {};

describe("derivedRunWarnings", () => {
  it("does not route faceless input through UGC warning derivation", () => {
    expect(derivedRunWarnings({ input_mode: "brief", brief: "A story", duration_seconds: 30 }, NO_FACTS, "make_faceless")).toEqual([]);
  });
  it("a faceless run names its chosen voice against its script exactly as the quote does, and nothing without a voice", () => {
    const russian = FACELESS_VOICE_NAMES.find((name) => FACELESS_VOICES[name].language === "ru")!;
    const input = { input_mode: "script", script: "A clear story with spoken words.", duration_seconds: 30, captions: true };
    const expected = buildFacelessVoiceWarnings({ voice: russian, script: input.script });
    expect(expected).toHaveLength(1);
    expect(derivedRunWarnings({ ...input, voice: russian }, NO_FACTS, "make_faceless")).toEqual(expected);
    expect(composeRunWarnings(["stored line"], { ...input, voice: russian }, NO_FACTS, "make_faceless")).toEqual([...expected, "stored line"]);
    expect(derivedRunWarnings(input, NO_FACTS, "make_faceless")).toEqual([]);
    expect(derivedRunWarnings({ ...input, script: "Каждое утро гавань просыпается." }, NO_FACTS, "make_faceless")).toEqual([]);
    expect(derivedRunWarnings({ ...input, voice: russian }, NO_FACTS, "make_ugc")).not.toEqual(expected);
    expect(derivedRunWarnings(null, NO_FACTS, "make_faceless")).toEqual([]);
  });
  // Mutant: a stored-input reader without `brief` derives nothing for a brief run.
  it("a faceless run names its chosen voice against its brief exactly as the quote does", () => {
    const russian = FACELESS_VOICE_NAMES.find((name) => FACELESS_VOICES[name].language === "ru")!;
    const input = { input_mode: "brief", brief: "How the tides of a harbor work", duration_seconds: 30, captions: true };
    const expected = buildFacelessVoiceWarnings({ voice: russian, brief: input.brief });
    expect(expected).toEqual([expect.stringContaining("but the brief is written in Latin letters")]);
    expect(derivedRunWarnings({ ...input, voice: russian }, NO_FACTS, "make_faceless")).toEqual(expected);
    expect(derivedRunWarnings(input, NO_FACTS, "make_faceless")).toEqual([]);
    expect(derivedRunWarnings({ ...input, brief: "Как устроены приливы", voice: russian }, NO_FACTS, "make_faceless")).toEqual([]);
  });
  it("names an accepted but unhonored field", () => {
    expect(derivedRunWarnings(stored({ person: "a barista" }), NO_FACTS, "make_ugc")).toContain(
      "person is not honored yet: this request uses the default actor; choose actor_id from list_actors or provide image to select a different face",
    );
  });

  it("is silent on a default input", () => {
    expect(derivedRunWarnings(stored(), NO_FACTS, "make_ugc")).toEqual([]);
  });

  it("matches the registry: there is no second list of texts here", () => {
    const input = stored({ person: "a barista", look: "commercial" });
    expect(derivedRunWarnings(input, NO_FACTS, "make_ugc")).toEqual(dispositionWarnings(input));
  });

  it("the language warning of an explicit preset is derived along with the registry", () => {
    // An English preset against a Cyrillic script.
    const warnings = derivedRunWarnings(stored({ voice: "sarah" }), NO_FACTS, "make_ugc");
    expect(warnings.some((w) => w.includes("sarah"))).toBe(true);
  });

  it("a raw voice_id does NOT give the quote-only deferred-validation warning", () => {
    const warnings = derivedRunWarnings(stored({ voice_id: "abcdefghij123456" }), NO_FACTS, "make_ugc");
    expect(warnings).toEqual([]);
  });

  it("image without a voice or actor_gender derives the default-voice warning from the stored input", () => {
    const input = stored({ image: "https://example.com/a.png" });
    expect(derivedRunWarnings(input, NO_FACTS, "make_ugc")).toEqual([IMAGE_DEFAULT_VOICE_WARNING]);
    expect(derivedRunWarnings(stored({ image: "https://example.com/a.png", actor_gender: "female" }), NO_FACTS, "make_ugc"))
      .toEqual([]);
  });

  it("\"actor_gender changed nothing\" is derived with voice_id too, without the raw-id quote line", () => {
    const input = stored({ image: "https://example.com/a.png", actor_gender: "male", voice_id: "abcdefghij123456" });
    expect(derivedRunWarnings(input, NO_FACTS, "make_ugc")).toEqual([actorGenderIgnoredWarning("voice_id")]);
  });

  it("voice lines come in the quote builder's order: language, gender, model", () => {
    const input = stored({ image: "https://example.com/a.png", actor_gender: "male", voice: "sarah" });
    const script = "привет";
    expect(derivedRunWarnings(input, NO_FACTS, "make_ugc")).toEqual([
      ...buildVoiceWarnings({ voice: "sarah", script }),
      ...buildActorGenderWarnings(input),
      ...buildVoiceActorMatchWarnings(input, voiceGenderOf),
      ...buildSpeechModelWarnings({ ...input, script }),
    ]);
    expect(buildActorGenderWarnings(input)).toEqual([actorGenderIgnoredWarning("voice")]);
  });

  // Mutant: a reader that resolves the model from `script` alone finds no Cyrillic in segmented input.
  it("a run derives the model the worker speaks: a raw voice_id on segments reads the joined lines", () => {
    const cut = "break tags in the script are not sent to eleven_v4: the model gives no pause for them, so they are cut from the text";
    const tagged = 'Первая часть фразы. <break time="2.0s" /> Вторая часть фразы.';
    const segments = [{ kind: "actor", script: tagged }, { kind: "actor", script: "Clipwright" }];
    const bySegments = makeUgcInput.parse({ segments, voice_id: "abcdefghij123456" });
    expect(derivedRunWarnings(bySegments, NO_FACTS, "make_ugc")).toEqual([cut]);
    expect(derivedRunWarnings(stored({ script: tagged, voice: "owner_ru_clone" }), NO_FACTS, "make_ugc")).toEqual([cut]);
    expect(derivedRunWarnings(stored({ script: tagged, voice: "owner_ru_clone", tts_model: "eleven_v3" }), NO_FACTS, "make_ugc"))
      .toEqual([]);
    expect(derivedRunWarnings(stored({ script: 'First part. <break time="2.0s" /> Second part.', voice_id: "abcdefghij123456" }), NO_FACTS, "make_ugc"))
      .toEqual([]);
  });

  it("a voice/face gender mismatch reaches the run, including via the actor snapshot", () => {
    // Removing `actor_snapshot` from `storedUgcInput` turns the pinned branch red.
    const byDefaultActor = derivedRunWarnings(stored({ voice: "daria_ru_female" }), NO_FACTS, "make_ugc");
    expect(byDefaultActor).toContain(voiceActorGenderWarning("daria_ru_female", "female", "male"));

    const pinned = { ...stored({ actor_id: "actor_anna", voice: "sarah" }), actor_snapshot: { gender: "male" } };
    expect(derivedRunWarnings(pinned, NO_FACTS, "make_ugc")).toContain(
      voiceActorGenderWarning("sarah", "female", "male"),
    );
  });

  it("a run with a retired, unknown or preset voice reads and derives warnings", () => {
    const tombstone = { ...VOICE_CATALOG.voices[0]!, slug: "es_female_retired_fixture", retired_at: "2026-09-20T10:00:00.000Z" };
    expect(catalogVoiceRefusal(tombstone.slug, [tombstone])).toMatch(/retired/);
    for (const voice of [tombstone.slug, "es_female_never_existed", "george"]) {
      const input = stored({ voice, person: "a barista", tts_model: "eleven_flash_v2_5" });
      const warnings = derivedRunWarnings(input, NO_FACTS, "make_ugc");
      expect(warnings, voice).not.toContain(UNREADABLE_RUN_INPUT_WARNING);
      expect(warnings, voice).toEqual(
        expect.arrayContaining([
          ...dispositionWarnings(input),
          ...buildSpeechModelWarnings({ ...input, script: "привет" }),
        ]),
      );
      expect(buildSpeechModelWarnings({ ...input, script: "привет" }), voice).toHaveLength(1);
    }
  });

  it("an unreadable input names itself instead of staying silent", () => {
    for (const bad of ["{}", 42, null, undefined, { script: "" }]) {
      expect(derivedRunWarnings(bad, NO_FACTS, "make_ugc")).toEqual([UNREADABLE_RUN_INPUT_WARNING]);
    }
  });
});

describe("derivation by run skill", () => {
  const actorInput = (extra: Record<string, unknown> = {}) => ({
    ...createActorInput.parse({
      description: "Fictional adult man, approximately 40, short grey beard, denim shirt, bright workshop.",
      gender: "male",
      approximate_age: 40,
      name: "Tom",
      ...extra,
    }),
    pricing_snapshot: {
      quality: extra.quality ?? "medium",
      unit_credits: { portrait: 10, variant: 10 },
      requested_aspects: ["9:16", "1:1", "16:9"],
    },
  });
  const FACTS = {
    voice: { kind: "catalog_incomplete" },
    aspect: { kind: "failed", error_class: "dns" },
  } as const;

  // Without the dispatcher the actor input parses as `make_ugc` and breaks the derivation.
  it("create_actor derives nothing even with preflight facts", () => {
    expect(derivedRunWarnings(actorInput(), FACTS, "create_actor")).toEqual([]);
    expect(derivedRunWarnings(actorInput(), NO_FACTS, "create_actor")).toEqual([]);
  });

  it("create_actor keeps only stored lines, in order and without duplicates", () => {
    expect(composeRunWarnings(["A", "B", "A"], actorInput(), FACTS, "create_actor")).toEqual(["A", "B"]);
  });

  // A strict read schema would treat the price snapshot as an extra field. Read independence
  // from accepted qualities is tested in account-actors.test.ts by module mocking.
  it("a stored input with a snapshot reads without an unreadable mark", () => {
    const input = actorInput({ quality: "high" });
    expect(derivedRunWarnings(input, NO_FACTS, "create_actor")).not.toContain(UNREADABLE_CREATE_ACTOR_INPUT_WARNING);
    expect(derivedRunWarnings(input, NO_FACTS, "create_actor")).toEqual([]);
  });

  it("an unreadable actor input names itself with its own text", () => {
    for (const bad of [null, { description: "x" }, { ...actorInput(), pricing_snapshot: undefined }]) {
      expect(derivedRunWarnings(bad, NO_FACTS, "create_actor")).toEqual([UNREADABLE_CREATE_ACTOR_INPUT_WARNING]);
    }
  });

  // Texts pinned as literals: make_ugc's is byte-for-byte unchanged, create_actor has its own.
  it("the unreadable text depends on the skill, and make_ugc's is unchanged", () => {
    expect(UNREADABLE_RUN_INPUT_WARNING).toBe(
      "run input could not be read: parameters that are accepted but not honored cannot be listed for this run",
    );
    expect(UNREADABLE_CREATE_ACTOR_INPUT_WARNING).toBe(
      "create_actor run input could not be read: a run that fails for this reason creates no actor and is not charged",
    );
    expect(derivedRunWarnings(null, NO_FACTS, "make_ugc")).toEqual([UNREADABLE_RUN_INPUT_WARNING]);
    expect(derivedRunWarnings(null, NO_FACTS, "create_actor")).toEqual([UNREADABLE_CREATE_ACTOR_INPUT_WARNING]);
    expect(composeRunWarnings([], null, NO_FACTS, "create_actor")).toEqual([UNREADABLE_CREATE_ACTOR_INPUT_WARNING]);
  });

  it("an unfamiliar skill reads neither as a clip nor as an actor", () => {
    expect(derivedRunWarnings(stored({ person: "x" }), FACTS, "x")).toEqual([UNREADABLE_RUN_INPUT_WARNING]);
  });
});

describe("derivation does not depend on environment kill switches", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // The claim is about the PUBLIC output, so that is what is called: kill switches move
  // implemented↔rejected, while derivation reads warned.
  it("derivedRunWarnings is the same for any flag values", async () => {
    const outputs: string[][] = [];
    for (const value of ["0", "1"]) {
      vi.resetModules();
      vi.stubEnv("CLIPWRIGHT_COMPOSE", value);
      vi.stubEnv("CLIPWRIGHT_REMOTE_FETCH", value);
      const [mod, skills] = await Promise.all([
        import("./run-static-warnings.js"),
        import("./skills.js"),
      ]);
      outputs.push(
        mod.derivedRunWarnings(
          skills.makeUgcInput.parse({ script: "привет", person: "a barista", captions: true }),
          NO_FACTS,
          "make_ugc",
          VOICE_GENDER,
        ),
      );
    }
    expect(outputs[0]!.length).toBeGreaterThan(1);
    expect(outputs[0]).toEqual(outputs[1]);
  });
});

describe("composeRunWarnings", () => {
  // An empty column is what a run created before the warnings column looks like.
  const NO_COLUMN = null;

  it("derived lines come first, stored ones after", () => {
    expect(
      composeRunWarnings(
        ["vendor returned 0.76s where 1s was expected"],
        stored({ person: "x" }),
        NO_COLUMN,
        "make_ugc",
      ),
    ).toEqual([
      "person is not honored yet: this request uses the default actor; choose actor_id from list_actors or provide image to select a different face",
      "vendor returned 0.76s where 1s was expected",
    ]);
  });

  it("does not repeat what is already stored", () => {
    const text = "person is not honored yet: this request uses the default actor; choose actor_id from list_actors or provide image to select a different face";
    expect(composeRunWarnings([text], stored({ person: "x" }), NO_COLUMN, "make_ugc")).toEqual([text]);
  });

  it("non-string column items are dropped instead of breaking the read", () => {
    expect(composeRunWarnings([1, null, "kept", {}], stored(), NO_COLUMN, "make_ugc")).toEqual(["kept"]);
  });

  it("an unreadable column does not cancel the derived lines", () => {
    expect(composeRunWarnings("не массив", stored({ person: "x" }), NO_COLUMN, "make_ugc")).toEqual([
      "person is not honored yet: this request uses the default actor; choose actor_id from list_actors or provide image to select a different face",
    ]);
  });
});

// The preflight fact stores the probe outcome; the reader derives the line. A missing
// value is not a fourth state.
describe("warnings from the preflight fact", () => {
  // With a gender hint: these cases are about the probe fact, not the default voice.
  const withImage = (extra: Record<string, unknown> = {}) =>
    stored({ image: "https://example.com/a.png", actor_gender: "female", ...extra });

  it("`not_probed` derives nothing", () => {
    expect(derivedRunWarnings(withImage(), { aspect: { kind: "not_probed" } }, "make_ugc")).toEqual([]);
  });

  it("`failed` names the error class AND the unverified format", () => {
    const warnings = derivedRunWarnings(withImage(), {
      aspect: { kind: "failed", error_class: "dns" },
    }, "make_ugc");
    expect(warnings).toContain("source could not be probed (dns)");
    expect(warnings.some((w) => w.includes("was not verified against the image"))).toBe(true);
  });

  it("`ok` derives the snap with the same resolver as quote", () => {
    const warnings = derivedRunWarnings(withImage(), {
      aspect: { kind: "ok", width: 1080, height: 1350 },
    }, "make_ugc");
    const resolution = resolveAspectRatio({
      requested: undefined,
      source: { width: 1080, height: 1350, origin: "probed" },
    });
    expect(warnings).toEqual(resolution.kind === "resolved" ? resolution.warnings : []);
    expect(warnings).toHaveLength(1);
  });

  it("a matching format is silent: a warning on every run devalues them all", () => {
    expect(
      derivedRunWarnings(withImage(), { aspect: { kind: "ok", width: 1080, height: 1920 } }, "make_ugc"),
    ).toEqual([]);
  });

  it("the voice preflight is derived from the fact, not from the warnings column", () => {
    expect(
      derivedRunWarnings(stored({ voice_id: "abcdefghij123456" }), {
        voice: { kind: "catalog_incomplete" },
      }, "make_ugc"),
    ).toEqual([VOICE_CATALOG_INCOMPLETE_WARNING]);
  });

  it("`verified` and `not_probed` voices are both silent, but they are DIFFERENT facts", () => {
    for (const kind of ["verified", "not_probed"] as const) {
      expect(derivedRunWarnings(stored(), { voice: { kind } }, "make_ugc")).toEqual([]);
    }
    expect(parseRunPreflight({ voice: { kind: "verified" } })).toEqual({
      voice: { kind: "verified" },
    });
  });

  it("an ABSENT VALUE is not a fourth state but \"not recorded\"", () => {
    for (const absent of [null, undefined, "", 42, []]) {
      expect(parseRunPreflight(absent)).toEqual({});
      expect(composeRunWarnings([], withImage(), absent, "make_ugc")).toEqual([]);
    }
  });

  it("a corrupt family does not take down a sound second one", () => {
    expect(
      parseRunPreflight({ aspect: { kind: "ok", width: -1 }, voice: { kind: "verified" } }),
    ).toEqual({ voice: { kind: "verified" } });
  });

  // An unreadable input does not cancel the facts; an early return of
  // `[UNREADABLE_RUN_INPUT_WARNING]` turns all three cases red.
  describe("unreadable input: facts arrive, input-derived lines do not", () => {
    const BROKEN = { script: "" };

    it("the voice preflight arrives: it does not read the input at all", () => {
      expect(
        derivedRunWarnings(BROKEN, { voice: { kind: "catalog_incomplete" } }, "make_ugc"),
      ).toEqual([UNREADABLE_RUN_INPUT_WARNING, VOICE_CATALOG_INCOMPLETE_WARNING]);
    });

    // BOTH failure lines arrive, not one: neither depends on the input.
    it("a probe failure arrives WHOLE: both its lines are input-independent", () => {
      const fromFact = derivedRunWarnings(BROKEN, {
        aspect: { kind: "failed", error_class: "dns" },
      }, "make_ugc");
      const nullSource = resolveAspectRatio({ requested: undefined, source: null });
      expect(nullSource.kind).toBe("resolved");

      expect(fromFact).toEqual([
        UNREADABLE_RUN_INPUT_WARNING,
        "source could not be probed (dns)",
        ...(nullSource.kind === "resolved" ? nullSource.warnings : []),
      ]);
      // A layout snap needs the requested format, which is unreadable; claiming a format
      // the client did not ask for is worse than silence.
      expect(fromFact.some((w) => w.includes("the vendor"))).toBe(false);
    });

    // `requested: undefined` is not a format default: with `source === null` the
    // WARNINGS do not depend on `requested`, and warnings are all we take.
    it("with an unprobed source the requested format does NOT affect WARNINGS", () => {
      const results = ([undefined, "9:16", "1:1", "16:9"] as const).map((requested) => {
        const r = resolveAspectRatio({ requested, source: null });
        return r.kind === "resolved" ? r.warnings : ["rejected"];
      });
      for (const warnings of results) expect(warnings).toEqual(results[0]);
      expect(results[0]).toHaveLength(1);
    });

    it("a successful probe on an unreadable input gives nothing beyond unreadability", () => {
      expect(
        derivedRunWarnings(BROKEN, { aspect: { kind: "ok", width: 1080, height: 1350 } }, "make_ugc"),
      ).toEqual([UNREADABLE_RUN_INPUT_WARNING]);
    });
  });

  it("the order matches quote: dispositions, format, voice", () => {
    // `person` excludes `image`, and no format derives without a source, so another
    // registry disposition is used.
    const input = withImage({ captions: true });
    const warnings = composeRunWarnings([], input, {
      aspect: { kind: "failed", error_class: "timeout" },
      voice: { kind: "catalog_incomplete" },
    }, "make_ugc");
    expect(warnings.slice(0, dispositionWarnings(input).length)).toEqual(
      dispositionWarnings(input),
    );
    expect(warnings[dispositionWarnings(input).length]).toBe(
      "source could not be probed (timeout)",
    );
    expect(warnings.at(-1)).toBe(VOICE_CATALOG_INCOMPLETE_WARNING);
  });
});

// Run derivation ignores the pinned gender; correct while both genders' default voices share a model.
describe("the speech-model warning does not depend on actor gender", () => {
  it.each(["привет", "hello world", "прИвет"])("script %s: female and male give the same", (script) => {
    expect(buildSpeechModelWarnings({ script }, "female")).toEqual(buildSpeechModelWarnings({ script }, "male"));
  });
});
