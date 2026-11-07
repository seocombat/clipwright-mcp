import { describe, expect, it } from "vitest";
import { makeUgcInput, storedUgcInput } from "./skills.js";
import { sceneAllowsPurple } from "./ugc-scenes.js";

const script = "Our new site is live. Visit clipwright dot io today and see it.";
const scene = { id: "pen", anchor: { quote: "clipwright dot io" }, brief: "a pen stroke draws under the site name", text: "clipwright.io" };

describe("make_ugc scenes", () => {
  it("accepts a scene on the script's words, with its placement defaulted to over, and the stored parse keeps it", () => {
    const parsed = makeUgcInput.parse({ script, scenes: [scene] });
    expect(parsed.scenes).toEqual([{ ...scene, placement: "over" }]);
    expect(storedUgcInput.parse({ script, scenes: [scene] }).scenes).toEqual([{ ...scene, placement: "over" }]);
  });

  it("refuses words the script lacks, an id another layer holds, segments, and a brief or text over two lines", () => {
    const issues = (input: object) => makeUgcInput.safeParse(input).error?.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`) ?? [];
    expect(issues({ script, scenes: [{ ...scene, anchor: { quote: "nowhere" } }] })).toContain('scenes.0.anchor: anchor quote "nowhere" does not occur in script');
    expect(issues({ script, scenes: [scene, { ...scene, anchor: { quote: "today" } }] })).toContain('scenes.1.id: id "pen" is used by another layer or scene');
    expect(issues({ script, scenes: [scene], framing: [{ id: "pen", anchor: { quote: "today" } }] }))
      .toContain('scenes.0.id: id "pen" is used by another layer or scene');
    expect(issues({ segments: [{ kind: "actor", text: script }], scenes: [scene] })).toContain("scenes: scenes require script and cannot be combined with segments");
    expect(issues({ script, scenes: [{ ...scene, brief: "two\nlines" }] })).toContain("scenes.0.brief: brief must be plain text on one line");
    expect(issues({ script, scenes: [{ ...scene, extra: 1 }] }).some(issue => issue.startsWith("scenes.0"))).toBe(true);
  });

  it("allows purple only where the customer's own colours name one", () => {
    expect(sceneAllowsPurple({})).toBe(false);
    expect(sceneAllowsPurple({ colors: ["#1385A3", "#111827"] })).toBe(false);
    expect(sceneAllowsPurple({ colors: ["#111827", "#7C3AED"] })).toBe(true);
  });
});
