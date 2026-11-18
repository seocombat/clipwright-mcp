import { describe, expect, it } from "vitest";
import { facelessStoredInput, makeFacelessInput, makeUgcInput, sceneBible, storedUgcInput, unknownFields } from "./index.js";

/** #1491: the scene director's public fields are withdrawn; the scene's schema stays for the runs that stored one. */

const SCRIPT = "Pour the water. Then check it at seventy two degrees.";
const action = { id: "pour", kind: "action", action: "pours hot water into the mug", anchor: { quote: "Pour the water." } };

describe("the scene of a stored run", () => {
  it("takes the fields it names and trims them", () => {
    expect(sceneBible.parse({ place: " a white kitchen counter ", posture: "standing", props: ["the same grey probe thermometer"] }))
      .toEqual({ place: "a white kitchen counter", posture: "standing", props: ["the same grey probe thermometer"] });
  });

  /** Mutants: an empty scene accepted, an unknown key kept, a negation passed into a prompt. */
  it("refuses an empty scene, an unknown field and a field that describes what is absent", () => {
    expect(sceneBible.safeParse({}).success).toBe(false);
    expect(sceneBible.safeParse({ place: "a desk", mood: "warm" }).success).toBe(false);
    const absent = sceneBible.safeParse({ place: "a counter with no clutter" });
    expect(absent.success).toBe(false);
    expect(absent.error?.issues[0]).toMatchObject({ path: ["place"], message: expect.stringContaining("describe what is visible") });
    expect(sceneBible.safeParse({ props: ["a mug", "a kettle without a lid"] }).error?.issues[0]?.path).toEqual(["props", 1]);
  });
});

describe("runs stored before the scene director was withdrawn", () => {
  const start = "she stands at the counter holding the empty mug";
  const proposal = { id: "sp_00000000000000000001", accept: ["o1"] };

  /** Mutants: a stored key dropped or narrowed (the digest of an old run would change), or a stored run refused outright. */
  it("parse with their scene, proposal, mark and a shot's start, key for key", () => {
    const ugc = { script: SCRIPT, scene: { place: "a white kitchen counter" }, proposal, propose: false,
      scene_direction: { mode: "complete", proposal: { id: proposal.id, content_digest: "a".repeat(64), accepted: ["o1"] } },
      shots: [{ ...action, start }, { id: "t", kind: "talking", anchor: { quote: "Then check it" }, start: "she leans on the counter" }] };
    const stored = storedUgcInput.parse(ugc);
    expect(stored).toMatchObject({ scene: ugc.scene, proposal, propose: false, scene_direction: ugc.scene_direction });
    expect(stored.shots?.map(shot => shot.start)).toEqual([start, "she leans on the counter"]);

    const faceless = { input_mode: "script", script: SCRIPT, duration_seconds: 30, scene: { place: "a harbor town", posture: "standing" }, proposal,
      propose: false, scene_direction: { mode: "complete" } };
    expect(facelessStoredInput.parse(faceless)).toMatchObject({ scene: faceless.scene, proposal, scene_direction: { mode: "complete" } });
    const brief = { input_mode: "brief", brief: "A harbor morning.", duration_seconds: 30, scene: { place: "a harbor town" } };
    expect(facelessStoredInput.parse(brief)).toMatchObject({ scene: brief.scene });
  });

  /** Mutants: a public body still takes a withdrawn field, or refuses the deprecated propose. */
  it("leave the public bodies refusing each withdrawn field as unknown, and taking propose false", () => {
    const unknown = (result: { success: boolean; error?: { issues: { code: string; keys?: string[] }[] } }, key: string) =>
      expect(result.error?.issues.some(issue => issue.code === "unrecognized_keys" && issue.keys?.includes(key)), key).toBe(true);
    // make_ugc's body is checked against the contract's field list before its schema, which refuses an unknown key in a shot.
    expect(unknownFields({ script: SCRIPT, scene: { place: "a desk" }, proposal, propose: false }).map(hit => hit.field))
      .toEqual(["scene", "proposal"]);
    unknown(makeUgcInput.safeParse({ script: SCRIPT, shots: [{ ...action, start }] }), "start");
    unknown(makeFacelessInput.safeParse({ input_mode: "script", script: SCRIPT, duration_seconds: 30, scene: { place: "a desk" } }), "scene");
    unknown(makeFacelessInput.safeParse({ input_mode: "brief", brief: "A harbor morning.", duration_seconds: 30, proposal }), "proposal");
    expect(makeUgcInput.parse({ script: SCRIPT, propose: false }).propose).toBe(false);
    expect(makeFacelessInput.parse({ input_mode: "script", script: SCRIPT, duration_seconds: 30, propose: false }).propose).toBe(false);
  });
});
