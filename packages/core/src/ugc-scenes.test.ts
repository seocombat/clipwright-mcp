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

describe("a scene's place (#1327)", () => {
  const issues = (input: object) => makeUgcInput.safeParse(input).error?.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`) ?? [];
  const low = { relative_to: "frame", rect: { left: 0.1, top: 0.62, width: 0.8, height: 0.1 } };

  it("keeps a frame or face place on an over scene, and takes the rect without relative_to as the frame's", () => {
    expect(makeUgcInput.parse({ script, scenes: [{ ...scene, place: low }] }).scenes![0]!.place).toEqual(low);
    expect(makeUgcInput.parse({ script, scenes: [{ ...scene, place: { rect: low.rect } }] }).scenes![0]!.place).toEqual(low);
    expect(issues({ script, scenes: [{ ...scene, place: { relative_to: "face", side: "below", width: 0.8, gap: 0.2 } }] })).toEqual([]);
  });

  it("refuses a place on a full scene, by the captions or a layer, with fit, or on the face without allow_face", () => {
    expect(issues({ script, scenes: [{ ...scene, placement: "full", place: low }] }))
      .toEqual(['scenes.0.place: scene "pen": a scene takes place over the presenter only (placement over)']);
    expect(issues({ script, captions: true, scenes: [{ ...scene, place: { relative_to: "captions", side: "below", width: 0.5 } }] }))
      .toEqual(['scenes.0.place: scene "pen" is placed by the frame or the face, not by the captions or another layer']);
    expect(issues({ script, scenes: [{ ...scene, place: { relative_to: { layer: "x" }, side: "below", width: 0.5 } }] }))
      .toEqual(['scenes.0.place: scene "pen" is placed by the frame or the face, not by the captions or another layer']);
    expect(issues({ script, scenes: [{ ...scene, place: { ...low, fit: "cover" } }] }))
      .toEqual(['scenes.0.place: scene "pen" is scaled whole into its box: drop fit']);
    const onFace = { relative_to: "frame", rect: { left: 0.3, top: 0.25, width: 0.4, height: 0.1 } };
    expect(issues({ script, scenes: [{ ...scene, place: onFace }] }))
      .toEqual(['scenes.0.place: scene "pen" covers the presenter\'s face; move it, or pass allow_face: true to cover it on purpose']);
    expect(issues({ script, scenes: [{ ...scene, place: { ...onFace, allow_face: true } }] })).toEqual([]);
  });

  it("names the place's forms when the shape is wrong", () => {
    const [message] = issues({ script, scenes: [{ ...scene, place: { rect: { x: 0.1, y: 0.6, w: 0.8, h: 0.1 } } }] });
    expect(message).toMatch(/^scenes\.0\.place: place takes \{relative_to:"frame",rect:\{left,top,width,height\}\}/);
  });
});
