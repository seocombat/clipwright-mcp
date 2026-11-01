import { describe, expect, it } from "vitest";
import { keyFrameSecond, mapAnalyserGraphic, mapAnalyserSourceKind, REFERENCE_PROFILE_VERSION, referenceProfileInput as referenceProfile, spanFrameSeconds } from "./index.js";

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
    expect(issues({ ...profile(), subtitles: "every word" })).toEqual([expect.stringMatching(/^: Unrecognized key/)]);
    const nested = profile();
    (nested.beats[0] as Record<string, unknown>).spoken_text = "the reference's words";
    expect(issues(nested)).toEqual([expect.stringMatching(/^beats\.0: Unrecognized key/)]);
  });

  /** Mutant: lift the cap, and a beat's summary grows into the whole transcript, which has its own field. */
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

describe("the reference's words and the graphics Argon called other (#930 S1)", () => {
  const words = [{ text: "What", start_s: 0.14, end_s: 0.26, speaker: "speaker_0" }, { text: "if", start_s: 0.32, end_s: 0.38 }];
  const spoken = () => ({ ...profile(), transcript: words, hook: { text: "What if", end_s: 0.38, caption: "ONE SIMPLE IDEA" } });

  /** Mutant: make transcript or hook required, and every analysis stored before #930 stops parsing on read. */
  it("parses a profile stored before #930, without transcript or hook, and one that has both", () => {
    const old = profile();
    expect(["transcript", "hook"].filter(key => key in old)).toEqual([]);
    expect(issues(old)).toEqual([]);
    expect(issues(spoken())).toEqual([]);
    expect(referenceProfile.parse(spoken()).transcript).toEqual(words);
  });

  /** Mutant: drop the word checks, and a transcript out of order or past the reel reaches the client as the reference's timing. */
  it("refuses a word that ends before it starts, lies past the source or comes out of order, and a hook past the source", () => {
    const at = (list: Record<string, unknown>[]) => issues({ ...spoken(), transcript: list });
    expect(at([{ text: "x", start_s: 2, end_s: 1 }])).toEqual([expect.stringMatching(/^transcript\.0\.end_s: ends before/)]);
    expect(at([{ text: "x", start_s: 71, end_s: 72.5 }])).toEqual([expect.stringMatching(/^transcript\.0\.end_s: .*72/)]);
    expect(at([words[1]!, words[0]!])).toEqual([expect.stringMatching(/^transcript\.1\.start_s: /)]);
    expect(at([{ text: "", start_s: 0, end_s: 1 }])).toEqual([expect.stringMatching(/^transcript\.0\.text: /)]);
    expect(at(Array.from({ length: 1001 }, (_, index) => ({ text: "w", start_s: index / 20, end_s: index / 20 })))).toEqual([expect.stringMatching(/^transcript: /)]);
    expect(issues({ ...spoken(), hook: { text: "", end_s: 73 } })).toEqual([expect.stringMatching(/^hook\.end_s: .*72/)]);
  });

  /** Mutant: read only the analyser's kind, or read a quoted on-screen line as the description, and the Ana reel's cards stay other or turn into logos. */
  it("names an other graphic from its description, leaving quoted on-screen text out", () => {
    expect([["other", "Blue banner 'DEVELOP THE STORY'"], ["other", "Migoo AI logo card with blue label"], ["other", "Comment input box showing 'MIGOO' and send button"],
      ["other", "Concept card showing black earbuds case with blue label"], ["other", "Card with the price $0.067 per second"], ["speech bubble", "a bubble saying hi"],
      ["other", "Blue banner 'NEW LOGO PRICING'"], ["other", "Migoo's logo on a white card"], ["product_ui", "Full-screen pricing card"], ["other", ""]]
      .map(([kind, what]) => mapAnalyserSourceKind(kind!, what))).toEqual(["banner", "logo_card", "comment_box", "concept_card", "price_card", "other", "banner",
      "logo_card", "product_ui", "other"]);
    // Codex r1: curly quotes, and an apostrophe inside the quote, still leave the quoted line out.
    expect(["Blue banner “NEW LOGO PRICING”", "Blue banner ‘NEW LOGO’", "Blue banner 'DON'T COMMENT'", "Blue banner \"DON'T COMMENT\"",
      "Blue banner ‘DON’T COMMENT’", "Migoo's logo card with 'BLUE BANNER'"].map(what => mapAnalyserSourceKind("other", what)))
      .toEqual(["banner", "banner", "banner", "banner", "banner", "logo_card"]);
  });

  /** Mutant: send the new kinds to unmapped, and a remake loses them; a comment box draws as a tag with its word to comment (owner, 30.10). */
  it("maps each new kind to a kind we draw, a comment box to a tag", () => {
    expect(["banner", "comment_box", "logo_card", "price_card"].map(kind => mapAnalyserGraphic(kind)))
      .toEqual([{ kind: "tag" }, { kind: "tag" }, { kind: "title_card" }, { kind: "stat" }]);
    expect([mapAnalyserGraphic("concept_card", "bottom").kind, mapAnalyserGraphic("concept_card", "full_screen").kind]).toEqual(["overlay_media", "insert_media"]);
    expect(mapAnalyserGraphic("toString").unmapped).toBe("a title_card with its label, or leave it out");
  });
});

/** The frame a beat or scene cites (#979): a second of the one-a-second frames, inside the span when one is, never past the reel's last frame. */
describe("frame seconds", () => {
  it("takes the second nearest the middle inside the span, else the nearest, and keeps both ends of a long span", () => {
    expect(keyFrameSecond(0, 3.9, 72)).toBe(2);
    expect(keyFrameSecond(4.2, 4.8, 72)).toBe(5);
    expect(keyFrameSecond(70.2, 72, 72)).toBe(71);
    expect(keyFrameSecond(71.5, 72.4, 72.4)).toBe(72);
    expect(spanFrameSeconds(17.9, 23.7, 72)).toEqual([18, 19, 20, 21, 22, 23]);
    expect(spanFrameSeconds(4.2, 4.8, 72)).toEqual([5]);
    const long = spanFrameSeconds(0, 60, 72);
    expect([long.length, long[0], long.at(-1)]).toEqual([12, 0, 59]);
  });

  it("refuses a beat citing a second the reel has no frame for", () => {
    const citing = (extra: Record<string, unknown>) => { const cited = profile(); return { ...cited, beats: [{ ...cited.beats[0]!, ...extra }, ...cited.beats.slice(1)] }; };
    expect(referenceProfile.safeParse(citing({ key_frame_s: 72 })).success).toBe(false);
    expect(referenceProfile.safeParse(citing({ key_frame_s: 2, frames_s: [0, 1, 2, 3] })).success).toBe(true);
  });
});
