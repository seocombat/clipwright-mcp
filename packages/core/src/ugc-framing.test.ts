import { describe, expect, it } from "vitest";
import { compositionLayersNotDrawnWarnings, dispositionWarnings, GOOGLE_TTS_MODEL, isNarratedUgcInput, makeUgcInput, resolveDispositions,
  speechModelRefusals } from "@clipwright/core";
import { FRAMING_SCALE, framingWarnings } from "./ugc-framing.js";
import { freezeResolvedTimeline, readResolvedTimeline } from "./resolved-timeline.js";
import { scriptInsertsTimelineFixture, segmentsTimelineFixture } from "./__fixtures__/long-form-timeline.fixture.js";

// Framing (reference-elements S2): word-anchored presenter sizes with a cut or a light-leak flash.

const script = "One two three four five six seven eight nine ten";
const url = "https://example.com/phone.png";
const frame = (id: string, startWord: number, endWord: number, extra: Record<string, unknown> = {}) => ({ id, anchor: { startWord, endWord }, ...extra });
const insert = (id: string, startWord: number, endWord: number) => ({ id, media_url: url, media_type: "image", anchor: { startWord, endWord } });
const window = (id: string, startWord: number, endWord: number, layout = "card") =>
  ({ id, media_url: url, media_type: "image", anchor: { startWord, endWord }, layout });
const fullTitle = (id: string, startWord: number, endWord: number) =>
  ({ id, kind: "title_card", placement: "full", anchor: { startWord, endWord }, data: { title: "Big news" } });

function refusals(body: Record<string, unknown>): string[] {
  const parsed = makeUgcInput.safeParse({ script, ...body });
  return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
}

describe("framing in the make_ugc contract", () => {
  it("accepts framing items and fills size close and transition cut", () => {
    const parsed = makeUgcInput.parse({ script, framing: [frame("in", 0, 2), frame("back", 2, 4, { size: "medium", transition: "flash", cover_words: 3 })] });
    expect(parsed.framing).toEqual([{ id: "in", anchor: { startWord: 0, endWord: 2 }, size: "close", transition: "cut" },
      { id: "back", anchor: { startWord: 2, endWord: 4 }, cover_words: 3, size: "medium", transition: "flash" }]);
    // full shows the take as rendered (#1175 S7): a scale above 1 would crop a full-height take, one below would draw past its edges.
    expect(FRAMING_SCALE).toEqual({ close: 1.18, medium: 1, full: 1 });
  });

  /** Mutant: drop any one refusal, and a framing scales a presenter who is not on screen or is already reframed. */
  it("refuses framing over an insert, a card or a split window, another framing, and a duplicate id", () => {
    expect(refusals({ inserts: [insert("i", 3, 5)], framing: [frame("f", 4, 6)] }))
      .toEqual(['framing.0: framing "f" overlaps insert "i": it reframes the presenter, who is not on screen during a full-frame insert']);
    expect(refusals({ layout_windows: [window("w", 4, 6)], framing: [frame("f", 5, 7)] }))
      .toEqual(['framing.0: framing "f" overlaps card window "w": a window reframes the presenter, and framing does not share the frame with it']);
    expect(refusals({ layout_windows: [window("s", 4, 6, "split")], framing: [frame("f", 0, 5)] }))
      .toEqual(['framing.0: framing "f" overlaps split window "s": a split crops the presenter to the top half and cannot scale it as well']);
    expect(refusals({ framing: [frame("a", 0, 3), frame("b", 2, 4)] }))
      .toEqual(['framing.1: framing "b" overlaps framing "a": one framing holds the presenter at a time']);
    expect(refusals({ inserts: [insert("x", 0, 1)], framing: [frame("x", 2, 3)] }))
      .toEqual(['framing.0.id: id "x" is already used in inserts: ids are unique across inserts, overlays, layout_windows, templates and framing']);
    expect(refusals({ templates: [{ ...fullTitle("t", 0, 1), placement: undefined }], framing: [frame("t", 2, 3)] }))
      .toEqual(['framing.0.id: id "t" is already used in templates: ids are unique across inserts, overlays, layout_windows, templates and framing']);
    expect(refusals({ framing: [frame("a", 0, 1), frame("a", 2, 3)] }))
      .toEqual(['framing.1.id: id "a" is already used in framing: ids are unique across inserts, overlays, layout_windows, templates and framing']);
  });

  it("keeps framing that meets an insert or a window at a word boundary, and items that meet one another", () => {
    expect(refusals({ inserts: [insert("i", 3, 5)], layout_windows: [window("w", 7, 8)], framing: [frame("a", 0, 3), frame("b", 5, 7), frame("c", 8, 10)] }))
      .toEqual([]);
  });

  it("refuses framing without script or with segments, an anchor the script does not hold, and a model without word timings", () => {
    expect(makeUgcInput.safeParse({ segments: [{ kind: "actor", script }], framing: [frame("f", 0, 1)] }).error?.issues.map(issue => issue.message))
      .toContain("framing requires script and cannot be combined with segments");
    expect(refusals({ framing: [{ id: "f", anchor: { quote: "eleven" } }] })).toEqual(['framing.0.anchor: framing "f": anchor quote "eleven" does not occur in script']);
    expect(refusals({ framing: [frame("f", 0, 1, { size: "wide" })] })).toHaveLength(1);
    expect(refusals({ framing: Array.from({ length: 21 }, (_, at) => frame(`f${at}`, 0, 1)) })).not.toEqual([]);
    expect(speechModelRefusals({ tts_model: GOOGLE_TTS_MODEL, framing: [] }).map(refusal => refusal.field)).toContain("framing");
  });

  /** Mutant: drop the warning, and a framing under a full-frame template disappears without a word (rule 3). */
  it("warns of a framing wholly under full-frame templates and keeps one partly over the presenter", () => {
    const under = makeUgcInput.parse({ script, templates: [fullTitle("t", 2, 6)], framing: [frame("hidden", 3, 5), frame("seen", 5, 8)] });
    const warning = 'framing "hidden" is not drawn: it lies wholly under full-frame templates, where the presenter is not on screen';
    expect(framingWarnings(under)).toEqual([warning]);
    expect(dispositionWarnings(under)).toContain(warning);
    const tag = { id: "t", kind: "tag", anchor: { startWord: 2, endWord: 6 }, data: { text: "Hi" } };
    expect(framingWarnings(makeUgcInput.parse({ script, templates: [tag], framing: [frame("f", 3, 5)] }))).toEqual([]);
  });

  it("routes framing alone to the long-form path, refuses it where long form or composition is off, and names it when undrawn", () => {
    expect([isNarratedUgcInput({ framing: [] }), isNarratedUgcInput({ segments: [], framing: [] })]).toEqual([true, false]);
    expect(resolveDispositions({ remoteFetch: true, compose: false, longForm: true }).framing.kind).toBe("rejected");
    expect(resolveDispositions({ remoteFetch: true, compose: true, longForm: true }).framing).toEqual({ kind: "implemented", provenBy: "composition" });
    expect(compositionLayersNotDrawnWarnings(makeUgcInput.parse({ script, framing: [frame("f", 0, 1)] }), "x")).toEqual(["framing was not drawn: x"]);
  });
});

describe("framing in the frozen timeline", () => {
  const withFraming = (framing: unknown[]) => { const { hash: _hash, ...content } = scriptInsertsTimelineFixture(); return { ...content, framing }; };

  it("keeps the hash of a timeline frozen without framing", () => {
    expect(scriptInsertsTimelineFixture().hash).toBe("51119f07a3d97a4653f69df6c0f7420f9307b3e4375e8a845851034f9e3ad603");
    expect(scriptInsertsTimelineFixture()).not.toHaveProperty("framing");
  });

  it("round-trips framing, and it moves the hash", () => {
    const frozen = freezeResolvedTimeline(withFraming([{ id: "in", startFrame: 0, endFrame: 150, size: "close" },
      { id: "out", startFrame: 450, endFrame: 600, size: "medium", transition: "flash" }]));
    expect(readResolvedTimeline(JSON.parse(JSON.stringify(frozen)))).toEqual(frozen);
    expect(frozen.hash).not.toBe(scriptInsertsTimelineFixture().hash);
  });

  it.each([
    ["past the output", [{ id: "a", startFrame: 900, endFrame: 1001, size: "close" }]],
    ["empty", [{ id: "a", startFrame: 100, endFrame: 100, size: "close" }]],
    ["duplicate", [{ id: "a", startFrame: 0, endFrame: 10, size: "close" }, { id: "a", startFrame: 20, endFrame: 30, size: "close" }]],
    ["overlapping", [{ id: "a", startFrame: 0, endFrame: 30, size: "close" }, { id: "b", startFrame: 20, endFrame: 40, size: "medium" }]],
    ["a cut written out", [{ id: "a", startFrame: 0, endFrame: 30, size: "close", transition: "cut" }]],
  ])("refuses framing %s", (_label, framing) => {
    expect(() => freezeResolvedTimeline(withFraming(framing))).toThrow();
  });

  it("refuses framing on an explicit-segments timeline", () => {
    const { hash: _hash, ...segments } = segmentsTimelineFixture();
    expect(() => freezeResolvedTimeline({ ...segments, framing: [{ id: "a", startFrame: 0, endFrame: 30, size: "close" }] })).toThrow("invalid framing");
  });
});
