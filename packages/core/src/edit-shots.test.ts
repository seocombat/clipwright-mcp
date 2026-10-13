import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { editableContext, facelessPlanFixture, longFormShotsFixture, unplannedShotsFixture } from "./__fixtures__/edit-views.fixture.js";
import { editDocument, identityEditDocument } from "./edit-document.js";
import { facelessRunShots } from "./edit-faceless.js";
import * as primitives from "./edit-primitives.js";
import * as editBarrel from "./edit.js";
import * as coreBarrel from "./index.js";
import { runShots, runShotsPath, runShotsRead, type PlannedRunShots } from "./edit-shots.js";

const faceless = () => facelessRunShots(facelessPlanFixture(), editableContext());
/** The view with every closed vocabulary widened to a string, so a test can step outside it. */
type Widened = { line: string; frame: { aspect_ratio: string }; rules: Record<string, unknown>; editable: { state: string };
  withheld: string[]; narration: { words: Record<string, unknown>[] };
  tracks: { id: string; shots: { kind: string; track: string; source: string; operations: string[] }[] }[] };
function altered(view: PlannedRunShots, change: (copy: Widened) => void): unknown {
  const copy: Widened = structuredClone(view);
  change(copy);
  return copy;
}

describe("the shots view of a run", () => {
  it("runShots parses both planned fixtures and the two unplanned ones (a failed run, an unsupported line); a view with `planned: true` and no `tracks` is refused, and one with `planned: false` needs no frame, duration, words or rules. runShotsRead parses a view with an unknown kind, action, line, track id, rule key, editable state, withheld name and aspect ratio, each of which runShots refuses; a word with an extra field parses in both; editDocument refuses an added key", () => {
    const view = faceless(), failed = unplannedShotsFixture("not_succeeded"), unsupported = unplannedShotsFixture("unsupported_line");
    for (const shots of [view, longFormShotsFixture(), failed, unsupported]) {
      expect(runShots.parse(shots)).toEqual(shots);
      expect(runShotsRead.parse(shots)).toEqual(shots);
    }
    expect([failed.line, failed.editable.state, unsupported.line, unsupported.editable.state]).toEqual(["faceless", "not_succeeded", "ugc", "unsupported_line"]);

    const { tracks, ...trackless } = view;
    expect(tracks).toHaveLength(1);
    expect(runShots.safeParse(trackless).success).toBe(false);
    expect(runShotsRead.safeParse(trackless).success).toBe(false);
    // The unplanned member carries none of the planned fields, and a planned state does not make it planned.
    for (const key of ["frame", "timebase", "duration_frames", "narration", "tracks", "rules"]) expect(failed).not.toHaveProperty(key);
    expect(runShots.safeParse({ ...failed, editable: { ...failed.editable, state: "editable" } }).success).toBe(false);
    expect(runShots.safeParse({ ...failed, planned: true }).success).toBe(false);
    expect(runShots.safeParse({ ...failed, editable: { ...failed.editable, reason: "" } }).success).toBe(false);

    const unknowns: Array<[name: string, change: (copy: Widened) => void]> = [
      ["kind", copy => { copy.tracks[0]!.shots[1]!.kind = "split_screen"; }],
      ["action", copy => { copy.tracks[0]!.shots[1]!.operations.push("restyle"); }],
      ["line", copy => { copy.line = "podcast"; }],
      ["track id", copy => { copy.tracks[0]!.id = "overlay"; }],
      ["shot track", copy => { copy.tracks[0]!.shots[1]!.track = "overlay"; }],
      ["shot source", copy => { copy.tracks[0]!.shots[1]!.source = "stock"; }],
      ["rule key", copy => { copy.rules.max_cuts_per_minute = 20; }],
      ["rule value", copy => { copy.rules.output_coverage = "audio"; }],
      ["editable state", copy => { copy.editable.state = "locked"; }],
      ["withheld name", copy => { copy.withheld.push("voice"); }],
      ["aspect ratio", copy => { copy.frame.aspect_ratio = "4:5"; }],
    ];
    for (const [name, change] of unknowns) {
      const widened = altered(view, change);
      expect(runShots.safeParse(widened).success, name).toBe(false);
      expect(runShotsRead.safeParse(widened).success, name).toBe(true);
    }
    const future = altered(view, copy => { for (const [, change] of unknowns) change(copy); });
    expect(runShotsRead.parse(future)).toEqual(future);
    // The unplanned member is read as openly.
    const unplannedFuture = { ...unsupported, line: "podcast", editable: { ...unsupported.editable, state: "retired" } };
    expect(runShots.safeParse(unplannedFuture).success).toBe(false);
    expect(runShotsRead.safeParse(unplannedFuture).success).toBe(true);

    const extraWord = altered(view, copy => { copy.narration.words[0]!.confidence = 0.9; });
    expect(runShots.safeParse(extraWord).success).toBe(true);
    expect(runShotsRead.safeParse(extraWord).success).toBe(true);

    const document = identityEditDocument(view);
    expect(editDocument.safeParse(document).success).toBe(true);
    expect(editDocument.safeParse({ ...document, captions: false }).success).toBe(false);
    expect(editDocument.safeParse({ ...document, timebase: { fps: 25, drop_frame: false } }).success).toBe(false);
  });

  it("the public barrels export `shotId` and no other name of `edit-primitives.ts`; no product module of core names a fixture, and the build leaves the fixtures out", () => {
    expect(Object.keys(primitives).sort()).toEqual(["frame", "frameCount", "shotId", "text"]);
    for (const barrel of [editBarrel, coreBarrel]) expect(Object.keys(primitives).filter(name => name in barrel)).toEqual(["shotId"]);
    expect(editBarrel.shotId).toBe(primitives.shotId);

    const src = new URL("./", import.meta.url);
    const product = readdirSync(src).filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts"));
    expect(product).toContain("edit-faceless.ts");
    for (const name of product) expect(readFileSync(new URL(name, src), "utf8").includes("__fixtures__"), name).toBe(false);
    const build = JSON.parse(readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8")) as { exclude: string[] };
    expect(build.exclude).toContain("src/__fixtures__/**");
  });

  it("the path of a run's shots encodes the run id it is given", () => {
    expect(runShotsPath("run_a1")).toBe("/v1/runs/run_a1/shots");
    expect(runShotsPath("run_a/../b c")).toBe("/v1/runs/run_a%2F..%2Fb%20c/shots");
  });
});
