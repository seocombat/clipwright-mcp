import { describe, expect, it, vi } from "vitest";

import {
  AI_DISCLOSURE_OBJECT_METADATA,
  AI_DISCLOSURE_TEXT,
  aiDisclosureObjectMetadata,
  aiDisclosureText,
  FACELESS_AI_DISCLOSURE_TEXT,
  FACELESS_OWN_IMAGES_AI_DISCLOSURE_TEXT,
  annotatedUgcInputShape,
  COMPOSITION_PROVEN_FIELDS,
  CONTRACT_VERSION,
  EGRESS_PROVEN_FIELDS,
  dispositionNote,
  dispositionWarnings,
  contractFlagsFromEnv,
  EFFECTIVE_DISPOSITIONS,
  FIELD_DISPOSITIONS,
  IMPLEMENTED_FIELDS,
  makeUgcInput,
  makeUgcInputShape,
  offeredUgcInputShape,
  MAX_SCRIPT_CHARS,
  rejectedFields,
  resolveDispositions,
  resolvedScript,
  run,
  type ContractField,
  type Disposition,
} from "@clipwright/core";

const FIELDS = Object.keys(makeUgcInputShape) as ContractField[];
// The effective rejected set: `image` is implemented, but the remote-fetch kill switch
// rejects it, and every surface uses the effective table.
const REJECTED = FIELDS.filter((f) => EFFECTIVE_DISPOSITIONS[f].kind === "rejected");
// The base set is the contract shape (schema, types, descriptions); the effective set
// above is the server's current decision, used by rejectedFields.
const BASE_REJECTED = FIELDS.filter((f) => FIELD_DISPOSITIONS[f].kind === "rejected");

/** Minimal valid input: only the required field. */
const parse = (extra: Record<string, unknown> = {}) =>
  makeUgcInput.parse({ script: "hello world", ...extra });

// The compiler already catches a field without a row, but dropping `satisfies` is one
// edit away; runtime iteration turns the same claim into a failing test.
describe("FIELD_DISPOSITIONS — completeness guard", () => {
  it("offers long form to clients and admits it only when all server gates are enabled", () => {
    for (const remoteFetch of [false, true]) for (const compose of [false, true]) for (const longForm of [false, true]) {
      const expected = remoteFetch && compose && longForm ? "implemented" : "rejected";
      expect(resolveDispositions({ remoteFetch, compose, longForm })).toHaveProperty("inserts.kind", expected);
      expect(resolveDispositions({ remoteFetch, compose, longForm })).toHaveProperty("segments.kind", expected);
    }
    expect(offeredUgcInputShape).toHaveProperty("inserts");
    expect(offeredUgcInputShape).toHaveProperty("segments");
    expect(rejectedFields({ inserts: [] })).toEqual([expect.objectContaining({ field: "inserts" })]);
  });
  it("every input field has a disposition and there are no extra rows", () => {
    expect(Object.keys(FIELD_DISPOSITIONS).sort()).toEqual([...FIELDS].sort());
  });

  it("the table matches today's contract (22 fields)", () => {
    // Pinned: growing the shape is a deliberate contract change, not a side effect.
    expect(FIELDS).toHaveLength(22);
  });

  it("an incomplete registry does not compile", () => {
    // Fails compilation on an unused suppression if an incomplete table ever became valid.
    // @ts-expect-error — a table missing most input fields is incomplete by type
    const incomplete: Record<keyof typeof makeUgcInputShape, Disposition> = {
      script: { kind: "implemented", provenBy: "egress" },
    };
    expect(incomplete.script.kind).toBe("implemented");
  });

  it("the three identity fields and webhook_url no longer pass silently", () => {
    // All four used to be accepted and to affect nothing.
    expect(FIELD_DISPOSITIONS.person.kind).toBe("warned");
    expect(FIELD_DISPOSITIONS.image.kind).toBe("implemented");
    expect(FIELD_DISPOSITIONS.character.kind).toBe("rejected");
    expect(FIELD_DISPOSITIONS.webhook_url.kind).toBe("rejected");
  });
});

// Turning off the outbound fetch surface must reject `image`, not accept and ignore it.
describe("resolveDispositions — remoteFetch kill switch", () => {
  it("flag off: actor_gender is rejected together with image", () => {
    const off = resolveDispositions({ remoteFetch: false, compose: false }).actor_gender;
    expect(off.kind).toBe("rejected");
    if (off.kind === "rejected") expect(off.message).toContain("together with image");
    expect(resolveDispositions({ remoteFetch: true, compose: false }).actor_gender.kind).toBe("implemented");
  });

  it("flag on: image is implemented", () => {
    expect(resolveDispositions({ remoteFetch: true, compose: false }).image.kind).toBe("implemented");
  });

  it("flag off: image is REJECTED and the text says how to continue", () => {
    const disposition = resolveDispositions({ remoteFetch: false, compose: false }).image;
    expect(disposition.kind).toBe("rejected");
    if (disposition.kind === "rejected") {
      // The refusal must leave a working path: a run without `image` uses the default actor.
      expect(disposition.message).toContain("default actor");
    }
  });

  it("the flag touches no other field", () => {
    const on = resolveDispositions({ remoteFetch: true, compose: true });
    const off = resolveDispositions({ remoteFetch: false, compose: true });
    for (const field of FIELDS) {
      if (field === "image" || field === "actor_id" || field === "actor_gender") continue;
      expect(on[field]).toEqual(off[field]);
    }
  });

  it("the compose flag touches ONLY background", () => {
    // It is applied by composition, so it follows its kill switch, and nothing else does.
    const composeGated = new Set(["background"]);
    const on = resolveDispositions({ remoteFetch: true, compose: true });
    const off = resolveDispositions({ remoteFetch: true, compose: false });
    for (const field of FIELDS) {
      if (composeGated.has(field)) {
        expect(on[field]).not.toEqual(off[field]);
        continue;
      }
      expect(on[field]).toEqual(off[field]);
    }
  });

  it("the flag is read from the environment, not guessed", () => {
    expect(contractFlagsFromEnv({ CLIPWRIGHT_REMOTE_FETCH: "1" })).toEqual({
      remoteFetch: true,
      compose: false,
      longForm: false,
    });
    expect(contractFlagsFromEnv({})).toEqual({ remoteFetch: false, compose: false, longForm: false });
  });
});

// Warnings never fire on the default happy path, although defaulted fields are always
// present after `parse`.
describe("dispositionWarnings — negative tests of the predicate", () => {
  it("the default happy path gives ZERO warnings", () => {
    expect(dispositionWarnings(parse())).toEqual([]);
  });

  it("look equal to the default gives zero warnings", () => {
    expect(dispositionWarnings(parse({ look: "natural" }))).toEqual([]);
  });

  it("look different from the default gives exactly one warning", () => {
    const warnings = dispositionWarnings(parse({ look: "commercial" }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("look");
  });

  it("captions=true warns, captions=false does not", () => {
    expect(dispositionWarnings(parse({ captions: true }))).toHaveLength(1);
    expect(dispositionWarnings(parse({ captions: false }))).toEqual([]);
  });

  it("a purely optional field (person) warns on presence", () => {
    expect(dispositionWarnings(parse({ person: "a barista" }))).toHaveLength(1);
    expect(dispositionWarnings(parse())).toEqual([]);
  });

  it("several unhonored fields give one warning each", () => {
    const warnings = dispositionWarnings(
      parse({ person: "a barista", name: "Ada", look: "commercial" }),
    );
    expect(warnings).toHaveLength(3);
  });

  it("EVERY `warned` field warns — by walking the registry, not by examples", () => {
    // The landing page claims nothing is dropped silently; this checks every `warned`
    // field, and a new one is covered without editing the test.
    const warned = (Object.keys(FIELD_DISPOSITIONS) as ContractField[]).filter(
      (field) => FIELD_DISPOSITIONS[field].kind === "warned",
    );
    expect(warned.length).toBeGreaterThan(3);

    for (const field of warned) {
      const disposition = FIELD_DISPOSITIONS[field];
      if (disposition.kind !== "warned") continue;
      // A non-default value, taken from the schema itself (`look` is an enum), since a
      // matching default stays silent by design.
      const parsedDefault = (parse() as Record<string, unknown>)[field];
      const schema = makeUgcInputShape[field] as unknown as {
        options?: readonly unknown[];
        def?: { innerType?: { options?: readonly unknown[] } };
      };
      const options = schema.options ?? schema.def?.innerType?.options;
      const value =
        options !== undefined
          ? options.find((option) => option !== parsedDefault)
          : typeof parsedDefault === "boolean"
            ? !parsedDefault
            : "нечто иное";
      expect(value, `no non-default value found for field ${field}`)
        .not.toBeUndefined();
      const warnings = dispositionWarnings(parse({ [field]: value }));
      expect(
        warnings,
        `field ${field} is declared warned but stays silent`,
      ).toContain(disposition.warning);
    }
  });
});

describe("rejectedFields", () => {
  it("a clean input gives no refusals", () => {
    expect(rejectedFields(parse())).toEqual([]);
  });

  it("every rejected field is detected by presence", () => {
    for (const field of REJECTED) {
      const hits = rejectedFields({ script: "x", [field]: "value" });
      expect(hits.map((h) => h.field)).toEqual([field]);
    }
  });

  it("the webhook_url refusal names get_run polling as the alternative", () => {
    // A warning would arrive through `get_run`, the channel a webhook subscriber abandoned.
    const [hit] = rejectedFields({ script: "x", webhook_url: "https://e.com/h" });
    // Checked before access: under `noUncheckedIndexedAccess` an empty result would
    // throw a TypeError instead of failing an assertion.
    expect(hit).toBeDefined();
    if (!hit) return;
    expect(hit.message).toContain("get_run");
  });

  it("the character refusal names person as the replacement", () => {
    const [hit] = rejectedFields({ script: "x", character: "char_a1" });
    expect(hit).toBeDefined();
    if (!hit) return;
    expect(hit.message).toContain("person");
  });
});

// Rejected fields must vanish from the offered surface, not only fail at runtime.
describe("offeredUgcInputShape", () => {
  it("is a subset of the full shape", () => {
    for (const field of Object.keys(offeredUgcInputShape)) {
      expect(makeUgcInputShape).toHaveProperty(field);
    }
  });

  it("its difference from the full shape EQUALS the rejected set", () => {
    // Equality, not inclusion: inclusion would pass with an empty difference.
    // Computed from the base table (see the kill-switch topology block below).
    const missing = FIELDS.filter((f) => !(f in offeredUgcInputShape));
    expect(missing.sort()).toEqual([...BASE_REJECTED].sort());
  });

  it("offers neither character nor webhook_url", () => {
    expect(offeredUgcInputShape).not.toHaveProperty("character");
    expect(offeredUgcInputShape).not.toHaveProperty("webhook_url");
  });
});

// Descriptions come from the registry, so any still-visible refused field carries its reason.
describe("descriptions from the registry", () => {
  it("every rejected field carries its refusal reason in description", () => {
    for (const field of BASE_REJECTED) {
      const description = annotatedUgcInputShape[field].description;
      expect(description).toBeDefined();
      expect(description).toContain("REJECTED");
      const disposition = FIELD_DISPOSITIONS[field];
      if (disposition.kind === "rejected") {
        expect(description).toContain(disposition.message);
      }
    }
  });

  it("every unhonored field carries its warning text in description", () => {
    for (const field of FIELDS) {
      const disposition = FIELD_DISPOSITIONS[field];
      if (disposition.kind !== "warned") continue;
      expect(annotatedUgcInputShape[field].description).toContain(
        disposition.warning,
      );
    }
  });

  it("an implemented field carries no disposition note", () => {
    expect(dispositionNote("script")).toBeNull();
    expect(dispositionNote("voice")).toBeNull();
  });
});

describe("identity contract", () => {
  it("person and image together are rejected by the schema", () => {
    const result = makeUgcInput.safeParse({
      script: "x",
      person: "a barista",
      image: "https://example.com/a.png",
    });
    expect(result.success).toBe(false);
  });

  it("character is out of the mutual exclusion: the registry rejects it, not a refine", () => {
    // Validating a choice where one option does not exist is pointless; the API refuses it.
    const result = makeUgcInput.safeParse({
      script: "x",
      person: "a barista",
      character: "char_a1",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(rejectedFields(result.data).map((h) => h.field)).toEqual(["character"]);
  });
});

describe("CONTRACT_VERSION", () => {
  it("is declared and non-empty", () => {
    expect(CONTRACT_VERSION).toBe("2026-10-04");
  });
});

describe("actor_gender — a gender hint only for image", () => {
  const issues = (input: Record<string, unknown>) => {
    const result = makeUgcInput.safeParse({ script: "hello world", ...input });
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  };

  it("with actor_id: a refusal naming the field and the fix", () => {
    expect(issues({ actor_id: "actor_anna", actor_gender: "female" })).toEqual([
      expect.stringMatching(/actor_gender cannot be combined with actor_id.*omit actor_gender/),
    ]);
  });

  it("without image: a refusal naming image", () => {
    expect(issues({ actor_gender: "male" })).toEqual([expect.stringMatching(/actor_gender requires image/)]);
    expect(issues({ actor_gender: "male", person: "a barista" })).toEqual([
      expect.stringMatching(/actor_gender requires image/),
    ]);
  });

  it("passes with image, and with an explicit voice too", () => {
    expect(issues({ image: "https://example.com/a.png", actor_gender: "female" })).toEqual([]);
    expect(issues({ image: "https://example.com/a.png", actor_gender: "female", voice: "george" })).toEqual([]);
  });

  it("with the flag off rejectedFields finds actor_gender next to image", async () => {
    vi.resetModules();
    vi.stubEnv("CLIPWRIGHT_REMOTE_FETCH", "0");
    try {
      const core = await import("./contract-dispositions.js");
      const input = { script: "x", image: "https://example.com/a.png", actor_gender: "female" };
      expect(core.rejectedFields(input).map((hit) => hit.field)).toEqual(["image", "actor_gender"]);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

// `data:` is refused: the vendor takes only URLs, and storage URLs are never passed to vendors.
describe("image — https only", () => {
  it("https passes", () => {
    expect(
      makeUgcInput.safeParse({ script: "x", image: "https://cdn.example.com/a.png" })
        .success,
    ).toBe(true);
  });

  it("data: is refused by the SCHEMA, not at runtime", () => {
    expect(
      makeUgcInput.safeParse({ script: "x", image: "data:image/png;base64,AAAA" })
        .success,
    ).toBe(false);
  });

  it("http is refused by the schema", () => {
    expect(
      makeUgcInput.safeParse({ script: "x", image: "http://cdn.example.com/a.png" })
        .success,
    ).toBe(false);
  });
});

// `segments` makes `script` optional, which changes the required set in `tools/list`.
describe("script/segments — exactly one of the two", () => {
  it("script alone works as before", () => {
    expect(makeUgcInput.safeParse({ script: "hello world" }).success).toBe(true);
  });

  it("neither of the two: refused", () => {
    expect(makeUgcInput.safeParse({}).success).toBe(false);
  });

  it("both at once: refused", () => {
    // Silently picking one would bring back a silent substitution.
    const result = makeUgcInput.safeParse({
      script: "hello world",
      segments: [{ kind: "actor", script: "hi" }],
    });
    expect(result.success).toBe(false);
  });

  it("segments alone passes the SCHEMA but is rejected by the registry", () => {
    // Division of duties: the schema describes shape, the registry availability.
    const parsed = makeUgcInput.safeParse({
      segments: [{ kind: "actor", script: "hi there" }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const [hit] = rejectedFields(parsed.data);
    expect(hit).toBeDefined();
    if (!hit) return;
    expect(hit.field).toBe("segments");
    expect(hit.message).toContain("disabled");
    expect(hit.message).toContain("script");
  });

  it("the script description makes up for the lost required flag", () => {
    // JSON Schema cannot say "exactly one of two" via required[], so the text says it.
    const description = makeUgcInputShape.script.description ?? "";

    expect(description).toContain("required");
    expect(description).toContain("qualification");
    expect(description).toContain("segments");
  });
});

describe("resolvedScript — the only path to the string", () => {
  it("returns script itself when set", () => {
    expect(resolvedScript({ script: "hello world" })).toBe("hello world");
  });

  it("joins actor segment lines, ignoring media", () => {
    expect(
      resolvedScript({
        segments: [
          { kind: "actor", script: "first line" },
          { kind: "media", media_url: "https://cdn.example.com/b.mp4" },
          { kind: "actor", script: "second line" },
        ],
      }),
    ).toBe("first line second line");
  });

  it("restores the guard before the paid call inside the helper", () => {
    // With `min(1)` gone from the schema, the non-empty check lives here explicitly.
    expect(() => resolvedScript({ script: "   " })).toThrow(/no speakable script/);
    expect(() => resolvedScript({})).toThrow(/no speakable script/);
    expect(() =>
      resolvedScript({ segments: [{ kind: "media", media_url: "https://e.com/b.mp4" }] }),
    ).toThrow(/no speakable script/);
  });

  it("the character cap applies to whichever of the two is set", () => {
    const longLine = "я".repeat(MAX_SCRIPT_CHARS);
    // The same text split into segments must hit the same cap.
    expect(
      makeUgcInput.safeParse({
        segments: [
          { kind: "actor", script: longLine },
          { kind: "actor", script: "one more" },
        ],
      }).success,
    ).toBe(false);
  });
});

// A fully synthesized clip must say so itself (EU AI Act art. 50); this is a technical
// measure, not a claim of legal compliance.
describe("AI output marking", () => {
  const terminalOutput = {
    video_url: "https://cdn.example.com/v.mp4",
    duration_seconds: 7.36,
    ai_generated: true,
    ai_disclosure: AI_DISCLOSURE_TEXT,
  };

  it("final_output WITHOUT ai_generated does not parse", () => {
    // Required on purpose: an optional flag could be forgotten and the clip ship unmarked.
    const { ai_generated: _dropped, ...withoutMark } = terminalOutput;
    expect(run.safeParse(terminalRun(withoutMark)).success).toBe(false);
  });

  it("final_output with the marking parses", () => {
    expect(run.safeParse(terminalRun(terminalOutput)).success).toBe(true);
  });

  it("ai_generated accepts ONLY true", () => {
    expect(
      run.safeParse(terminalRun({ ...terminalOutput, ai_generated: false })).success,
    ).toBe(false);
  });

  it("object metadata carries the same text as the contract", () => {
    // Otherwise the downloaded file and the API response would disagree about origin.
    expect(AI_DISCLOSURE_OBJECT_METADATA["ai-disclosure"]).toBe(AI_DISCLOSURE_TEXT);
    expect(AI_DISCLOSURE_OBJECT_METADATA["ai-generated"]).toBe("true");
  });

  it("the metadata builder carries the sentence it is given under the shared keys (clipwright#489)", () => {
    expect(aiDisclosureObjectMetadata("a sentence of this run alone")).toEqual({
      "ai-generated": "true", generator: "clipwright", "ai-disclosure": "a sentence of this run alone" });
    expect(AI_DISCLOSURE_OBJECT_METADATA).toEqual(aiDisclosureObjectMetadata(AI_DISCLOSURE_TEXT));
    expect(aiDisclosureObjectMetadata("x", true)["ai-disclosure-embedded"]).toBe("true");
    expect(aiDisclosureObjectMetadata("x", false)["ai-disclosure-embedded"]).toBe("false");
    expect(Object.keys(aiDisclosureObjectMetadata("x"))).not.toContain("ai-disclosure-embedded");
  });

  it("disclosure_overlay is rejected with an honest text", () => {
    const [hit] = rejectedFields({ script: "x", disclosure_overlay: true });
    expect(hit).toBeDefined();
    if (!hit) return;
    expect(hit.field).toBe("disclosure_overlay");
    // The refusal must say the disclosure exists in another form.
    expect(hit.message).toContain("marked");
  });

  it("a run with a presenter keeps the actor and lip sync wording", () => {
    expect(aiDisclosureText("make_ugc", { script: "x" })).toBe(AI_DISCLOSURE_TEXT);
    expect(AI_DISCLOSURE_TEXT).toMatch(/actor.*lip sync/);
  });

  it("a faceless run names neither an actor nor lip sync (clipwright#488)", () => {
    const plain = aiDisclosureText("make_faceless", { input_mode: "script", script: "x" });
    const ownImages = aiDisclosureText("make_faceless", { scene_images: [{ image_url: "https://e.com/a.png" }] });
    for (const text of [plain, ownImages]) {
      expect(text).not.toMatch(/actor|lip sync/);
      expect(text).toMatch(/voice.*opening clip/);
    }
    expect(plain).toBe(FACELESS_AI_DISCLOSURE_TEXT);
    expect(ownImages).toBe(FACELESS_OWN_IMAGES_AI_DISCLOSURE_TEXT);
  });

  it("only a run with images of its author excepts them, and it counts none", () => {
    expect(FACELESS_AI_DISCLOSURE_TEXT).not.toContain("supply");
    // An opening image is animated and every shot may be supplied: the sentence must hold for both.
    expect(FACELESS_OWN_IMAGES_AI_DISCLOSURE_TEXT).toContain("every image its author did not supply");
    expect(FACELESS_OWN_IMAGES_AI_DISCLOSURE_TEXT).not.toMatch(/generated images|were supplied|the images are/);
    expect(aiDisclosureText("make_faceless", { scene_images: [] })).toBe(FACELESS_AI_DISCLOSURE_TEXT);
    expect(aiDisclosureText("make_faceless", null)).toBe(FACELESS_AI_DISCLOSURE_TEXT);
  });
});

/** A terminal run around the given final_output: the minimum for run.parse. */
function terminalRun(finalOutput: unknown): unknown {
  return {
    run_id: "run_test1",
    skill: "make_ugc",
    state: "succeeded",
    credits_reserved: 8,
    credits_charged: 8,
    warnings: [],
    error: null,
    final_output: finalOutput,
    steps: [],
    created_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  };
}

// The MCP server runs on the user's machine; building the offered schema from flags would
// let the server's kill switch hide a field in a client whose env lacks the variable.
describe("the kill switch does not control the offered schema", () => {
  it("image is ALWAYS offered: the contract shape is the same for everyone", () => {
    expect(offeredUgcInputShape).toHaveProperty("image");
  });

  it("the offered schema ignores flags; the server's decision does not", () => {
    // The difference uses the base table; what is accepted now is rejectedFields' job.
    const missing = FIELDS.filter((f) => !(f in offeredUgcInputShape));
    expect(missing.sort()).toEqual([...BASE_REJECTED].sort());
  });

  it("with the flag off the refusal comes from the server, not the schema", () => {
    const off = resolveDispositions({ remoteFetch: false, compose: false });
    expect(off.image.kind).toBe("rejected");
    // The field stays declared: the caller learns the reason from the refusal text.
    expect(offeredUgcInputShape).toHaveProperty("image");
  });
});

// With composition off nothing can apply a background, so the field is rejected.
describe("resolveDispositions — composition kill switch", () => {
  it("the compose flag is read from the environment", () => {
    expect(contractFlagsFromEnv({ CLIPWRIGHT_COMPOSE: "1" })).toEqual({
      remoteFetch: false,
      compose: true,
      longForm: false,
    });
  });

  it("composition on: background works", () => {
    const resolved = resolveDispositions({ remoteFetch: true, compose: true });
    expect(resolved.background.kind).toBe("implemented");
  });

  it("composition off: background is REJECTED, not silently accepted", () => {
    const resolved = resolveDispositions({ remoteFetch: true, compose: false });
    expect(resolved.background.kind).toBe("rejected");
  });

  it("the composition-off refusal names the remedy", () => {
    const resolved = resolveDispositions({ remoteFetch: true, compose: false });
    if (resolved.background.kind !== "rejected") throw new Error("expected rejection");
    expect(resolved.background.message).toContain("aspect_ratio");
  });

  it("disclosure_overlay is REJECTED with composition on and off (clipwright#488)", () => {
    for (const compose of [true, false]) {
      const resolved = resolveDispositions({ remoteFetch: true, compose });
      if (resolved.disclosure_overlay.kind !== "rejected") throw new Error("expected rejection");
      expect(resolved.disclosure_overlay.message).toContain("metadata");
    }
  });
});

// A third `provenBy` value would leave an `implemented` field outside every meta-test.
describe("split-proof guard", () => {
  it("egress ∪ composition covers ALL implemented fields", () => {
    expect([...EGRESS_PROVEN_FIELDS, ...COMPOSITION_PROVEN_FIELDS].sort()).toEqual(
      [...IMPLEMENTED_FIELDS].sort(),
    );
  });

  it("the lists do not overlap: a field has one kind of proof", () => {
    const overlap = EGRESS_PROVEN_FIELDS.filter((field) =>
      COMPOSITION_PROVEN_FIELDS.includes(field),
    );
    expect(overlap).toEqual([]);
  });
});
