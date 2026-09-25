import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCutStyle } from "./faceless-cut-style.js";

const style = JSON.parse(readFileSync(new URL("./fixtures/cut-style-profile-v1.json", import.meta.url), "utf8"));
const clone = () => structuredClone(style);
const emptyOffsets = { p25: null, p50: null, p75: null, n: 0 };

function measuredStyle() {
  const candidate = clone();
  candidate.sources[0].aligned_cuts = 3;
  candidate.speech_rules_available = true;
  candidate.speech = {
    n: 2, unknown: 1,
    class_counts: { word: 2 },
    offset_frames: {
      sentence: { ...emptyOffsets }, phrase: { ...emptyOffsets }, pause: { ...emptyOffsets },
      word: { p25: -1, p50: -1, p75: 0, n: 2 }, mid_word: { ...emptyOffsets },
    },
  };
  return candidate;
}

describe("parseCutStyle", () => {
  it("accepts the analyzer's exact aggregate shape without original speech", () => {
    const parsed = parseCutStyle(style);
    expect(parsed.fps).toBe(25);
    expect(parsed.speech_rules_available).toBe(false);
    expect(parsed.speech).toBeNull();
    expect(parsed.sources[0]?.image_shots).toBe(51);
    expect(parsed.motion.pan_travel_n).toBe(51);
    expect(parsed.opening_video.n).toBe(1);
    expect(parsed.captions.changes_per_sec.n).toBe(1);
  });

  it.each([
    ["schema", (p: any) => { p.schema = "wrong"; }],
    ["fps", (p: any) => { p.fps = 30; }],
    ["empty global pace", (p: any) => { p.pacing.global_image_frames.n = 0; }],
    ["nonfinite quantile", (p: any) => { p.pacing.global_image_frames.p50 = Infinity; }],
    ["unordered quantile", (p: any) => { p.pacing.global_image_frames.p25 = 100; }],
    ["fractional frame", (p: any) => { p.pacing.global_image_frames.p25 = 43.5; }],
    ["unknown root field", (p: any) => { p.reference_text = "source words"; }],
    ["raw cut timeline", (p: any) => { p.sources[0].cut_frames = [93, 162]; }],
    ["raw reference timestamps", (p: any) => { p.pacing.cut_timestamps = [3.72]; }],
    ["unknown phase field", (p: any) => { p.pacing.by_phase.start_sec = { p25: 1, p50: 1, p75: 1, n: 1 }; }],
    ["unproven speech", (p: any) => { p.speech_rules_available = true; p.speech = { n: 0 }; }],
  ])("rejects %s", (_label, mutate) => {
    const candidate = clone();
    mutate(candidate);
    expect(() => parseCutStyle(candidate)).toThrow();
  });

  it("accepts a phase bucket without samples", () => {
    const candidate = clone();
    candidate.pacing.by_phase.setup = { p25: null, p50: null, p75: null, n: 0 };
    expect(parseCutStyle(candidate).pacing.by_phase.setup?.n).toBe(0);
  });

  it("accepts exporter-shaped measured speech with five offset buckets and reconciled cuts", () => {
    const candidate = measuredStyle();
    expect(parseCutStyle(candidate).speech?.n).toBe(2);
    candidate.sources.push({ sha256: "b".repeat(64), reviewed_shots: 4, image_shots: 4, aligned_cuts: 2 });
    candidate.speech.unknown = 3;
    expect(parseCutStyle(candidate).speech?.unknown).toBe(3);
  });

  it("rejects measured speech when known plus unknown cuts differ from aligned cuts", () => {
    const candidate = measuredStyle();
    candidate.speech.unknown = 0;
    expect(() => parseCutStyle(candidate)).toThrow();
  });

  it("rejects positive known speech with zero aligned cuts", () => {
    const candidate = measuredStyle();
    candidate.sources[0].aligned_cuts = 0;
    expect(() => parseCutStyle(candidate)).toThrow();
  });

  it("rejects a measured-speech offset record missing an exporter class", () => {
    const candidate = measuredStyle();
    delete candidate.speech.offset_frames.pause;
    expect(() => parseCutStyle(candidate)).toThrow();
  });

  it("accepts no speech rule with zero or unknown-only aligned cuts", () => {
    const candidate = clone();
    expect(parseCutStyle(candidate).speech).toBeNull();
    candidate.sources[0].aligned_cuts = 2;
    expect(parseCutStyle(candidate).speech_rules_available).toBe(false);
  });
});

it.each([0, 1, 3])('rejects three cuts with %s reviewed shots', reviewed => {
 const p = measuredStyle(); p.sources[0].reviewed_shots = reviewed; p.sources[0].image_shots = reviewed;
 expect(() => parseCutStyle(p)).toThrow();
});
it('preserves 52 reviewed shots and 51 cuts', () => {
 const p = clone(); p.sources[0].aligned_cuts = 51;
 expect(parseCutStyle(p).sources[0]?.reviewed_shots).toBe(52);
});
