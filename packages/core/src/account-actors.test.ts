import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACTOR_AGE_FLOOR,
  ACTOR_ASPECTS_KNOWN,
  ACTOR_DEFAULT_QUALITY,
  ACTOR_DESCRIPTION_MAX_CHARS,
  ACTOR_GENDERS_ACCEPTED,
  ACTOR_GENDERS_KNOWN,
  ACTOR_MAX_AGE,
  ACTOR_MIN_AGE,
  ACTOR_NAME_MAX_CHARS,
  ACTOR_QUALITIES_ACCEPTED,
  ACTOR_QUALITIES_KNOWN,
  ACTOR_SIZE_SET,
  ACTOR_VARIANT_ASPECTS,
  ACTOR_VARIANT_FACE_CHECK_REASON,
  ACTOR_VARIANT_FACE_CHECK_WARNINGS,
  CREATE_ACTOR_FIELD_DISPOSITIONS,
  CREATE_ACTOR_RUN_ERROR_CODES,
  actorIdScope,
  actorVariantWarning,
  createActorRunErrorWith,
  actorPricingSnapshot,
  admittedActorPricingSnapshot,
  createActorAdmissionWarnings,
  createActorInput,
  createActorQuote,
  createActorRunError,
  createdActor,
  newPersonalActorId,
  producedCreatedActor,
  storedCreateActorInput,
} from "./account-actors.js";
import { run, runRead } from "./runs.js";
import { resolveAspectRatio } from "./aspect.js";
import { derivedRunWarnings, UNREADABLE_CREATE_ACTOR_INPUT_WARNING } from "./run-static-warnings.js";

/** `create_actor` has no voice at all: the resolver is never reached on any branch. */
const NO_VOICE = () => undefined;
import { actorId, ASPECT_RATIOS, MAKE_UGC_DESCRIPTION, parseSkill, SKILLS } from "./skills.js";

const VALID = {
  description: "Fictional adult woman, approximately 30, short dark curly hair, green linen shirt, sunny kitchen.",
  gender: "female",
  approximate_age: 30,
  name: "Mira",
} as const;

const SNAPSHOT = {
  quality: "medium",
  unit_credits: { portrait: 10, variant: 10 },
  requested_aspects: ["9:16", "1:1", "16:9"],
} as const;

function refusal(result: { success: boolean; error?: { issues: { message: string }[] } }): string {
  expect(result.success).toBe(false);
  return (result.error?.issues ?? []).map((issue) => issue.message).join("\n");
}

describe("actorIdScope — whose actor", () => {
  // A regex without `_u_` turns both cases red.
  it("a generated personal id is account-scoped, and make_ugc `actor_id` accepts it", () => {
    for (let i = 0; i < 200; i += 1) {
      const id = newPersonalActorId(randomBytes(16));
      expect(id).toMatch(/^actor_u_[a-z2-7]{26}$/);
      expect(actorIdScope(id), id).toBe("account");
      expect(actorId.safeParse(id).success, id).toBe(true);
    }
  });

  it("`actor_` plus 26 base32 characters without `_u_` is clipwright-scoped", () => {
    for (const id of [`actor_${"a".repeat(26)}`, `actor_${"abcdefghijklmnopqrstuvwxyz"}`, "actor_anna", "actor_u_short"]) {
      expect(actorIdScope(id), id).toBe("clipwright");
    }
  });

  it("the encoding is pinned at edge bytes and the randomness length is checked", () => {
    expect(newPersonalActorId(new Uint8Array(16))).toBe(`actor_u_${"a".repeat(26)}`);
    expect(newPersonalActorId(new Uint8Array(16).fill(255))).toBe(`actor_u_${"7".repeat(25)}4`);
    expect(() => newPersonalActorId(new Uint8Array(15))).toThrow(/16 random bytes/);
  });
});

describe("createActorInput — strict input", () => {
  it("a minimal input passes with defaults filled in", () => {
    expect(createActorInput.parse(VALID)).toEqual({
      ...VALID,
      quality: ACTOR_DEFAULT_QUALITY,
      aspect_ratios: [...ASPECT_RATIOS],
    });
    expect(ACTOR_DEFAULT_QUALITY).toBe("medium");
  });

  it("formats without 9:16 and a repeated format are refused with text", () => {
    expect(refusal(createActorInput.safeParse({ ...VALID, aspect_ratios: ["1:1", "16:9"] }))).toMatch(
      /must include 9:16/,
    );
    expect(refusal(createActorInput.safeParse({ ...VALID, aspect_ratios: ["9:16", "9:16"] }))).toMatch(/repeat/);
  });

  it("an age below 18 is refused", () => {
    expect(createActorInput.safeParse({ ...VALID, approximate_age: 17 }).success).toBe(false);
    expect(createActorInput.safeParse({ ...VALID, approximate_age: 18 }).success).toBe(true);
  });

  it("an input without gender is refused", () => {
    const { gender: _omitted, ...withoutGender } = VALID;
    expect(createActorInput.safeParse(withoutGender).success).toBe(false);
  });

  it("an unknown field and an image are refused and named", () => {
    expect(refusal(createActorInput.safeParse({ ...VALID, voice: "sarah" }))).toMatch(/unknown field\(s\) voice/);
    expect(refusal(createActorInput.safeParse({ ...VALID, image: "https://example.com/a.png" }))).toMatch(
      /takes no image/,
    );
  });
});

// A photo of a person is NOT an input, so face checks run on our own generation;
// this is the biometrics boundary.
describe("create_actor input stays TEXTUAL", () => {
  /** The list is checked against the schema's own shape: a new field turns it red and forces a boundary review. */
  const TEXT_ONLY_KEYS = [
    "approximate_age",
    "aspect_ratios",
    "description",
    "gender",
    "name",
    "quality",
  ];

  it("there are EXACTLY SIX keys, all read from the schema", () => {
    expect(Object.keys(createActorInput.shape).sort()).toEqual(TEXT_ONLY_KEYS);
  });

  /** An image carrier: bytes, a link or an upload id. Tried against EVERY field. */
  const CARRIERS: [string, unknown][] = [
    ["bytes", Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ["typed array", new Uint8Array([1, 2, 3])],
    ["link as object", { url: "https://example.com/face.png" }],
    ["upload id", { upload_id: "upl_1" }],
    ["data URI as object", { data: "data:image/png;base64,iVBORw0KGgo=" }],
  ];

  it("NO FIELD accepts an image carrier", () => {
    for (const key of TEXT_ONLY_KEYS) {
      for (const [label, carrier] of CARRIERS) {
        expect(
          createActorInput.safeParse({ ...VALID, [key]: carrier }).success,
          `${key}: ${label}`,
        ).toBe(false);
      }
    }
  });

  it("the parsed input consists of text, a number and a format list", () => {
    for (const [key, value] of Object.entries(createActorInput.parse(VALID))) {
      const textual = Array.isArray(value)
        ? value.every((item) => typeof item === "string")
        : typeof value === "string" || typeof value === "number";
      expect(textual, `${key}: ${JSON.stringify(value)}`).toBe(true);
    }
  });
});

function refusedFields(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}): (PropertyKey | undefined)[] {
  expect(result.success).toBe(false);
  return [...new Set(result.error?.issues.map((issue) => issue.path[0]))];
}

const SCALAR_BOUNDS = [
  { label: "description, lower edge", field: "description", accepted: "x", rejected: "" },
  {
    label: "description, upper edge",
    field: "description",
    accepted: "x".repeat(ACTOR_DESCRIPTION_MAX_CHARS),
    rejected: "x".repeat(ACTOR_DESCRIPTION_MAX_CHARS + 1),
  },
  { label: "name, lower edge", field: "name", accepted: "x", rejected: "" },
  {
    label: "name, upper edge",
    field: "name",
    accepted: "x".repeat(ACTOR_NAME_MAX_CHARS),
    rejected: "x".repeat(ACTOR_NAME_MAX_CHARS + 1),
  },
  { label: "age, lower edge", field: "approximate_age", accepted: ACTOR_MIN_AGE, rejected: ACTOR_MIN_AGE - 1 },
  { label: "age, upper edge", field: "approximate_age", accepted: ACTOR_MAX_AGE, rejected: ACTOR_MAX_AGE + 1 },
] as const;

describe("strict input: scalar bounds at both edges", () => {
  // Shifting any bound by one in either direction turns its edge's case red.
  it.each(SCALAR_BOUNDS)("$label: accepted at the edge, refused one step past it", ({ field, accepted, rejected }) => {
    expect(createActorInput.safeParse({ ...VALID, [field]: accepted }).success).toBe(true);
    expect(refusedFields(createActorInput.safeParse({ ...VALID, [field]: rejected }))).toEqual([field]);
  });
});

const LIST_NARROWINGS = [
  {
    label: "formats, same size and different members",
    module: "./skills.js",
    narrowed: { ASPECT_RATIOS: ["9:16", "1:1"] },
    field: "aspect_ratios",
    accepted: ["9:16", "1:1"],
    rejected: ["9:16", "16:9"],
  },
  {
    label: "formats, smaller size",
    module: "./skills.js",
    narrowed: { ASPECT_RATIOS: ["9:16"] },
    field: "aspect_ratios",
    accepted: ["9:16"],
    rejected: ["9:16", "1:1"],
  },
  {
    label: "qualities, same size and different members",
    module: "./actor-qualities.js",
    narrowed: { ACTOR_QUALITIES_ACCEPTED: ["medium", "ultra"], ACTOR_DEFAULT_QUALITY: "medium" },
    field: "quality",
    accepted: "medium",
    rejected: "high",
  },
  {
    label: "qualities, smaller size",
    module: "./actor-qualities.js",
    narrowed: { ACTOR_QUALITIES_ACCEPTED: ["high"], ACTOR_DEFAULT_QUALITY: "high" },
    field: "quality",
    accepted: "high",
    rejected: "medium",
  },
  {
    label: "gender, same size and different members",
    module: "./actor-bounds.js",
    narrowed: { ACTOR_GENDERS_ACCEPTED: ["female", "nonbinary"] },
    field: "gender",
    accepted: "female",
    rejected: "male",
  },
  {
    label: "gender, smaller size",
    module: "./actor-bounds.js",
    narrowed: { ACTOR_GENDERS_ACCEPTED: ["male"] },
    field: "gender",
    accepted: "male",
    rejected: "female",
  },
] as const;

describe("strict input: members and size of accepted lists, separately", () => {
  afterEach(() => {
    for (const module of new Set(LIST_NARROWINGS.map((narrowing) => narrowing.module))) vi.doUnmock(module);
    vi.resetModules();
  });

  // Same size with other members catches length instead of membership; a smaller size with
  // the right members catches membership in the known list instead of the accepted one.
  it.each(LIST_NARROWINGS)("$label", async ({ module, narrowed, field, accepted, rejected }) => {
    vi.resetModules();
    vi.doMock(module, async (importOriginal) => ({ ...(await importOriginal<object>()), ...narrowed }));
    const actors = await import("./account-actors.js");
    expect(actors.createActorInput.safeParse({ ...VALID, [field]: accepted }).success).toBe(true);
    expect(refusedFields(actors.createActorInput.safeParse({ ...VALID, [field]: rejected }))).toEqual([field]);
  });
});

describe("known and accepted qualities", () => {
  it("accepted is a subset of known, and the default is among accepted", () => {
    for (const quality of ACTOR_QUALITIES_ACCEPTED) {
      expect(ACTOR_QUALITIES_KNOWN as readonly string[]).toContain(quality);
    }
    expect(ACTOR_QUALITIES_ACCEPTED as readonly string[]).toContain(ACTOR_DEFAULT_QUALITY);
  });

  it("accepted formats, gender and age lie within the known ones", () => {
    for (const ratio of ASPECT_RATIOS) expect(ACTOR_ASPECTS_KNOWN as readonly string[]).toContain(ratio);
    for (const gender of ACTOR_GENDERS_ACCEPTED) expect(ACTOR_GENDERS_KNOWN as readonly string[]).toContain(gender);
    expect(ACTOR_MIN_AGE).toBeGreaterThanOrEqual(ACTOR_AGE_FLOOR);
  });

  it("an unfamiliar quality is refused with a text listing the options", () => {
    expect(refusal(createActorInput.safeParse({ ...VALID, quality: "ultra" }))).toBe(
      'quality "ultra" is not accepted: choose one of medium | high',
    );
  });

});

const NARROWINGS = [
  {
    label: "quality",
    module: "./actor-qualities.js",
    narrowed: { ACTOR_QUALITIES_ACCEPTED: ["medium"], ACTOR_DEFAULT_QUALITY: "medium" },
    field: "quality",
    value: "high",
  },
  {
    label: "description length",
    module: "./actor-bounds.js",
    narrowed: { ACTOR_DESCRIPTION_MAX_CHARS: 20 },
    field: "description",
    value: VALID.description,
  },
  { label: "name length", module: "./actor-bounds.js", narrowed: { ACTOR_NAME_MAX_CHARS: 2 }, field: "name", value: "Mira" },
  { label: "upper age", module: "./actor-bounds.js", narrowed: { ACTOR_MAX_AGE: 80 }, field: "approximate_age", value: 85 },
  { label: "lower age", module: "./actor-bounds.js", narrowed: { ACTOR_MIN_AGE: 21 }, field: "approximate_age", value: 19 },
  { label: "gender", module: "./actor-bounds.js", narrowed: { ACTOR_GENDERS_ACCEPTED: ["male"] }, field: "gender", value: "female" },
  {
    label: "formats",
    module: "./skills.js",
    narrowed: { ASPECT_RATIOS: ["9:16"] },
    field: "aspect_ratios",
    value: [...ACTOR_ASPECTS_KNOWN],
  },
] as const;

// Each run carries every known format while lists are narrowed to one element, so an
// array-length bound taken from any accepted list turns its case red.
function storedWith(field: string, value: unknown): Record<string, unknown> {
  const stored: Record<string, unknown> = { ...VALID, quality: "medium", aspect_ratios: [...ACTOR_ASPECTS_KNOWN], [field]: value };
  return { ...stored, pricing_snapshot: { ...SNAPSHOT, quality: stored.quality, requested_aspects: stored.aspect_ratios } };
}

describe("reading stored data does not depend on intake bounds", () => {
  afterEach(() => {
    for (const module of new Set(NARROWINGS.map((narrowing) => narrowing.module))) vi.doUnmock(module);
    vi.resetModules();
  });

  // Intake is narrowed by mocking one bound, and the schemas are reloaded; a read schema
  // that borrows an intake bound or list length turns its case red.
  it.each(NARROWINGS)(
    "$label: strict input refuses the field, while the stored run, snapshot, quote and result read",
    async ({ module, narrowed, field, value }) => {
      vi.resetModules();
      vi.doMock(module, async (importOriginal) => ({ ...(await importOriginal<object>()), ...narrowed }));
      const [actors, warnings, runs] = await Promise.all([
        import("./account-actors.js"),
        import("./run-static-warnings.js"),
        import("./runs.js"),
      ]);
      const stored = storedWith(field, value);
      const { pricing_snapshot, ...intake } = stored;

      const refused = actors.createActorInput.safeParse(intake);
      expect(refused.success, "the mock did not reach the strict input").toBe(false);
      expect([...new Set(refused.error?.issues.map((issue) => issue.path[0]))]).toEqual([field]);

      expect(actors.storedCreateActorInput.safeParse(stored).success).toBe(true);
      expect(warnings.derivedRunWarnings(stored, {}, "create_actor", NO_VOICE)).toEqual([]);
      expect(
        actors.createActorQuote.safeParse({ skill: "create_actor", credits_estimate: 60, pricing_snapshot, contract_version: "x" })
          .success,
      ).toBe(true);

      const created_actor = {
        actor_id: newPersonalActorId(randomBytes(16)),
        name: stored.name,
        gender: stored.gender,
        approximate_age: stored.approximate_age,
        version: 1,
        quality: stored.quality,
        aspect_ratios: stored.aspect_ratios,
      };
      const response = {
        run_id: "run_abc",
        skill: "create_actor",
        state: "succeeded",
        credits_reserved: 60,
        credits_charged: 60,
        warnings: ["A"],
        error: null,
        created_actor,
        final_output: null,
        created_at: "2026-09-14T10:00:00.000Z",
        finished_at: "2026-09-14T10:05:00.000Z",
      };
      expect(runs.run.parse(response).created_actor).toEqual(created_actor);
      expect(runs.runRead.parse(response).created_actor).toEqual(created_actor);
      expect(warnings.composeRunWarnings(["A"], stored, {}, "create_actor", NO_VOICE)).toEqual(["A"]);
    },
  );
});

describe("price snapshot and responses", () => {
  it("the snapshot requires positive prices and at least one format", () => {
    expect(actorPricingSnapshot.safeParse(SNAPSHOT).success).toBe(true);
    expect(actorPricingSnapshot.safeParse({ ...SNAPSHOT, unit_credits: { portrait: 0, variant: 10 } }).success).toBe(false);
    expect(actorPricingSnapshot.safeParse({ ...SNAPSHOT, requested_aspects: [] }).success).toBe(false);
  });

  it("the admission snapshot requires a portrait and refuses repeats, while reading tolerates both", () => {
    expect(admittedActorPricingSnapshot.safeParse(SNAPSHOT).success).toBe(true);
    expect(
      refusal(admittedActorPricingSnapshot.safeParse({ ...SNAPSHOT, requested_aspects: ["1:1", "16:9"] })),
    ).toMatch(/requested_aspects must include 9:16/);
    expect(
      refusal(admittedActorPricingSnapshot.safeParse({ ...SNAPSHOT, requested_aspects: ["9:16", "9:16"] })),
    ).toMatch(/requested_aspects must not repeat/);
    for (const requested_aspects of [["1:1", "16:9"], ["9:16", "9:16"]]) {
      expect(actorPricingSnapshot.safeParse({ ...SNAPSHOT, requested_aspects }).success).toBe(true);
      const stored = { ...VALID, quality: "medium", aspect_ratios: requested_aspects, pricing_snapshot: { ...SNAPSHOT, requested_aspects } };
      expect(storedCreateActorInput.safeParse(stored).success, requested_aspects.join()).toBe(true);
    }
  });

  it("an input that diverged from its snapshot does not read and gives a signal, not an exception", () => {
    const base = {
      ...VALID,
      quality: "medium",
      aspect_ratios: ["9:16", "1:1"],
      pricing_snapshot: { ...SNAPSHOT, requested_aspects: ["1:1", "9:16", "9:16"] },
    };
    expect(storedCreateActorInput.safeParse(base).success, "the same set in another order and with a repeat").toBe(true);
    expect(derivedRunWarnings(base, {}, "create_actor", NO_VOICE)).toEqual([]);

    const mismatches = {
      quality: { ...base, quality: "high" },
      "format outside the snapshot": { ...base, aspect_ratios: ["9:16", "16:9"] },
      "fewer formats": { ...base, aspect_ratios: ["9:16"] },
      "wider snapshot": { ...base, pricing_snapshot: { ...base.pricing_snapshot, requested_aspects: ["9:16", "1:1", "16:9"] } },
    };
    for (const [label, stored] of Object.entries(mismatches)) {
      expect(storedCreateActorInput.safeParse(stored).success, label).toBe(false);
      expect(derivedRunWarnings(stored, {}, "create_actor", NO_VOICE), label).toEqual([UNREADABLE_CREATE_ACTOR_INPUT_WARNING]);
    }
  });

  it("a stored input without a snapshot does not read, nor does a strict input with one", () => {
    const withSnapshot = { ...createActorInput.parse(VALID), pricing_snapshot: SNAPSHOT };
    expect(storedCreateActorInput.safeParse(withSnapshot).success).toBe(true);
    expect(storedCreateActorInput.safeParse(createActorInput.parse(VALID)).success).toBe(false);
    expect(createActorInput.safeParse(withSnapshot).success).toBe(false);
  });

  it("a quote carries the snapshot, a result a personal id", () => {
    expect(
      createActorQuote.parse({ skill: "create_actor", credits_estimate: 30, pricing_snapshot: SNAPSHOT, contract_version: "x" })
        .warnings,
    ).toEqual([]);
    expect(
      createdActor.safeParse({
        actor_id: "actor_anna",
        name: "Anna",
        gender: "female",
        approximate_age: 27,
        version: 1,
        quality: "medium",
        aspect_ratios: ["9:16"],
      }).success,
    ).toBe(false);
  });

  it("a deleted actor's result without name and formats reads in the run parse but cannot be written", () => {
    const produced = {
      actor_id: newPersonalActorId(randomBytes(16)),
      name: "Mira",
      gender: "female",
      approximate_age: 30,
      version: 1,
      quality: "medium",
      aspect_ratios: ["9:16"],
    };
    expect(producedCreatedActor.safeParse(produced).success).toBe(true);

    const tombstone = { ...produced, name: "", aspect_ratios: [] };
    const response = {
      run_id: "run_abc",
      skill: "create_actor",
      state: "succeeded",
      credits_reserved: 10,
      credits_charged: 10,
      warnings: [],
      error: null,
      created_actor: tombstone,
      final_output: null,
      created_at: "2026-09-14T10:00:00.000Z",
      finished_at: "2026-09-14T10:05:00.000Z",
    };
    expect(run.parse(response).created_actor).toEqual(tombstone);
    expect(runRead.parse(response).created_actor).toEqual(tombstone);

    expect(producedCreatedActor.safeParse({ ...produced, aspect_ratios: [] }).success, "empty formats").toBe(false);
    expect(refusal(producedCreatedActor.safeParse({ ...produced, aspect_ratios: ["1:1", "16:9"] }))).toMatch(
      /must include 9:16/,
    );
    expect(producedCreatedActor.safeParse({ ...produced, name: "" }).success, "empty name").toBe(false);
  });

  it("compact sizes match their format without warnings", () => {
    for (const ratio of ASPECT_RATIOS) {
      const size = ACTOR_SIZE_SET[ratio];
      expect(resolveAspectRatio({ requested: ratio, source: { ...size, origin: "probed" } }), ratio).toEqual({
        kind: "resolved",
        aspectRatio: ratio,
        warnings: [],
      });
    }
  });
});

describe("dispositions and admission warnings", () => {
  it("every input field has a decision, and the registry has no other rows", () => {
    expect(Object.keys(CREATE_ACTOR_FIELD_DISPOSITIONS).sort()).toEqual(Object.keys(createActorInput.shape).sort());
  });

  it("today every field is honored and admission warns about nothing", () => {
    expect(createActorAdmissionWarnings(createActorInput.parse(VALID))).toEqual([]);
  });

  it("a field with a `warned` decision gives its text only when present", () => {
    const table = { name: { kind: "warned", warning: "name is not honored yet", triggersWhen: "present" } } as const;
    expect(createActorAdmissionWarnings({ name: "Mira" }, table)).toEqual(["name is not honored yet"]);
    expect(createActorAdmissionWarnings({}, table)).toEqual([]);
  });

  it("there are exactly nine failure codes; each starts its text and promises zero charge", () => {
    expect([...CREATE_ACTOR_RUN_ERROR_CODES].sort()).toEqual(
      [
        "actor_generation_disabled",
        "actor_portrait_not_delivered",
        "actor_run_interrupted",
        "actor_portrait_unusable",
        "actor_prompt_refused",
        "actor_spend_refused",
        "face_check_unavailable",
        "prompt_check_unavailable",
        "run_input_unreadable",
      ].sort(),
    );
    for (const code of CREATE_ACTOR_RUN_ERROR_CODES) {
      expect(createActorRunError(code)).toMatch(new RegExp(`^${code}: .*nothing was charged`));
    }
  });

  it("a detail does not break the prefix: the code reads up to the colon even with a parenthesis", () => {
    const error = createActorRunErrorWith("actor_spend_refused", "paid_render_disabled");
    expect(error.split(":")[0]).toBe("actor_spend_refused");
    expect(error.endsWith(" (paid_render_disabled)")).toBe(true);
  });

  it("failed-face-check warnings cover exactly the variants, as whole lines", () => {
    expect([...ACTOR_VARIANT_ASPECTS]).toEqual(["1:1", "16:9"]);
    expect([...ACTOR_VARIANT_FACE_CHECK_WARNINGS]).toEqual([
      "1:1 was not created: the face check was unavailable; it was not charged",
      "16:9 was not created: the face check was unavailable; it was not charged",
    ]);
    // The alert counter compares whole lines, so both halves come from one place.
    for (const aspect of ACTOR_VARIANT_ASPECTS) {
      expect(ACTOR_VARIANT_FACE_CHECK_WARNINGS).toContain(
        actorVariantWarning(aspect, ACTOR_VARIANT_FACE_CHECK_REASON),
      );
    }
  });
});

describe("run skills", () => {
  it("the registry names both skills; an unfamiliar value is null", () => {
    expect([...SKILLS]).toEqual(["make_ugc", "create_actor"]);
    expect(parseSkill("make_ugc")).toBe("make_ugc");
    expect(parseSkill("create_actor")).toBe("create_actor");
    for (const value of ["x", "", null, undefined, 1, "MAKE_UGC"]) {
      expect(parseSkill(value), String(value)).toBeNull();
    }
  });

  it("the make_ugc description does not point to describing a face in words", () => {
    expect(MAKE_UGC_DESCRIPTION).not.toContain("person (described in words)");
    expect(MAKE_UGC_DESCRIPTION).not.toMatch(/\bperson\b/);
    expect(MAKE_UGC_DESCRIPTION).toContain("actor_id");
  });
});
