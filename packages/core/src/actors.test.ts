import { describe, expect, it } from "vitest";
import { ACTORS_PATH, actorItemPath, CREATE_ACTOR_QUOTE_PATH, CREATE_ACTOR_RUN_PATH, presenterViewWarnings, renderedPresenterFraming } from "./actors.js";
import { API_ENDPOINTS } from "./endpoints.js";
import { makeUgcInput } from "./skills.js";

describe("personal actor paths have one source", () => {
  it("the client constants are declared in the endpoint registry", () => {
    const paths = API_ENDPOINTS.map((endpoint) => endpoint.path);
    expect(paths).toContain(CREATE_ACTOR_QUOTE_PATH);
    expect(paths).toContain(CREATE_ACTOR_RUN_PATH);
    expect(paths).toContain(`${ACTORS_PATH}/:id`);
  });

  /** Joining the path without encoding would fail here: the id comes from the caller. */
  it("the path of one actor encodes the id", () => {
    expect(actorItemPath("actor_u_1 2")).toBe("/v1/actors/actor_u_1%202");
    expect(actorItemPath("../secrets")).toBe("/v1/actors/..%2Fsecrets");
  });
});

describe("actor selection", () => {
  it("preserves the selected identity instead of silently dropping it", () => {
    expect(makeUgcInput.parse({ script: "Hello", actor_id: "actor_anna" })).toMatchObject({
      actor_id: "actor_anna",
    });
  });

  it.each([
    { image: "https://example.com/portrait.png" },
    { person: "A woman in a blue shirt" },
  ])("rejects conflicting sources before rendering: %j", (other) => {
    expect(makeUgcInput.safeParse({ script: "Hello", actor_id: "actor_anna", ...other }).success)
      .toBe(false);
  });

  it.each(["", "../anna", "https://example.com", "actor_" ])("rejects malformed actor ID %j", (actor_id) => {
    expect(makeUgcInput.safeParse({ script: "Hello", actor_id }).success).toBe(false);
  });
});

// #884 S5d, C1.
describe("presenter_framing", () => {
  it("takes close or wide, leaves it unset when omitted, and refuses anything else", () => {
    expect(makeUgcInput.parse({ script: "Hello", actor_id: "actor_alex", presenter_framing: "wide" }).presenter_framing).toBe("wide");
    expect(makeUgcInput.parse({ script: "Hello", presenter_framing: "close" }).presenter_framing).toBe("close");
    expect(makeUgcInput.parse({ script: "Hello" }).presenter_framing).toBeUndefined();
    expect(makeUgcInput.safeParse({ script: "Hello", presenter_framing: "medium" }).success).toBe(false);
  });

  it("names why a wide request renders close: no actor, another format, or an actor without a wide view", () => {
    expect(presenterViewWarnings({ presenter_framing: "wide" })).toEqual([
      "presenter_framing wide needs an actor_id with a wide view (see list_actors): the presenter was rendered close"]);
    // Without an actor there is no portrait to name, whatever the format.
    expect(presenterViewWarnings({ presenter_framing: "wide", aspect_ratio: "16:9" })).toEqual([
      "presenter_framing wide needs an actor_id with a wide view (see list_actors): the presenter was rendered close"]);
    expect(presenterViewWarnings({ presenter_framing: "wide", aspect_ratio: "16:9" }, { actor_id: "actor_alex", asset: { aspect_ratio: "16:9" } })).toEqual([
      "presenter_framing wide is drawn in 9:16 only: the 16:9 close portrait was used"]);
    expect(presenterViewWarnings({ presenter_framing: "wide" }, { actor_id: "actor_alex", asset: { aspect_ratio: "9:16", framing: "wide" } })).toEqual([]);
    expect(presenterViewWarnings({}, { actor_id: "actor_alex", asset: { aspect_ratio: "9:16" } })).toEqual([]);
    expect([renderedPresenterFraming(), renderedPresenterFraming({ asset: {} }), renderedPresenterFraming({ asset: { framing: "wide" } })])
      .toEqual(["close", "close", "wide"]);
  });

  // #898 C5: an actor derived with framing wide has only a wide view; a wide request is met, an explicit close one is named.
  it("a wide-only personal actor renders wide without a wide warning, and names an explicit close request", () => {
    const wideOnly = { actor_id: `actor_u_${"a".repeat(26)}`, asset: { aspect_ratio: "9:16", framing: "wide" } };
    expect(presenterViewWarnings({ presenter_framing: "wide" }, wideOnly)).toEqual([]);
    expect(presenterViewWarnings({}, wideOnly)).toEqual([]);
    expect(presenterViewWarnings({ presenter_framing: "close" }, wideOnly)).toEqual([
      `presenter_framing close: personal actor ${wideOnly.actor_id} has only a wide view (made with framing wide); the wide view was used`]);
    expect(presenterViewWarnings({ presenter_framing: "close" }, { actor_id: "actor_alex", asset: { aspect_ratio: "9:16" } })).toEqual([]);
  });
});

// #884 S5d: the owner's handheld mini-mic.
describe("presenter_mic", () => {
  it("takes a boolean and leaves it unset when omitted", () => {
    expect(makeUgcInput.parse({ script: "Hello", actor_id: "actor_alex", presenter_mic: true }).presenter_mic).toBe(true);
    expect(makeUgcInput.parse({ script: "Hello" }).presenter_mic).toBeUndefined();
    expect(makeUgcInput.safeParse({ script: "Hello", presenter_mic: "yes" }).success).toBe(false);
  });

  /** Mutant: fold the two drops into one line, and a wide-and-mic request that got neither names only one. */
  it("names a dropped mic in its own line, beside a dropped wide view", () => {
    const close = { actor_id: "actor_alex", asset: { aspect_ratio: "9:16" } };
    const noMic = (framing: string) => `presenter_mic: actor actor_alex has no ${framing} mic view (library mic views are wide); rendered without the mic`;
    expect(presenterViewWarnings({ presenter_mic: true }, close)).toEqual([noMic("close")]);
    expect(presenterViewWarnings({ presenter_mic: true, presenter_framing: "wide" }, close)).toEqual([
      "presenter_framing wide: actor actor_alex has no wide view yet; the close portrait was used", noMic("close")]);
    expect(presenterViewWarnings({ presenter_mic: true, presenter_framing: "wide" }, { ...close, asset: { aspect_ratio: "9:16", framing: "wide" } }))
      .toEqual([noMic("wide")]);
    expect(presenterViewWarnings({ presenter_mic: true }, { ...close, asset: { aspect_ratio: "9:16", prop: "mic" } })).toEqual([]);
    expect(presenterViewWarnings({ presenter_mic: false }, close)).toEqual([]);
    expect(presenterViewWarnings({ presenter_mic: true })).toEqual(["presenter_mic needs an actor_id with a mic view (see list_actors): rendered without the mic"]);
  });
});
