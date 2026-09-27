import { describe, expect, it } from "vitest";

import { actorIdempotencyKeyFor, facelessIdempotencyKeyFor, idempotencyKeyFor, requestHash } from "./idempotency.js";

/** Every paid-run key: a new key builder must join this table, not get its own ad hoc test. */
const keyBuilders = [
  { name: "make_ugc", key: idempotencyKeyFor, input: { script: "hello world" },
    explicit: { script: "hello world", captions: false, caption_style: "hormozi", look: "natural" },
    other: { script: "hello there" } },
  { name: "create_actor", key: actorIdempotencyKeyFor,
    input: { name: "Ada", description: "A calm lighthouse keeper with grey hair", gender: "female", approximate_age: 55 },
    explicit: { name: "Ada", description: "A calm lighthouse keeper with grey hair", gender: "female", approximate_age: 55, quality: "medium" },
    other: { name: "Ada", description: "A cheerful baker with flour on her apron", gender: "female", approximate_age: 55 } },
  { name: "make_faceless", key: facelessIdempotencyKeyFor,
    input: { input_mode: "script", script: "Mira reached the harbor.", duration_seconds: 30 },
    explicit: { input_mode: "script", script: "Mira reached the harbor.", duration_seconds: 30, captions: true },
    other: { input_mode: "brief", brief: "Mira reached the harbor.", duration_seconds: 30 } },
] as const;

describe.each(keyBuilders)("$name idempotency key", ({ key, input, explicit, other }) => {
  it("differs between clients on one input", () => {
    expect(key(input, "client-aaaa")).not.toBe(key(input, "client-bbbb"));
  });
  it("is one key for raw input and explicit defaults", () => {
    expect(key(input, "client-aaaa")).toBe(key(explicit, "client-aaaa"));
  });
  it("differs for a different request", () => {
    expect(key(input, "client-aaaa")).not.toBe(key(other, "client-aaaa"));
  });
});

// The hash arbitrates the 409 branch of run creation: sensitivity to key order would turn an
// agent's rebuilt retry into a false key conflict. Order stability is a money-path requirement.
describe("requestHash", () => {
  it("is stable to top-level key order", () => {
    // Byte-different JSON for one semantic request must match.
    expect(requestHash({ a: 1, b: 2 })).toBe(requestHash({ b: 2, a: 1 }));
  });

  it("is stable to key order in NESTED objects", () => {
    // Canonicalization must recurse, or reordering inside a nested object gives a false 409.
    expect(requestHash({ outer: { a: 1, b: 2 }, top: 1 })).toBe(
      requestHash({ top: 1, outer: { b: 2, a: 1 } }),
    );
  });

  it("PRESERVES array element order", () => {
    // In an array order is part of the value: [1,2] and [2,1] are different requests.
    expect(requestHash({ list: [1, 2] })).not.toBe(requestHash({ list: [2, 1] }));
  });
});

// The key is deterministic from input AND client: a raw input and one with explicit defaults
// share a key (else a retry is a new paid run); different clients never do (else a leak).
describe("idempotencyKeyFor", () => {
  const clientA = "client-aaaa";
  const clientB = "client-bbbb";

  it("raw input ≡ input with explicit defaults: ONE key", () => {
    // parse fills in defaults inside; `aspect_ratio` is not listed, since it has no default.
    const raw = { script: "hello world" };
    const explicit = {
      script: "hello world",
      captions: false,
      caption_style: "hormozi",
      look: "natural",
    };
    expect(idempotencyKeyFor(raw, clientA)).toBe(idempotencyKeyFor(explicit, clientA));
  });

  it("an explicit aspect_ratio differs from silence: they are different requests", () => {
    // Silence snaps with a warning where an explicit request is refused, so a shared
    // key would return a run the client did not order.
    const silent = { script: "hello world" };
    const explicit = { script: "hello world", aspect_ratio: "9:16" };
    expect(idempotencyKeyFor(silent, clientA)).not.toBe(
      idempotencyKeyFor(explicit, clientA),
    );
  });

  it("two different clientIds on one input: DIFFERENT keys", () => {
    const input = { script: "hello world" };
    expect(idempotencyKeyFor(input, clientA)).not.toBe(idempotencyKeyFor(input, clientB));
  });

  it("does not depend on input key order", () => {
    // Canonicalized inside: reordering body fields gives no new key.
    const a = { script: "hi", captions: true, look: "commercial" };
    const b = { look: "commercial", script: "hi", captions: true };
    expect(idempotencyKeyFor(a, clientA)).toBe(idempotencyKeyFor(b, clientA));
  });

  it("a 0-word script throws BEFORE a key is built", () => {
    // The zero-word gate inside makeUgcInput.parse must reject blank scripts first.
    expect(() => idempotencyKeyFor({ script: "   " }, clientA)).toThrow(
      /0 speakable words/,
    );
  });
});

// These test key BEHAVIOR, not canonicalization: zod rebuilds objects in schema key order
// first. Different lines or segment order are different clips; key order inside is not.
describe("idempotencyKeyFor — segments", () => {
  const client = "client-a";
  const actor = (script: string) => ({ kind: "actor", script });
  const media = { kind: "media", media_url: "https://example.com/broll.mp4" };

  it("tells inputs apart by segment line content", () => {
    const one = idempotencyKeyFor({ segments: [actor("hello there")] }, client);
    const two = idempotencyKeyFor({ segments: [actor("goodbye now")] }, client);
    expect(one).not.toBe(two);
  });

  it("tells inputs apart by segment ORDER", () => {
    const before = idempotencyKeyFor(
      { segments: [actor("line one"), media, actor("line two")] },
      client,
    );
    const after = idempotencyKeyFor(
      { segments: [actor("line two"), media, actor("line one")] },
      client,
    );
    expect(before).not.toBe(after);
  });

  it("does not tell inputs apart by KEY order inside a segment", () => {
    const straight = idempotencyKeyFor(
      { segments: [{ kind: "media", media_url: media.media_url }, actor("line")] },
      client,
    );
    const flipped = idempotencyKeyFor(
      { segments: [{ media_url: media.media_url, kind: "media" }, actor("line")] },
      client,
    );
    expect(straight).toBe(flipped);
  });

  it("tells a segmented input from a single-script one with the same text", () => {
    const segmented = idempotencyKeyFor({ segments: [actor("same words here")] }, client);
    const plain = idempotencyKeyFor({ script: "same words here" }, client);
    expect(segmented).not.toBe(plain);
  });
});

// Segment canonicalization WITHOUT zod: `requestHash` is called directly, so only key
// sorting inside array elements and preservation of their order are tested.
describe("requestHash — canonicalizing a segment array", () => {
  it("ignores KEY order inside an element", () => {
    const straight = requestHash({
      segments: [{ kind: "media", media_url: "https://example.com/a.mp4" }],
    });
    const flipped = requestHash({
      segments: [{ media_url: "https://example.com/a.mp4", kind: "media" }],
    });
    expect(straight).toBe(flipped);
  });

  it("tells array ELEMENT order apart", () => {
    const first = requestHash({ segments: [{ kind: "actor" }, { kind: "media" }] });
    const second = requestHash({ segments: [{ kind: "media" }, { kind: "actor" }] });
    expect(first).not.toBe(second);
  });
});
