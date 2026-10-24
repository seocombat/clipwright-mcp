import { describe, expect, it } from "vitest";
import { compositionLayersNotDrawnWarnings, GOOGLE_TTS_MODEL, isNarratedUgcInput, makeUgcInput, resolveDispositions, speechModelRefusals,
  storedUgcInput } from "@clipwright/core";
import { frameCanvasOf, layerRefusals, layerWordRange, OVERLAY_POSITIONS, overlayRect, rectsOverlap, resolveLayerFrames, type OverlayPosition } from "./ugc-layers.js";
import { lexicalTokens } from "./semantic-inserts.js";
import { freezeResolvedTimeline, readResolvedTimeline } from "./resolved-timeline.js";
import { LONG_FORM_RUN_ID, scriptInsertsTimelineFixture, segmentsTimelineFixture } from "./__fixtures__/long-form-timeline.fixture.js";

const script = "One two three four five six seven eight nine ten";
const url = "https://example.com/phone.png";
const overlay = (id: string, startWord: number, endWord: number, position = "top_right") =>
  ({ id, media_url: url, media_type: "image", anchor: { startWord, endWord }, position });
const window = (id: string, startWord: number, endWord: number, layout = "card") =>
  ({ id, media_url: url, media_type: "image", anchor: { startWord, endWord }, layout });
const insert = (id: string, startWord: number, endWord: number) => ({ id, media_url: url, media_type: "image", anchor: { startWord, endWord } });

/** The messages a body is refused with; an accepted body gives none. */
function refusals(body: Record<string, unknown>): string[] {
  const parsed = makeUgcInput.safeParse({ script, ...body });
  return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
}

describe("overlays and layout windows in the make_ugc contract (#778 S2b, C3)", () => {
  it("accepts overlays, windows, transitions and punch_in, and keeps them", () => {
    const body = { inserts: [{ ...insert("ins", 0, 1), transition: "flash" }], overlays: [{ ...overlay("o1", 2, 4), enter: "slide" }],
      layout_windows: [{ ...window("w1", 5, 7), blur_presenter: true, enter: "tilt_in" }],
      captions: true, caption_emphasis: [{ quote: "nine", punch_in: true }] };
    expect(refusals(body)).toEqual([]);
    const parsed = makeUgcInput.parse({ script, ...body });
    expect(parsed.overlays).toEqual(body.overlays);
    expect(parsed.layout_windows).toEqual(body.layout_windows);
    expect(parsed.inserts![0]!.transition).toBe("flash");
    expect(parsed.caption_emphasis).toEqual([{ quote: "nine", punch_in: true }]);
  });

  it("refuses windows that overlap each other or a full-frame insert", () => {
    expect(refusals({ layout_windows: [window("a", 0, 3), window("b", 2, 4)] }))
      .toEqual(['layout_windows.1: layout window "b" overlaps layout window "a": windows take the frame one at a time']);
    expect(refusals({ inserts: [insert("i", 3, 5)], layout_windows: [window("w", 4, 6)] }))
      .toEqual(['layout_windows.0: layout window "w" overlaps insert "i": a window reframes the presenter, who is not on screen during a full-frame insert']);
    expect(refusals({ inserts: [insert("i", 3, 5)], layout_windows: [window("w", 5, 6), window("v", 0, 3)] })).toEqual([]);
  });

  it("refuses a third overlay on screen at once, and two overlays sharing a position", () => {
    expect(refusals({ overlays: [overlay("a", 0, 4, "top_left"), overlay("b", 1, 5, "bottom_right"), overlay("c", 3, 6, "bottom_left")] }))
      .toEqual(['overlays.2: overlay "c" would be on screen together with "a" and "b": at most 2 overlays show at once']);
    expect(refusals({ overlays: [overlay("a", 0, 2, "top_left"), overlay("b", 2, 4, "bottom_right"), overlay("c", 1, 3, "bottom_left")] })).toEqual([]);
    expect(refusals({ overlays: [overlay("a", 0, 4, "top"), overlay("b", 3, 5, "top_left")] }))
      .toEqual(['overlays.1.position: overlay "b" (top_left) shares the screen with overlay "a" (top) at the same time: overlays on screen together need different positions']);
    expect(refusals({ overlays: [overlay("a", 0, 4, "top"), overlay("b", 3, 5, "bottom")] })).toEqual([]);
  });

  it("refuses split outside 9:16 and blur_presenter off a card", () => {
    expect(refusals({ aspect_ratio: "16:9", layout_windows: [window("s", 0, 2, "split")] }))
      .toEqual(['layout_windows.0.layout: layout window "s": split works in 9:16 only, and aspect_ratio is 16:9']);
    expect(refusals({ aspect_ratio: "9:16", layout_windows: [window("s", 0, 2, "split")] })).toEqual([]);
    expect(refusals({ layout_windows: [window("s", 0, 2, "split")] })).toEqual([]);
    expect(refusals({ layout_windows: [{ ...window("s", 0, 2, "split"), blur_presenter: true }] }))
      .toEqual(["layout_windows.0.blur_presenter: blur_presenter works on a card window only"]);
  });

  it("refuses both or neither source, and a duplicate id across inserts, overlays and windows", () => {
    const { media_url: _gone, ...neither } = overlay("o", 0, 1);
    expect(refusals({ overlays: [neither] })).toEqual(["overlays.0.media_url: pass exactly one of media_url or asset_id"]);
    expect(refusals({ layout_windows: [{ ...window("w", 0, 1), asset_id: `ast_${"a".repeat(32)}` }] }))
      .toEqual(["layout_windows.0.media_url: pass exactly one of media_url or asset_id"]);
    expect(refusals({ inserts: [insert("same", 0, 1)], overlays: [overlay("same", 2, 3)] }))
      .toEqual(['overlays.0.id: id "same" is already used in inserts: ids are unique across inserts, overlays and layout_windows']);
    expect(refusals({ overlays: [overlay("x", 0, 1)], layout_windows: [window("x", 2, 3)] }))
      .toEqual(['layout_windows.0.id: id "x" is already used in overlays: ids are unique across inserts, overlays and layout_windows']);
    expect(refusals({ overlays: [overlay("x", 0, 1, "top_left"), overlay("x", 4, 5, "top_left")] }))
      .toEqual(['overlays.1.id: id "x" is already used in overlays: ids are unique across inserts, overlays and layout_windows']);
  });

  it("refuses an overlay that lies wholly under inserts, where it would never show, and keeps one partly over the presenter", () => {
    expect(refusals({ inserts: [insert("a", 2, 4), insert("b", 4, 6)], overlays: [overlay("o", 3, 6)] }))
      .toEqual(['overlays.0: overlay "o" lies wholly under insert "a": an overlay draws over the presenter, who is not on screen during a full-frame insert']);
    expect(refusals({ inserts: [insert("a", 2, 4)], overlays: [overlay("o", 3, 5)] })).toEqual([]);
  });

  it("refuses overlays and windows without script or with segments, and an anchor the script does not hold", () => {
    expect(makeUgcInput.safeParse({ segments: [{ kind: "actor", script }], overlays: [overlay("o", 0, 1)] }).success).toBe(false);
    expect(makeUgcInput.safeParse({ segments: [{ kind: "actor", script }], layout_windows: [window("w", 0, 1)] }).error?.issues
      .map(issue => issue.message)).toContain("overlays and layout_windows require script and cannot be combined with segments");
    expect(refusals({ overlays: [{ ...overlay("o", 0, 1), anchor: { quote: "eleven" } }] }))
      .toEqual(['overlays.0.anchor: overlay "o": anchor quote "eleven" does not occur in script']);
    expect(refusals({ layout_windows: [window("w", 8, 11)] }))
      .toEqual(['layout_windows.0.anchor: layout window "w": anchor ends at word 11, past the script\'s 10 words']);
  });

  it("refuses overlays and windows with a speech model that returns no word timings", () => {
    const fields = speechModelRefusals({ tts_model: GOOGLE_TTS_MODEL, overlays: [], layout_windows: [] }).map(refusal => refusal.field);
    expect(fields).toEqual(expect.arrayContaining(["overlays", "layout_windows"]));
  });

  it("keeps the pins of asset media of overlays and windows in the stored input", () => {
    const parsed = storedUgcInput.safeParse({ script, overlays: [overlay("o", 0, 1)],
      insert_assets: Array.from({ length: 12 }, (_, i) => ({ insert_id: `p${i}`, asset_id: `ast_${"a".repeat(32)}`, key: "k", sha256: "b".repeat(64),
        bytes: 1, kind: "image", media_type: "image/png", width: 1, height: 1 })) });
    expect(parsed.success).toBe(true);
  });
});

describe("layer word ranges and frames", () => {
  const tokens = lexicalTokens(script);
  it("resolves anchors as inserts do, and names why one does not", () => {
    expect(layerWordRange(tokens, { id: "a", anchor: { quote: "three four" }, cover_words: 3 })).toEqual({ startWord: 2, coverWord: 5 });
    expect(layerWordRange(lexicalTokens("go go"), { id: "a", anchor: { quote: "go" } })).toBe('anchor quote "go" occurs 2 times in script: pass occurrence');
    expect(layerWordRange(tokens, { id: "a", anchor: { startWord: 1, endWord: 3 }, cover_words: 1 }))
      .toBe("cover_words 1 is fewer than the 2 words the anchor names");
  });

  it("collides positions whose rectangles overlap", () => {
    const collide = (a: OverlayPosition, b: OverlayPosition) => rectsOverlap(overlayRect(a, frameCanvasOf("9:16")), overlayRect(b, frameCanvasOf("9:16")));
    expect([collide("top", "top_right"), collide("top", "bottom"), collide("top_left", "top_left")]).toEqual([true, false, true]);
  });

  it("maps word ranges to frames: from the first word's start to the first uncovered word's start", () => {
    const words = [{ word: "Hello", startSec: 0.1, endSec: 0.5 }, { word: ",", startSec: 0.5, endSec: 0.5 },
      { word: "big", startSec: 0.6, endSec: 0.9 }, { word: "world", startSec: 1.02, endSec: 1.6 }];
    const frames = resolveLayerFrames({ tokens: ["hello", "big", "world"], words, totalFrames: 50, fps: 25,
      layers: [{ id: "a", startWord: 0, coverWord: 1 }, { id: "b", startWord: 1, coverWord: 2 }, { id: "c", startWord: 2, coverWord: 3 }] });
    expect(frames).toEqual([{ id: "a", startFrame: 0, endFrame: 15 }, { id: "b", startFrame: 15, endFrame: 26 }, { id: "c", startFrame: 26, endFrame: 50 }]);
    expect(() => resolveLayerFrames({ tokens: ["other"], words, totalFrames: 50, fps: 25, layers: [] })).toThrow("do not follow");
  });

  it("names no refusal for a valid set", () => {
    expect(layerRefusals({ script, overlays: [overlay("o", 0, 2) as never], layout_windows: [window("w", 3, 5) as never] })).toEqual([]);
  });
});

describe("routing, dispositions and undrawn layers (C7)", () => {
  it("routes a script with overlays or windows alone to the narrated long-form path", () => {
    expect([isNarratedUgcInput({ overlays: [] }), isNarratedUgcInput({ layout_windows: [] }), isNarratedUgcInput({ inserts: [] }),
      isNarratedUgcInput({}), isNarratedUgcInput({ segments: [], overlays: [] })]).toEqual([true, true, true, false, false]);
  });

  it("refuses overlays and windows at admission where long form or composition is off", () => {
    const off = resolveDispositions({ remoteFetch: true, compose: false, longForm: true });
    expect([off.overlays.kind, off.layout_windows.kind]).toEqual(["rejected", "rejected"]);
    const on = resolveDispositions({ remoteFetch: true, compose: true, longForm: true });
    expect([on.overlays, on.layout_windows]).toEqual([{ kind: "implemented", provenBy: "composition" }, { kind: "implemented", provenBy: "composition" }]);
  });

  it("names every undrawn composition-only part, and nothing for a run without them", () => {
    const input = makeUgcInput.parse({ script, inserts: [{ ...insert("i", 0, 1), transition: "wipe" }], overlays: [overlay("o", 2, 3)],
      layout_windows: [window("w", 4, 5)], captions: true, caption_emphasis: [{ quote: "nine", punch_in: true }] });
    expect(compositionLayersNotDrawnWarnings(input, "composition is disabled on this deployment"))
      .toEqual(["overlays, layout_windows, transition, punch_in were not drawn: composition is disabled on this deployment"]);
    expect(compositionLayersNotDrawnWarnings(makeUgcInput.parse({ script, captions: true, caption_emphasis: [{ quote: "nine", punch_in: true }] }), "x"))
      .toEqual(["punch_in was not drawn: x"]);
    expect(compositionLayersNotDrawnWarnings(makeUgcInput.parse({ script, inserts: [{ ...insert("i", 0, 1), transition: "cut" }],
      captions: true, caption_emphasis: ["nine"] }), "x")).toEqual([]);
  });
});

describe("layers in the frozen timeline (D8, C5, C7)", () => {
  const layer = { id: "phone", startFrame: 100, endFrame: 300, enter: "slide" as const, key: `runs/${LONG_FORM_RUN_ID}/layers/phone.image`,
    sha256: "e".repeat(64), bytes: 1000, width: 600, height: 1200, mediaType: "image" as const, contentType: "image/png" as const };
  const withLayers = (layers: unknown[]) => { const { hash: _hash, ...content } = scriptInsertsTimelineFixture(); return { ...content, layers }; };

  it("keeps the hash of a timeline frozen before layers existed", () => {
    // Literal from the pre-#778-S2b build: an optional field that is absent must not move an old hash.
    expect(scriptInsertsTimelineFixture().hash).toBe("51119f07a3d97a4653f69df6c0f7420f9307b3e4375e8a845851034f9e3ad603");
    expect(scriptInsertsTimelineFixture()).not.toHaveProperty("layers");
  });

  it("round-trips overlays and windows, and they move the hash", () => {
    const frozen = freezeResolvedTimeline(withLayers([{ ...layer, kind: "overlay", position: "top_right" },
      { ...layer, id: "card", kind: "window", layout: "card", blurPresenter: true, startFrame: 800, endFrame: 1000 }]));
    expect(readResolvedTimeline(JSON.parse(JSON.stringify(frozen)))).toEqual(frozen);
    expect(frozen.layers).toHaveLength(2);
    expect(frozen.hash).not.toBe(scriptInsertsTimelineFixture().hash);
  });

  it.each([
    ["past the output", { ...layer, kind: "overlay", position: "top", endFrame: 1001 }],
    ["foreign key", { ...layer, kind: "overlay", position: "top", key: "runs/other/layers/phone.image" }],
    ["blur off a card", { ...layer, kind: "window", layout: "split", blurPresenter: true }],
    ["empty interval", { ...layer, kind: "overlay", position: "top", endFrame: 100 }],
  ])("refuses a layer %s", (_label, bad) => {
    expect(() => freezeResolvedTimeline(withLayers([bad]))).toThrow();
  });

  it("refuses duplicate layer ids and layers on an explicit-segments timeline", () => {
    const overlayLayer = { ...layer, kind: "overlay", position: "top" };
    expect(() => freezeResolvedTimeline(withLayers([overlayLayer, overlayLayer]))).toThrow("invalid layer");
    const { hash: _hash, ...segments } = segmentsTimelineFixture();
    expect(() => freezeResolvedTimeline({ ...segments, layers: [{ ...overlayLayer, key: `runs/${LONG_FORM_RUN_ID}/layers/phone.image` }] })).toThrow("invalid layer");
  });
});

describe("rectangle footprints refuse exactly what S2's corners refused (#778 S3a(0), D5)", () => {
  // S2's model, kept here as the oracle: two overlays on screen together collided when they shared a corner.
  const CORNERS: Record<OverlayPosition, readonly string[]> = {
    top_left: ["tl"], top_right: ["tr"], bottom_left: ["bl"], bottom_right: ["br"], top: ["tl", "tr"], bottom: ["bl", "br"] };
  const shareCorner = (a: OverlayPosition, b: OverlayPosition) => CORNERS[a].some(corner => CORNERS[b].includes(corner));
  const formats = ["9:16", "1:1", "16:9"] as const;

  it.each(formats)("refuses the same pairs in %s, with S2's message", aspect_ratio => {
    const table = OVERLAY_POSITIONS.flatMap(a => OVERLAY_POSITIONS.map(b => {
      const found = layerRefusals({ script, aspect_ratio, overlays: [overlay("a", 0, 2, a), overlay("b", 1, 3, b)] as never });
      return { pair: `${a}+${b}`, refused: found.map(refusal => `${refusal.path.join(".")}: ${refusal.message}`) };
    }));
    expect(table).toHaveLength(36);
    expect(table).toEqual(OVERLAY_POSITIONS.flatMap(a => OVERLAY_POSITIONS.map(b => ({ pair: `${a}+${b}`, refused: shareCorner(a, b)
      ? [`overlays.1.position: overlay "b" (${b}) shares the screen with overlay "a" (${a}) at the same time: overlays on screen together need different positions`]
      : [] }))));
  });

  it.each(formats)("declares in %s the most overlayBox draws, a margin of 4% of the short side from the edges", aspect_ratio => {
    const canvas = frameCanvasOf(aspect_ratio), margin = Math.round(0.04 * Math.min(canvas.width, canvas.height));
    const px = (position: OverlayPosition) => { const rect = overlayRect(position, canvas);
      return [rect.left * canvas.width, rect.top * canvas.height, rect.width * canvas.width, rect.height * canvas.height].map(Math.round); };
    const [cornerWidth, height] = [Math.round(0.42 * canvas.width), Math.round(0.3 * canvas.height)];
    expect(px("top_left")).toEqual([margin, margin, cornerWidth, height]);
    expect(px("bottom_right")).toEqual([canvas.width - margin - cornerWidth, canvas.height - margin - height, cornerWidth, height]);
    expect(px("bottom")).toEqual([margin, canvas.height - margin - height, canvas.width - 2 * margin, height]);
  });

  it("derives the frame from the format as the composition does: the short side 1080, both sides even", () => {
    expect(formats.map(frameCanvasOf)).toEqual([{ width: 1080, height: 1920 }, { width: 1080, height: 1080 }, { width: 1920, height: 1080 }]);
  });

  it("counts only a shared area as overlap: rectangles that touch do not collide", () => {
    const a = { left: 0, top: 0, width: 0.5, height: 0.5 };
    expect(rectsOverlap(a, { left: 0.5, top: 0, width: 0.5, height: 0.5 })).toBe(false);
    expect(rectsOverlap(a, { left: 0.49, top: 0.49, width: 0.5, height: 0.5 })).toBe(true);
  });
});
