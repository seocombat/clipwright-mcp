import { describe, expect, it } from "vitest";
import { isScenePurple, minSceneTextPx, repairScenePurple, sceneGraphFootprint, sceneGraphSchema, validateSceneGraph, type SceneGraph,
  type SceneNode } from "./scene-graph.js";

const scene = (nodes: SceneNode[], extra: Partial<SceneGraph> = {}): SceneGraph =>
  ({ version: "scene-graph-v1", canvas: { width: 1080, height: 1920, fps: 30 }, duration_s: 3, background: "#F7F3EC", nodes, ...extra });
const text = (over: Partial<Extract<SceneNode, { type: "text" }>> = {}): SceneNode =>
  ({ id: "t", type: "text", x: 100, y: 100, text: "views", font: { family: "Inter", weight: 700 }, size: 40, color: "#111111", ...over });
const errorsOf = (input: unknown) => { const result = validateSceneGraph(input); return result.ok ? [] : result.errors; };

describe("scene graph schema", () => {
  it("accepts every node type, a nested clip group, springs and stroke-draw", () => {
    const result = validateSceneGraph(scene([
      { id: "card", type: "rect", x: 540, y: 400, anchor: [0.5, 0.5], width: 600, height: 200, fill: "#FFFFFF", radius: 24, stroke: "#111111", strokeWidth: 3,
        anim: [{ prop: "scale", keys: [{ t: 0, v: 0.6 }, { t: 0.5, v: 1, spring: { damping: 12, stiffness: 120, mass: 1 } }] }] },
      { id: "dot", type: "ellipse", x: 200, y: 700, width: 40, height: 40, fill: "#E5533D" },
      { id: "pen", type: "path", x: 100, y: 900, width: 300, height: 200, d: "M10 190 C 80 20, 200 20, 290 10", stroke: "#E5533D", strokeWidth: 12,
        anim: [{ prop: "draw", keys: [{ t: 0.2, v: 0 }, { t: 1.2, v: 1, ease: "out" }] }] },
      { id: "wipe", type: "group", x: 100, y: 1200, width: 800, height: 120, clip: { shape: "rect", radius: 20 },
        anim: [{ prop: "width", keys: [{ t: 0, v: 0 }, { t: 1, v: 800 }] }],
        children: [text({ id: "views", x: 20, y: 20, text: "{n} views", count: { from: 3536, to: 3610, from_s: 0.5, to_s: 1.5, ease: "linear" } })] },
      { id: "frame", type: "image", x: 0, y: 0, width: 300, height: 300, src: "run_frame" },
    ], { assets: [{ id: "run_frame" }] }));
    expect(result).toMatchObject({ ok: true, warnings: [] });
  });

  it("refuses unknown keys and node types, so a model cannot smuggle a field the renderer ignores", () => {
    expect(sceneGraphSchema.safeParse(scene([{ ...text(), onClick: "x" } as never])).success).toBe(false);
    expect(sceneGraphSchema.safeParse(scene([{ id: "s", type: "script", x: 0, y: 0 } as never])).success).toBe(false);
    expect(errorsOf(scene([text({ shadow: { x: 0, y: 4, blur: 8, color: "#000000" } })]))).toEqual([]);
    expect(errorsOf(scene([text({ shadow: { x: 0, y: 4, blur: 8, color: "#000000", spread: 2 } as never })]))[0]).toMatch(/^nodes\.0\.shadow:/);
    expect(errorsOf(scene([{ id: "p", type: "path", x: 0, y: 0, width: 10, height: 10, d: "M0 0 L10 10\"/><script>" }]))[0]).toMatch(/^nodes\.0\.d:/);
  });

  it("names the field of a schema error so the author can fix it", () => {
    expect(errorsOf({ ...scene([text()]), canvas: { width: 1080, height: 1920, fps: 60 } })).toEqual([expect.stringMatching(/^canvas\.fps:/)]);
  });
});

describe("validateSceneGraph", () => {
  it("refuses a duplicate id", () => {
    expect(errorsOf(scene([text(), text({ y: 300 })]))).toEqual(['nodes.1: id "t" is used twice']);
  });

  it("refuses timing outside the scene: window, keyframes, reveal and count", () => {
    expect(errorsOf(scene([text({ to_s: 3.5 })]))).toEqual(["nodes.0.to_s: 3.5s is after the scene ends at 3s"]);
    expect(errorsOf(scene([text({ from_s: 2, to_s: 1 })]))).toEqual(["nodes.0: from_s 2 is not before to_s 1"]);
    expect(errorsOf(scene([text({ anim: [{ prop: "opacity", keys: [{ t: 0, v: 0 }, { t: 4, v: 1 }] }] })])))
      .toEqual(["nodes.0.anim.0.keys.1.t: 4s is after the scene ends at 3s"]);
    expect(errorsOf(scene([text({ anim: [{ prop: "y", keys: [{ t: 1, v: 0 }, { t: 1, v: 10 }] }] })])))
      .toEqual(["nodes.0.anim.0.keys.1.t: keyframe times must rise (1 after 1)"]);
    expect(errorsOf(scene([text({ reveal: { mode: "type", from_s: 0, to_s: 3.2 } })]))).toEqual(["nodes.0.reveal.to_s: 3.2s is after the scene ends at 3s"]);
    expect(errorsOf(scene([text({ text: "{n}", count: { from: 0, to: 9, from_s: 1, to_s: 1 } })]))).toEqual(["nodes.0.count: from_s 1 is not before to_s 1"]);
  });

  /** #1175 S5 C3. Mutant: drop the pairing check, and a swap with nothing to erase or a typed text with a stray from passes. */
  it("takes reveal.from on a swap only, and measures the longer of the two words against the canvas", () => {
    const window = { from_s: 0, to_s: 1 };
    expect(errorsOf(scene([text({ reveal: { mode: "swap", ...window } })]))).toEqual(["nodes.0.reveal.from: a swap needs the words it erases in from"]);
    expect(errorsOf(scene([text({ reveal: { mode: "type", ...window, from: "old" } })]))).toEqual(["nodes.0.reveal.from: only a swap takes from"]);
    expect(errorsOf(scene([text({ reveal: { mode: "swap", ...window, from: "old" } }), text({ id: "s", y: 300, reveal: { mode: "scramble", ...window } })])))
      .toEqual([]);
    expect(errorsOf(scene([text({ x: 700, size: 60, reveal: { mode: "swap", ...window, from: "a much longer line" } })]))[0])
      .toMatch(/^nodes\.0: text is cut by the canvas edge at rest/);
  });

  /** #1175 S5 C4. Mutant: skip the morph window check, and a morph past the scene's end never lands. */
  it("keeps a path's morph inside the scene and in time order", () => {
    const shape = { id: "p", type: "path", x: 100, y: 100, width: 40, height: 40, d: "M0 0 L40 40", stroke: "#111111", strokeWidth: 4 } as const;
    expect(errorsOf(scene([{ ...shape, morph: { d: "M0 20 L40 20", from_s: 1, to_s: 2 } }]))).toEqual([]);
    expect(errorsOf(scene([{ ...shape, morph: { d: "M0 20 L40 20", from_s: 1, to_s: 3.5 } }]))).toEqual(["nodes.0.morph.to_s: 3.5s is after the scene ends at 3s"]);
    expect(errorsOf(scene([{ ...shape, morph: { d: "M0 20 L40 20", from_s: 2, to_s: 1 } }]))).toEqual(["nodes.0.morph: from_s 2 is not before to_s 1"]);
  });

  /** #1175 S5 C5. Mutant: drop the bound on the tilt track, and a group swings edge-on. */
  it("tilts only a group, within ±80°", () => {
    const group = { id: "g", type: "group" as const, x: 100, y: 100, width: 200, height: 100, children: [] };
    expect(errorsOf(scene([{ ...group, rotateX: 12, anim: [{ prop: "rotateY", keys: [{ t: 0, v: -18 }, { t: 1, v: 18 }] }] }]))).toEqual([]);
    expect(errorsOf(scene([{ ...group, anim: [{ prop: "rotateY", keys: [{ t: 0, v: 0 }, { t: 1, v: 95 }] }] }])))
      .toEqual(["nodes.0.anim.0.keys.1.v: a tilt stays within ±80°, past it the group turns edge-on"]);
    expect(errorsOf(scene([text({ anim: [{ prop: "rotateX", keys: [{ t: 0, v: 10 }] }] })]))).toEqual(['nodes.0.anim.0: a text cannot animate "rotateX"']);
  });

  it("refuses a family, weight or italic the renderer cannot load", () => {
    expect(errorsOf(scene([text({ font: { family: "Comic Sans MS", weight: 400 } })]))[0]).toMatch(/^nodes\.0\.font\.family: "Comic Sans MS" is not available; use one of Inter/);
    expect(errorsOf(scene([text({ font: { family: "Instrument Serif", weight: 700 } })]))).toEqual(["nodes.0.font.weight: Instrument Serif has weights 400, not 700"]);
    expect(errorsOf(scene([text({ font: { family: "Caveat", weight: 700, italic: true } })]))).toEqual(["nodes.0.font.italic: Caveat has no italic"]);
    expect(errorsOf(scene([text({ font: { family: "Instrument Serif", weight: 400, italic: true } })]))).toEqual([]);
  });

  it("refuses text smaller than the minimum, counting the scale of its groups and its own resting scale", () => {
    expect(minSceneTextPx({ height: 1920 })).toBe(20);
    expect(errorsOf(scene([text({ size: 19 })]))).toEqual(["nodes.0.size: text draws at 19.0 px, under the 20 px minimum for a 1920 px tall canvas"]);
    expect(errorsOf(scene([text({ size: 20 })]))).toEqual([]);
    expect(errorsOf(scene([{ id: "g", type: "group", x: 0, y: 0, scale: 1.5, children: [text({ size: 14 })] }]))).toEqual([]);
    expect(errorsOf(scene([{ id: "g", type: "group", x: 0, y: 0, scale: 1.5, children: [text({ size: 13 })] }])))
      .toEqual(["nodes.0.children.0.size: text draws at 19.5 px, under the 20 px minimum for a 1920 px tall canvas"]);
    expect(errorsOf(scene([text({ size: 40, anim: [{ prop: "scale", keys: [{ t: 0, v: 1 }, { t: 1, v: 0.4 }] }] })]))[0]).toMatch(/text draws at 16\.0 px/);
  });

  it("refuses a node resting outside the canvas and text cut by its edge, but lets a shape bleed", () => {
    expect(errorsOf(scene([{ id: "r", type: "rect", x: 1100, y: 0, width: 100, height: 100 }]))[0]).toMatch(/^nodes\.0: rests entirely outside the 1080×1920 canvas/);
    expect(errorsOf(scene([{ id: "r", type: "rect", x: 1000, y: 0, width: 300, height: 100 }]))).toEqual([]);
    expect(errorsOf(scene([text({ x: 900, text: "a long headline" })]))[0]).toMatch(/^nodes\.0: text is cut by the canvas edge at rest/);
    expect(errorsOf(scene([text({ x: 540, anchor: [0.5, 0], align: "center", text: "a long headline" })]))).toEqual([]);
    // A wrap width is the box: a short word in a wide box is still cut.
    expect(errorsOf(scene([text({ x: 100, width: 1000 })]))[0]).toMatch(/^nodes\.0: text is cut by the canvas edge at rest \(estimated box 100,100 1000×/);
    expect(errorsOf(scene([text({ x: 100, width: 900 })]))).toEqual([]);
    expect(errorsOf(scene([{ id: "r", type: "rect", x: 0, y: 0, width: 100, height: 100, anim: [{ prop: "x", keys: [{ t: 0, v: 0 }, { t: 1, v: 2000 }] }] }])))
      .toEqual([expect.stringMatching(/rests entirely outside/)]);
    expect(errorsOf(scene([{ id: "r", type: "rect", x: 0, y: 0, width: 100, height: 100, anim: [{ prop: "x", keys: [{ t: 0, v: 2000 }, { t: 1, v: 0 }] }] }]))).toEqual([]);
    expect(errorsOf(scene([{ id: "g", type: "group", x: 1000, y: 0, children: [text({ x: 0, y: 0, text: "cut here" })] }]))[0]).toMatch(/children\.0: text is cut/);
  });

  it("refuses a track the node cannot animate, a colour track given a number, and draw without a stroke", () => {
    expect(errorsOf(scene([text({ anim: [{ prop: "draw", keys: [{ t: 0, v: 0 }] }] })]))).toEqual(['nodes.0.anim.0: a text cannot animate "draw"']);
    expect(errorsOf(scene([text({ anim: [{ prop: "color", keys: [{ t: 0, v: 1 }] }] })]))).toEqual(['nodes.0.anim.0.keys.0.v: "color" takes a #RRGGBB colour']);
    expect(errorsOf(scene([{ id: "p", type: "path", x: 0, y: 0, width: 10, height: 10, d: "M0 0 L10 10", anim: [{ prop: "draw", keys: [{ t: 0, v: 0 }] }] }])))
      .toEqual(['nodes.0.anim.0: "draw" needs a stroke to draw']);
  });

  it("refuses an image that names no asset of the scene, a clip group without a size, and a count without its slot", () => {
    expect(errorsOf(scene([{ id: "i", type: "image", x: 0, y: 0, width: 10, height: 10, src: "frame_1" }]))).toEqual(['nodes.0.src: "frame_1" is not one of the scene\'s assets']);
    expect(errorsOf(scene([{ id: "g", type: "group", x: 0, y: 0, clip: { shape: "rect" }, children: [] }]))).toEqual(["nodes.0.clip: a clipping group needs width and height"]);
    expect(errorsOf(scene([text({ text: "3,610", count: { from: 0, to: 1, from_s: 0, to_s: 1 } })]))).toEqual(['nodes.0.text: a counting text needs "{n}" where the number goes']);
  });

  it("refuses nesting deeper than four groups", () => {
    const nest = (depth: number): SceneNode => (depth === 0 ? text() : { id: `g${depth}`, type: "group", x: 0, y: 0, children: [nest(depth - 1)] });
    expect(errorsOf(scene([nest(3)]))).toEqual([]);
    expect(errorsOf(scene([nest(4)]))).toEqual(["nodes.0.children.0.children.0.children.0.children.0: groups nest deeper than 4"]);
  });

  it("refuses purple unless the customer's colours allow it, and repairs it to the brand teal's hue", () => {
    const purple = scene([text({ color: "#7C3AED" })]);
    expect(validateSceneGraph(purple)).toMatchObject({ ok: false,
      errors: ["purple colours #7C3AED are not allowed: use the brand teal #1385A3 or another hue outside 230–335°"] });
    expect(validateSceneGraph(purple, { allowPurple: true })).toMatchObject({ ok: true });
    // Every drawn colour counts: the ground, a shadow, a text box's fill and edge, a colour keyframe.
    const purpleIn = (extra: Partial<SceneGraph>, node: Partial<Extract<SceneNode, { type: "text" }>> = {}) =>
      errorsOf({ ...scene([text(node)]), ...extra }).filter(error => error.startsWith("purple colours #7C3AED"));
    for (const [extra, node] of [[{ background: "#7C3AED" }, {}], [{}, { shadow: { x: 0, y: 4, blur: 8, color: "#7C3AED" } }],
      [{}, { box: { fill: "#7C3AED" } }], [{}, { box: { stroke: "#7C3AED", strokeWidth: 2 } }],
      [{}, { anim: [{ prop: "color", keys: [{ t: 0, v: "#111111" }, { t: 1, v: "#7C3AED" }] }] }]] as const) {
      expect(purpleIn(extra, node as never)).toHaveLength(1);
    }
    // Both ends of the band and a blue-violet are purple; a sky blue, a pink past the band and a greyish lilac are not.
    expect(["#3B3BF6", "#4F46E5", "#7C3AED", "#C026D3", "#E61AA0"].map(isScenePurple)).toEqual([true, true, true, true, true]);
    expect(["#1385A3", "#3B82F6", "#F43F5E", "#8E8A94", "#FFFFFF"].map(isScenePurple)).toEqual([false, false, false, false, false]);
    const { scene: fixed, repaired } = repairScenePurple({ ...purple, background: "#4C1D95", nodes: [{ ...purple.nodes[0]!,
      anim: [{ prop: "color", keys: [{ t: 0, v: "#A855F7" }, { t: 1, v: "#111827" }] }], text: "#7C3AED" }] });
    expect(repaired.sort()).toEqual(["#4C1D95", "#7C3AED", "#A855F7"]);
    expect(validateSceneGraph(fixed)).toMatchObject({ ok: true });
    expect(fixed.nodes[0]).toMatchObject({ text: "#7C3AED", anim: [{ keys: [{ v: expect.not.stringMatching(/A855F7/) }, { v: "#111827" }] }] });
    expect(isScenePurple((fixed.nodes[0] as { color: string }).color)).toBe(false);
    // The repaired colour sits on the brand teal's hue (#1385A3, 192.5°): its lightness is kept, not the teal itself.
    const hue = (colour: string) => {
      const [r, g, b] = [1, 3, 5].map(at => Number.parseInt(colour.slice(at, at + 2), 16)) as [number, number, number];
      const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
      return 60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
    };
    for (const purple of ["#7C3AED", "#4C1D95", "#C026D3", "#E9D5FF"]) expect(Math.abs(hue(repairScenePurple({ fill: purple }).scene.fill) - hue("#1385A3"))).toBeLessThan(2);
    expect(repairScenePurple({ fill: "#7C3AED80" }).scene.fill).toMatch(/^#[0-9A-F]{6}80$/);
  });
});

describe("sceneGraphFootprint (#1190)", () => {
  /** Mutants: take only the resting pose, count a group's own box, skip the opacity check or the canvas cut, and the box grows, shrinks or spills. */
  it("bounds every shape the scene shows, first and resting pose, inside the canvas", () => {
    const drop: SceneNode = { id: "drop", type: "rect", x: 0, y: 960, width: 540, height: 192, anim: [{ prop: "y", keys: [{ t: 0, v: 1728 }, { t: 1, v: 960 }] }] };
    const hidden: SceneNode = { id: "ghost", type: "rect", x: 0, y: 0, width: 1080, height: 100, opacity: 0 };
    const group: SceneNode = { id: "g", type: "group", x: 540, y: 0, width: 1080, height: 1920, children: [{ id: "c", type: "ellipse", x: 0, y: 0, width: 1080, height: 96 }] };
    expect(sceneGraphFootprint(scene([group]))).toEqual({ left: 0.5, top: 0, width: 0.5, height: 0.05 });
    expect(sceneGraphFootprint(scene([drop, hidden]))).toEqual({ left: 0, top: 0.5, width: 0.5, height: 0.5 });
    expect(sceneGraphFootprint(scene([hidden]))).toBeNull();
    expect(sceneGraphFootprint(scene([{ ...hidden, opacity: 1, anim: [{ prop: "opacity", keys: [{ t: 0, v: 0 }, { t: 1, v: 0.5 }, { t: 2, v: 0 }] }] }])))
      .toEqual({ left: 0, top: 0, width: 1, height: 100 / 1920 });
  });
});
