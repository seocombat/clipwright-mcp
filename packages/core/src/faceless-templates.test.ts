import { describe, expect, it } from "vitest";
import { FACELESS_TEMPLATE_MEDIA_REFUSAL, facelessStoredInput, makeFacelessInput, offeredFacelessInput } from "./faceless-public.js";
import { quoteFaceless } from "./faceless-price.js";

// #1113: make_faceless takes templates on its script's words, as make_ugc does.

const SCRIPT = "Most people quit in week two. The ones who stay track one number. Here is that number, and why it works.";
const script = { input_mode: "script", script: SCRIPT, duration_seconds: 30 };
const tag = { id: "t1", kind: "tag", anchor: { quote: "week two" }, data: { text: "Week two" } };

describe("make_faceless templates", () => {
  /** Mutant: drop the field, and the composition's templates stay unreachable; drop the check, and a template on no word is paid for. */
  it("takes templates on the script's words and keeps them in the stored input", () => {
    const parsed = makeFacelessInput.parse({ ...script, templates: [tag] });
    expect(parsed).toMatchObject({ templates: [tag] });
    expect(facelessStoredInput.parse(parsed)).toMatchObject({ templates: [tag] });
    expect(offeredFacelessInput.safeParse({ ...script, templates: [tag] }).success).toBe(true);
    const nowhere = makeFacelessInput.safeParse({ ...script, templates: [{ ...tag, anchor: { quote: "never said" } }] });
    expect(nowhere.success).toBe(false);
    expect(nowhere.error!.issues[0]!.path.slice(0, 2)).toEqual(["templates", 0]);
  });

  /** Mutant: accept a brief's templates, and they name words the run has not written yet. */
  it("refuses templates on a brief, by name", () => {
    const refused = makeFacelessInput.safeParse({ input_mode: "brief", brief: "Why habits stick.", duration_seconds: 30, templates: [tag] });
    expect(refused.error?.issues.map(issue => issue.message)).toContain("templates need input_mode script: they sit on the narration's words");
  });

  /** Mutants: a scene id shared with a template accepted; a scene on a brief accepted; a quote that leaves the scenes out of the hold. */
  it("takes scenes on the script's words, each priced 25 on the quote inside the total", () => {
    const scene = { id: "s1", anchor: { quote: "one number" }, placement: "full", brief: "A single number counts up" };
    expect(makeFacelessInput.parse({ ...script, scenes: [scene] })).toMatchObject({ scenes: [{ id: "s1", placement: "full" }] });
    expect(makeFacelessInput.safeParse({ ...script, templates: [tag], scenes: [{ ...scene, id: "t1" }] }).success).toBe(false);
    expect(makeFacelessInput.safeParse({ input_mode: "brief", brief: "Why habits stick.", duration_seconds: 30, scenes: [scene] }).success).toBe(false);
    const plain = quoteFaceless({ outputFrames: 750, captions: true }), two = quoteFaceless({ outputFrames: 750, captions: true, scenes: 2 });
    expect({ scenes: two.scenes, credits: two.sceneCredits, extra: two.totalCredits - plain.totalCredits }).toEqual({ scenes: 2, credits: 50, extra: 50 });
    expect(plain).not.toHaveProperty("sceneCredits");
  });

  /** Mutant: accept a slot of the customer's media, and the run is admitted with a picture it cannot fetch. */
  it("refuses a template slot that shows the customer's picture or clip, before money", () => {
    const grid = { id: "g1", kind: "compare", anchor: { quote: "track one number" },
      data: { before: { asset_id: `ast_${"a".repeat(32)}` }, after: { asset_id: `ast_${"b".repeat(32)}` }, reveal_at: "number" } };
    const refused = makeFacelessInput.safeParse({ ...script, templates: [grid] });
    expect(refused.success).toBe(false);
    expect(refused.error!.issues.filter(issue => issue.message === FACELESS_TEMPLATE_MEDIA_REFUSAL).map(issue => issue.path))
      .toEqual([["templates", 0, "data", "before"], ["templates", 0, "data", "after"]]);
  });
});
