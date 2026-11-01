import { describe, expect, it } from "vitest";
import { editDocument } from "./edit-document.js";
import { facelessMediaRecord } from "./faceless-media-record.js";
import { facelessStoredInput, makeFacelessInput, offeredFacelessInput } from "./faceless-public.js";

const script = { input_mode: "script", duration_seconds: 30,
  script: "An espresso first. Then the latte arrives, and a latte is milk. Finally the mocha." } as const;
const issues = (input: unknown) => {
  const parsed = makeFacelessInput.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
};

describe("make_faceless transitions", () => {
  it("defaults to every scene change and keeps a run without the field as it was", () => {
    expect(makeFacelessInput.parse({ ...script, transitions: { look: "flash" } }).transitions).toEqual({ look: "flash", at: "scene_changes" });
    expect(Object.hasOwn(makeFacelessInput.parse(script), "transitions")).toBe(false);
    expect(facelessStoredInput.parse({ ...script, transitions: { look: "light_leak" } })).toMatchObject({ transitions: { look: "light_leak" } });
  });

  it("takes word anchors that resolve to one place in the script", () => {
    const at = [{ anchor: { quote: "Then the latte" } }, { anchor: { quote: "latte", occurrence: 1 } }, { anchor: { startWord: 12, endWord: 14 } }];
    expect(makeFacelessInput.parse({ ...script, transitions: { look: "light_leak", at } }).transitions).toEqual({ look: "light_leak", at });
  });

  it.each([
    ["an ambiguous quote", { look: "flash", at: [{ anchor: { quote: "latte" } }] }, "transitions.at.0.anchor: the quote is said more than once"],
    ["a quote the script lacks", { look: "flash", at: [{ anchor: { quote: "cappuccino" } }] }, "transitions.at.0.anchor: the anchor names no words"],
    ["an occurrence past the last", { look: "flash", at: [{ anchor: { quote: "mocha", occurrence: 1 } }] }, "the anchor names no words"],
    ["a word range past the script", { look: "flash", at: [{ anchor: { startWord: 14, endWord: 99 } }] }, "the anchor names no words"],
    ["an unknown look", { look: "wipe" }, "transitions.look"],
    ["an empty anchor list", { look: "flash", at: [] }, "transitions.at"],
    ["an unknown key", { look: "flash", frames: 4 }, "transitions"],
  ])("refuses %s before any charge", (_what, transitions, message) => {
    expect(issues({ ...script, transitions }).join("\n")).toContain(message);
  });

  it("gives a brief every scene change only: its narration is not written yet", () => {
    const brief = { input_mode: "brief", duration_seconds: 30, brief: "Coffee drinks, one by one" };
    expect(makeFacelessInput.parse({ ...brief, transitions: { look: "flash" } }).transitions).toEqual({ look: "flash", at: "scene_changes" });
    expect(issues({ ...brief, transitions: { look: "flash", at: [{ anchor: { quote: "Coffee" } }] } }).join()).toContain("need input_mode script");
  });

  it("is offered to MCP clients with the same shape", () => {
    expect(offeredFacelessInput.parse({ ...script, transitions: { look: "flash" } }).transitions).toEqual({ look: "flash", at: "scene_changes" });
    expect(offeredFacelessInput.safeParse({ ...script, transitions: { look: "wipe" } }).success).toBe(false);
  });
});

describe("a revision's transitions", () => {
  const document = { v: 1, source_run_id: "run_source1", timebase: { fps: 25 }, duration_frames: 750,
    shots: [{ id: "beat-1", track: "visual", kind: "clip", start_frame: 0, end_frame: 100, asset: { from: "source", shot_id: "beat-1" } }] };

  it("sets, names shots or removes them, and a document without the key has none", () => {
    expect(editDocument.parse({ ...document, transitions: { look: "flash" } }).transitions).toEqual({ look: "flash", at: "scene_changes" });
    expect(editDocument.parse({ ...document, transitions: { look: "light_leak", at: ["beat-3"] } }).transitions).toEqual({ look: "light_leak", at: ["beat-3"] });
    expect(editDocument.parse({ ...document, transitions: null }).transitions).toBeNull();
    expect(Object.hasOwn(editDocument.parse(document), "transitions")).toBe(false);
  });

  it.each([["no shot", { look: "flash", at: [] }], ["a quote", { look: "flash", at: [{ anchor: { quote: "latte" } }] }], ["a look it lacks", { look: "wipe" }]])(
    "refuses %s", (_what, transitions) => expect(editDocument.safeParse({ ...document, transitions }).success).toBe(false));

  it("records them by shot only", () => {
    const record = (transitions: unknown) => facelessMediaRecord.shape.settings.safeParse({ captions: true, character_reference: false,
      character_details: null, image_model: "gpt-image-2", voice: null, lambda_site_sha256: "f", transitions }).success;
    expect([record({ look: "flash", at: ["beat-2"] }), record({ look: "flash", at: "scene_changes" }), record({ look: "flash", at: [] })])
      .toEqual([true, false, false]);
  });
});
