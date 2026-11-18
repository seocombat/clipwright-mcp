import { describe, expect, it } from "vitest";
import { facelessStoredInput, makeFacelessInput, offeredFacelessInput, parseFacelessStoredInputPreservingScript } from "./index.js";

/** #1491 S7: one scene for a whole faceless video, from the same schema as make_ugc's, in script and brief mode. */

const script = Array.from({ length: 70 }, (_, i) => `word${i}`).join(" ");
const scene = { place: "a quiet seaside town in late autumn", posture: "standing" as const, light: "low grey daylight" };

describe("the scene of a faceless video", () => {
  /** Mutant: the withdrawn field still taken on a public body, or dropped from a stored run that carries it. */
  it("is refused on a script, a brief and the MCP shape, and kept on a stored run", () => {
    expect(makeFacelessInput.safeParse({ input_mode: "script", script, duration_seconds: 30, scene }).success).toBe(false);
    expect(makeFacelessInput.safeParse({ input_mode: "brief", brief: "a lighthouse keeper's day", duration_seconds: 30, scene }).success).toBe(false);
    expect(offeredFacelessInput.safeParse({ input_mode: "brief", brief: "a day", duration_seconds: 30, scene }).success).toBe(false);
    expect(facelessStoredInput.parse({ input_mode: "script", script, duration_seconds: 30, scene })).toMatchObject({ scene });
  });

  /** Mutant: the stored field written by hand instead of the shared schema, so a negation or an unknown key reaches a prompt. */
  it("refuses an empty stored scene, an unknown key and a field that describes what is absent, as make_ugc does", () => {
    for (const bad of [{}, { place: "a town", mood: "calm" }, { place: "a street with no cars" }]) {
      expect(facelessStoredInput.safeParse({ input_mode: "script", script, duration_seconds: 30, scene: bad }).success).toBe(false);
    }
  });

  /** Mutant: the server mark accepted on a public body, or lost from a stored brief, so the worker cannot tell a directed run. */
  it("keeps the server mark on a stored script and brief, and refuses it on a public body", () => {
    for (const input of [{ input_mode: "script", script, duration_seconds: 30 }, { input_mode: "brief", brief: "a day", duration_seconds: 30 }]) {
      const marked = { ...input, scene_direction: { mode: "complete" } };
      expect(facelessStoredInput.parse(marked)).toMatchObject({ scene_direction: { mode: "complete" } });
      expect(parseFacelessStoredInputPreservingScript(marked)).toMatchObject({ scene_direction: { mode: "complete" } });
      expect(makeFacelessInput.safeParse(marked).success).toBe(false);
    }
  });
});
