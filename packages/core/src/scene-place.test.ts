import { describe, expect, it } from "vitest";
import { dispositionWarnings, makeUgcInput } from "@clipwright/core";
import { captionPlaceAt, fitPlacedRect, PLACE_FORMS, presenterPlaceFace, presenterPlaceWantsWide, presetPlace, resolvePlace, usualFace, type Place,
  type PresenterPlace } from "./scene-place.js";
import { mcpUgcOverlay, mcpUgcScene, mcpUgcTemplate } from "./skills.js";
import { admissionScene, frameCanvasOf, type LayerRect, OVERLAY_POSITIONS, overlayFootprints, overlayRect } from "./ugc-layers.js";
import { templateSceneItems } from "./templates/index.js";
import { freezeResolvedTimeline } from "./resolved-timeline.js";
import { LONG_FORM_RUN_ID, scriptInsertsTimelineFixture } from "./__fixtures__/long-form-timeline.fixture.js";

const script = "One two three four five six seven eight nine ten";
const url = "https://example.com/icon.png";
const placed = (id: string, startWord: number, endWord: number, place: Record<string, unknown>) =>
  ({ id, media_url: url, media_type: "image", anchor: { startWord, endWord }, place });
const frame = (left: number, top: number, width: number, height: number, extra: Record<string, unknown> = {}) =>
  ({ relative_to: "frame", rect: { left, top, width, height }, ...extra });

function refusals(body: Record<string, unknown>): string[] {
  const parsed = makeUgcInput.safeParse({ script, ...body });
  return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
}
const near = (rect: LayerRect, expected: LayerRect) =>
  expect(Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, Math.round(value * 1e6) / 1e6]))).toEqual(expected);

const canvas = { width: 1080, height: 1920 };
// The usual 9:16 close face: two thirds of the zone's 0.36 H, centred in it, 3:4 in pixels.
const face = { left: 0.34, top: 0.18, width: 0.32, height: 0.24 };

describe("resolvePlace (#973 S1)", () => {
  it("resolves a preset position to exactly the footprint overlayRect gives, for all 6 positions in all 3 formats", () => {
    for (const aspect of ["9:16", "1:1", "16:9"]) for (const position of OVERLAY_POSITIONS) {
      const size = frameCanvasOf(aspect);
      expect(resolvePlace(presetPlace(position, size), { canvas: size, face: usualFace(aspect, size) })).toEqual(overlayRect(position, size));
    }
  });

  it("puts the usual face in the middle of the face zone", () => near(usualFace("9:16", canvas), face));

  it("maps a rect in face units onto the face: origin its centre, unit its height on both axes", () => {
    near(resolvePlace({ relative_to: "face", rect: { left: 0.5, top: -0.5, width: 1, height: 1 } }, { canvas, face }),
      { left: 0.713333, top: 0.18, width: 0.426667, height: 0.24 });
  });

  it("puts a box next to the face by side, gap and align, square without the picture and in its shape with it", () => {
    const below = { relative_to: "face", side: "below", width: 0.3 } as Place;
    near(resolvePlace(below, { canvas, face }), { left: 0.35, top: 0.43, width: 0.3, height: 0.16875 });
    near(resolvePlace(below, { canvas, face, media: { width: 200, height: 100 } }), { left: 0.35, top: 0.43, width: 0.3, height: 0.084375 });
    near(resolvePlace({ relative_to: "face", side: "right", height: 0.5, size_unit: "face", gap: 0, align: "start" }, { canvas, face }),
      { left: 0.66, top: 0.18, width: 0.213333, height: 0.12 });
    near(resolvePlace({ relative_to: { layer: "a" }, side: "above", width: 0.2, align: "end" },
      { canvas, face, layers: new Map([["a", { left: 0.5, top: 0.5, width: 0.4, height: 0.1 }]]) }), { left: 0.7, top: 0.377500, width: 0.2, height: 0.1125 });
  });

  it("fits the picture inside its box, centred, unless it covers the box", () => {
    near(fitPlacedRect({ left: 0, top: 0, width: 0.5, height: 0.5 }, { width: 100, height: 100 }, canvas), { left: 0, top: 0.109375, width: 0.5, height: 0.28125 });
    expect(fitPlacedRect({ left: 0, top: 0, width: 0.5, height: 0.5 }, { width: 100, height: 100 }, canvas, "cover")).toEqual({ left: 0, top: 0, width: 0.5, height: 0.5 });
  });
});

describe("placed overlays at admission (#973 S1, design 2.6)", () => {
  it("takes exactly one of position and place, and keeps the place", () => {
    const body = { overlays: [placed("icon", 0, 2, frame(0.05, 0.7, 0.3, 0.1, { fit: "cover" }))] };
    expect(refusals(body)).toEqual([]);
    expect(makeUgcInput.parse({ script, ...body }).overlays![0]!.place).toEqual(frame(0.05, 0.7, 0.3, 0.1, { fit: "cover" }));
    expect(refusals({ overlays: [{ ...placed("icon", 0, 2, frame(0.05, 0.7, 0.3, 0.1)), position: "top" }] }))
      .toEqual(["overlays.0.position: pass exactly one of position or place"]);
    expect(refusals({ overlays: [{ id: "icon", media_url: url, media_type: "image", anchor: { startWord: 0, endWord: 2 } }] }))
      .toEqual(["overlays.0.position: pass exactly one of position or place"]);
  });

  it("takes the captions anchor only with captions, below or above them", () => {
    const icon = (side: string) => placed("icon", 0, 2, { relative_to: "captions", side, width: 0.285 });
    expect(refusals({ overlays: [icon("below")] })).toEqual(['overlays.0.place.relative_to: overlay "icon" is placed next to the captions: pass captions: true']);
    expect(refusals({ captions: true, overlays: [icon("below")] })).toEqual([]);
    // Over hormozi's own place the tallest page, 3 lines up from 0.65 H, would put the icon on the face.
    expect(refusals({ captions: true, overlays: [icon("above")] }))
      .toEqual(['overlays.0.place: overlay "icon" covers the presenter\'s face; move it, or pass allow_face: true to cover it on purpose']);
    expect(refusals({ captions: true, overlays: [icon("left")] })).toEqual(['overlays.0.place.side: overlay "icon" takes side left of the captions, ' +
      "whose width follows their words: next to the captions, use side below or above"]);
  });

  it("refuses a box on the face unless allow_face asks for it, and warns at its edge", () => {
    expect(refusals({ overlays: [placed("icon-3", 0, 2, frame(0.4, 0.2, 0.2, 0.1))] }))
      .toEqual(['overlays.0.place: overlay "icon-3" covers the presenter\'s face; move it, or pass allow_face: true to cover it on purpose']);
    expect(refusals({ overlays: [placed("icon-3", 0, 2, frame(0.4, 0.2, 0.2, 0.1, { allow_face: true }))] })).toEqual([]);
    expect(refusals({ overlays: [placed("icon-3", 0, 2, { relative_to: "face", rect: { left: -0.2, top: -0.2, width: 0.4, height: 0.4 } })] }))
      .toEqual(['overlays.0.place: overlay "icon-3" covers the presenter\'s face; move it, or pass allow_face: true to cover it on purpose']);
    const edge = makeUgcInput.parse({ script, overlays: [placed("icon-1", 0, 2, frame(0.62, 0.2, 0.2, 0.1))] });
    expect(dispositionWarnings(edge)).toContain('overlay "icon-1" may touch the presenter\'s face at its edge; it is drawn where it was placed');
  });

  it("judges two overlays by their drawn boxes, not the band a preset reserves", () => {
    expect(refusals({ overlays: [placed("gamma", 0, 5, frame(0.05, 0.75, 0.25, 0.1)), placed("canva", 2, 6, frame(0.7, 0.75, 0.25, 0.1))] })).toEqual([]);
    expect(refusals({ overlays: [placed("canva", 0, 5, frame(0.05, 0.7, 0.3, 0.1)), placed("gamma", 2, 6, frame(0.3, 0.72, 0.3, 0.1))] }))
      .toEqual(['overlays.1.place: overlay "gamma" and overlay "canva" share the screen on overlapping boxes at the same time']);
    expect(refusals({ overlays: [{ ...placed("a", 0, 4, {}), place: undefined, position: "bottom" }, placed("b", 2, 5, frame(0.3, 0.8, 0.2, 0.1))] }))
      .toEqual(['overlays.1.place: overlay "b" and overlay "a" share the screen on overlapping boxes at the same time']);
    expect(refusals({ overlays: [placed("a", 0, 4, frame(0.3, 0.7, 0.4, 0.2)), placed("b", 0, 4, { relative_to: { layer: "a" }, side: "over", width: 0.1 })] }))
      .toEqual([]);
  });

  it("refuses a box mostly off the frame, and one too small to read", () => {
    expect(refusals({ overlays: [placed("logo", 0, 2, frame(0.85, 0.5, 0.4, 0.1))] }))
      .toEqual(['overlays.0.place.rect: less than half of overlay "logo" is inside the frame']);
    expect(refusals({ overlays: [placed("logo", 0, 2, frame(0.7, 0.5, 0.4, 0.1))] })).toEqual([]);
    expect(refusals({ overlays: [placed("dot", 0, 2, frame(0.1, 0.7, 0.02, 0.02))] }))
      .toEqual(['overlays.0.place: overlay "dot" is smaller than 3% of the frame\'s short side: it would not read']);
  });

  it("places next to another placed overlay only while that one shows, in a chain of at most 2, without a loop", () => {
    const base = placed("a", 0, 5, frame(0.1, 0.6, 0.3, 0.1)), next = (id: string, to: string, from = 0, until = 5) =>
      placed(id, from, until, { relative_to: { layer: to }, side: "below", width: 0.1 });
    expect(refusals({ overlays: [base, next("b", "a")] })).toEqual([]);
    expect(refusals({ overlays: [base, next("b", "a", 0, 7)] })).toEqual(['overlays.1.place.relative_to: "a" is not on screen for all of overlay "b"\'s words']);
    expect(refusals({ overlays: [next("b", "zz")] }))
      .toEqual(['overlays.0.place.relative_to: overlay "b" is placed next to "zz", which is not an overlay or template of this run']);
    expect(refusals({ overlays: [{ ...base, place: undefined, position: "top" }, next("b", "a")] }))
      .toEqual(['overlays.1.place.relative_to: overlay "b" is placed next to "a", which has a position: place it next to an overlay that has place']);
    const chain = refusals({ overlays: [base, next("b", "a"), next("c", "b"), next("d", "c")] });
    expect(chain).toContain('overlays.3.place.relative_to: overlay "d" is placed next to a chain of more than 2 overlays or a loop: ' +
      "anchor it to the face, the frame or an overlay placed there");
    expect(chain.filter(line => line.startsWith("overlays.2."))).not.toContainEqual(expect.stringContaining("chain"));
    expect(refusals({ overlays: [next("x", "y"), next("y", "x")] })).toEqual([0, 1].map(index =>
      `overlays.${index}.place.relative_to: overlay "${"xy"[index]}" is placed next to a chain of more than 2 overlays or a loop: anchor it to the face, the frame or an overlay placed there`));
  });

  it("warns when a placed overlay hides most of a presenter who is still billed", () => {
    const parsed = makeUgcInput.parse({ script, overlays: [placed("shot", 0, 2, frame(0, 0, 1, 0.72, { allow_face: true }))] });
    expect(dispositionWarnings(parsed)).toContain('overlay "shot" covers 72% of the frame while the presenter under it is still billed; ' +
      "an insert replaces the presenter and is not billed as presenter time");
  });

  it("judges a template against a placed overlay's box, not a preset band", () => {
    const tag = { id: "t", kind: "tag", anchor: { startWord: 0, endWord: 3 }, data: { text: "Cursor" } };
    expect(refusals({ templates: [tag], overlays: [{ ...placed("o", 0, 3, {}), place: undefined, position: "bottom" }] }))
      .toEqual(['templates.0: template "t" shares the screen with "o" at the same time on an overlapping footprint: move one of them or its words']);
    expect(refusals({ templates: [tag], overlays: [placed("o", 0, 3, frame(0.1, 0.85, 0.2, 0.1))] })).toEqual([]);
  });
});

describe("placed templates and layers standing by them (#973 S4)", () => {
  // A product shot at the top left that slides out, a price tag beside it, a badge under the tag and a glint over it: nothing like the job-01 icons.
  const product = { ...placed("product", 0, 6, frame(0.04, 0.04, 0.3, 0.16875)), exit: "slide" };
  const price = (extra: Record<string, unknown> = {}) => ({ id: "price", kind: "tag", anchor: { startWord: 1, endWord: 5 }, data: { text: "$19", position: "top" },
    place: { relative_to: { layer: "product" }, side: "right", width: 0.3, align: "start" }, ...extra });
  const badge = placed("badge", 2, 4, { relative_to: { layer: "price" }, side: "below", width: 0.1 });
  const glint = placed("glint", 2, 3, { relative_to: { layer: "price" }, side: "over", width: 0.05 });
  const boxes = (body: Record<string, unknown>) => {
    const input = makeUgcInput.parse({ script, ...body });
    return overlayFootprints([...input.overlays ?? [], ...templateSceneItems(input, "close")], "9:16", "close", admissionScene(input, "9:16", "close"));
  };

  /** Mutant: draw a placed template at its kind's rect, or scale it to the box unevenly, and the tag leaves the product or loses its shape. */
  it("scales a template's own rect whole into its place, and an overlay stands by the template as drawn", () => {
    const beside = { overlays: [product], templates: [price()] };
    expect(refusals(beside)).toEqual([]);
    // The tag's own rect is 972 × 147 px; 0.3 W wide keeps that shape: 324 × 49 px, right of the product by 0.01 H, its top on the product's.
    near(boxes(beside).get("price")!, { left: 0.357778, top: 0.04, width: 0.3, height: 0.025521 });
    // In a 324 × 96 px box it is contained, centred: 49 px high from 0.6 H + 23.5 px; the badge stands 0.01 H under the tag as drawn.
    const framed = { overlays: [badge], templates: [price({ place: frame(0.3, 0.6, 0.3, 0.05), anchor: { startWord: 0, endWord: 6 } })] };
    expect(refusals(framed)).toEqual([]);
    near(boxes(framed).get("price")!, { left: 0.3, top: 0.61224, width: 0.3, height: 0.025521 });
    near(boxes(framed).get("badge")!, { left: 0.4, top: 0.64776, width: 0.1, height: 0.05625 });
    // A glint asked over the tag is drawn on it by asking: no clash.
    expect(refusals({ ...framed, overlays: [glint] })).toEqual([]);
  });

  it("refuses a place a template cannot take, and judges its box as an overlay's", () => {
    const at = (extra: Record<string, unknown>, overlays: unknown[] = [product]) => refusals({ ...(overlays.length ? { overlays } : {}),
      templates: [price(extra)] });
    expect(refusals({ templates: [{ id: "card", kind: "title_card", placement: "full", anchor: { startWord: 0, endWord: 2 }, data: { title: "Hi" },
      place: frame(0.1, 0.1, 0.3, 0.1) }] })).toEqual(['templates.0.place: template "card": a template takes place over the presenter only (placement over)']);
    expect(at({ place: { relative_to: "captions", side: "below", width: 0.3 } }, [])).toEqual(['templates.0.place: template "price": ' +
      "a template does not stand by the captions: place it by the frame, the face, an overlay or a template"]);
    expect(at({ place: frame(0.1, 0.8, 0.3, 0.05, { fit: "cover" }) })).toEqual(['templates.0.place: template "price": a template is scaled whole into its box: drop fit cover']);
    expect(at({ place: { relative_to: { layer: "zz" }, side: "below", width: 0.3 } })).toEqual(['templates.0.place.relative_to: template "price" is placed ' +
      'next to "zz", which is not an overlay or template of this run']);
    expect(at({ anchor: { startWord: 1, endWord: 8 } })).toEqual(['templates.0.place.relative_to: "product" is not on screen for all of template "price"\'s words']);
    expect(at({ place: frame(0.3, 0.25, 0.4, 0.1) })).toEqual(['templates.0.place: template "price" covers the presenter\'s face; move it, ' +
      "or pass allow_face: true to cover it on purpose"]);
    expect(at({ place: frame(0.3, 0.25, 0.4, 0.1, { allow_face: true }) })).toEqual([]);
    // Its own rect at the top would meet a top band; placed low, its box is judged and clears it.
    const band = { ...placed("band", 1, 3, {}), place: undefined, position: "top" };
    expect(at({ place: undefined }, [band])).toEqual(['templates.0: template "price" shares the screen with "band" at the same time on an overlapping ' +
      "footprint: move one of them or its words"]);
    expect(at({ place: frame(0.3, 0.6, 0.3, 0.05) }, [band])).toEqual([]);
    expect(at({ place: frame(0.04, 0.1, 0.3, 0.05) })).toEqual(['templates.0: template "price" shares the screen with "product" at the same time on an ' +
      "overlapping footprint: move one of them or its words"]);
  });

  it("refuses an overlay by a template that is not on screen for all its words, and warns on a placed template at the face's edge", () => {
    expect(refusals({ overlays: [placed("badge", 0, 6, { relative_to: { layer: "price" }, side: "below", width: 0.1 })],
      templates: [price({ place: frame(0.3, 0.6, 0.3, 0.05) })] }))
      .toEqual(['overlays.0.place.relative_to: "price" is not on screen for all of overlay "badge"\'s words']);
    const edge = makeUgcInput.parse({ script, templates: [price({ place: frame(0.2, 0.16, 0.3, 0.03) })] });
    expect(dispositionWarnings(edge)).toContain('template "price" may touch the presenter\'s face at its edge; it is drawn where it was placed');
  });
});

describe("placed overlays in the frozen timeline (#973 S1)", () => {
  const layer = { id: "phone", startFrame: 100, endFrame: 300, enter: "slide" as const, key: `runs/${LONG_FORM_RUN_ID}/layers/phone.image`,
    sha256: "e".repeat(64), bytes: 1000, width: 600, height: 1200, mediaType: "image" as const, contentType: "image/png" as const };
  const withLayers = (layers: unknown[]) => { const { hash: _hash, ...content } = scriptInsertsTimelineFixture(); return { ...content, layers }; };

  /** Mutant: freeze `place: null` or any default beside a preset, and every overlay run stored before S1 fails its hash on resume. */
  it("keeps the hash of an overlay frozen at a position before place existed", () => {
    // Literal computed on the pre-S1 build (a84dd9d3 + main) for this stored shape.
    expect(freezeResolvedTimeline(withLayers([{ ...layer, kind: "overlay", position: "top_right" }])).hash)
      .toBe("b00dd7c36289ccf5a0eab49339e4806a43d8c4fbbf32d40cd18115bec9272d57");
  });

  it("round-trips a place, which moves the hash, and holds one of position and place", () => {
    const at = freezeResolvedTimeline(withLayers([{ ...layer, kind: "overlay", place: frame(0.1, 0.6, 0.3, 0.1) }]));
    expect(at.layers![0]).toMatchObject({ place: frame(0.1, 0.6, 0.3, 0.1) });
    expect(at.hash).not.toBe("b00dd7c36289ccf5a0eab49339e4806a43d8c4fbbf32d40cd18115bec9272d57");
    expect(() => freezeResolvedTimeline(withLayers([{ ...layer, kind: "overlay", position: "top", place: frame(0.1, 0.6, 0.3, 0.1) }]))).toThrow();
    expect(() => freezeResolvedTimeline(withLayers([{ ...layer, kind: "overlay" }]))).toThrow();
  });

  it("freezes a place next to the captions", () => {
    const by = { relative_to: "captions", side: "below", gap: 0.01, width: 0.285 };
    expect(freezeResolvedTimeline(withLayers([{ ...layer, kind: "overlay", place: by }])).layers![0]).toMatchObject({ place: by });
  });
});

describe("captions as an anchor and caption_place (#973 S2)", () => {
  const job = { captions: true, caption_place: { relative_to: "frame", y: 0.57, edge: "center" } };
  const icon = (id: string, from: number, to: number) => placed(id, from, to, { relative_to: "captions", side: "below", gap: 0.01, width: 0.285 });

  it("stands a caption-placed box by the tallest page at caption_place: 3 hormozi lines of 130 px about 0.57 H, 0.01 H under them", () => {
    const scene = admissionScene(makeUgcInput.parse({ script, ...job }), "9:16", "close");
    near(scene.captions!, { left: 0.066667, top: 0.468437, width: 0.866667, height: 0.203125 });
    near(resolvePlace(icon("i", 0, 2).place as Place, { canvas, face, captions: scene.captions }), { left: 0.3575, top: 0.681563, width: 0.285, height: 0.160312 });
    near(resolvePlace({ relative_to: "captions", side: "above", width: 0.2 }, { canvas, face, captions: scene.captions }),
      { left: 0.4, top: 0.345937, width: 0.2, height: 0.1125 });
    // Without an edge, a place below the middle anchors the block's bottom there, as caption_position does.
    near(admissionScene(makeUgcInput.parse({ script, captions: true, caption_place: { relative_to: "frame", y: 0.57 } }), "9:16", "close").captions!,
      { left: 0.066667, top: 0.366875, width: 0.866667, height: 0.203125 });
  });

  it("refuses an overlay that meets pinned captions unless it stands by them, and never one by its own captions", () => {
    expect(refusals({ ...job, overlays: [icon("cursor", 0, 3), icon("claude", 3, 6)] })).toEqual([]);
    expect(refusals({ ...job, overlays: [placed("cursor", 0, 2, frame(0.1, 0.65, 0.2, 0.1))] })).toEqual(['overlays.0.place: overlay "cursor" meets ' +
      "the captions placed by caption_place while both show; captions placed this way do not move — place it relative_to captions, or move it"]);
    expect(refusals({ ...job, caption_place: { relative_to: "frame", y: 0.75, edge: "center" },
      overlays: [{ ...placed("band", 0, 2, {}), place: undefined, position: "bottom" }] }))
      .toEqual([expect.stringMatching(/^overlays\.0\.position: overlay "band" meets the captions placed by caption_place/)]);
    expect(refusals({ captions: true, overlays: [placed("cursor", 0, 2, frame(0.1, 0.65, 0.2, 0.1))] })).toEqual([]);
  });

  it("judges a caption-placed box against the face and the other overlays by the tallest page", () => {
    expect(refusals({ ...job, overlays: [icon("a", 0, 3), placed("b", 1, 4, frame(0.3, 0.75, 0.4, 0.1))] }))
      .toEqual(['overlays.1.place: overlay "b" and overlay "a" share the screen on overlapping boxes at the same time']);
    expect(refusals({ captions: true, caption_place: { relative_to: "frame", y: 0.5, edge: "top" },
      overlays: [placed("up", 0, 2, { relative_to: "captions", side: "above", width: 0.285 })] }))
      .toEqual(['overlays.0.place: overlay "up" covers the presenter\'s face; move it, or pass allow_face: true to cover it on purpose']);
  });

  it("does not chain an overlay to one that follows the captions", () => {
    expect(refusals({ ...job, overlays: [icon("a", 0, 5), placed("b", 0, 5, { relative_to: { layer: "a" }, side: "right", width: 0.1 })] }))
      .toEqual(['overlays.1.place.relative_to: overlay "b" is placed next to "a", which follows the captions: place it relative_to captions too']);
  });

  it("takes caption_place with captions only, not beside caption_position, and inside the frame", () => {
    expect(refusals({ caption_place: { relative_to: "frame", y: 0.57 } })).toEqual(["caption_place: caption_place requires captions=true: it places the burned captions"]);
    expect(refusals({ ...job, caption_position: "middle" })).toEqual(["caption_place: pass caption_position or caption_place, not both"]);
    expect(refusals({ captions: true, caption_place: { relative_to: "face", y: 4 } }))
      .toEqual(["caption_place: caption_place puts the captions at 126% of the height, outside the frame"]);
    expect(refusals({ captions: true, caption_place: { relative_to: "face", y: 1.5, edge: "center" } })).toEqual([]);
  });
});

describe("presenter_place (#973 S2b)", () => {
  const at = { face_height: 0.267, face_centre: [0.5, 0.31] };
  const icon = placed("i", 0, 2, frame(0.1, 0.8, 0.2, 0.1));

  it("takes a saved actor in a composed video only", () => {
    expect(refusals({ actor_id: "actor_alex", presenter_place: at, overlays: [icon] })).toEqual([]);
    expect(refusals({ presenter_place: at, overlays: [icon] })).toEqual(["presenter_place: presenter_place requires actor_id: it frames a saved actor's portrait"]);
    expect(refusals({ actor_id: "actor_alex", presenter_place: at })).toEqual(["presenter_place: presenter_place requires script with overlays, inserts, " +
      "layout_windows, framing, call or interview: it frames the presenter of a composed video"]);
  });

  it("plans overlays and face-relative captions by the face it asks for", () => {
    const input = makeUgcInput.parse({ script, actor_id: "actor_alex", presenter_place: at, overlays: [icon] });
    near(admissionScene(input, "9:16", "close").face, { left: 0.322, top: 0.1765, width: 0.356, height: 0.267 });
    expect(refusals({ actor_id: "actor_alex", presenter_place: { face_height: 0.2, face_centre: [0.2, 0.85] }, overlays: [icon] }))
      .toEqual(['overlays.0.place: overlay "i" covers the presenter\'s face; move it, or pass allow_face: true to cover it on purpose']);
    const caption = captionPlaceAt({ relative_to: "face", y: 1 }, presenterPlaceFace(at as PresenterPlace, canvas));
    expect({ ...caption, vertical: Math.round(caption.vertical * 1e6) / 1e6 }).toEqual({ vertical: 57.7, edge: "bottom" });
  });

  it("starts from the wide view for a face smaller than the close view's", () => {
    expect([0.2, 0.267, 0.275, 0.3].map(face_height => presenterPlaceWantsWide({ face_height }))).toEqual([true, true, false, false]);
  });
});

describe("one place shape for overlays, templates and scenes (#1327)", () => {
  const tag = (place: unknown) => ({ id: "tag", kind: "tag", anchor: { startWord: 0, endWord: 2 }, data: { text: "$19" }, place });

  /** Mutant: keep relative_to required, and the journey's {rect:{left,top,width,height}} is refused again as "Invalid input". */
  it("takes a template's rect without relative_to as a frame rect", () => {
    expect(refusals({ templates: [tag({ rect: { left: 0.3, top: 0.6, width: 0.3, height: 0.05 } })] })).toEqual([]);
    expect(makeUgcInput.parse({ script, templates: [tag({ rect: { left: 0.3, top: 0.6, width: 0.3, height: 0.05 } })] }).templates![0]!.place)
      .toEqual(frame(0.3, 0.6, 0.3, 0.05));
  });

  it("names the forms on every wrong shape the journey tried, never a bare Invalid input", () => {
    for (const shape of [{ rect: { x: 0.3, y: 0.6, w: 0.3, h: 0.05 } }, { rect: [0.3, 0.6, 0.3, 0.05] }]) {
      const [message] = refusals({ templates: [tag(shape)] });
      expect(message).toContain('templates.0.place: place takes {relative_to:"frame",rect:{left,top,width,height}}');
    }
  });

  it("describes the place forms once, on the MCP overlay, template and scene alike", () => {
    const text = (schema: { shape: { place: { description?: string | undefined } } }) => schema.shape.place.description ?? "";
    expect(text(mcpUgcOverlay)).toContain(PLACE_FORMS);
    expect(text(mcpUgcTemplate)).toContain(PLACE_FORMS);
    expect(text(mcpUgcScene)).toContain(PLACE_FORMS);
    expect(PLACE_FORMS).toContain("rect:{left,top,width,height}");
  });
});
