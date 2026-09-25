import { describe, expect, it } from "vitest";
import { ACTORS_PATH, actorItemPath, CREATE_ACTOR_QUOTE_PATH, CREATE_ACTOR_RUN_PATH } from "./actors.js";
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
