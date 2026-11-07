import { describe, expect, it } from "vitest";
import { actorDefaultsInput, brollPolicy, resolveBrollPolicy, storedBrollPolicy } from "./broll-policy.js";
import { makeUgcInput } from "./skills.js";
import { BROLL_UNUSED_WARNING, dispositionWarnings, FIELD_DISPOSITIONS, offeredUgcInputShape } from "./contract-dispositions.js";

describe("B-roll people policy", () => {
  it("accepts named values and refuses booleans, null and unknown values", () => {
    for (const policy of ["anyone", "no_actor", "no_people"]) expect(brollPolicy.parse(policy)).toBe(policy);
    for (const policy of [true, false, null, "nobody", {}]) expect(brollPolicy.safeParse(policy).success).toBe(false);
    expect(actorDefaultsInput.safeParse({}).success).toBe(false);
    expect(actorDefaultsInput.safeParse({ broll_policy: "anyone", unexpected: true }).success).toBe(false);
  });
  it("resolves run override, actor default, then no_people without widening corrupt values", () => {
    expect(resolveBrollPolicy(undefined, undefined)).toBe("no_people");
    expect(resolveBrollPolicy(undefined, "no_actor")).toBe("no_actor");
    expect(resolveBrollPolicy("no_people", "anyone")).toBe("no_people");
    expect(resolveBrollPolicy("anyone", "no_people")).toBe("anyone");
    expect(resolveBrollPolicy(undefined, "corrupt")).toBe("no_people");
  });
  it("historical runs default safely and never reread a changed actor default", () => {
    expect(storedBrollPolicy({ broll_policy: "anyone" })).toBe("no_people");
    expect(storedBrollPolicy({ resolved_broll_policy: "no_actor" })).toBe("no_actor");
    expect(storedBrollPolicy({ resolved_broll_policy: "corrupt" })).toBe("no_people");
  });
  it("names in one short line that an explicit policy has no effect on a video without the customer's media (#1047)", () => {
    const input = makeUgcInput.parse({ script: "Hello.", broll_policy: "no_people" });
    expect(input.broll_policy).toBe("no_people");
    expect(dispositionWarnings(input)).toEqual([BROLL_UNUSED_WARNING]);
    expect(BROLL_UNUSED_WARNING).not.toContain("Segmented media generation");
    expect(dispositionWarnings(makeUgcInput.parse({ script: "Hello." }))).toEqual([]);
    expect(FIELD_DISPOSITIONS.broll_policy.kind).toBe("stored");
    expect(FIELD_DISPOSITIONS.segments.kind).toBe("implemented");
    expect(offeredUgcInputShape.broll_policy.description).toContain("Templates with your own picture or video need \"anyone\"");
  });
  /** Mutant: warn on any explicit policy, and every remake that lets the customer's pictures in reads that the field does nothing. */
  it.each([
    ["inserts", { inserts: [{ id: "i", media_type: "image", media_url: "https://example.com/a.png", anchor: { startWord: 0, endWord: 1 } }] }],
    ["overlays", { overlays: [{ id: "o", media_type: "image", media_url: "https://example.com/o.png", anchor: { startWord: 0, endWord: 1 }, position: "top_right" }] }],
    ["layout_windows", { layout_windows: [{ id: "w", media_type: "image", media_url: "https://example.com/w.png", anchor: { startWord: 0, endWord: 1 }, layout: "card" }] }],
    ["segments", { segments: [{ kind: "actor", script: "Hello" }, { kind: "media", media_type: "image", media_url: "https://example.com/s.png", duration_seconds: 2 }] }],
    ["template pictures", { templates: [{ id: "t", kind: "title_card", anchor: { startWord: 0, endWord: 1 }, data: { title: "Hi", logo: { asset_id: `ast_${"9".repeat(32)}` } } }] }],
  ])("sends no B-roll line when broll_policy lets the customer's %s in (#1047)", (_, media) => {
    const warnings = dispositionWarnings({ script: "Hello there.", broll_policy: "anyone", ...media });
    expect(warnings.filter(warning => /broll|b-roll/i.test(warning))).toEqual([]);
  });
});
