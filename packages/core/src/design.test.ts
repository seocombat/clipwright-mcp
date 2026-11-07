import { describe, expect, it } from "vitest";
import { CAPTION_ACCENT_GROUND, design, DESIGN_LOOK_IDS, DESIGN_LOOKS, DESIGN_MIN_CONTRAST, designPaletteRefusals, hexToHsl, readableShade,
  resolveDesign } from "./design.js";
import { contrastRatio } from "./templates/theme.js";

describe("design DNA (#1122)", () => {
  it("every look of ours reads at 4.5:1 and keeps out of hues 230–335", () => {
    for (const id of DESIGN_LOOK_IDS) {
      const { palette } = DESIGN_LOOKS[id];
      expect({ id, refusals: designPaletteRefusals(palette) }).toEqual({ id, refusals: [] });
      for (const color of Object.values(palette)) {
        const { h, s } = hexToHsl(color);
        expect({ id, color, purple: s >= 0.15 && h >= 230 && h <= 335 }).toEqual({ id, color, purple: false });
      }
    }
  });

  /** Mutant (Codex r2): take the accent as the caption highlight as it is, and ocean_teal's highlight reads 3.6:1 on the black stroke. */
  it("derives, for every look, accent text that reads on its cards and a caption highlight that reads on black", () => {
    for (const id of DESIGN_LOOK_IDS) {
      const { palette } = resolveDesign({ look: id });
      expect({ id, text: contrastRatio(palette.accent_text, palette.surface) >= DESIGN_MIN_CONTRAST,
        caption: contrastRatio(palette.caption_accent, CAPTION_ACCENT_GROUND) >= DESIGN_MIN_CONTRAST }).toEqual({ id, text: true, caption: true });
    }
    expect(contrastRatio(DESIGN_LOOKS.ocean_teal.palette.accent, CAPTION_ACCENT_GROUND)).toBeLessThan(DESIGN_MIN_CONTRAST);
  });

  it("no two looks share an accent: there is no house palette", () => {
    expect(new Set(DESIGN_LOOK_IDS.map(id => DESIGN_LOOKS[id].palette.accent)).size).toBe(DESIGN_LOOK_IDS.length);
  });

  it("takes a customer's purple brand as given", () => {
    const parsed = design.safeParse({ palette: { background: "#F5F0FF", surface: "#FFFFFF", ink: "#1B1033", accent: "#7C3AED", accent_ink: "#FFFFFF" } });
    expect(parsed.success).toBe(true);
    expect(resolveDesign(parsed.data!).palette.accent).toBe("#7C3AED");
  });

  it("refuses unreadable text on its fill and names the nearest readable shade", () => {
    const parsed = design.safeParse({ palette: { background: "#FFFFFF", surface: "#FFFFFF", ink: "#9CA3AF", accent: "#FFD400", accent_ink: "#FFFFFF" } });
    expect(parsed.success).toBe(false);
    const messages = parsed.error!.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatch(/^palette\.ink: ink #9CA3AF reaches 2\.\d\d:1 on surface #FFFFFF, under 4\.5:1; #[0-9A-F]{6} is the nearest readable shade$/);
    expect(messages[2]).toMatch(/^palette\.accent_ink: /);
    const fix = /(#[0-9A-F]{6}) is the nearest/.exec(messages[0]!)![1]!;
    expect(contrastRatio(fix, "#FFFFFF")).toBeGreaterThanOrEqual(DESIGN_MIN_CONTRAST);
    expect(hexToHsl(fix).h).toBeCloseTo(hexToHsl("#9CA3AF").h, -1);
  });

  /** Mutant (Codex r1): check the text against the cards twice, and text the colour of the page passes. */
  it("refuses text the colour of the page even when it reads on the cards", () => {
    const parsed = design.safeParse({ palette: { background: "#111111", surface: "#FFFFFF", ink: "#111111", accent: "#C62D23", accent_ink: "#FFFFFF" } });
    expect(parsed.error?.issues.map(issue => `${issue.path.join(".")}: ${issue.message.split(",")[0]}`))
      .toEqual(["palette.ink: ink #111111 reaches 1.00:1 on background #111111"]);
  });

  it("finds one shade that reads on every ground it is asked for", () => {
    const shade = readableShade("#555555", ["#FFFFFF", "#AAAAAA"]);
    expect(Math.min(contrastRatio(shade, "#FFFFFF"), contrastRatio(shade, "#AAAAAA"))).toBeGreaterThanOrEqual(DESIGN_MIN_CONTRAST);
  });

  it("needs a look or a palette", () => {
    expect(design.safeParse({ radius: "pill" }).success).toBe(false);
    expect(design.safeParse({ look: "sunny_pop", radius: "square" }).success).toBe(true);
  });

  it("derives accent text and caption accent that read, keeping the accent itself", () => {
    const resolved = resolveDesign({ look: "sunset_coral" });
    expect(resolved.palette.accent).toBe("#FF6B4A");
    expect(contrastRatio(resolved.palette.accent_text, resolved.palette.surface)).toBeGreaterThanOrEqual(DESIGN_MIN_CONTRAST);
    expect(contrastRatio(resolved.palette.caption_accent, CAPTION_ACCENT_GROUND)).toBeGreaterThanOrEqual(DESIGN_MIN_CONTRAST);
    expect({ fonts: resolved.fonts, radius: resolved.radius, motion: resolved.motion })
      .toEqual({ fonts: { display: "Montserrat", body: "Inter" }, radius: "pill", motion: "punchy" });
  });

  it("lets the customer's fields override a look", () => {
    const resolved = resolveDesign({ look: "midnight_gold", radius: "square", fonts: { display: "Oswald" } });
    expect([resolved.radius, resolved.fonts.display, resolved.fonts.body, resolved.motion]).toEqual(["square", "Oswald", "Inter", "premium"]);
  });

  it("keeps a readable colour as it is", () => {
    expect(readableShade("#111111", "#FFFFFF")).toBe("#111111");
  });
});
