import { describe, expect, it } from "vitest";
import { editDocument } from "./edit-document.js";
import { facelessMediaRecord } from "./faceless-media-record.js";
import { facelessStoredInput, makeFacelessInput, offeredFacelessInput, parseFacelessInputPreservingScript } from "./faceless-public.js";

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

/** #1067. Mutants: default the flash in the schema, or for a script, and a run admitted before the default, or a script, gains a flash. */
describe("a brief's default flash", () => {
  const brief = { input_mode: "brief", duration_seconds: 30, brief: "Coffee drinks, one by one" } as const;

  it("is frozen at admission for a brief that names no transitions, never for a script, and false keeps plain cuts", () => {
    expect(parseFacelessInputPreservingScript(brief).transitions).toEqual({ look: "flash", at: "scene_changes" });
    expect([parseFacelessInputPreservingScript({ ...brief, transitions: false }).transitions,
      parseFacelessInputPreservingScript({ ...brief, transitions: { look: "light_leak" } }).transitions,
      Object.hasOwn(parseFacelessInputPreservingScript(script), "transitions"), parseFacelessInputPreservingScript({ ...script, transitions: false }).transitions])
      .toEqual([false, { look: "light_leak", at: "scene_changes" }, false, false]);
    // The worker reads the stored input as written: a brief stored without the field draws plain cuts.
    expect(Object.hasOwn(facelessStoredInput.parse(brief), "transitions")).toBe(false);
    expect(offeredFacelessInput.parse({ ...brief, transitions: false }).transitions).toBe(false);
  });
});

/** #1067. Mutants: let a name through for a beat the run never plays, or under a mute, and the request is silently ignored (rule 3). */
describe("make_faceless sounds", () => {
  const brief = { input_mode: "brief", duration_seconds: 30, brief: "Coffee drinks, one by one" } as const;

  it("takes edit_sounds and the names of the beats the run plays", () => {
    expect(makeFacelessInput.parse({ ...script, transitions: { look: "light_leak" }, edit_sounds: true, template_sounds: { whoosh: "sweep", edit: "sub_drop" } }))
      .toMatchObject({ edit_sounds: true, template_sounds: { whoosh: "sweep", edit: "sub_drop" } });
    expect(makeFacelessInput.parse({ ...brief, template_sounds: { flash: "glitch" } }).template_sounds).toEqual({ flash: "glitch" });
    expect(makeFacelessInput.parse({ ...brief, template_sounds: false }).template_sounds).toBe(false);
  });

  it.each([
    ["a beat make_faceless never plays", { template_sounds: { ring: "ring_classic" } }, "template_sounds of make_faceless has no beat ring: the beats are flash, whoosh, edit"],
    ["a name of another beat", { template_sounds: { flash: "whoosh" } }, "template_sounds.flash \"whoosh\" is not a flash sound: use shutter, glitch, swish"],
    ["a light leak's sound on a brief's default flash", { template_sounds: { whoosh: "sweep" } },
      "template_sounds.whoosh: template_sounds.whoosh picks the sound of a light_leak cut, and this run draws flash cuts: drop it"],
    ["a flash's sound with plain cuts", { transitions: false, template_sounds: { flash: "glitch" } },
      "template_sounds.flash: template_sounds.flash picks the sound of a flash cut, and this run draws no transitions: drop it"],
    ["an edit sound without the switch", { template_sounds: { edit: "boom_low" } }, "template_sounds.edit: template_sounds.edit picks the edit sound: add edit_sounds: true"],
    ["edit_sounds under a mute", { edit_sounds: true, template_sounds: false }, "edit_sounds: edit_sounds plays a sound on each cut and template_sounds: false mutes"],
  ])("refuses %s before any charge", (_what, fields, message) => {
    expect(issues({ ...brief, ...fields }).join("\n")).toContain(message);
  });

  it("refuses a script's flash name without transitions, and records names by beat", () => {
    expect(issues({ ...script, template_sounds: { flash: "glitch" } }).join()).toContain("this run draws no transitions");
    const record = (sounds: unknown) => facelessMediaRecord.shape.settings.safeParse({ captions: true, character_reference: false,
      character_details: null, image_model: "gpt-image-2", voice: null, lambda_site_sha256: "f", sounds }).success;
    expect([record({ flash: "shutter", whoosh: "whoosh", edit: "boom_low" }), record({}), record({ flash: "whoosh" }), record({ ring: "ring_classic" })])
      .toEqual([true, true, false, false]);
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
