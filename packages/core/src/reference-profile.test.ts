import { describe, expect, it } from "vitest";
import { mapAnalyserGraphic, REFERENCE_PROFILE_VERSION, referenceProfile } from "./index.js";

const beat = (start: number, end: number, extra: Record<string, unknown> = {}) => ({
  start_frac: start / 72, end_frac: end / 72, start_s: start, end_s: end, role: "demo", spoken_summary: "she answers calls", graphics: [],
  camera: "static", transition_in: "cut", sounds: [], presenter_behaviour: "speaking", ...extra,
});

/** A profile shaped like the reference reel's: a toggle checklist, the recorded call the presenter listens to, particles we cannot draw. */
const profile = () => ({
  version: REFERENCE_PROFILE_VERSION,
  source: { digest: `sha256:${"a".repeat(64)}`, duration_s: 72, width: 1080, height: 1920 },
  format: "talking_head_graphics",
  beats: [
    beat(0, 3.9, { role: "hook", transition_in: "none", graphics: [{ kind: "particles", source_kind: "particles", position: "full_screen",
      state_changes: [{ at_frac: 0.25, change: "highlighted" }], label_hint: "" }], sounds: [{ at_frac: 0.25, kind: "whoosh" }] }),
    beat(17.9, 23.7, { graphics: [{ kind: "checklist", source_kind: "toggle_checklist", position: "bottom", label_hint: "answers calls | works 24/7",
      state_changes: [{ at_frac: 0.05, change: "toggles_on" }, { at_frac: 0.28, change: "toggles_on" }, { at_frac: 0.76, change: "toggles_off" }] }],
      sounds: [{ at_frac: 0.17, kind: "toggle" }] }),
    beat(26, 43.5, { role: "proof", presenter_behaviour: "listening", sounds: [{ at_frac: 0, kind: "recorded_audio" }] }),
  ],
  captions: { present: true, words_per_caption_max: 3, position: "lower", emphasis_style: "pill", hidden_under_graphics: true },
  pacing: { layer_change_every_s: 2.5, face_share: 0.83 },
  palette: ["#4F46E5", "#10B981"],
  music: "upbeat lo-fi bed under the voice",
  unmapped: [{ what: "falling dollar-bill particles", beat_index: 0, suggested_substitute: "a stat on the same words" }],
  analysis: { models: ["gemini-3.8-flash", "scribe_v2"], cost_usd: 0.07, latency_ms: 41_000 },
});
const issues = (value: unknown) => referenceProfile.safeParse(value).error?.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`) ?? [];

describe("reference profile (reference-to-video S1)", () => {
  it("accepts a realistic profile", () => {
    expect(issues(profile())).toEqual([]);
  });

  /** Mutant: drop the order check, and two beats claim the same seconds of the reference. */
  it("refuses overlapping and unordered beats", () => {
    const overlapping = profile();
    overlapping.beats[1] = beat(3, 23.7);
    expect(issues(overlapping)).toEqual([expect.stringMatching(/^beats\.1\.start_frac: .*overlaps/)]);
    const reversed = profile();
    reversed.beats = [reversed.beats[1]!, reversed.beats[0]!, reversed.beats[2]!];
    expect(issues(reversed).length).toBeGreaterThan(0);
    expect(issues({ ...profile(), unmapped: [], beats: [beat(5, 5)] })).toEqual([expect.stringMatching(/^beats\.0\.end_frac: /)]);
  });

  it("refuses fractions outside 0..1 and evidence past the source", () => {
    const out = profile();
    out.beats[0] = { ...beat(0, 3.9), start_frac: -0.1 };
    out.beats[2] = { ...beat(26, 43.5), end_frac: 1.2 };
    expect(issues(out).map(issue => issue.split(":")[0])).toEqual(["beats.0.start_frac", "beats.2.end_frac"]);
    const state = profile();
    (state.beats[1]!.graphics as { state_changes: { at_frac: number }[] }[])[0]!.state_changes[0]!.at_frac = 1.5;
    expect(issues(state)).toEqual([expect.stringMatching(/^beats\.1\.graphics\.0\.state_changes\.0\.at_frac: /)]);
    expect(issues({ ...profile(), unmapped: [], beats: [{ ...beat(60, 80), end_frac: 1 }] })).toEqual([expect.stringMatching(/^beats\.0\.end_s: .*72/)]);
  });

  /** Mutant: take change and source_kind as text, and a quote from the reference is stored in the profile. */
  it("refuses a state change or source kind outside the closed sets", () => {
    const freeChange = profile();
    (freeChange.beats[1]!.graphics as { state_changes: { change: string }[] }[])[0]!.state_changes[0]!.change = 'title changes to "ACME never sleeps"';
    expect(issues(freeChange)).toEqual([expect.stringMatching(/^beats\.1\.graphics\.0\.state_changes\.0\.change: /)]);
    const freeKind = profile();
    (freeKind.beats[1]!.graphics as { source_kind: string }[])[0]!.source_kind = "ACME never sleeps";
    expect(issues(freeKind)).toEqual([expect.stringMatching(/^beats\.1\.graphics\.0\.source_kind: /)]);
  });

  it("refuses unknown fields at the top and inside", () => {
    expect(issues({ ...profile(), transcript: "every word" })).toEqual([expect.stringMatching(/^: Unrecognized key/)]);
    const nested = profile();
    (nested.beats[0] as Record<string, unknown>).spoken_text = "the reference's words";
    expect(issues(nested)).toEqual([expect.stringMatching(/^beats\.0: Unrecognized key/)]);
  });

  /** Mutant: lift the cap, and the reference's transcript travels in the profile verbatim. */
  it("keeps a beat's summary to 200 characters", () => {
    const long = profile();
    long.beats[2] = beat(26, 43.5, { spoken_summary: "word ".repeat(41) });
    expect(issues(long)).toEqual([expect.stringMatching(/^beats\.2\.spoken_summary: /)]);
  });

  /** Mutant: drop the check, and a graphic we cannot draw leaves the profile with no substitute (rule 3). */
  it("refuses a particles or unmapped graphic with no unmapped entry on its beat", () => {
    const silent = profile();
    silent.unmapped = [];
    expect(issues(silent)).toEqual([expect.stringMatching(/^beats\.0\.graphics\.0\.kind: .*unmapped/)]);
    const elsewhere = profile();
    elsewhere.unmapped = [{ ...elsewhere.unmapped[0]!, beat_index: 1 }];
    expect(issues(elsewhere)).toEqual([expect.stringMatching(/^beats\.0\.graphics\.0\.kind: /)]);
    expect(issues({ ...profile(), unmapped: [...profile().unmapped, { what: "x", beat_index: 3, suggested_substitute: "y" }] }))
      .toEqual([expect.stringMatching(/^unmapped\.1\.beat_index: /)]);
  });

  it("maps the analyser's vocabulary to ours, and names a substitute for what we cannot draw", () => {
    const kinds = (kind: string, position?: Parameters<typeof mapAnalyserGraphic>[1]) => mapAnalyserGraphic(kind, position).kind;
    expect(["toggle_checklist", "phone_call", "notification", "before_after_split", "title_card", "end_card", "split_screen", "stat"].map(kind => kinds(kind)))
      .toEqual(["checklist", "phone_call", "notification", "compare", "title_card", "end_card", "layout_split", "stat"]);
    expect([kinds("product_ui", "full_screen"), kinds("screenshot", "full_screen"), kinds("product_ui", "top_right"), kinds("screenshot")])
      .toEqual(["insert_media", "insert_media", "overlay_media", "overlay_media"]);
    expect(mapAnalyserGraphic("toggle_checklist").unmapped).toBeUndefined();
    const particles = mapAnalyserGraphic("particles"), other = mapAnalyserGraphic("other"), odd = mapAnalyserGraphic("hologram");
    expect([particles.kind, other.kind, odd.kind]).toEqual(["particles", "unmapped", "unmapped"]);
    for (const mapped of [particles, other, odd]) expect(mapped.unmapped?.length).toBeGreaterThan(0);
  });
});
