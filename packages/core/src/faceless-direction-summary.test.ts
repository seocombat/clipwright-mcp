import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FACELESS_BEAT_KINDS, FACELESS_SHOT_SIZES, facelessDirectionSummary } from "./faceless-direction-summary.js";
import * as core from "./index.js";

/** Names and keys of the private direction (service-core `faceless-direction/`) that no published core file may define or spell. */
const INTERNAL = /\b(?:parseFacelessDirection|facelessDirectionDefects|planDirectedFaceless|facelessDirectedPlan|directedShot|alignTake|pauseTimelineOf|facelessTakeTexts|danglingRefs|facelessSoundRef|facelessBedRef|FACELESS_LIVE_ROUTES|FACELESS_SOUND_SYNTH|FACELESS_BED_RECIPES|FACELESS_DIRECTED_FPS|FACELESS_TAKE_MIN_RATE|facelessDirectionKey)\b|faceless\/direction\.json/u;

// #1573, rule 8: the published package carries what a customer sends or reads about a directed video, never how it is directed.
describe("the directed faceless video in the public contract", () => {
  it("exports no direction internals", () => {
    const names = Object.keys(core);
    expect(names.filter(name => /faceless|direct/i.test(name) && /omni|route|technique|take/i.test(name))).toEqual([]);
    for (const internal of ["parseFacelessDirection", "facelessDirection", "facelessDirectionDefects", "planDirectedFaceless", "facelessDirectedPlan",
      "alignTake", "pauseTimelineOf", "facelessTakeTexts", "danglingRefs", "facelessSoundRef", "facelessBedRef", "FACELESS_LIVE_ROUTES",
      "FACELESS_SOUND_SYNTH", "FACELESS_BED_RECIPES", "FACELESS_DIRECTED_FPS", "facelessDirectionKey"]) expect(names).not.toContain(internal);
  });

  // Codex r2 r1: an export check misses a local definition, which still ships in the published JS; every published source is read.
  it("defines no direction internals in any published source", () => {
    const root = new URL(".", import.meta.url);
    const sources = readdirSync(root, { recursive: true, encoding: "utf8" }).filter(path => /\.ts$/u.test(path) && !/\.test\.ts$/u.test(path));
    expect(sources.length).toBeGreaterThan(100);
    expect(sources.filter(path => INTERNAL.test(readFileSync(new URL(path, root), "utf8")))).toEqual([]);
  });

  // Codex r2 r2: the summary and the private direction share these lists, so each value is pinned.
  it("names the five shot kinds and the seven shot sizes", () => {
    expect([...FACELESS_BEAT_KINDS]).toEqual(["live", "still_move", "static_insert", "customer_image", "card"]);
    expect([...FACELESS_SHOT_SIZES]).toEqual(["ecu", "cu", "mcu", "ms", "mws", "ws", "ews"]);
    for (const shot_size of FACELESS_SHOT_SIZES) {
      expect(facelessDirectionSummary.safeParse({ beats: [{ words: [0, 1], kind: "card", shot_size }], live_seconds: 0, pictures: 0 }).success).toBe(true);
    }
  });

  it("summarises only shot kinds, sizes, words and counts", () => {
    const summary = { beats: [{ words: null, kind: "live", shot_size: "ecu" }], live_seconds: 1.5, pictures: 3 };
    expect(facelessDirectionSummary.parse(summary)).toEqual(summary);
    expect(() => facelessDirectionSummary.parse({ ...summary, beats: [{ ...summary.beats[0], technique_ids: ["F01"] }] })).toThrow();
    expect(() => facelessDirectionSummary.parse({ ...summary, route: "omni" })).toThrow();
    // Codex r2 r3: a beat's words are a [first, end) pair of word indices, or null for the cold open.
    const words = (value: unknown) => facelessDirectionSummary.safeParse({ ...summary, beats: [{ ...summary.beats[0], words: value }] }).success;
    expect(words([0, 4])).toBe(true);
    expect(words(null)).toBe(true);
    for (const bad of [[0], [0, 1, 2], [-1, 2], [0.5, 2], undefined]) expect(words(bad), JSON.stringify(bad)).toBe(false);
    expect(JSON.stringify(z.toJSONSchema(facelessDirectionSummary))).not.toMatch(/omni|route|technique|take/i);
  });
});
