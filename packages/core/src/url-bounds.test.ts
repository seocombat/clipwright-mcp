import { describe, expect, it } from "vitest";
import { z } from "zod";

import { makeUgcInput, makeUgcInputShape, MAX_URL_LENGTH } from "./skills.js";

/** A length cap on EVERY URL field, by predicate, not by list: a list of known fields would */
/** stay silent about a new `.url()` field without `.max`. */

/** The `.url()` fields in `runs.ts` are excluded: they are RESPONSE fields we write. The cap */
/** guards foreign bodies, so only `makeUgcInputShape` is walked. */

/** zod 4 string checks live in `def.checks`, each with its own `_zod.def`. */
interface StringCheck {
  _zod?: { def?: { check?: string; format?: string } };
}

function stringChecks(schema: unknown): StringCheck[] {
  const def = (schema as { def?: { type?: string; checks?: StringCheck[] } }).def;
  if (def?.type !== "string") return [];
  return def.checks ?? [];
}

/** Unwraps down to the string itself: `.optional()`, arrays, objects. */
function urlFieldsOf(schema: unknown, path: string, found: [string, unknown][] = []): [string, unknown][] {
  const def = (schema as { def?: Record<string, unknown> }).def;
  if (def === undefined) return found;

  const type = def["type"];
  if (type === "string") {
    const isUrl = stringChecks(schema).some((check) => check._zod?.def?.format === "url");
    if (isUrl) found.push([path, schema]);
    return found;
  }
  if (def["innerType"] !== undefined) return urlFieldsOf(def["innerType"], path, found);
  if (type === "array") return urlFieldsOf(def["element"], `${path}[]`, found);
  if (type === "object") {
    const shape = def["shape"] as Record<string, unknown>;
    for (const [key, value] of Object.entries(shape)) urlFieldsOf(value, `${path}.${key}`, found);
  }
  return found;
}

describe("an upper length bound on input URL fields", () => {
  const fields = Object.entries(makeUgcInputShape).flatMap(([name, schema]) =>
    urlFieldsOf(schema, name),
  );

  it("the walk is NOT EMPTY and reaches nested fields, or the next case is a tautology", () => {
    // A broken walk would make the predicate pass on an empty list. No name list here
    // on purpose: it would go stale with every new URL field.
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.map(([name]) => name)).toContain("segments[].media_url");
  });

  it("EVERY `.url()` field carries `.max`: a predicate, not a list of names", () => {
    const unbounded = fields
      .filter(
        ([, schema]) =>
          !stringChecks(schema).some((check) => check._zod?.def?.check === "max_length"),
      )
      .map(([name]) => name);

    expect(unbounded, "a URL field without an upper length bound").toEqual([]);
  });
});

describe("the bound refuses a long URL on input", () => {
  const longUrl = `https://example.com/${"a".repeat(MAX_URL_LENGTH)}`;

  it("`image` above the cap is refused", () => {
    const result = makeUgcInput.safeParse({ script: "hello there", image: longUrl });
    expect(result.success).toBe(false);
  });

  it("`webhook_url` above the cap is refused", () => {
    const result = makeUgcInput.safeParse({ script: "hello there", webhook_url: longUrl });
    expect(result.success).toBe(false);
  });

  it("`broll_url` above the cap is refused", () => {
    const result = makeUgcInput.safeParse({ script: "hello there", broll_url: longUrl });
    expect(result.success).toBe(false);
  });

  it("a segment `media_url` above the cap is refused", () => {
    const result = makeUgcInput.safeParse({
      segments: [
        { kind: "actor", script: "line" },
        { kind: "media", media_url: longUrl },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("a URL within the cap passes: the bound does not block work", () => {
    expect(
      makeUgcInput.safeParse({ script: "hello there", image: "https://example.com/a.png" })
        .success,
    ).toBe(true);
  });
});

describe("the introspection walk invents no rules of its own", () => {
  it("a field without `.url()` is not a URL field", () => {
    expect(urlFieldsOf(z.string().max(10), "plain")).toEqual([]);
  });

  it("a nested URL is seen through an array and `.optional()`", () => {
    const schema = z.array(z.object({ u: z.string().url().optional() })).optional();
    expect(urlFieldsOf(schema, "outer").map(([name]) => name)).toEqual(["outer[].u"]);
  });
});
