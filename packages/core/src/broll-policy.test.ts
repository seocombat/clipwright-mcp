import { describe, expect, it } from "vitest";
import { actorDefaultsInput, brollPolicy, resolveBrollPolicy, storedBrollPolicy } from "./broll-policy.js";
import { makeUgcInput } from "./skills.js";
import { dispositionWarnings, FIELD_DISPOSITIONS, offeredUgcInputShape } from "./contract-dispositions.js";

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
  it("discloses that an explicit stored policy has no effect on an actor-only video", () => {
    const input = makeUgcInput.parse({ script: "Hello.", broll_policy: "no_people" });
    expect(input.broll_policy).toBe("no_people");
    expect(dispositionWarnings(input)).toEqual([expect.stringContaining("has no effect on actor-only videos")]);
    expect(dispositionWarnings(makeUgcInput.parse({ script: "Hello." }))).toEqual([]);
    expect(FIELD_DISPOSITIONS.broll_policy.kind).toBe("stored");
    expect(FIELD_DISPOSITIONS.segments.kind).toBe("implemented");
    expect(offeredUgcInputShape.broll_policy.description).toContain("closed");
  });
});
