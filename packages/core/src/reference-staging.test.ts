import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { faceRelativeRect, REFERENCE_PROFILE_VERSION, referenceProfileInput as referenceProfile, referenceStaging, thinStagingRects } from "./index.js";

// The hand-measured S4c scene spec, converted once (#914 D1a, C1); the phone rises straight up (D1 §3.2), not from the lower right.
const GANESH = JSON.parse(readFileSync(new URL("./__fixtures__/ganesh-staging.json", import.meta.url), "utf8"));

const beat = (start: number, end: number, graphics: unknown[] = []) => ({ start_frac: start / 72, end_frac: end / 72, start_s: start, end_s: end,
  role: "proof", spoken_summary: "", graphics, camera: "static", transition_in: "cut", sounds: [], presenter_behaviour: "listening" });
const phone = { kind: "phone_call", source_kind: "phone_call", position: "top_right", state_changes: [], label_hint: "" };
const profile = (staging?: unknown) => ({
  version: REFERENCE_PROFILE_VERSION,
  source: { digest: `sha256:${"a".repeat(64)}`, duration_s: 72, width: 1080, height: 1920 },
  format: "talking_head_graphics",
  beats: [beat(0, 3.9), beat(3.9, 25.9), beat(25.9, 43.5, [phone]), beat(43.5, 72)],
  captions: { present: true, words_per_caption_max: 3, position: "lower", emphasis_style: "pill", hidden_under_graphics: true },
  pacing: { layer_change_every_s: 2.5, face_share: 0.83 }, palette: [], music: "none", unmapped: [],
  analysis: { models: ["gemini-3.8-flash", "scribe_v2"], latency_ms: 41_000 },
  ...(staging === undefined ? {} : { staging }),
});
const issues = (value: unknown) => referenceProfile.safeParse(value).error?.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`) ?? [];
const copy = () => structuredClone(GANESH);

describe("reference staging (#914 D1a, C1)", () => {
  it("parses the converted Ganesh scene spec, and a v1 profile without staging", () => {
    expect(issues(profile(GANESH))).toEqual([]);
    expect(issues(profile())).toEqual([]);
    expect(referenceStaging.parse(GANESH).elements[0]!.entry).toMatchObject({ style: "slide", from: "bottom", anchors: [{ id: "freeze_start#1" }] });
  });

  /** Mutant (Codex 930-s2 r1): lower the element cap to 39, and the analysis keeping the 40 it promises fails to parse. */
  it("holds 40 elements and refuses 41", () => {
    const of = (count: number) => ({ ...GANESH, elements: Array.from({ length: count }, (_, at) => ({ ...GANESH.elements[0], id: `e${at + 1}` })) });
    expect([referenceStaging.safeParse(of(40)).success, referenceStaging.safeParse(of(41)).success]).toEqual([true, false]);
  });

  /** Mutant: drop the anchor lookup, and an element names a freeze that no list holds, which the compiler would place at zero. */
  it("refuses an anchor id that staging.anchors does not hold, and a malformed one", () => {
    const missing = copy();
    missing.elements[0].entry.anchors[0].id = "freeze_start#2";
    expect(issues(profile(missing))).toEqual(["staging.elements.0.entry.anchors.0.id: freeze_start#2 is not in staging.anchors"]);
    const malformed = copy();
    malformed.elements[0].exit.anchors[0].id = "nearest_flash";
    expect(issues(profile(malformed))).toContainEqual(expect.stringMatching(/^staging\.elements\.0\.exit\.anchors\.0\.id: Invalid string/));
  });

  /** Mutant: drop the beat check, and an element links a graphic that is not there. */
  it("refuses a beat or graphic index the profile does not have", () => {
    const beatPast = copy();
    beatPast.elements[0].beat_index = 4;
    expect(issues(profile(beatPast))).toEqual(["staging.elements.0.beat_index: there are 4 beats"]);
    const graphicPast = copy();
    graphicPast.elements[0].graphic_index = 1;
    expect(issues(profile(graphicPast))).toEqual(["staging.elements.0.graphic_index: beat 2 has 1 graphics"]);
    const unlinked = copy();
    unlinked.elements[0].graphic_index = null;
    expect(issues(profile(unlinked))).toEqual([]);
  });

  /** Mutant: compare first_visible with last_visible only, and a settle before the first frame passes. */
  it("refuses inverted times and times past the source", () => {
    const inverted = copy();
    inverted.elements[0].entry.settled_s = 25.0;
    expect(issues(profile(inverted))).toEqual(["staging.elements.0.entry.settled_s: comes before entry.first_visible_s"]);
    const late = copy();
    late.elements[0].exit.last_visible_s = 26.5;
    expect(issues(profile(late))).toEqual(["staging.elements.0.exit.last_visible_s: comes before entry.settled_s"]);
    const past = copy();
    past.freezes[0].end_s = 80;
    expect(issues(profile(past))).toEqual(["staging.freezes.0.end_s: lies past the source's 72 s"]);
    const backwards = copy();
    backwards.freezes[0].end_s = 20;
    expect(issues(profile(backwards))).toEqual(["staging.freezes.0.end_s: ends where or before the freeze starts"]);
  });

  /** Codex r1: a single settled-frame cover hid a face covered mid-life; the layer carries the max over the life and the share of frames covered. */
  it("reports face overlap as max and share over the life, not one frame", () => {
    expect(GANESH.elements[0].layer).toMatchObject({ face_core_cover_max: 0, face_covered_share: 0, face_clear: true });
    const single = copy();
    single.elements[0].layer = { ...single.elements[0].layer, face_core_cover: 0 };
    delete single.elements[0].layer.face_core_cover_max;
    expect(issues(profile(single))).toEqual([expect.stringMatching(/^staging\.elements\.0\.layer: /)]);
  });

  it("keeps the reference's words out: an unknown style or cover refuses", () => {
    const style = copy();
    style.elements[0].entry.style = "rises gracefully from behind her hair";
    expect(issues(profile(style))).toEqual([expect.stringMatching(/^staging\.elements\.0\.entry\.style: /)]);
    const extra = copy();
    extra.elements[0].label = "Hold This Call?";
    expect(issues(profile(extra)).length).toBe(1);
  });
});

describe("staging geometry helpers", () => {
  /** Mutant: scale x by the face width, and the phone's offset from the face changes with the face's aspect, not its size. */
  it("puts a rect in face units: origin the face centre, unit its height in pixels", () => {
    const face = { left: 0.326, top: 0.254, width: 0.261, height: 0.188 };
    const rel = faceRelativeRect({ left: 0.55, top: 0.1, width: 0.38, height: 0.42 }, face, 1080, 1920);
    expect(rel).toEqual({ left: 0.2798, top: -1.3191, width: 1.137, height: 2.234 });
    expect(GANESH.elements[0].rect_hold_face).toEqual(rel);
  });

  it("thins samples to change points and keeps the last", () => {
    const at = (t_s: number, left: number) => ({ t_s, rect: { left, top: 0.1, width: 0.3, height: 0.4 } });
    expect(thinStagingRects([at(0, 0.5), at(0.2, 0.501), at(0.4, 0.51), at(0.6, 0.511)]).map(sample => sample.t_s)).toEqual([0, 0.4, 0.6]);
    expect(thinStagingRects(Array.from({ length: 100 }, (_, index) => at(index, index / 200)), 0.003, 60)).toHaveLength(60);
  });

  /** Mutant (#1051 S4): ignore `pinned`, and an entry's even samples thin to its change points, or spread away past the cap. */
  it("keeps every pinned entry sample, and spreads only the rest past the cap", () => {
    const at = (t_s: number, left: number) => ({ t_s, rect: { left, top: 0.1, width: 0.3, height: 0.4 } });
    const entry = [at(0, 0.5), at(0.2, 0.5), at(0.4, 0.5)], pinned = new Set(entry), hold = Array.from({ length: 80 }, (_, i) => at(1 + i, i / 100));
    expect(thinStagingRects(entry, 0.003, 60, sample => pinned.has(sample)).map(sample => sample.t_s)).toEqual([0, 0.2, 0.4]);
    const kept = thinStagingRects([...entry, ...hold], 0.003, 20, sample => pinned.has(sample));
    expect(kept).toHaveLength(20);
    expect(kept.slice(0, 3)).toEqual(entry);
    expect(kept.at(-1)).toBe(hold.at(-1));
  });
});

describe("flash lights (#1051 S4)", () => {
  const flash = { id: "flash#1", t_s: 43.4, length_s: 0.533, strength: 0.96, tint: "warm", color: "#FF9F76" };

  it("parses a staging with and without flashes", () => {
    expect(issues(profile({ ...GANESH, flashes: [flash] }))).toEqual([]);
    expect(referenceStaging.parse(GANESH).flashes).toBeUndefined();
  });

  /** Mutant: drop the anchor lookup, and a measured light names a flash the anchors do not hold. */
  it("refuses a flash that is not an anchor, measured twice, or lit past the source", () => {
    const staged = (flashes: unknown[]) => profile({ ...GANESH, flashes });
    expect(issues(staged([{ ...flash, id: "flash#2" }]))).toEqual(["staging.flashes.0.id: flash#2 is not in staging.anchors"]);
    expect(issues(staged([flash, flash]))).toEqual(["staging.flashes.1.id: flash#1 is measured twice"]);
    expect(issues(staged([{ ...flash, t_s: 71.8, length_s: 0.5 }]))).toEqual(["staging.flashes.0.length_s: lies past the source's 72 s"]);
    expect(issues(staged([{ ...flash, tint: "orange" }]))[0]).toMatch(/^staging\.flashes\.0\.tint: /);
  });
});
