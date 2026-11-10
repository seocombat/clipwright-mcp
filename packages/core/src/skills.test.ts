import { describe, expect, it, vi } from "vitest";

import {
  makeUgcInput,
  MAX_ACTOR_SEGMENTS,
  MAX_INSERTS,
  MAX_NARRATED_ACTOR_SHOTS,
  MAX_SCRIPT_CHARS,
  MAX_SEGMENTS,
} from "@clipwright/core";
import { facelessQuoteResponse, offeredFacelessInputShape } from "./faceless-public.js";
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

  describe("asset_id instead of media_url (#778 S2a)", () => {
    const assetId = `ast_${"a".repeat(32)}`;
    const { media_url: _url, ...byAsset } = { ...insert, asset_id: assetId };
    const pinned = { insert_id: insert.id, asset_id: assetId, key: `assets/acc/${assetId}/${"b".repeat(64)}.png`, sha256: "b".repeat(64),
      bytes: 10, kind: "image", media_type: "image/png", width: 1, height: 1 };

    it("accepts exactly one of media_url or asset_id", () => {
      expect(makeUgcInput.parse({ script: "Hello world", inserts: [byAsset] }).inserts![0]).toEqual(byAsset);
      const { media_url: _gone, ...neither } = insert;
      for (const bad of [{ ...insert, asset_id: assetId }, neither, { ...byAsset, asset_id: "ast_short" }]) {
        expect(makeUgcInput.safeParse({ script: "Hello world", inserts: [bad] }).success).toBe(false);
      }
    });

    /** Mutant: make the public insert loose, and a client could hand the worker a storage key of its choosing. */
    it("refuses a storage key on a public insert; the pin lives only at the top of the stored input", () => {
      for (const field of ["key", "r2_key", "sha256"]) {
        expect(makeUgcInput.safeParse({ script: "Hello world", inserts: [{ ...byAsset, [field]: pinned.key }] }).success).toBe(false);
      }
      expect(contract.ACCEPTED_UGC_FIELDS).not.toContain("insert_assets");
      const stored = contract.storedUgcInput.parse({ script: "Hello world", inserts: [byAsset], insert_assets: [pinned] });
      expect(contract.pinnedInsertAssetOf(stored, insert.id)).toEqual(pinned);
      expect(contract.pinnedInsertAssetOf(makeUgcInput.parse({ script: "Hello world", inserts: [byAsset] }), insert.id)).toBeUndefined();
    });
  });

  it("narrated-path caps are pinned as literals, not references", () => {
    // Literals on purpose: a reference to the constant would not kill a mutant.
    expect(MAX_INSERTS).toBe(99);
    expect(MAX_NARRATED_ACTOR_SHOTS).toBe(16);
    expect(2 * MAX_INSERTS + 1).toBeLessThanOrEqual(RESOLVED_TIMELINE_MAX_SLOTS);
    expect([MAX_SEGMENTS, MAX_ACTOR_SEGMENTS]).toEqual([20, 10]);
  });
});

describe("live shots (#1103)", () => {
  const script = "One two three four five six seven eight nine ten.";
  const shot = (extra: Record<string, unknown>) => ({ id: "s1", anchor: { quote: "One two" }, ...extra });

  it("takes each kind with what it needs and makes the run narrated", () => {
    const input = { script, shots: [shot({ kind: "talking" }), { ...shot({ kind: "talking_action", action: "points" }), id: "s2" },
      { ...shot({ kind: "action", action: "types", setup: "a café", product: true }), id: "s3" }], product_asset_id: `ast_${"b".repeat(32)}` };
    expect(makeUgcInput.safeParse(input).success).toBe(true);
    expect(contract.isNarratedUgcInput({ shots: input.shots })).toBe(true);
  });

  /** Mutants: drop a shot refinement, and an action shot goes to the vendor with no action, or a talking shot with a product. */
  it("refuses an action-less acting shot, setup or product on a talking shot, and duplicate ids", () => {
    const accepted = (shots: unknown[]) => makeUgcInput.safeParse({ script, shots }).success;
    expect(accepted([shot({ kind: "action" })])).toBe(false);
    expect(accepted([shot({ kind: "talking_action" })])).toBe(false);
    expect(accepted([shot({ kind: "talking", setup: "a café" })])).toBe(false);
    expect(accepted([shot({ kind: "talking", product: { placement: "hand" } })])).toBe(false);
    expect(accepted([shot({ kind: "talking", product: true })])).toBe(false);
    expect(accepted([shot({ kind: "talking" }), shot({ kind: "talking" })])).toBe(false);
    expect(accepted(Array.from({ length: contract.MAX_LIVE_SHOTS + 1 }, (_, index) => ({ ...shot({ kind: "talking" }), id: `s${index}` })))).toBe(false);
  });
});

describe("live shots: the product in the hand or beside the actor (#1146)", () => {
  const script = "One two three four five six seven eight nine ten.";
  const acting = (id: string, extra: Record<string, unknown>) => ({ id, kind: "action", action: "types", anchor: { quote: "One" }, ...extra });
  const accepted = (shots: unknown[]) => makeUgcInput.safeParse({ script, shots }).success;

  /** Mutants: the old boolean-only field, setup refused off action, or `true` read as no product. */
  it("takes a placement on talking_action and action, and keeps true as the hand", () => {
    expect(accepted([{ ...acting("s1", { setup: "at a desk", product: { placement: "hand" } }), kind: "talking_action" },
      acting("s2", { setup: "at a desk", product: true })])).toBe(true);
    expect(accepted([acting("s1", { product: { placement: "beside" } })])).toBe(true);
    expect(accepted([acting("s1", { product: { placement: "floor" } })])).toBe(false);
    expect(accepted([acting("s1", { product: { placement: "hand", size: 2 } })])).toBe(false);
    expect([true, { placement: "beside" as const }, false, undefined].map(product => contract.liveShotProductPlacement({ product })))
      .toEqual(["hand", "beside", undefined, undefined]);
  });

  /** Mutants: the setup compared raw, or a product-less shot let into a product setup, and one place shows the product moving or vanishing. */
  it("refuses Wan shots of one setup that place the product differently, but not shots of different setups or a talking shot", () => {
    expect(accepted([acting("s1", { setup: "at a desk", product: { placement: "hand" } }),
      acting("s2", { setup: " at a  desk", product: { placement: "beside" } })])).toBe(false);
    expect(accepted([acting("s1", { setup: "at a desk", product: true }), acting("s2", { setup: "at a desk" })])).toBe(false);
    expect(accepted([acting("s1", { product: true }), acting("s2", {})])).toBe(false);
    // Mixed kinds (Codex r3): a talking_action shot is held to its setup's placement as an action shot is, either way round.
    const speaking = (id: string, extra: Record<string, unknown>) => ({ ...acting(id, extra), kind: "talking_action" });
    expect(accepted([speaking("s1", { setup: "at a desk", product: true }), acting("s2", { setup: "at a desk", product: { placement: "beside" } })]))
      .toBe(false);
    expect(accepted([speaking("s1", { setup: "at a desk", product: true }), acting("s2", { setup: "at a desk" })])).toBe(false);
    expect(accepted([acting("s1", { product: { placement: "beside" } }), speaking("s2", {})])).toBe(false);
    expect(accepted([speaking("s1", { product: { placement: "hand" } }), speaking("s2", { product: { placement: "beside" } })])).toBe(false);
    expect(accepted([acting("s1", { setup: "at a desk", product: { placement: "hand" } }),
      acting("s2", { setup: "in a park", product: { placement: "beside" } }), acting("s3", { setup: "in a car" })])).toBe(true);
    expect(accepted([acting("s1", { product: true }), { id: "s2", kind: "talking", anchor: { quote: "five" } }])).toBe(true);
  });

  /** The refusals name the way out: split the setups, or move the product off the talking shot. */
  it("words each refusal with what to do instead", () => {
    const messages = (shots: unknown[]) => makeUgcInput.safeParse({ script, shots }).error?.issues.map(issue => issue.message) ?? [];
    expect(messages([acting("s1", { setup: "at a desk", product: true }), acting("s2", { setup: "at a desk", product: { placement: "beside" } })]))
      .toEqual([expect.stringMatching(/one product placement \(or none\), or give them different setups$/)]);
    expect(messages([{ id: "s1", kind: "talking", anchor: { quote: "One" }, product: true }]))
      .toEqual(["a talking shot shows no product; use talking_action, or an actor view holding it (create_actor holding)"]);
  });

  /** Mutant: the new refinement applied to stored runs differently; a run admitted before #1146 must still read back. */
  it("reads back a stored run admitted with product: true on an action shot", () => {
    const stored = { script, product_asset_id: `ast_${"b".repeat(32)}`, shots: [acting("s1", { setup: "a café", product: true })] };
    expect(contract.storedUgcInput.safeParse(stored).success).toBe(true);
  });
});

describe("live shots: a cast beside the actor (#1192)", () => {
  const script = "One two three four five six seven eight nine ten.";
  const woman = { asset_id: `ast_${"1".repeat(32)}`, role: "the customer", action: "laughs" }, man = { asset_id: `ast_${"2".repeat(32)}`, role: "friend" };
  const acting = (id: string, extra: Record<string, unknown>) => ({ id, kind: "action", action: "types", anchor: { quote: "One" }, ...extra });
  const messages = (shots: unknown[]) => makeUgcInput.safeParse({ script, shots }).error?.issues.map(issue => issue.message) ?? [];

  /** Mutants: a cast on a talking shot, a fourth person, the same picture twice, or no role, and the still draws what the clip cannot keep. */
  it("takes up to three people with a role on talking_action and action shots only", () => {
    expect(messages([acting("s1", { cast: [woman, man] }), { ...acting("s2", { cast: [woman, man] }), kind: "talking_action" }])).toEqual([]);
    expect(messages([{ id: "s1", kind: "talking", anchor: { quote: "One" }, cast: [woman] }]))
      .toEqual(["a talking shot shows the actor alone; use talking_action or action for a cast"]);
    const people = Array.from({ length: contract.MAX_SHOT_CAST + 1 }, (_, at) => ({ asset_id: `ast_${String(at + 3).repeat(32)}`, role: "guest" }));
    expect(messages([acting("s1", { cast: people })])).not.toEqual([]);
    expect(messages([acting("s1", { cast: [woman, { ...woman, role: "twin" }] })])).toEqual(["each cast picture appears once in a shot"]);
    expect(messages([acting("s1", { cast: [{ asset_id: woman.asset_id }] })])).not.toEqual([]);
  });

  /** Mutants: casts compared by action, by role spelling, or not at all: one setup's shots then start from one still that lacks a person. */
  it("refuses shots of one setup with different people, and lets their actions differ", () => {
    expect(messages([acting("s1", { cast: [woman, man] }), acting("s2", { cast: [{ ...woman, action: "nods" }, { ...man, role: " friend " }] })])).toEqual([]);
    expect(messages([acting("s1", { cast: [woman, man] }), acting("s2", { cast: [man, woman] })]))
      .toEqual([expect.stringMatching(/give them the same cast \(asset_id and role, in one order\) or none, or give them different setups$/)]);
    expect(messages([acting("s1", { cast: [woman] }), acting("s2", {})])).not.toEqual([]);
    expect(messages([acting("s1", { cast: [woman] }), acting("s2", { cast: [{ ...woman, role: "owner" }] })])).not.toEqual([]);
    expect(messages([acting("s1", { setup: "at a desk", cast: [woman] }), acting("s2", { setup: "in a park" })])).toEqual([]);
    expect(messages([acting("s1", { cast: [woman] }), { id: "s2", kind: "talking", anchor: { quote: "five" } }])).toEqual([]);
  });

  /** Mutant: a slot cut from the asset id, and two pictures differing in their last digits share one pin. */
  it("gives every cast picture its own pin slot", () => {
    const slots = [`ast_${"0".repeat(31)}1`, `ast_${"0".repeat(31)}2`, `ast_${"f".repeat(32)}`].map(contract.castSlotOf);
    expect(new Set(slots).size).toBe(3);
    for (const slot of slots) expect(slot).toMatch(/^[a-z][a-z0-9_]{0,31}$/);
  });
});

describe("live shots: the stored input reads what admission may write (#1103)", () => {
  /** Mutant: keep the old pin cap, and a run using every media slot plus a product no longer reads back from its own row. */
  it("holds a pin for every insert, overlay, window and template slot plus the product and every shot's cast (#1192)", () => {
    const pin = (index: number) => ({ insert_id: `p${index}`, asset_id: `ast_${"a".repeat(32)}`, key: "k", sha256: "b".repeat(64), bytes: 1,
      kind: "image", media_type: "image/png", width: 1, height: 1 });
    const slots = MAX_INSERTS + contract.MAX_OVERLAYS + contract.MAX_LAYOUT_WINDOWS + contract.MAX_TEMPLATE_MEDIA + contract.MAX_LIVE_SHOTS * contract.MAX_SHOT_CAST;
    const stored = (count: number) => contract.storedUgcInput.safeParse({ script: "Hello world",
      insert_assets: [...Array.from({ length: count - 1 }, (_, index) => pin(index)), { ...pin(0), insert_id: "product" }] });
    expect(stored(slots + 1).success).toBe(true);
    expect(stored(slots + 2).success).toBe(false);
  });

  /** Mutant: a pin slot pattern without digits, and a video_grid of the account's clips (cell_1…cell_4) fails its quote with a 500. */
  it("pins every media slot a template kind declares", () => {
    const pin = (slot: string) => ({ insert_id: "t1", slot, asset_id: `ast_${"a".repeat(32)}`, key: "k", sha256: "b".repeat(64), bytes: 1,
      kind: "image", media_type: "image/png", width: 1, height: 1 });
    const slots = contract.TEMPLATE_KINDS.flatMap(kind => Object.keys(kind.slots));
    expect(slots).toContain("cell_1");
    for (const slot of slots) expect(contract.pinnedInsertAsset.safeParse(pin(slot)).success, slot).toBe(true);
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
      "RUN_WAIT_MAX_SECONDS", // how long a run read may wait for the run to end: not video seconds, not money
      // A stored clip's length and the worker's budget to check it (clipwright#724 F2 S3): assets are free, nothing is billed by them.
      "ASSET_VIDEO_MAX_SECONDS",
      "ASSET_INGEST_TASK_MAX_DURATION_SECONDS",
      // The free reference analysis task's ceiling (reference-to-video S1c): nothing is billed by it.
      "REFERENCE_ANALYSIS_TASK_MAX_DURATION_SECONDS",
      // The longest call admitted (#857 S5): a refusal before money; the call adds no face seconds, so it caps no price.
      "MAX_CALL_SEC",
      // The staged call phone's rise and its lead before the freeze (#914 D1e): drawing bounds on a schema field, not video length or price.
      "CALL_STAGE_MAX_ENTER_SEC",
      "CALL_STAGE_MAX_LEAD_SEC",
      // The longest faceless length a caller selects (#927): the quote is priced from the selection, so it caps no bill below it.
      "FACELESS_MAX_SELECTED_SECONDS",
      // How far a reference's hook may run to finish its sentence (#930): a read of someone else's reel, never a price or a render length.
      "REFERENCE_HOOK_MAX_SECONDS",
      // How long a read of an analysis may wait for it to finish (#970): a free read's hold, never a price or a render length.
      "REFERENCE_WAIT_MAX_SECONDS",
      // The creator profile task's ceiling (#999): a read of someone's account, priced per profile, never by its length.
      "CREATOR_PROFILE_TASK_MAX_DURATION_SECONDS",
      // The trend search task's ceiling (#921): a read of public reels, priced per search, never by its length.
      "TREND_SEARCH_TASK_MAX_DURATION_SECONDS",
      // A faceless action shot's longest clip (#1113): a longer scene keeps its still and is not charged, so the bill never outruns the cap.
      "FACELESS_SHOT_MAX_SEC",
      // The longest film and take the «own agent» mode prices (#1291 F2): a refusal before money; every second up to it is charged.
      "OWN_FILM_MAX_SECONDS",
      "OWN_VOICE_MAX_SECONDS",
      // A styled film's beat and length bounds (#1338): the style runtime's drawing bounds, refused before money; the price is the film's.
      "FILM_BEAT_MAX_SEC",
      "FILM_STYLED_MAX_SEC",
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

// Mutants (#1216): the offer said where the format is refused, moved out of the brief, or naming a field the tools do not have.
describe("server instructions offer the explainer only where it is sold", () => {
  const instructions = async (flag: string | undefined): Promise<string> => {
    vi.resetModules();
    vi.stubEnv("CLIPWRIGHT_FACELESS_EXPLAINER", flag);
    try {
      return (await import("./skills.js")).MCP_SERVER_INSTRUCTIONS;
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  };

  it("is absent with the format off", async () => {
    expect(await instructions(undefined)).not.toContain("offer the explainer");
  });

  it("follows the declined brief, names real fields and picks the hero by meaning", async () => {
    const text = await instructions("1");
    const brief = text.indexOf("If the user declines the brief, go on as asked. For a how-to"), visuals = text.indexOf("\n\nCompose the visuals");
    expect(brief).toBeGreaterThan(0);
    expect(text.slice(brief, visuals)).toMatch(/offer the explainer \(make_faceless, format explainer\) beside the remake, with explainer_fit and the price from quote_faceless/);
    expect(text.slice(brief, visuals)).toMatch(/propose two or three characters[^.]*passed as character_details; reuse one only when the user asks or the brand has its own\. A delivered explainer keeps its hero as a mascot[^.]*mascot_id[^.]*\.$/);
    expect(Object.keys(facelessQuoteResponse.shape)).toContain("explainer_fit");
    expect(Object.keys(offeredFacelessInputShape)).toEqual(expect.arrayContaining(["character_details", "format", "tier"]));
    // #1291 F4. Mutant: the offer quoting one level only, so the user never hears of the other.
    expect(text.slice(brief, visuals)).toContain("both levels, standard and pro (tier), for the user to pick; a film takes about half an hour.");
    expect(Object.keys(facelessQuoteResponse.shape)).toContain("explainer_tiers");
  });
});
