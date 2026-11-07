import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dispositionWarnings } from "./contract-dispositions.js";
import { design, resolveDesign } from "./design.js";
import { facelessMotionStyleWarnings, makeFacelessInput } from "./faceless-public.js";
import { baseMotionStyle, MOTION_STYLE_IDS, MOTION_STYLE_UNUSED_WARNING, motionStyleRefusals } from "./motion-styles.js";
import { derivedRunWarnings } from "./run-static-warnings.js";
import { makeUgcInput } from "./skills.js";
import { compileReferenceRemake, type CapabilityProfile } from "./workflows/index.js";

// #1123: one motion_style object on make_ugc, make_faceless and the remake; a style is part of the design DNA, and the run's own wins.

const SCRIPT = "Every missed call is a lost deal. Your receptionist sleeps, takes breaks, and sometimes gets annoyed. This one does not.";
const ugc = (extra: Record<string, unknown>) => makeUgcInput.safeParse({ script: SCRIPT, ...extra });
const messages = (result: { error?: { issues: { message: string }[] } | undefined }) => (result.error?.issues ?? []).map(issue => issue.message).join(" | ");

describe("motion_style on make_ugc", () => {
  it("takes a style for the whole video, and spans on the script's words", () => {
    expect(ugc({ motion_style: { style: "line_boil" } }).success).toBe(true);
    expect(ugc({ motion_style: { style: "sketchbook", spans: [{ style: "comic", anchor: { quote: "This one does not" } }] } }).success).toBe(true);
    expect(ugc({ motion_style: { spans: [{ style: "film", anchor: { startWord: 0, endWord: 3 } }] } }).success).toBe(true);
  });

  // Mutants: a span that names no words, two spans on one word, a span in the video's own style, a span without a script.
  it("refuses spans it cannot draw, before any money", () => {
    expect(messages(ugc({ motion_style: { spans: [{ style: "film", anchor: { quote: "not in the script" } }] } }))).toContain("does not occur in script");
    expect(messages(ugc({ motion_style: { spans: [{ style: "film", anchor: { startWord: 0, endWord: 4 } },
      { style: "pixel", anchor: { startWord: 3, endWord: 6 } }] } }))).toContain("spans may not share words");
    expect(messages(ugc({ motion_style: { style: "clay", spans: [{ style: "clay", anchor: { startWord: 0, endWord: 2 } }] } })))
      .toContain("the video's own style clay");
    // A plain video's span in plain changes nothing.
    expect(messages(ugc({ motion_style: { spans: [{ style: "plain", anchor: { startWord: 0, endWord: 2 } }] } }))).toContain("own style plain");
    expect(motionStyleRefusals({ segments: [], motion_style: { spans: [{ style: "film", anchor: { startWord: 0, endWord: 1 } }] } })[0]!.message)
      .toContain("pass script");
    expect(messages(ugc({ motion_style: {} }))).toContain("motion_style needs style or spans");
    expect(ugc({ motion_style: { style: "watercolour" } }).success).toBe(false);
  });

  it("names every style the composition draws", () => {
    expect([...MOTION_STYLE_IDS]).toEqual(["line_boil", "sketchbook", "paper_cutout", "fabric", "pixel", "comic", "zine", "film", "glass", "clay", "engraving"]);
  });

  // Mutant: the design's style winning over the run's own, or lost on the way to the drawers.
  it("draws the run's style over the design's, and the design's over plain", () => {
    expect(baseMotionStyle({ motion_style: { style: "pixel" }, design: { style: "film" } })).toBe("pixel");
    expect(baseMotionStyle({ design: { style: "film" } })).toBe("film");
    expect(baseMotionStyle({})).toBe("plain");
    expect(resolveDesign(design.parse({ look: "fresh_mint", style: "clay" })).style).toBe("clay");
    expect(resolveDesign(design.parse({ look: "fresh_mint" })).style).toBeUndefined();
    // A span against the design's style is judged against that style.
    expect(messages(ugc({ design: { look: "fresh_mint", style: "zine" }, motion_style: { spans: [{ style: "zine", anchor: { startWord: 0, endWord: 2 } }] } })))
      .toContain("own style zine");
  });

  // Mutant: a style with nothing to dress accepted silently (rule 3), or a kit's style named as the call's.
  it("says a style draws nothing on a video with no captions, templates or scenes", () => {
    const base = { script: SCRIPT, motion_style: { style: "comic" } };
    expect(dispositionWarnings(base)).toContain(MOTION_STYLE_UNUSED_WARNING);
    expect(dispositionWarnings({ ...base, captions: true })).not.toContain(MOTION_STYLE_UNUSED_WARNING);
    expect(dispositionWarnings({ script: SCRIPT, design: { look: "fresh_mint", style: "comic" }, design_source: "brand_kit" })).not.toContain(MOTION_STYLE_UNUSED_WARNING);
    expect(dispositionWarnings({ script: SCRIPT, motion_style: { style: "plain" } })).not.toContain(MOTION_STYLE_UNUSED_WARNING);
  });
});

describe("motion_style on make_faceless", () => {
  const faceless = (extra: Record<string, unknown>) => makeFacelessInput.safeParse({ duration_seconds: 30, ...extra });
  it("takes spans on a script's words and only a style on a brief", () => {
    expect(faceless({ input_mode: "script", script: SCRIPT, motion_style: { style: "engraving",
      spans: [{ style: "glass", anchor: { quote: "This one does not" } }] } }).success).toBe(true);
    expect(faceless({ input_mode: "brief", brief: "a receptionist that never sleeps", motion_style: { style: "film" } }).success).toBe(true);
    expect(messages(faceless({ input_mode: "brief", brief: "a receptionist", motion_style: { spans: [{ style: "film", anchor: { startWord: 0, endWord: 1 } }] } })))
      .toContain("a brief takes style only");
    expect(messages(faceless({ input_mode: "script", script: SCRIPT, motion_style: { spans: [{ style: "film", anchor: { quote: "nowhere" } }] } })))
      .toContain("does not occur in script");
  });

  it("names a style with nothing to dress only when captions are off and nothing is drawn", () => {
    expect(facelessMotionStyleWarnings({ motion_style: { style: "pixel" } })).toEqual([]);
    expect(facelessMotionStyleWarnings({ motion_style: { style: "pixel" }, captions: false })).toEqual([MOTION_STYLE_UNUSED_WARNING]);
    expect(facelessMotionStyleWarnings({ motion_style: { style: "pixel" }, captions: false, templates: [{}] })).toEqual([]);
  });

  // Mutant (Codex r1): the run reading its stored input without the style line the quote said.
  it("names it on the run as the quote does, from the stored input", () => {
    const stored = { input_mode: "script", script: SCRIPT, duration_seconds: 30, captions: false, motion_style: { style: "pixel" } };
    expect(derivedRunWarnings(stored, {}, "make_faceless", () => undefined)).toContain(MOTION_STYLE_UNUSED_WARNING);
    expect(derivedRunWarnings({ ...stored, captions: true }, {}, "make_faceless", () => undefined)).not.toContain(MOTION_STYLE_UNUSED_WARNING);
  });
});

describe("motion_style in a reference remake", () => {
  const PROFILE = JSON.parse(readFileSync(new URL("./fixtures/reference-profile-reel.json", import.meta.url), "utf8"));
  const capabilities = (motion?: "implemented" | "rejected"): CapabilityProfile => ({ v: 1, content_digest: "c".repeat(64), executors: [{ skill: "make_ugc",
    configured: true, qualified: true, enabled: true, profiles: ["ugc-native-v1"], features: ["exact_script", "actor", "voice"],
    formats: [{ aspect_ratio: "9:16", resolution: "1080p" }],
    field_dispositions: { captions: "implemented", caption_style: "implemented", templates: "implemented", ...(motion ? { motion_style: motion } : {}) } }] });
  const plan = (motion?: "implemented" | "rejected") => {
    const result = compileReferenceRemake({ reference_profile: PROFILE, script: SCRIPT, actor_id: "actor_marcus", voice: "sarah",
      motion_style: { style: "sketchbook", spans: [{ style: "comic", anchor: { quote: "This one does not" } }] } }, capabilities(motion));
    if (result.kind !== "compiled") throw new Error(JSON.stringify(result.issues));
    const brief = result.document.brief;
    if (brief.native?.skill !== "make_ugc") throw new Error("not a make_ugc plan");
    return { input: brief.native.input as Record<string, unknown>, gaps: brief.reference_profile!.unmapped };
  };

  // Mutant: the style dropped on the way into the video, or passed to a server that would refuse it at the quote.
  it("carries the asked style into the video where the server draws it, and names it plain where it does not", () => {
    expect(plan("implemented").input.motion_style).toEqual({ style: "sketchbook", spans: [{ style: "comic", anchor: { quote: "This one does not" } }] });
    for (const motion of ["rejected", undefined] as const) {
      const { input, gaps } = plan(motion);
      expect(input.motion_style).toBeUndefined();
      expect(gaps.find(gap => gap.what === "the motion style you asked for")?.suggested_substitute).toBe("plain: motion styles are not available on this server");
    }
  });
});
