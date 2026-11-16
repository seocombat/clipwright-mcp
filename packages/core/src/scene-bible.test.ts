import { describe, expect, it } from "vitest";
import { dispositionWarnings, rejectedFields, resolveDispositions, SCENE_DIRECTOR_DISABLED_MESSAGE, SCENE_UNUSED_WARNING, makeUgcInput,
  sceneBible, sceneDirectorAccounts, storedUgcInput } from "./index.js";

/** #1491 S1: one scene for the whole video, and a live shot's first frame, on the make_ugc contract. */

const SCRIPT = "Pour the water. Then check it at seventy two degrees.";
const action = { id: "pour", kind: "action", action: "pours hot water into the mug", anchor: { quote: "Pour the water." } };

describe("the scene of a video", () => {
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

  it("rides on make_ugc beside the shots, and a stored run keeps it with its server mark", () => {
    const input = makeUgcInput.parse({ script: SCRIPT, scene: { place: "a white kitchen counter" }, shots: [action] });
    expect(input.scene).toEqual({ place: "a white kitchen counter" });
    const stored = storedUgcInput.parse({ ...input, scene_direction: { mode: "complete" } });
    expect(stored.scene_direction).toEqual({ mode: "complete" });
  });
});

describe("a live shot's start", () => {
  it("is taken on every kind of shot: a talking shot's start is its pose (#1536)", () => {
    const start = "she stands at the counter holding the empty mug";
    expect(makeUgcInput.parse({ script: SCRIPT, shots: [{ ...action, start }] }).shots![0]!.start).toBe(start);
    expect(makeUgcInput.parse({ script: SCRIPT, shots: [{ id: "t", kind: "talking", anchor: { quote: "Pour" }, start }] }).shots![0]!.start)
      .toBe(start);
    expect(makeUgcInput.safeParse({ script: SCRIPT, shots: [{ ...action, start: "she holds nothing" }] }).success).toBe(false);
  });
});

describe("the scene director's switch", () => {
  it("reads 1 as every account, a comma list as those accounts, anything else as nobody", () => {
    expect(sceneDirectorAccounts({ CLIPWRIGHT_SCENE_DIRECTOR: "1" })).toBe("all");
    expect(sceneDirectorAccounts({ CLIPWRIGHT_SCENE_DIRECTOR: " acc_a , acc_b,nope " })).toEqual(new Set(["acc_a", "acc_b"]));
    for (const value of [undefined, "", "0", "true", "nope"]) expect(sceneDirectorAccounts({ CLIPWRIGHT_SCENE_DIRECTOR: value })).toBeNull();
  });

  /** Mutant: scene accepted and stored with the switch off, so a run the director never reads looks like one scene. */
  it("refuses scene by name before any reserve when off, and offers it when on", () => {
    expect(resolveDispositions({ remoteFetch: true, compose: true }).scene).toEqual({ kind: "rejected", message: SCENE_DIRECTOR_DISABLED_MESSAGE });
    expect(resolveDispositions({ remoteFetch: true, compose: true, sceneDirector: true }).scene.kind).toBe("implemented");
    expect(rejectedFields({ script: SCRIPT, scene: { place: "a desk" } })).toEqual([{ field: "scene", message: SCENE_DIRECTOR_DISABLED_MESSAGE }]);
  });

  it("names a scene on a video with no live shots", () => {
    expect(dispositionWarnings(makeUgcInput.parse({ script: SCRIPT, scene: { place: "a desk" } }))).toContain(SCENE_UNUSED_WARNING);
    expect(dispositionWarnings(makeUgcInput.parse({ script: SCRIPT, scene: { place: "a desk" }, shots: [action] })))
      .not.toContain(SCENE_UNUSED_WARNING);
  });
});
