import { z } from "zod";
import { assetId } from "./asset-identity.js";
import { MOTION_STYLE_IDS } from "./motion-styles.js";
import { scriptVoice } from "./script-voice.js";
import { contrastRatio } from "./templates/theme.js";

// A run's design DNA (#1122): palette roles, fonts, logo, corner radius and motion character, drawn by templates, the end card and captions.

const HEX = /^#[0-9A-Fa-f]{6}$/;
/** The least contrast of text against the fill it sits on. */
export const DESIGN_MIN_CONTRAST = 4.5;
/** The ground caption words are drawn against: their black stroke or box. */
export const CAPTION_ACCENT_GROUND = "#000000";

export const DESIGN_MOTIONS = ["calm", "playful", "premium", "punchy"] as const;
export type DesignMotion = (typeof DESIGN_MOTIONS)[number];
export const DESIGN_RADII = ["square", "soft", "round", "pill"] as const;
export type DesignRadius = (typeof DESIGN_RADII)[number];
/** Each radius as a factor on the corners every template draws at `round`. */
export const DESIGN_RADIUS_SCALE: Readonly<Record<DesignRadius, number>> = { square: 0, soft: 0.5, round: 1, pill: 1.8 };

/** Faces the composition bundles, each under an open font licence, at a weight a caption preset already ships (a test keeps both). */
export const DESIGN_FONTS = {
  "Plus Jakarta Sans": { weight: 800, category: "sans", license: "OFL-1.1" },
  Inter: { weight: 700, category: "sans", license: "OFL-1.1" },
  Montserrat: { weight: 800, category: "sans", license: "OFL-1.1" },
  Roboto: { weight: 700, category: "sans", license: "OFL-1.1" },
  "PT Sans": { weight: 700, category: "sans", license: "OFL-1.1" },
  Oswald: { weight: 700, category: "condensed", license: "OFL-1.1" },
  "Bebas Neue": { weight: 400, category: "condensed", license: "OFL-1.1" },
  "Titan One": { weight: 400, category: "display", license: "OFL-1.1" },
  Bungee: { weight: 400, category: "display", license: "OFL-1.1" },
  Bangers: { weight: 400, category: "display", license: "OFL-1.1" },
  Caveat: { weight: 700, category: "hand", license: "OFL-1.1" },
  "Permanent Marker": { weight: 400, category: "hand", license: "Apache-2.0" },
} as const satisfies Record<string, { weight: number; category: "sans" | "condensed" | "display" | "hand"; license: "OFL-1.1" | "Apache-2.0" }>;
export type DesignFont = keyof typeof DESIGN_FONTS;
export const DESIGN_FONT_FAMILIES = Object.keys(DESIGN_FONTS) as [DesignFont, ...DesignFont[]];

export const DESIGN_PALETTE_ROLES = ["background", "surface", "ink", "accent", "accent_ink"] as const;
export type DesignPaletteRole = (typeof DESIGN_PALETTE_ROLES)[number];
export type DesignPalette = Record<DesignPaletteRole, string>;

export interface DesignLook { palette: DesignPalette; fonts: { display: DesignFont; body: DesignFont }; radius: DesignRadius; motion: DesignMotion;
  /** Topics the look suits; the agent picks by them when the customer leaves the look to us. */
  fits: string }
/** Our own looks: none is a house default, and none sits in hues 230–335 (a test keeps both). */
export const DESIGN_LOOKS = {
  fresh_mint: { palette: { background: "#E9F7F1", surface: "#FFFFFF", ink: "#0F2A23", accent: "#12B886", accent_ink: "#062A1F" },
    fonts: { display: "Plus Jakarta Sans", body: "Inter" }, radius: "round", motion: "playful", fits: "health, wellness, apps" },
  sunset_coral: { palette: { background: "#FFF0E8", surface: "#FFFFFF", ink: "#2B1A14", accent: "#FF6B4A", accent_ink: "#2B1A14" },
    fonts: { display: "Montserrat", body: "Inter" }, radius: "pill", motion: "punchy", fits: "food, lifestyle, retail" },
  midnight_gold: { palette: { background: "#0E0F12", surface: "#1A1C21", ink: "#F5F1E8", accent: "#D4A64A", accent_ink: "#14110A" },
    fonts: { display: "Montserrat", body: "Inter" }, radius: "soft", motion: "premium", fits: "luxury, finance, real estate" },
  forest_paper: { palette: { background: "#F3EFE4", surface: "#FBF8F1", ink: "#1F2A1F", accent: "#2F6B3A", accent_ink: "#FFFFFF" },
    fonts: { display: "PT Sans", body: "PT Sans" }, radius: "soft", motion: "calm", fits: "education, outdoors, sustainability" },
  electric_lime: { palette: { background: "#0B0D0A", surface: "#161A14", ink: "#F2F7EC", accent: "#B8F23A", accent_ink: "#0B0D0A" },
    fonts: { display: "Oswald", body: "Inter" }, radius: "square", motion: "punchy", fits: "fitness, sport, gaming" },
  ocean_teal: { palette: { background: "#E6F3F7", surface: "#FFFFFF", ink: "#0B2530", accent: "#0B6E8A", accent_ink: "#FFFFFF" },
    fonts: { display: "Inter", body: "Inter" }, radius: "round", motion: "calm", fits: "software, healthcare, services" },
  sunny_pop: { palette: { background: "#FFF6D6", surface: "#FFFFFF", ink: "#1E1A10", accent: "#FFC21A", accent_ink: "#1E1A10" },
    fonts: { display: "Titan One", body: "Inter" }, radius: "pill", motion: "playful", fits: "kids, entertainment, events" },
  graphite_red: { palette: { background: "#F2F2F0", surface: "#FFFFFF", ink: "#111111", accent: "#C62D23", accent_ink: "#FFFFFF" },
    fonts: { display: "Inter", body: "Roboto" }, radius: "square", motion: "punchy", fits: "news, media, marketing" },
} as const satisfies Record<string, DesignLook>;
export type DesignLookId = keyof typeof DESIGN_LOOKS;
export const DESIGN_LOOK_IDS = Object.keys(DESIGN_LOOKS) as [DesignLookId, ...DesignLookId[]];

const hex = z.string().regex(HEX, "must be a #RRGGBB hex colour");
export const designPalette = z.object(Object.fromEntries(DESIGN_PALETTE_ROLES.map(role => [role, hex])) as Record<DesignPaletteRole, typeof hex>).strict();

/** Each text role against each fill it is drawn on; a pair under 4.5:1 is refused with the nearest readable shade, never shifted (D2). */
export function designPaletteRefusals(palette: DesignPalette): { path: string[]; message: string }[] {
  const pairs = [["ink", "surface"], ["ink", "background"], ["accent_ink", "accent"]] as const;
  return pairs.flatMap(([text, fill]) => {
    const ratio = contrastRatio(palette[text], palette[fill]);
    if (ratio >= DESIGN_MIN_CONTRAST) return [];
    return [{ path: ["palette", text], message: `${text} ${palette[text]} reaches ${ratio.toFixed(2)}:1 on ${fill} ${palette[fill]}, under ` +
      `${DESIGN_MIN_CONTRAST}:1; ${readableShade(palette[text], palette[fill])} is the nearest readable shade` }];
  });
}

export const design = z.object({
  look: z.enum(DESIGN_LOOK_IDS).optional().describe("One of our looks, each fitting its topics; palette, fonts, radius and motion override it."),
  palette: designPalette.optional().describe("The brand's #RRGGBB roles: background, surface (cards), ink (text), accent (fills, highlights), " +
    "accent_ink (text on accent). Text below 4.5:1 on its fill is refused."),
  fonts: z.object({ display: z.enum(DESIGN_FONT_FAMILIES).optional(), body: z.enum(DESIGN_FONT_FAMILIES).optional() }).strict().optional(),
  logo_asset_id: assetId.optional().describe("An uploaded logo image (ast_…); fills a title_card's empty logo."),
  radius: z.enum(DESIGN_RADII).optional(),
  motion: z.enum(DESIGN_MOTIONS).optional(),
  style: z.enum(MOTION_STYLE_IDS).optional().describe("The motion style its graphics are drawn in; a run's motion_style.style wins."),
}).strict().superRefine((value, context) => {
  if (value.look === undefined && value.palette === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["palette"], message: "design needs a look or a palette" });
  }
  if (value.palette) for (const refusal of designPaletteRefusals(value.palette)) context.addIssue({ code: z.ZodIssueCode.custom, ...refusal });
});
export type DesignInput = z.infer<typeof design>;

/** The DNA every drawer reads: the palette with its derived roles, both fonts, radius, motion and logo. */
export const resolvedDesign = z.object({
  look: z.enum(DESIGN_LOOK_IDS).optional(),
  palette: designPalette.extend({ accent_text: hex, caption_accent: hex }),
  fonts: z.object({ display: z.enum(DESIGN_FONT_FAMILIES), body: z.enum(DESIGN_FONT_FAMILIES) }),
  radius: z.enum(DESIGN_RADII),
  motion: z.enum(DESIGN_MOTIONS),
  style: z.enum(MOTION_STYLE_IDS).optional(),
  logo_asset_id: assetId.optional(),
});
export type ResolvedDesign = z.infer<typeof resolvedDesign>;

/** A look's own values under the customer's; a palette without a look takes the plain defaults below. */
export function resolveDesign(input: DesignInput): ResolvedDesign {
  const look = input.look === undefined ? undefined : DESIGN_LOOKS[input.look];
  const palette = input.palette ?? look!.palette;
  return {
    ...(input.look === undefined ? {} : { look: input.look }),
    palette: { ...palette, accent_text: readableShade(palette.accent, palette.surface), caption_accent: readableShade(palette.accent, CAPTION_ACCENT_GROUND) },
    fonts: { display: input.fonts?.display ?? look?.fonts.display ?? "Plus Jakarta Sans", body: input.fonts?.body ?? look?.fonts.body ?? "Inter" },
    radius: input.radius ?? look?.radius ?? "round",
    motion: input.motion ?? look?.motion ?? "calm",
    ...(input.style === undefined ? {} : { style: input.style }),
    ...(input.logo_asset_id === undefined ? {} : { logo_asset_id: input.logo_asset_id }),
  };
}

/** The same object for tools/list, where every byte counts: no patterns or catalogues, which brand_kit lists; the API checks the full `design`. */
export const mcpDesign = z.object({
  look: z.string().optional(),
  palette: z.object(Object.fromEntries(DESIGN_PALETTE_ROLES.map(role => [role, z.string().optional()])) as
    Record<DesignPaletteRole, z.ZodOptional<z.ZodString>>).strict().optional(),
  fonts: z.object({ display: z.string().optional(), body: z.string().optional() }).strict().optional(),
  logo_asset_id: z.string().optional(),
  radius: z.enum(DESIGN_RADII).optional(),
  motion: z.enum(DESIGN_MOTIONS).optional(),
  style: z.string().optional(),
}).strict();

/** Our looks and the bundled faces, listed with the kit so an agent picks from them without a catalogue in every tool. */
export const designLookEntry = z.object({ id: z.enum(DESIGN_LOOK_IDS), fits: z.string(), palette: designPalette,
  fonts: z.object({ display: z.enum(DESIGN_FONT_FAMILIES), body: z.enum(DESIGN_FONT_FAMILIES) }), radius: z.enum(DESIGN_RADII), motion: z.enum(DESIGN_MOTIONS) });
export function designCatalog(): { looks: z.infer<typeof designLookEntry>[]; fonts: DesignFont[] } {
  return { looks: DESIGN_LOOK_IDS.map(id => ({ id, ...DESIGN_LOOKS[id] })), fonts: [...DESIGN_FONT_FAMILIES] };
}

/** The account's saved DNA (#1122): a run naming neither design nor template_theme draws in it, so a series stays consistent. */
/** Its script voice (#1203) sits beside it; each part is saved, kept or cleared on its own. */
export const BRAND_KIT_PATH = "/v1/brand-kit";
export const brandKitInput = z.object({
  design: design.nullable().optional().describe("The DNA to save; null clears it, omitted keeps it."),
  voice: scriptVoice.nullable().optional().describe("The script voice to save; null clears it, omitted keeps it."),
  mascot_id: assetId.nullable().optional().describe("A saved mascot (list_assets with mascot true) an explainer draws when it names no character; null clears it, omitted keeps it."),
}).strict().refine(value => value.design !== undefined || value.voice !== undefined || value.mascot_id !== undefined,
  { message: "pass design, voice, mascot_id or any of them; null clears one" });
export type BrandKitInput = z.infer<typeof brandKitInput>;
export const brandKit = z.object({ design: design.nullable(), voice: scriptVoice.nullable().default(null), mascot_id: assetId.nullable().default(null),
  updated_at: z.string().nullable(),
  looks: z.array(designLookEntry), fonts: z.array(z.enum(DESIGN_FONT_FAMILIES)) });
export type BrandKit = z.infer<typeof brandKit>;

/** A proposed DNA read from a public site's page and stylesheets, for the customer to confirm (#1122). */
export const BRAND_EXTRACT_PATH = "/v1/brand/extract";
export const extractBrandInput = z.object({ url: z.string().min(1).max(2048) }).strict();
export const extractBrandResponse = z.object({
  url: z.string(),
  design: design,
  resolved: resolvedDesign,
  voice: scriptVoice.optional().describe("A proposed script voice read from the page's own words (#1203): third-party text, for the user to " +
    "confirm before brand_kit saves it."),
  evidence: z.object({
    colors: z.array(z.object({ hex, count: z.number().int().positive() })).max(12),
    fonts: z.array(z.string()).max(8),
    logo_url: z.string().nullable(),
    radius_px: z.number().nonnegative().nullable(),
    stylesheets: z.number().int().nonnegative(),
  }),
  warnings: z.array(z.string()),
});
export type ExtractBrandResponse = z.infer<typeof extractBrandResponse>;

/** The DNA as the composition draws a template: camel-cased roles, the corner factor and the display face at its weight. */
export function templateDesignOf(resolved: ResolvedDesign): { background: string; surface: string; ink: string; accent: string; accentInk: string;
  accentText: string; radius: number; font: { family: string; weight: number } } {
  const { palette } = resolved;
  return { background: palette.background, surface: palette.surface, ink: palette.ink, accent: palette.accent, accentInk: palette.accent_ink,
    accentText: palette.accent_text, radius: DESIGN_RADIUS_SCALE[resolved.radius],
    font: { family: resolved.fonts.display, weight: DESIGN_FONTS[resolved.fonts.display].weight } };
}

export function hexToHsl(color: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map(at => Number.parseInt(color.slice(at, at + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

export function hslToHex({ h, s, l }: { h: number; s: number; l: number }): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** The colour itself when it reads on every ground, else the nearest lightness of its hue that does; failing that, white or black, whichever
 * reads better on the worst ground, which a caller must check when grounds sit on both sides of it. */
export function readableShade(color: string, ground: string | readonly string[], min = DESIGN_MIN_CONTRAST): string {
  const grounds = typeof ground === "string" ? [ground] : ground;
  const worst = (shade: string) => Math.min(...grounds.map(each => contrastRatio(shade, each)));
  if (worst(color) >= min) return color.toUpperCase();
  const { h, s, l } = hexToHsl(color);
  for (let step = 1; step <= 100; step += 1) {
    for (const level of [l - step / 100, l + step / 100]) {
      if (level < 0 || level > 1) continue;
      const shade = hslToHex({ h, s, l: level });
      if (worst(shade) >= min) return shade;
    }
  }
  return worst("#FFFFFF") >= worst("#000000") ? "#FFFFFF" : "#000000";
}
