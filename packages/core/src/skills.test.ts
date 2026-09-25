import { describe, expect, it } from "vitest";

import {
  makeUgcInput,
  MAX_ACTOR_SEGMENTS,
  MAX_INSERTS,
  MAX_NARRATED_ACTOR_SHOTS,
  MAX_SCRIPT_CHARS,
  MAX_SEGMENTS,
} from "@clipwright/core";
import { RESOLVED_TIMELINE_MAX_SLOTS } from "./long-form-profile.js";
import * as contract from "./index.js";

describe("closed script with semantic inserts", () => {
  const insert = { id: "product-1", media_url: "https://example.com/product.png", media_type: "image",
    anchor: { startWord: 0, endWord: 1 } };
  it("retains explicit source type and word anchor", () => {
    expect(makeUgcInput.parse({ script: "Hello world", inserts: [insert] })).toHaveProperty("inserts", [insert]);
  });
  it("accepts an exact quote with an explicit zero-based occurrence", () => {
    const quoted = { ...insert, anchor: { quote: "world", occurrence: 1 } };
    expect(makeUgcInput.parse({ script: "Hello world world", inserts: [quoted] })).toHaveProperty("inserts", [quoted]);
  });
  it.each([
    { inserts: [insert] },
    { script: "Hello world", segments: [{ kind: "actor", script: "Hello world" }], inserts: [insert] },
    { segments: [{ kind: "actor", script: "Hello world" }], inserts: [insert] },
  ])("rejects inserts without standalone script %#", input => {
    expect(makeUgcInput.safeParse(input).success).toBe(false);
  });
  it.each([
    { id: "../escape" }, { id: "x".repeat(65) }, { id: "" },
    { media_url: "http://example.com/media" }, { media_type: undefined },
    { anchor: { startWord: 1, endWord: 1 } }, { anchor: { startWord: -1, endWord: 2 } },
    { anchor: { startWord: 0.5, endWord: 2 } }, { anchor: { quote: " " } },
    { anchor: { quote: "Hello", occurrence: -1 } },
    { anchor: { quote: "Hello", startWord: 0, endWord: 1 } },
    { media_type: "video", image_motion: { direction: "in", amount: 0.1 } },
  ])("rejects invalid semantic insert %#", change => {
    expect(makeUgcInput.safeParse({ script: "Hello world", inserts: [{ ...insert, ...change }] }).success).toBe(false);
  });
  it("rejects duplicate IDs, empty lists and more inserts than the ceiling", () => {
    const many = (count: number) => Array.from({ length: count }, (_, i) => ({ ...insert, id: `i${i}` }));
    for (const inserts of [[], [insert, insert], many(MAX_INSERTS + 1)]) {
      expect(makeUgcInput.safeParse({ script: "Hello world", inserts }).success).toBe(false);
    }
    expect(makeUgcInput.safeParse({ script: "Hello world", inserts: many(MAX_INSERTS) }).success).toBe(true);
  });

  it("accepts cover_words and rejects invalid values", () => {
    expect(makeUgcInput.parse({ script: "Hello world", inserts: [{ ...insert, cover_words: 2 }] }))
      .toHaveProperty("inserts", [{ ...insert, cover_words: 2 }]);
    for (const cover_words of [0, -1, 1.5, 10001]) {
      expect(makeUgcInput.safeParse({ script: "Hello world", inserts: [{ ...insert, cover_words }] }).success).toBe(false);
    }
    // The cap is pinned from BOTH sides: without an accepted 10000 a `.max(100)` mutant survives.
    expect(makeUgcInput.safeParse({ script: "Hello world", inserts: [{ ...insert, cover_words: 10000 }] }).success).toBe(true);
  });

  it("narrated-path caps are pinned as literals, not references", () => {
    // Literals on purpose: a reference to the constant would not kill a mutant.
    expect(MAX_INSERTS).toBe(49);
    expect(MAX_NARRATED_ACTOR_SHOTS).toBe(6);
    expect(2 * MAX_INSERTS + 1).toBeLessThanOrEqual(RESOLVED_TIMELINE_MAX_SLOTS);
    expect([MAX_SEGMENTS, MAX_ACTOR_SEGMENTS]).toEqual([5, 3]);
  });
});

describe("makeUgcInput — script length gate", () => {
  it("rejects text above the largest model ceiling", () => {
    expect(makeUgcInput.safeParse({ script: "я".repeat(MAX_SCRIPT_CHARS + 1) }).success).toBe(false);
  });

  it("the contract has no NAME that looks like a duration cap", () => {
    // An exported duration ceiling previously capped the price below the bill.
    // This guard checks names only; it does not prove runtime duration bounds.
    const TIME_CAP = /(?:^|_)(MAX|CAP|LIMIT|CEILING)(?:_|$)/;
    const timeCap = (name: string) => TIME_CAP.test(name);
    // `\b` does not split `SECONDS_PER_RUN` in JavaScript, since `_` is a word character;
    // the boundary is an underscore or the end of the name.
    const TIME_UNIT =
      /(?:^|_)(SECONDS?|SECS?|MINUTES?|MINS?|HOURS?|HRS?|DAYS?|WEEKS?|MONTHS?|YEARS?|DURATION|MILLIS|MS)(?:_|$)/;
    const timeUnit = (name: string) => TIME_UNIT.test(name);
    // An allow list, not a deny list: the SHAPE is caught, and a new "limit + time" name
    // forces its author to say here whether it caps billable duration.
    const NOT_A_DURATION_CAP = [
      // The window in which requests are counted; money never depends on it.
      "RATE_LIMIT_WINDOW_SECONDS",
      // A pace (words per second), a multiplier rather than a cap: it does not measure
      // duration. The word cap is derived from it, which is a different thing.
      "WORDS_PER_SECOND_MAX",
      // Request frequencies, listed by name rather than by prefix so a future
      // `RATE_LIMIT_MAX_VIDEO_SECONDS` still needs a human decision.
      "RATE_LIMIT_PAID_PER_MINUTE",
      "RATE_LIMIT_FREE_PER_MINUTE",
      "ACTOR_LIMIT_WINDOW_SECONDS", // the `create_actor` counting window: not video seconds, not money
    ];
    const durationCaps = Object.keys(contract).filter(
      (name) =>
        timeCap(name) && timeUnit(name) && !NOT_A_DURATION_CAP.includes(name),
    );
    // Empty, with no allowed name: the basis constant is named by its role, `SCRIPT_SECONDS_BASIS`.
    expect(durationCaps).toEqual([]);

    // Counterexamples live here because the pattern stays green on an empty name set.
    // The unit vocabulary is finite: this narrows where a trap hides, it cannot close it.
    for (const trap of [
      "MAX_SECONDS_PER_RUN",
      "RUN_SECONDS_LIMIT",
      "VIDEO_DURATION_CAP",
      "MAX_VIDEO_DURATION_SEC",
      "MAX_VIDEO_MINUTES",
      "RUN_HOURS_LIMIT",
      "CAP_CLIP_DAYS",
      "MAX_VIDEO_WEEKS",
      "RUN_MONTHS_LIMIT",
    ]) {
      expect(timeCap(trap) && timeUnit(trap), `trap ${trap} not caught`).toBe(true);
    }

    // False positives are checked separately, or "catch everything" would pass trivially.
    // These legal names hide the limit and time words inside other words.
    for (const innocent of ["CAPTURE_DURATION", "CLIMAX_SECONDS", "MAXIMAL_QUALITY"]) {
      expect(
        timeCap(innocent) && timeUnit(innocent),
        `legal name ${innocent} falsely caught`,
      ).toBe(false);
    }

  });

});

// "   " passes the character `.min(1)` but has 0 spoken words; countWords trims and collapses
// whitespace, so blank scripts never reach the pacing gate or the vendor.
describe("makeUgcInput — zero-word gate", () => {
  it("rejects a script of spaces only", () => {
    const result = makeUgcInput.safeParse({ script: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a script of a newline and a tab", () => {
    const result = makeUgcInput.safeParse({ script: "\n\t" });
    expect(result.success).toBe(false);
  });

  it("accepts a one-word script", () => {
    const result = makeUgcInput.safeParse({ script: "hello" });
    expect(result.success).toBe(true);
  });
});

// Each test asserts the refusal TEXT naming the broken rule: an agent that gets
// "invalid input" fixes it by trial, and trial on a paid surface costs money.
describe("makeUgcInput — segment rules", () => {
  const actor = (script = "hello there") => ({ kind: "actor" as const, script });
  const media = (url = "https://example.com/broll.mp4") => ({
    kind: "media" as const,
    media_url: url,
  });

  const errorText = (input: unknown): string => {
    const result = makeUgcInput.safeParse(input);
    if (result.success) throw new Error("expected rejection, got success");
    return result.error.issues.map((issue) => issue.message).join(" | ");
  };

  it("accepts a minimal valid segmented clip", () => {
    const result = makeUgcInput.safeParse({ segments: [actor()] });
    expect(result.success).toBe(true);
  });

  it("accepts an actor → media → actor structure", () => {
    const result = makeUgcInput.safeParse({
      segments: [actor("intro"), media(), actor("outro")],
    });
    expect(result.success).toBe(true);
  });

  it("rejects segments without an actor and names the rule", () => {
    expect(errorText({ segments: [media(), media()] })).toContain(
      "at least one actor segment",
    );
  });

  it("accepts exactly MAX_ACTOR_SEGMENTS actors", () => {
    const result = makeUgcInput.safeParse({
      segments: Array.from({ length: MAX_ACTOR_SEGMENTS }, (_, i) => actor(`line ${i}`)),
    });
    expect(result.success).toBe(true);
  });

  it("rejects MAX_ACTOR_SEGMENTS+1 actors and names the cap", () => {
    expect(
      errorText({
        segments: Array.from({ length: MAX_ACTOR_SEGMENTS + 1 }, (_, i) =>
          actor(`line ${i}`),
        ),
      }),
    ).toContain(`at most ${MAX_ACTOR_SEGMENTS} actor segments`);
  });

  it("rejects an actor without script and names the rule", () => {
    expect(errorText({ segments: [{ kind: "actor" }] })).toContain(
      "actor segment requires `script`",
    );
  });

  it("rejects an actor with media_url and names the rule", () => {
    expect(
      errorText({
        segments: [{ kind: "actor", script: "hi", media_url: "https://example.com/a.mp4" }],
      }),
    ).toContain("actor segment must not carry `media_url`");
  });

  it("rejects media without media_url and names the rule", () => {
    expect(errorText({ segments: [actor(), { kind: "media" }] })).toContain(
      "media segment requires `media_url`",
    );
  });

  it("rejects script and segments together", () => {
    expect(errorText({ script: "hello", segments: [actor()] })).toContain(
      "exactly one of script | segments",
    );
  });

  it("rejects input with neither script nor segments", () => {
    expect(errorText({})).toContain("exactly one of script | segments");
  });

  it("measures the character cap on the SUM of lines, not one line", () => {
    const half = "я".repeat(MAX_SCRIPT_CHARS / 2);
    const result = makeUgcInput.safeParse({ segments: [actor(half), actor(half)] });
    expect(result.success).toBe(false);
  });
});

/** Library vocabulary in a refusal is the first sign nobody wrote the message. Checks the */
/** fields callers see most often. */
describe("refusal texts on common fields are ours, not zod's", () => {
  const ZOD_VOCABULARY = /Too small|Too big|Invalid input|Invalid URL|Invalid string|expected string/;
  const cases = [
    // A TYPE error needs its own text: constraint messages do not cover it.
    { field: "script", input: { script: 42 } },
    { field: "voice", input: { script: "hello there", voice: 42 } },
    { field: "voice_id", input: { script: "hello there", voice_id: 42 } },
    { field: "image", input: { script: "hello there", image: 42 } },
    { field: "script", input: { script: "" } },
    { field: "script", input: { script: "я".repeat(MAX_SCRIPT_CHARS + 1) } },
    { field: "voice", input: { script: "hello there", voice: "не имя" } },
    { field: "voice_id", input: { script: "hello there", voice_id: "short" } },
    { field: "image", input: { script: "hello there", image: "not-a-url" } },
    { field: "image", input: { script: "hello there", image: "http://example.com/face.png" } },
  ];

  it.each(cases)("$field: $input", ({ field, input }) => {
    // Dropping the text from any of these constraints turns this red.
    const result = makeUgcInput.safeParse(input);

    expect(result.success).toBe(false);
    const issues = result.success ? [] : result.error.issues.filter((issue) => issue.path[0] === field);
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) expect(issue.message).not.toMatch(ZOD_VOCABULARY);
  });
});

describe("agent protocol: `failed` is no longer promised to be final", () => {
  // Without the caveat an agent reading `failed` would stop waiting for a clip already
  // paid to the vendor.
  it("names the transition back to queued and promises a warnings entry", () => {
    expect(contract.MAKE_UGC_AGENT_PROTOCOL).toContain("back to 'queued'");
    expect(contract.MAKE_UGC_AGENT_PROTOCOL).toContain("warnings[]");
  });
});
