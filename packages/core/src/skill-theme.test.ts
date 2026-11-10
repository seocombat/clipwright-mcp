import { describe, expect, it } from "vitest";
import { DESIGN_LOOKS, DESIGN_MIN_CONTRAST } from "./design.js";
import { EXPLAINER_THEME } from "./skill-theme-explainer.js";
import { parseSkillThemeRule, resolveSkillTheme, skillBrandOf, skillThemeManifest } from "./skill-theme.js";
import { contrastRatio } from "./templates/theme.js";

// #1291 F2, 02-solution §8: a kit's brand contract and its resolver.

const defaults = Object.fromEntries(Object.entries(EXPLAINER_THEME.tokens).map(([name, token]) => [name, token.default]));
const mint = skillBrandOf({ look: "fresh_mint" });
const gold = skillBrandOf({ look: "midnight_gold" });

describe("the theme manifest's closed rules", () => {
  it("parses each of the six functions and refuses anything else", () => {
    expect(parseSkillThemeRule("mix(ink, background, 0.15)")).toEqual({ fn: "mix", a: "ink", b: "background", t: 0.15 });
    expect(parseSkillThemeRule("shade(accent, -0.4)")).toEqual({ fn: "shade", a: "accent", l: -0.4 });
    expect(parseSkillThemeRule("readable(accent, board)")).toEqual({ fn: "readable", a: "accent", on: "board" });
    expect(parseSkillThemeRule("fixed()")).toEqual({ fn: "fixed" });
    for (const bad of ["eval(accent)", "role(brand)", "mix(ink, background)", "alpha(accent, 2)", "role(accent); fetch()", "role(accent) + 1"]) {
      expect(typeof parseSkillThemeRule(bad)).toBe("string");
    }
  });

  it("accepts the explainer kit's manifest and refuses a readable() that reads a later token or a translucent one", () => {
    expect(skillThemeManifest.safeParse(EXPLAINER_THEME).success).toBe(true);
    const later = { ...EXPLAINER_THEME, tokens: { first: { rule: "readable(accent, paper)", default: "#000000" }, ...EXPLAINER_THEME.tokens } };
    expect(skillThemeManifest.safeParse(later).success).toBe(false);
    const translucent = { ...EXPLAINER_THEME, pairs: [["ink", "gridMinor"]] };
    expect(skillThemeManifest.safeParse(translucent).success).toBe(false);
  });
});

describe("resolving a brand onto the explainer kit", () => {
  /** Mutant: drop the zero-delta shortcut or round through HSL, and the kit's own literals come back one step off. */
  it("gives the kit's own literals for its own brand, with no warning and the kit's own variation", () => {
    const own = resolveSkillTheme(EXPLAINER_THEME, { brand: { palette: EXPLAINER_THEME.roles } });
    expect(own.tokens).toEqual(defaults);
    expect(own.warnings).toEqual([]);
    expect(own.fonts).toEqual({ caption: "Onest", ui: "Onest", display: "Oswald", accent: "Caveat", mono: "JetBrains Mono" });
    expect(own.variation).toEqual({ grid_step: 24, hero_side: "right" });
    expect(resolveSkillTheme(EXPLAINER_THEME).tokens).toEqual(defaults);
  });

  it("holds every declared text pair of the kit's own theme at 4.5:1 already", () => {
    for (const [text, fill] of EXPLAINER_THEME.pairs) expect(contrastRatio(defaults[text]!, defaults[fill]!)).toBeGreaterThanOrEqual(DESIGN_MIN_CONTRAST);
  });

  /** Mutant: a role token keeps the kit's value, and every brand draws cobalt. */
  it("takes the brand's roles as they are, carries derived tokens and keeps fixed ones", () => {
    const theme = resolveSkillTheme(EXPLAINER_THEME, { brand: mint });
    expect(theme.tokens.paper).toBe("#E9F7F1");
    expect(theme.tokens.card).toBe("#FFFFFF");
    expect(theme.tokens.ink).toBe("#0F2A23");
    expect(theme.tokens.gridMinor).toBe("rgba(18, 184, 134, 0.085)");
    expect(theme.tokens.good).toBe(defaults.good);
    expect(theme.tokens["hero.outline"]).toBe(defaults["hero.outline"]);
    expect(theme.tokens.accentDark).not.toBe(defaults.accentDark);
    expect(theme.source).toBe("brand_kit");
  });

  /** Mutant: skip the pair pass, and a light accent on cream reads at 2:1. */
  it("moves a text token that would read under 4.5:1 and says so", () => {
    for (const brand of [mint, gold, skillBrandOf({ look: "sunny_pop" }), skillBrandOf({ look: "electric_lime" })]) {
      const theme = resolveSkillTheme(EXPLAINER_THEME, { brand });
      for (const [text, fill] of EXPLAINER_THEME.pairs) {
        expect(contrastRatio(theme.tokens[text]!, theme.tokens[fill]!), `${text} on ${fill}`).toBeGreaterThanOrEqual(DESIGN_MIN_CONTRAST);
      }
    }
    const sunny = resolveSkillTheme(EXPLAINER_THEME, { brand: skillBrandOf({ look: "sunny_pop" }) });
    expect(sunny.warnings.some(w => w.startsWith("accent #FFC21A was moved"))).toBe(true);
  });

  /** Codex r1. Mutants: check only a token's first ground, or trust readableShade's answer, and a text reads 1:1 on its card while the
   *  warning claims 4.5:1. Every pair either reads at 4.5:1 or is named with the contrast it does reach. */
  it.each([
    ["grounds on both sides", { background: "#000000", surface: "#FFFFFF", ink: "#777777" }],
    ["a dark ground and a light card", { background: "#101010", surface: "#F8F8F8", ink: "#808080", accent: "#7F7F7F" }],
    ["a mid-grey ground", { background: "#777777", surface: "#FFFFFF", ink: "#000000", accent: "#777777" }],
  ] as const)("never claims a contrast it does not reach (%s)", (_name, palette) => {
    const theme = resolveSkillTheme(EXPLAINER_THEME, { overrides: { palette } });
    for (const [text, fill] of EXPLAINER_THEME.pairs) {
      const ratio = contrastRatio(theme.tokens[text]!, theme.tokens[fill]!);
      const said = theme.warnings.find(w => w.startsWith(`${text} `));
      if (ratio >= DESIGN_MIN_CONTRAST) continue;
      expect(said, `${text} on ${fill} at ${ratio.toFixed(2)}`).toMatch(/reaches only/);
    }
    for (const warning of theme.warnings.filter(w => w.includes("to read at"))) {
      const text = warning.split(" ")[0]!;
      for (const [t, fill] of EXPLAINER_THEME.pairs) if (t === text) expect(contrastRatio(theme.tokens[t]!, theme.tokens[fill]!)).toBeGreaterThanOrEqual(DESIGN_MIN_CONTRAST);
    }
  });

  it("finds the grey that reads on a black ground and a white card at once", () => {
    const theme = resolveSkillTheme(EXPLAINER_THEME, { overrides: { palette: { background: "#000000", surface: "#FFFFFF", ink: "#777777" } } });
    expect(Math.min(contrastRatio(theme.tokens.ink!, "#000000"), contrastRatio(theme.tokens.ink!, "#FFFFFF"))).toBeGreaterThanOrEqual(DESIGN_MIN_CONTRAST);
  });

  it("lets the call's overrides win over the brand kit, role by role", () => {
    const theme = resolveSkillTheme(EXPLAINER_THEME, { brand: mint, overrides: { palette: { accent: "#C62D23" }, variation: { hero_side: "left" } } });
    expect(theme.tokens.accent).toBe("#C62D23");
    expect(theme.tokens.paper).toBe("#E9F7F1");
    expect(theme.variation.hero_side).toBe("left");
    expect(theme.source).toBe("overrides");
  });
});

describe("brand faces (C4)", () => {
  it("binds display and body faces, never the kit's handwritten or monospace face", () => {
    const theme = resolveSkillTheme(EXPLAINER_THEME, { brand: gold });
    expect(theme.fonts).toEqual({ caption: "Inter", ui: "Inter", display: "Montserrat", accent: "Caveat", mono: "JetBrains Mono" });
  });

  /** Mutant: drop the Cyrillic check, and a Russian film draws its headline in a face with no Russian letters. */
  it("keeps the kit's face where the brand's has no Cyrillic and the script needs it", () => {
    const brand = { fonts: { display: "Titan One" as const, body: "Inter" as const } };
    expect(resolveSkillTheme(EXPLAINER_THEME, { brand, language: "en" }).fonts.display).toBe("Titan One");
    const ru = resolveSkillTheme(EXPLAINER_THEME, { brand, language: "ru" });
    expect(ru.fonts.display).toBe("Oswald");
    expect(ru.fonts.caption).toBe("Inter");
    expect(ru.warnings).toEqual(["Titan One has no Cyrillic letters, so the display text keeps Oswald"]);
  });

  /** Codex r2. Mutant: check Cyrillic only for the display face, and Russian captions draw in a face with no Russian letters. */
  it("checks every face the brand binds, the body's caption and interface text too", () => {
    const ru = resolveSkillTheme(EXPLAINER_THEME, { brand: { fonts: { display: "Inter", body: "Plus Jakarta Sans" } }, language: "ru" });
    expect(ru.fonts).toMatchObject({ display: "Inter", caption: "Onest", ui: "Onest" });
    expect(ru.warnings).toEqual(["Plus Jakarta Sans has no Cyrillic letters, so the caption text keeps Onest",
      "Plus Jakarta Sans has no Cyrillic letters, so the ui text keeps Onest"]);
    expect(resolveSkillTheme(EXPLAINER_THEME, { brand: { fonts: { body: "Plus Jakarta Sans" } }, language: "uk" }).fonts.caption).toBe("Onest");
    expect(resolveSkillTheme(EXPLAINER_THEME, { brand: { fonts: { body: "Plus Jakarta Sans" } }, language: "de" }).fonts.caption).toBe("Plus Jakarta Sans");
  });

  it("takes no face from a palette-only brand: our design defaults are not the brand's choice", () => {
    expect(skillBrandOf({ palette: DESIGN_LOOKS.ocean_teal.palette })).toEqual({ palette: DESIGN_LOOKS.ocean_teal.palette });
  });
});

describe("the account's variation seed", () => {
  it("is stable for one account and spreads across accounts", () => {
    const pick = (seed: string) => resolveSkillTheme(EXPLAINER_THEME, { seed }).variation;
    expect(pick("acc_one")).toEqual(pick("acc_one"));
    const seen = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(pick(`acc_${i}`))));
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});
