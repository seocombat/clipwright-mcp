import { describe, expect, it } from "vitest";
import { TEMPLATE_KINDS, templateLeadFrames, templateMoments } from "./index.js";

// Words every 10 frames at 25 fps from the span's start at frame 100: word i starts on frame 10·i of the template (#778 S3c, owner 23.10).
const script = "zero one two three four five six seven eight nine";
const tokens = script.split(" "), words = tokens.map((word, index) => ({ word, startSec: (100 + 10 * index) / 25 }));
const span = { startFrame: 100, endFrame: 200 }, range = { startWord: 0, coverWord: 10 };
const kind = (name: string) => TEMPLATE_KINDS.find(entry => entry.kind === name)!;
const rows = [{ label: "a", on: true }, { label: "b", on: false }, { label: "c", on: true }];
const beats = (name: string, data: Record<string, unknown>) => templateMoments(kind(name), data, tokens, range, words, 25, span, "t");

describe("no beat lands before its template has entered (owner 23.10)", () => {
  /** Mutants: drop the clamp, clamp a frame early, or drop the warning, and a click lands on rows not yet drawn, or moves silently. */
  it("moves a click spoken while the checklist enters to frame 12, when the rows are in and the cursor has reached them, and says so", () => {
    expect(beats("checklist", { items: rows, clicks: [{ item: 0, quote: "zero" }, { item: 1, quote: "five" }] })).toEqual({ moments: [12, 50],
      warnings: ["template \"t\" clicks.0.quote \"zero\" is spoken on frame 0 of the template, before its checklist is on screen: the beat plays on frame 12"] });
  });

  it("moves the answer, a step and the reveal to frame 9, the first after their 8-frame enter", () => {
    expect(beats("phone_call", { caller: "Maya", answer_at: "zero" })).toEqual({ moments: [9],
      warnings: ["template \"t\" answer_at \"zero\" is spoken on frame 0 of the template, before its phone_call is on screen: the beat plays on frame 9"] });
    expect(beats("progress", { steps: ["a", "b"], advance_at: ["zero", "four"] }).moments).toEqual([9, 40]);
    expect(beats("compare", { before: { asset_id: "x" }, after: { asset_id: "y" }, reveal_at: "zero" }).moments).toEqual([9]);
  });

  it("keeps beats spoken after the enter on their words, with no warning", () => {
    expect(beats("checklist", { items: rows, clicks: [{ item: 0, quote: "two" }, { item: 1, quote: "three" }] })).toEqual({ moments: [20, 30], warnings: [] });
  });

  /** #1198 item 3, Kuzey: clicks.0 on "Buzdolabına ayrı" was spoken on frame 0 and played on frame 12. Mutants: no lead, a lead past the */
  /** kind's own entry, one before the video starts, or one for a kind whose first beat plays at its start, and the click misses its word. */
  it("starts a template early by the frames its first beat is spoken before its rows are in, within its entry and the video", () => {
    const at = (name: string, data: Record<string, unknown>, from = span.startFrame) => templateLeadFrames(kind(name), data, tokens, range,
      tokens.map((word, index) => ({ word, startSec: (from + 10 * index) / 25 })), 25, { startFrame: from });
    expect(at("checklist", { items: rows, clicks: [{ item: 0, quote: "zero" }, { item: 1, quote: "five" }] })).toBe(12);
    expect(at("checklist", { items: rows, clicks: [{ item: 0, quote: "one" }] })).toBe(2);
    expect(at("checklist", { items: rows, clicks: [{ item: 0, quote: "two" }] })).toBe(0);
    expect(at("checklist", { items: rows, clicks: [{ item: 0, quote: "zero" }] }, 5)).toBe(5);
    expect(at("checklist", { items: rows })).toBe(0);
    expect(at("word_title", { words: [{ text: "own", at: "zero" }] })).toBe(0);
    // Started 12 frames early, the first click plays on its word and nothing is named.
    const early = { startFrame: span.startFrame - 12, endFrame: span.endFrame };
    expect(templateMoments(kind("checklist"), { items: rows, clicks: [{ item: 0, quote: "zero" }, { item: 1, quote: "five" }] }, tokens, range, words, 25, early, "t"))
      .toEqual({ moments: [12, 62], warnings: [] });
  });

  /** Mutant: clamp each beat alone, and two clicks land on one frame. */
  it("moves the beats after a moved one in order, 6 frames apart, and names each", () => {
    const moved = beats("checklist", { items: rows, clicks: [{ item: 0, quote: "zero" }, { item: 1, quote: "one" }, { item: 2, quote: "two" }] });
    expect(moved.moments).toEqual([12, 18, 24]);
    expect(moved.warnings).toEqual([
      "template \"t\" clicks.0.quote \"zero\" is spoken on frame 0 of the template, before its checklist is on screen: the beat plays on frame 12",
      "template \"t\" clicks.1.quote \"one\" is spoken on frame 10 of the template, before its checklist is on screen: the beat plays on frame 18",
      "template \"t\" clicks.2.quote \"two\" is spoken on frame 20 of the template, too close after the beat before it moved: the beat plays on frame 24"]);
  });

  /** Mutant: stop the chain at the first beat that was only crowded, and the next click lands one frame after it (Codex r1 on S3c). */
  it("carries the 6-frame gap on past a beat that was only crowded", () => {
    const close = ["a", "b", "c", "d", "e"], at = [0, 10, 20, 25, 60].map((frame, index) => ({ word: close[index]!, startSec: (100 + frame) / 25 }));
    const items = [...rows, { label: "d", on: false }];
    const chained = templateMoments(kind("checklist"), { items, clicks: ["a", "b", "c", "d"].map((quote, item) => ({ item, quote })) }, close,
      { startWord: 0, coverWord: 5 }, at, 25, span, "t");
    expect(chained.moments).toEqual([12, 18, 24, 30]);
  });

  /** Mutant: let the first entry wait for its quote, or warn on it, and the full frame shows its bare ground until it is spoken (#1129). */
  it("plays a word_title's first entry on its first frame whatever its quote, with no warning, and the later entries on their words", () => {
    const words = [{ text: "own", at: "four" }, { text: "identity", at: "six" }];
    expect(beats("word_title", { words })).toEqual({ moments: [0, 60], warnings: [] });
    expect(TEMPLATE_KINDS.filter(entry => entry.firstBeatAtStart).map(entry => entry.kind)).toEqual(["word_title", "race", "series_frame", "comment_cta"]);
  });

  it("holds every kind with beats to a first beat frame after its enter", () => {
    expect(Object.fromEntries(TEMPLATE_KINDS.filter(entry => entry.quotes?.length).map(entry => [entry.kind, entry.beatsFrom])))
      .toEqual({ checklist: 12, phone_call: 9, compare: 9, progress: 9, chat_window: 10, word_title: 0, phone_screen: 7, terminal: 10, pointer_chips: 1,
        notification: undefined, chart: 8, race: undefined, hand_title: 14 });
  });
});
