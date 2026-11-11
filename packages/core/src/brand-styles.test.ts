import { describe, expect, it } from "vitest";
import job01 from "./__fixtures__/reference-job01-profile.json" with { type: "json" };
import { brandKitWithStyles, brandStyleProposal, paletteFromReference, proposeStyleFromProfile, saveBrandStyleInput } from "./brand-styles.js";
import { DESIGN_FONTS, DESIGN_MIN_CONTRAST, designPaletteRefusals } from "./design.js";
import { createFilmDraftInput } from "./film-drafts.js";
import { referenceProfileInput as referenceProfileAnswer } from "./reference-profile.js";
import { isScenePurple } from "./scene-graph.js";
import { contrastRatio } from "./templates/theme.js";

const ANALYSIS_A = "ref_907c321d070d4ee482db9cf3bb7d78c9", ANALYSIS_B = "ref_0123456789abcdef0123456789abcdef";
const profileA = referenceProfileAnswer.parse(job01.reference_profile);
// A second reel of another look: the ana reel's palette and caption look, cut on every beat, slower.
const profileB = referenceProfileAnswer.parse({ ...job01.reference_profile, palette: ["#2EA3F2", "#000000", "#FFFFFF", "#1E65F3"],
  captions: { ...job01.reference_profile.captions, emphasis_style: "box", position: "lower" }, pacing: { layer_change_every_s: 3.2, face_share: 0.4 },
  beats: job01.reference_profile.beats.map(beat => ({ ...beat, transition_in: "cut" })) });

describe("a style proposed from a reference (#1364)", () => {
  it("two different references give two different styles: ground, accent, faces, motion and habits", () => {
    const a = proposeStyleFromProfile(profileA, { analysisId: ANALYSIS_A }), b = proposeStyleFromProfile(profileB, { analysisId: ANALYSIS_B });
    expect(a.style.design.palette).toMatchObject({ background: "#FFFFFF", accent: "#FFEA00" });
    expect(b.style.design.palette).toMatchObject({ background: "#000000", accent: "#2EA3F2", ink: "#FFFFFF" });
    expect(a.style.design.fonts).toEqual({ display: "Bebas Neue", body: "Inter" });
    expect(a.warnings.at(-1)).toMatch(/typeface is not read: Bebas Neue and Inter are picked from our faces by its pace/);
    expect(b.style.design.fonts).toEqual({ display: "Oswald", body: "Roboto" });
    expect([a.style.design.motion, b.style.design.motion]).toEqual(["punchy", "premium"]);
    expect([a.style.habits.transition, b.style.habits.transition]).toEqual(["none", "cut"]);
    expect(b.style.habits.captions).toEqual({ position: "lower", emphasis: "box" });
    expect(b.evidence.transitions).toEqual([{ transition: "cut", beats: profileB.beats.length }]);
  });

  it("is the same answer for the same profile, and its theme overrides are the proposed design", () => {
    const once = proposeStyleFromProfile(profileB, { analysisId: ANALYSIS_B, name: "cyan-night" });
    expect(proposeStyleFromProfile(profileB, { analysisId: ANALYSIS_B, name: "cyan-night" })).toEqual(once);
    expect(once.style.name).toBe("cyan-night");
    expect(once.theme_overrides).toEqual({ palette: once.style.design.palette, fonts: once.style.design.fonts });
    expect(proposeStyleFromProfile(profileA, { analysisId: ANALYSIS_A }).style.name).toBe("ref-907c321d");
  });

  it("carries the donor's mechanics only: no logo, no frames, no source link; a logo is refused on save", () => {
    const { style } = proposeStyleFromProfile(profileA, { analysisId: ANALYSIS_A });
    expect(style.design.logo_asset_id).toBeUndefined();
    expect(JSON.stringify(style)).not.toMatch(/https?:|\.jpg|\.mp4|asset_id/);
    const withLogo = saveBrandStyleInput.safeParse({ name: "x", design: { ...style.design, logo_asset_id: "ast_0123456789abcdef0123456789abcdef" } });
    expect(withLogo.success).toBe(false);
    expect(withLogo.error?.issues[0]?.path).toEqual(["design", "logo_asset_id"]);
  });

  it("moves a reference's purple out and names it; a palette the customer saves keeps their purple", () => {
    const { palette, warnings } = paletteFromReference(["#FFFFFF", "#7048E8", "#1E1E1E"]);
    expect(isScenePurple(palette.accent)).toBe(false);
    expect(warnings.join(" ")).toMatch(/purple #7048E8 became #[0-9A-F]{6}/);
    const own = { name: "mine", design: { palette: { ...palette, accent: "#7048E8", accent_ink: "#FFFFFF" } } };
    expect(saveBrandStyleInput.parse(own).design.palette?.accent).toBe("#7048E8");
  });

  it("every proposed palette reads at 4.5:1 and every face is one we bundle, whatever the reference holds", () => {
    const palettes = [[], ["#FFEA00"], ["#777777", "#808080"], ["#000000"], ["#FFFFFF", "#FFFF00", "#FFFFF0"], ["#1E1E1E", "#2B2B2B", "#E5E5E5"],
      ["#4F46E5", "#60A5FA", "#FFFFFF", "#111827", "#10B981"], ["#FF0000", "#00FF00", "#0000FF"]];
    for (const colours of palettes) {
      const { palette } = paletteFromReference(colours);
      expect(designPaletteRefusals(palette), colours.join()).toEqual([]);
      expect(contrastRatio(palette.ink, palette.surface)).toBeGreaterThanOrEqual(DESIGN_MIN_CONTRAST);
    }
    for (const emphasis of ["box", "pill", "punch", "color", "none"] as const) {
      for (const pace of [0.8, 2, 3, 6]) {
        const proposal = proposeStyleFromProfile(referenceProfileAnswer.parse({ ...job01.reference_profile, pacing: { layer_change_every_s: pace, face_share: 1 },
          captions: { ...job01.reference_profile.captions, emphasis_style: emphasis } }), { analysisId: ANALYSIS_A });
        expect(Object.keys(DESIGN_FONTS)).toContain(proposal.style.design.fonts?.display);
        expect(Object.keys(DESIGN_FONTS)).toContain(proposal.style.design.fonts?.body);
        expect(brandStyleProposal.safeParse(proposal).success).toBe(true);
      }
    }
  });

  it("the kit lists saved styles, an old answer without them reads as none; a draft names a style by its name", () => {
    const kit = { design: null, updated_at: null, looks: [], fonts: [] };
    expect(brandKitWithStyles.parse(kit).styles).toEqual([]);
    expect(createFilmDraftInput.parse({ brand_style: "cyan-night" }).brand_style).toBe("cyan-night");
    expect(createFilmDraftInput.safeParse({ brand_style: "Cyan Night" }).success).toBe(false);
  });
});
