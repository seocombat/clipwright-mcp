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
  ACTOR_PORTRAIT_MIN_FACE_HEIGHT,
  actorPortraitFraming,
  actorPortraitFramingRefusal,
  actorVariantWarning,
  isActorPortraitShape,
  createActorRunErrorWith,
  actorPricingSnapshot,
  admittedActorPricingSnapshot,
  createActorAdmissionWarnings,
  createActorDispositions,
  createActorInput,
  createActorQuote,
  createActorRejectedFields,
  createActorRunError,
  createdActor,
  newPersonalActorId,
  producedCreatedActor,
  storedCreateActorInput,
} from "./account-actors.js";
import { isActorViewsEnabled } from "./contract-dispositions.js";
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
      /takes no image link/,
    );
  });
});

// A photo of a person is NOT an input, so face checks run on our own generation;
// this is the biometrics boundary.
describe("create_actor input stays TEXTUAL", () => {
  /** The list is checked against the schema's own shape: a new field turns it red and forces a boundary review. */
  /** #898 review: `from_actor_id` names our own actor, and a held object's picture is an asset id, never scored for a face. */
  const TEXT_ONLY_KEYS = [
    "approximate_age",
    "aspect_ratios",
    "description",
    "framing",
    "from_actor_id",
    "gender",
    "holding",
    "name",
    "portrait",
    "quality",
    "setting",
    "style_reference",
  ];

  /** #975: `style_reference` is a photo that may show a person; only an asset id, whose faces the worker gates against, never copies. */
  /** #1095: `portrait` is the account's own rights-confirmed image of the presenter, an asset id; the worker checks one face and framing. */
  it("there are EXACTLY TWELVE keys, all read from the schema", () => {
    expect(Object.keys(createActorInput.shape).sort()).toEqual(TEXT_ONLY_KEYS);
  });

  it("a derived actor takes no image carrier either, and a held object's picture only as an asset id", () => {
    const derived = { name: "Anna wide", from_actor_id: "actor_anna", framing: "wide" };
    for (const key of ["from_actor_id", "framing", "holding", "setting"]) {
      for (const [label, carrier] of CARRIERS) {
        expect(createActorInput.safeParse({ ...derived, [key]: carrier }).success, `${key}: ${label}`).toBe(false);
        expect(createActorInput.safeParse({ ...derived, holding: [{ description: "a mug", reference: carrier }] }).success, label)
          .toBe(false);
      }
    }
    const asset = { asset_id: `ast_${"a".repeat(32)}` };
    expect(createActorInput.safeParse({ ...derived, holding: [{ description: "a mug", reference: asset }] }).success).toBe(true);
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
  it("the snapshot requires a positive format price, a portrait price of zero or more, and at least one format", () => {
    expect(actorPricingSnapshot.safeParse(SNAPSHOT).success).toBe(true);
    expect(actorPricingSnapshot.safeParse({ ...SNAPSHOT, unit_credits: { portrait: 0, variant: 10 } }).success).toBe(true);
    expect(actorPricingSnapshot.safeParse({ ...SNAPSHOT, unit_credits: { portrait: -1, variant: 10 } }).success).toBe(false);
    expect(actorPricingSnapshot.safeParse({ ...SNAPSHOT, unit_credits: { portrait: 10, variant: 0 } }).success).toBe(false);
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

  it("there are exactly fifteen failure codes; each starts its text and promises zero charge", () => {
    expect([...CREATE_ACTOR_RUN_ERROR_CODES].sort()).toEqual(
      [
        "actor_generation_disabled",
        "actor_identity_not_kept",
        "actor_portrait_framing",
        "actor_portrait_not_one_face",
        "actor_resembles_reference",
        "actor_source_unreadable",
        "actor_views_disabled",
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
  it("the registry names the shared run skills; an unfamiliar value is null", () => {
    expect([...SKILLS]).toEqual(["make_ugc", "create_actor", "make_faceless", "edit_shot", "revise_long_form", "generate_image", "generate_video"]);
    expect(parseSkill("generate_video")).toBe("generate_video");
    expect(parseSkill("revise_long_form")).toBe("revise_long_form");
    expect(parseSkill("make_ugc")).toBe("make_ugc");
    expect(parseSkill("create_actor")).toBe("create_actor");
    expect(parseSkill("make_faceless")).toBe("make_faceless");
    expect(parseSkill("edit_shot")).toBe("edit_shot");
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

// #898 C1: an actor derived from an actor takes its words, gender and age from the source; none is dropped silently.
describe("an actor derived from an actor", () => {
  const DERIVED = { name: "Anna wide", from_actor_id: "actor_anna", framing: "wide" } as const;
  const ASSET = `ast_${"b".repeat(32)}`;
  const issues = (body: unknown) => {
    const result = createActorInput.safeParse(body);
    expect(result.success).toBe(false);
    return (result.error?.issues ?? []).map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  };

  it("passes with a name, a source and one change, defaults filled", () => {
    expect(createActorInput.parse(DERIVED)).toEqual({ ...DERIVED, quality: ACTOR_DEFAULT_QUALITY, aspect_ratios: [...ASPECT_RATIOS] });
    for (const change of [{ holding: [{ description: "a coffee mug" }] }, { setting: "a bright studio" }]) {
      expect(createActorInput.safeParse({ name: "Anna", from_actor_id: `actor_u_${"a".repeat(26)}`, ...change }).success).toBe(true);
    }
  });

  /** #1192. Mutant (description refused again, or gender let through): a view cannot change its look, or changes who the person is. */
  it("refuses gender and age next to from_actor_id, each by name, and takes description as the view's look", () => {
    for (const [field, value] of [["gender", "female"], ["approximate_age", 30]] as const) {
      expect(issues({ ...DERIVED, [field]: value })).toEqual([`${field}: ${field} comes from the source actor with from_actor_id; omit it`]);
    }
    expect(createActorInput.safeParse({ ...DERIVED, description: "a red raincoat, arms crossed" }).success).toBe(true);
    expect(createActorInput.safeParse({ name: "Anna", from_actor_id: "actor_anna", description: "a red raincoat" }).success).toBe(true);
  });

  /** #1192. Mutant (holding or setting on a new actor refused again): a new presenter cannot be drawn in a place or with an object. */
  it("refuses a source without a change, and takes holding and setting on a new actor", () => {
    expect(issues({ name: "Anna", from_actor_id: "actor_anna" })).toEqual([
      "from_actor_id: from_actor_id needs a change: framing, holding, setting, description or style_reference"]);
    for (const change of [{ holding: [{ description: "a mug" }] }, { setting: "a studio" }]) {
      expect(createActorInput.safeParse({ ...VALID, ...change }).success).toBe(true);
      expect(createActorInput.safeParse({ ...VALID, ...change, style_reference: { asset_id: ASSET } }).success).toBe(true);
    }
    expect(issues({ ...VALID, holding: [{ description: "a", hand: "left" }, { description: "b", hand: "left" }] })).toEqual([
      "holding: holding names the same hand twice: one object per hand"]);
  });

  /** #1175 S7. Mutant (framing from words refused, or let through with an image source): words cannot ask a shot size, or an image's is overridden. */
  it("takes a shot size from words, and refuses one beside an image that sets its own", () => {
    for (const framing of ["close", "wide", "full"] as const) expect(createActorInput.safeParse({ ...VALID, framing }).success).toBe(true);
    expect(createActorInput.safeParse({ name: "Anna", from_actor_id: "actor_anna", framing: "full" }).success).toBe(true);
    expect(issues({ ...VALID, framing: "full", style_reference: { asset_id: "ast_0123456789abcdef0123456789abcdef" } })).toEqual([
      "framing: framing does not combine with style_reference: its image sets the shot size; omit it"]);
    expect(issues({ name: "Anna", from_actor_id: "actor_anna", framing: "close" })).toEqual([
      "framing: framing close is not a change of view: with from_actor_id, framing is wide or full"]);
  });

  it("a described actor still needs its words, gender and age, named", () => {
    expect(issues({ name: "Mira" }).map((line) => line.split(":")[0])).toEqual(["description", "gender", "approximate_age"]);
  });

  it("holds one or two objects, one per hand, with bounded words", () => {
    const item = (hand?: "left" | "right") => ({ description: "a mug", ...(hand ? { hand } : {}) });
    expect(createActorInput.safeParse({ ...DERIVED, holding: [item("left"), item("right")] }).success).toBe(true);
    expect(createActorInput.safeParse({ ...DERIVED, holding: [item(), item()] }).success).toBe(true);
    expect(issues({ ...DERIVED, holding: [item("left"), item("left")] })).toEqual(["holding: holding names the same hand twice: one object per hand"]);
    expect(createActorInput.safeParse({ ...DERIVED, holding: [item(), item(), item()] }).success).toBe(false);
    expect(createActorInput.safeParse({ ...DERIVED, holding: [] }).success).toBe(false);
    expect(createActorInput.safeParse({ ...DERIVED, holding: [{ description: "x".repeat(1000) }] }).success).toBe(true);
    expect(createActorInput.safeParse({ ...DERIVED, holding: [{ description: "x".repeat(1001) }] }).success).toBe(false);
    expect(createActorInput.safeParse({ ...DERIVED, setting: "x".repeat(2000) }).success).toBe(true);
    expect(createActorInput.safeParse({ ...DERIVED, setting: "x".repeat(2001) }).success).toBe(false);
    expect(createActorInput.safeParse({ ...DERIVED, description: "x".repeat(2000) }).success).toBe(true);
    expect(createActorInput.safeParse({ ...DERIVED, description: "x".repeat(2001) }).success).toBe(false);
    expect(createActorInput.safeParse({ ...DERIVED, holding: [{ description: "a mug", hand: "both" }] }).success).toBe(false);
    expect(createActorInput.safeParse({ ...DERIVED, framing: "close" }).success).toBe(false);
  });

  it("the unknown-field refusal names the view fields", () => {
    expect(refusal(createActorInput.safeParse({ ...DERIVED, prop: "mic" }))).toBe(
      "unknown field(s) prop: create_actor accepts description, gender, approximate_age, name, quality, aspect_ratios, " +
        "from_actor_id, framing, holding, setting, style_reference, portrait");
  });

  it("the stored input reads only with the source admission resolved and each picture it found", () => {
    const snapshot = { quality: "medium", unit_credits: { portrait: 10, variant: 10 }, requested_aspects: ["9:16"] } as const;
    const source = { actor_id: "actor_anna", scope: "clipwright", key: "candidates/anna.png", sha256: "c".repeat(64), width: 941,
      height: 1672, framing: "close" } as const;
    const stored = { ...DERIVED, description: "Fictional adult woman", gender: "female", approximate_age: 27, aspect_ratios: ["9:16"],
      quality: "medium", pricing_snapshot: snapshot, source_actor: source,
      holding: [{ description: "a mug", reference: { asset_id: ASSET }, picture: { asset_id: ASSET, key: "assets/k.png", mime: "image/png" } }] };
    expect(storedCreateActorInput.safeParse(stored).success).toBe(true);
    const { source_actor: _source, ...withoutSource } = stored;
    expect(storedCreateActorInput.safeParse(withoutSource).success).toBe(false);
    expect(storedCreateActorInput.safeParse({ ...stored, source_actor: { ...source, actor_id: "actor_maya" } }).success).toBe(false);
    expect(storedCreateActorInput.safeParse({ ...stored, holding: [{ description: "a mug", reference: { asset_id: ASSET } }] }).success).toBe(false);
  });

  it("with CLIPWRIGHT_ACTOR_VIEWS off the view fields are rejected by name, and nothing else", () => {
    const off = createActorDispositions(false);
    expect(createActorRejectedFields(createActorInput.parse(VALID), off)).toEqual([]);
    expect(createActorRejectedFields({ ...DERIVED, setting: "a studio" }, off).map((hit) => hit.field)).toEqual(["from_actor_id", "framing", "setting"]);
    expect(createActorRejectedFields({ ...DERIVED, setting: "a studio" }, createActorDispositions(true))).toEqual([]);
    expect(createActorAdmissionWarnings({ ...DERIVED }, off)).toEqual([]);
  });

  /** #1192. Mutant (style_reference beside from_actor_id refused again): an existing actor cannot be put into a reference's scene. */
  it("a style reference makes a new person from words, or puts a source actor into its scene (#975, #1192)", () => {
    const style = { style_reference: { asset_id: ASSET } };
    expect(createActorInput.parse({ ...VALID, ...style }).style_reference).toEqual({ asset_id: ASSET });
    expect(issues({ name: "Mira", ...style }).map((line) => line.split(":")[0])).toEqual(["description", "gender", "approximate_age"]);
    expect(createActorInput.safeParse({ name: "Anna", from_actor_id: "actor_anna", ...style }).success).toBe(true);
    expect(issues({ ...DERIVED, ...style })).toEqual(["framing: framing does not combine with style_reference: its image sets the shot size; omit it"]);
    expect(createActorInput.safeParse({ ...VALID, style_reference: { asset_id: ASSET, url: "https://example.com/a.jpg" } }).success).toBe(false);
    expect(createActorInput.safeParse({ ...VALID, style_reference: { asset_id: "upl_1" } }).success).toBe(false);
    expect(createActorRejectedFields({ ...VALID, ...style }, createActorDispositions(false))).toEqual([]);
    expect(createActorAdmissionWarnings({ ...VALID, ...style })).toEqual([]);
  });

  it("a stored style reference carries the asset admission found, beside a source actor too (#1192); a look only with one", () => {
    const snapshot = { quality: "medium", unit_credits: { portrait: 10, variant: 10 }, requested_aspects: ["9:16"] } as const;
    const stored = { ...VALID, aspect_ratios: ["9:16"], quality: "medium", pricing_snapshot: snapshot,
      style_reference: { asset_id: ASSET, key: `assets/acc_1/${ASSET}/${"d".repeat(64)}.jpg`, mime: "image/jpeg" } };
    const derived = { ...stored, from_actor_id: "actor_anna", source_actor: { actor_id: "actor_anna",
      scope: "clipwright", key: "candidates/anna.png", sha256: "c".repeat(64), width: 941, height: 1672, framing: "close" } };
    expect(storedCreateActorInput.safeParse(stored).success).toBe(true);
    expect(storedCreateActorInput.safeParse({ ...stored, style_reference: { asset_id: ASSET } }).success).toBe(false);
    expect(storedCreateActorInput.safeParse(derived).success).toBe(true);
    expect(storedCreateActorInput.safeParse({ ...derived, look: "a red raincoat" }).data?.look).toBe("a red raincoat");
    expect(storedCreateActorInput.safeParse({ ...stored, look: "a red raincoat" }).success).toBe(false);
  });

  it("the switch needs generation and the fetch surface as well", () => {
    const on = { CLIPWRIGHT_ACTOR_VIEWS: "1", CLIPWRIGHT_ACTOR_GENERATION: "1", CLIPWRIGHT_REMOTE_FETCH: "1" };
    expect(isActorViewsEnabled(on)).toBe(true);
    for (const key of Object.keys(on)) expect(isActorViewsEnabled({ ...on, [key]: "0" }), key).toBe(false);
  });
});

// #1095: an actor from the account's own portrait image — gender and age from the caller, the face and look from the image.
describe("an actor from an own portrait image", () => {
  const ASSET = `ast_${"c".repeat(32)}`;
  const IMPORTED = { name: "Nell", gender: "female", approximate_age: 34, portrait: { asset_id: ASSET } } as const;
  const issues = (body: unknown) => {
    const result = createActorInput.safeParse(body);
    expect(result.success).toBe(false);
    return (result.error?.issues ?? []).map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  };

  it("passes with a name, gender, age and the asset, defaults filled", () => {
    expect(createActorInput.parse(IMPORTED)).toEqual({ ...IMPORTED, quality: ACTOR_DEFAULT_QUALITY, aspect_ratios: [...ASPECT_RATIOS] });
    expect(createActorAdmissionWarnings(createActorInput.parse(IMPORTED))).toEqual([]);
    expect(createActorRejectedFields(IMPORTED, createActorDispositions(false))).toEqual([]);
  });

  it("refuses description, style_reference and from_actor_id next to portrait, each by name", () => {
    expect(issues({ ...IMPORTED, description: "a woman" })).toEqual([
      "description: description does not combine with portrait: the face and look come from the portrait image; omit it"]);
    expect(issues({ ...IMPORTED, style_reference: { asset_id: ASSET } })).toEqual([
      "style_reference: style_reference draws a new face and does not combine with portrait; omit it"]);
    expect(issues({ name: "Nell", portrait: { asset_id: ASSET }, from_actor_id: "actor_anna", framing: "wide" })).toEqual([
      "portrait: portrait makes a new actor and does not combine with from_actor_id; create the actor first, then derive a view of it"]);
  });

  it("requires gender and age, with the adult bounds", () => {
    expect(issues({ name: "Nell", portrait: { asset_id: ASSET } })).toEqual([
      "gender: gender is required with portrait: it fixes the actor's gender and default voice",
      "approximate_age: approximate_age is required with portrait: the actor's approximate age in years"]);
    expect(createActorInput.safeParse({ ...IMPORTED, approximate_age: ACTOR_MIN_AGE - 1 }).success).toBe(false);
    expect(createActorInput.safeParse({ ...IMPORTED, approximate_age: ACTOR_MAX_AGE + 1 }).success).toBe(false);
    expect(createActorInput.safeParse({ ...IMPORTED, approximate_age: ACTOR_MIN_AGE }).success).toBe(true);
  });

  it("takes only an asset id, and is used as it is: no setting or holding drawn into it", () => {
    expect(createActorInput.safeParse({ ...IMPORTED, portrait: { asset_id: ASSET, url: "https://example.com/a.jpg" } }).success).toBe(false);
    expect(createActorInput.safeParse({ ...IMPORTED, portrait: { asset_id: "upl_1" } }).success).toBe(false);
    for (const [field, value] of [["setting", "a studio"], ["holding", [{ description: "a mug" }]]] as const) {
      expect(issues({ ...IMPORTED, [field]: value })).toEqual([`${field}: ${field} does not combine with portrait: the image is used as it is; ` +
        "create the actor, then derive a view of it with from_actor_id"]);
    }
  });

  it("the stored input reads only with the admitted asset and a zero portrait unit, never next to another source", () => {
    const snapshot = { quality: "medium", unit_credits: { portrait: 0, variant: 8 }, requested_aspects: ["9:16", "1:1"] } as const;
    const portrait = { asset_id: ASSET, key: `assets/acc_1/${ASSET}/${"d".repeat(64)}.jpg`, mime: "image/jpeg" } as const;
    const stored = { ...IMPORTED, description: "x", aspect_ratios: ["9:16", "1:1"], quality: "medium", pricing_snapshot: snapshot, portrait };
    expect(storedCreateActorInput.safeParse(stored).success).toBe(true);
    expect(storedCreateActorInput.safeParse({ ...stored, portrait: { asset_id: ASSET } }).success, "not admitted").toBe(false);
    expect(storedCreateActorInput.safeParse({ ...stored, pricing_snapshot: { ...snapshot, unit_credits: { portrait: 4, variant: 8 } } }).success,
      "a charged portrait unit next to an imported portrait").toBe(false);
    // Account deletion drops the portrait and the input still reads; the worker refuses such a run before generating (task test).
    const { portrait: _portrait, ...dropped } = stored;
    expect(storedCreateActorInput.safeParse(dropped).success, "the portrait dropped by account deletion").toBe(true);
    expect(storedCreateActorInput.safeParse({ ...stored, style_reference: portrait }).success).toBe(false);
    expect(storedCreateActorInput.safeParse({ ...stored, from_actor_id: "actor_anna", source_actor: { actor_id: "actor_anna",
      scope: "clipwright", key: "candidates/anna.png", sha256: "c".repeat(64), width: 941, height: 1672, framing: "close" } }).success)
      .toBe(false);
  });

  it("a portrait within 2% of 9:16 is the actor's shape; further off is not", () => {
    expect(isActorPortraitShape(1080, 1920)).toBe(true);
    expect(isActorPortraitShape(359, 640)).toBe(true);
    expect(isActorPortraitShape(1101, 1920)).toBe(true);
    expect(isActorPortraitShape(1103, 1920)).toBe(false);
    expect(isActorPortraitShape(1059, 1920)).toBe(true);
    expect(isActorPortraitShape(1057, 1920)).toBe(false);
    expect(isActorPortraitShape(1080, 1080)).toBe(false);
  });

  it("framing takes the measured lip-sync floor and the presenter_place ceiling: a face 5.5% to 60% of the height, wholly inside", () => {
    const face = (top: number, height: number, left = 0.4, width = 0.2) => ({ left, top, width, height });
    // The live check (#1171): a face of 0.055 talked on a delivered take, 0.031 did not.
    expect(ACTOR_PORTRAIT_MIN_FACE_HEIGHT).toBe(0.055);
    expect(actorPortraitFramingRefusal(face(0.4, 0.031))).toMatch(/too small: 0\.03 of the height, at least 0\.055/);
    expect(actorPortraitFramingRefusal(face(0.2, 0.25))).toBeNull();
    expect(actorPortraitFramingRefusal(face(0.2, ACTOR_PORTRAIT_MIN_FACE_HEIGHT))).toBeNull();
    expect(actorPortraitFramingRefusal(face(0.2, 0.6))).toBeNull();
    expect(actorPortraitFramingRefusal(face(0.2, ACTOR_PORTRAIT_MIN_FACE_HEIGHT - 0.001))).toMatch(/too small/);
    // Mutant (zero floor): any face, however small, passes.
    expect(actorPortraitFramingRefusal(face(0.2, 0.005))).toMatch(/too small/);
    expect(actorPortraitFramingRefusal(face(0.2, 0.601))).toMatch(/too large/);
    expect(actorPortraitFramingRefusal(face(-0.01, 0.25))).toMatch(/cut off/);
    expect(actorPortraitFramingRefusal(face(0.8, 0.25))).toMatch(/cut off/);
    expect(actorPortraitFramingRefusal(face(0.2, 0.25, 0.9, 0.2))).toMatch(/cut off/);
  });

  // Mutant (Codex 1095 r2 M5): drop any one edge of the cut-off check, and a face past that edge passes.
  it.each([
    ["the top", { left: 0.4, top: -0.01, width: 0.2, height: 0.25 }],
    ["the bottom", { left: 0.4, top: 0.8, width: 0.2, height: 0.25 }],
    ["the left", { left: -0.01, top: 0.2, width: 0.2, height: 0.25 }],
    ["the right", { left: 0.81, top: 0.2, width: 0.2, height: 0.25 }],
  ])("a face past %s edge is cut off", (_edge, box) => {
    expect(actorPortraitFramingRefusal(box)).toMatch(/cut off/);
  });

  // #1171: the full-height portraits of the live check (YuNet boxes: the reference 0.0869, the actor drawn from it 0.0916).
  /** Mutant (the presenter_place floor 0.08 back): a full-height portrait whose face is 0.07 is refused. */
  it("a full-height portrait passes, and so does one with a face of 0.07", () => {
    for (const height of [0.0869, 0.0916, 0.07]) {
      expect(actorPortraitFramingRefusal({ left: 0.44, top: 0.17, width: 0.12, height }), String(height)).toBeNull();
    }
  });

  /** Mutant ("wide" never set): a full-height or waist-up portrait comes back close, and make_ugc frames it as a chest-up shot. */
  /** Mutant (#1175 S7, "full" never set, or the line moved past a library wide view): a full-height actor is filed waist-up, or one the other way. */
  it("a face smaller than a chest-up portrait's makes the portrait wide, a full-height one's full; a chest-up one stays close", () => {
    // Measured: live full-height faces 0.087–0.092, library wide views 0.149–0.195, generated chest-up portraits 0.286–0.315.
    expect([0.055, 0.087, 0.0916, 0.119].map((height) => actorPortraitFraming({ height }))).toEqual(["full", "full", "full", "full"]);
    expect([0.12, 0.149, 0.195, 0.239].map((height) => actorPortraitFraming({ height }))).toEqual(["wide", "wide", "wide", "wide"]);
    expect([0.24, 0.286, 0.315, 0.6].map((height) => actorPortraitFraming({ height }))).toEqual(["close", "close", "close", "close"]);
  });

  it("the unknown-field refusal names portrait, and an image link points to it", () => {
    expect(refusal(createActorInput.safeParse({ ...IMPORTED, prop: "mic" }))).toBe(
      "unknown field(s) prop: create_actor accepts description, gender, approximate_age, name, quality, aspect_ratios, " +
        "from_actor_id, framing, holding, setting, style_reference, portrait");
    expect(refusal(createActorInput.safeParse({ ...VALID, image: "https://example.com/a.png" }))).toMatch(/portrait: \{ asset_id \}/);
  });
});
