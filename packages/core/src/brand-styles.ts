import { z } from "zod";
import { brandKit, design, designPalette, hexToHsl, hslToHex, readableShade, type DesignFont, type DesignInput, type DesignMotion,
  type DesignPalette, type DesignRadius } from "./design.js";
import { referenceAnalysisId } from "./reference-analysis.js";
import { REFERENCE_CAPTION_POSITIONS, REFERENCE_TRANSITION_DEVICES, REFERENCE_TRANSITIONS, type ReferenceProfileAnswer } from "./reference-profile.js";
import { isScenePurple, SCENE_BRAND_TEAL } from "./scene-graph.js";
import { CAPTION_EMPHASIS_LOOKS } from "./skills.js";
import { skillThemeOverrides } from "./skill-theme.js";
import { contrastRatio } from "./templates/theme.js";

// A style built from a reference video (#1364): a named design saved beside the brand kit, with the reference's habits. The proposal is a free
// reading of an analysis already paid for; the donor gives colours, faces and habits, never its logo, characters or frames.

export const BRAND_STYLES_PATH = "/v1/brand-styles";
export const BRAND_STYLE_PROPOSE_PATH = "/v1/brand-styles/propose";
/** An account keeps at most this many styles. */
export const BRAND_STYLES_PER_ACCOUNT = 12;

export const brandStyleName = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, "a style name is 1–40 of a-z, 0-9, _ and -, starting with a letter or digit");

/** A style's design: any brand design but a logo, which a style taken from someone else's video never carries. */
export const brandStyleDesign = design.refine(value => value.logo_asset_id === undefined,
  { path: ["logo_asset_id"], message: "a style carries no logo; the brand kit's design holds yours" });

const EMPHASIS = [...CAPTION_EMPHASIS_LOOKS, "none"] as const;
/** How the reference moves and captions: kept with the style and shown; the drawing reads its design. */
export const brandStyleHabits = z.strictObject({
  transition: z.enum(REFERENCE_TRANSITIONS).describe("The reference's most frequent transition between beats"),
  transition_device: z.enum(REFERENCE_TRANSITION_DEVICES).optional().describe("The transition by name when transition is other"),
  cut_every_s: z.number().positive().max(60).describe("Seconds between changes on screen"),
  captions: z.strictObject({ position: z.enum(REFERENCE_CAPTION_POSITIONS), emphasis: z.enum(EMPHASIS) }),
});
export type BrandStyleHabits = z.infer<typeof brandStyleHabits>;

export const saveBrandStyleInput = z.strictObject({
  name: brandStyleName.describe("The style's name; saving a name again replaces that style"),
  design: brandStyleDesign.describe("The confirmed colours, faces, corners and motion"),
  habits: brandStyleHabits.optional(),
  source_analysis_id: referenceAnalysisId.optional().describe("The analysis the style was proposed from"),
});
export type SaveBrandStyleInput = z.infer<typeof saveBrandStyleInput>;

export const brandStyle = z.strictObject({
  name: brandStyleName,
  design: brandStyleDesign,
  habits: brandStyleHabits.nullable(),
  source_analysis_id: referenceAnalysisId.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type BrandStyle = z.infer<typeof brandStyle>;

/** The kit as read and saved: its parts, our looks and faces, and the account's saved styles. */
export const brandKitWithStyles = brandKit.extend({ styles: z.array(brandStyle).default([]) });
export type BrandKitWithStyles = z.infer<typeof brandKitWithStyles>;

export const proposeBrandStyleInput = z.strictObject({
  analysis_id: referenceAnalysisId.describe("A finished full analyze_reference of this account"),
  name: brandStyleName.optional().describe("The name to propose; omitted, one is made from the analysis"),
});
export type ProposeBrandStyleInput = z.infer<typeof proposeBrandStyleInput>;

const HEX = z.string().regex(/^#[0-9A-F]{6}$/);
export const brandStyleProposal = z.strictObject({
  style: z.strictObject({ name: brandStyleName, design: brandStyleDesign, habits: brandStyleHabits, source_analysis_id: referenceAnalysisId }),
  /** What the proposal was read from. */
  evidence: z.strictObject({
    palette: z.array(HEX).max(8),
    transitions: z.array(z.strictObject({ transition: z.enum(REFERENCE_TRANSITIONS), beats: z.number().int().positive() })),
  }),
  /** Pass to create_film_draft as theme_overrides to draw sample stills in the proposal before saving it. */
  theme_overrides: skillThemeOverrides,
  warnings: z.array(z.string()),
});
export type BrandStyleProposal = z.infer<typeof brandStyleProposal>;

type Faces = { display: DesignFont; body: DesignFont };
/** Faces by the reference's caption look, else by its pace: the typeface itself is not read, so the proposal names its pick. */
const FACES_BY_EMPHASIS: Readonly<Record<(typeof CAPTION_EMPHASIS_LOOKS)[number], Faces>> = {
  box: { display: "Oswald", body: "Roboto" },
  pill: { display: "Plus Jakarta Sans", body: "Inter" },
  punch: { display: "Montserrat", body: "Inter" },
  color: { display: "Titan One", body: "Roboto" },
};
const FACES_BY_MOTION: Readonly<Record<DesignMotion, Faces>> = {
  punchy: { display: "Bebas Neue", body: "Inter" },
  playful: { display: "Plus Jakarta Sans", body: "Inter" },
  premium: { display: "Montserrat", body: "Inter" },
  calm: { display: "PT Sans", body: "PT Sans" },
};
const RADIUS_BY_EMPHASIS: Readonly<Record<(typeof EMPHASIS)[number], DesignRadius>> = { box: "square", pill: "pill", punch: "soft", color: "round", none: "soft" };
const motionOf = (cutEvery: number): DesignMotion => cutEvery < 1.5 ? "punchy" : cutEvery < 2.5 ? "playful" : cutEvery < 4 ? "premium" : "calm";

/** Low saturation, or near white or black: a colour that grounds rather than accents. */
const neutral = (hex: string): boolean => { const { s, l } = hexToHsl(hex); return s < 0.2 || l > 0.92 || l < 0.12; };
const mix = (from: string, to: string, t: number): string => {
  const [a, b] = [from, to].map(hex => [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16))) as [number[], number[]];
  return `#${a.map((v, i) => Math.round(v + (b[i]! - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
};
const TEAL_HUE = hexToHsl(SCENE_BRAND_TEAL).h;

/** The reference's palette as five brand roles, every text pair readable; a purple is moved to teal and named, as our own looks never hold one. */
export function paletteFromReference(colours: readonly string[]): { palette: DesignPalette; warnings: string[] } {
  const warnings: string[] = [];
  const repaired = colours.map(hex => {
    if (!isScenePurple(hex)) return hex;
    const moved = hslToHex({ ...hexToHsl(hex), h: TEAL_HUE });
    warnings.push(`the reference's purple ${hex} became ${moved}; save a palette with your own purple if you want it`);
    return moved;
  });
  const neutrals = repaired.filter(neutral), chromatic = repaired.filter(hex => !neutral(hex));
  const firstHue = chromatic[0];
  const background = neutrals[0] ?? (firstHue ? hslToHex({ ...hexToHsl(firstHue), s: hexToHsl(firstHue).s * 0.4, l: 0.95 }) : "#F4F4F2");
  const darkGround = hexToHsl(background).l < 0.5;
  const far = [...neutrals.slice(1)].sort((x, y) => Math.abs(hexToHsl(y).l - hexToHsl(background).l) - Math.abs(hexToHsl(x).l - hexToHsl(background).l))[0];
  const inkWanted = far ?? (darkGround ? "#FFFFFF" : "#111111");
  const surface = mix(background, inkWanted, 0.06);
  const ink = readableShade(inkWanted, [background, surface]);
  if (ink !== inkWanted.toUpperCase()) warnings.push(`the reference's text colour ${inkWanted} became ${ink} to read on its background`);
  const accent = firstHue ?? (darkGround ? "#F2C14E" : SCENE_BRAND_TEAL);
  if (!firstHue) warnings.push(`the reference has no accent colour, so ${accent} is proposed`);
  const accentInk = readableShade(contrastRatio(ink, accent) >= contrastRatio(background, accent) ? ink : background, accent);
  return { palette: designPalette.parse({ background, surface, ink, accent, accent_ink: accentInk }), warnings };
}

/** A style read from one analysis's profile, free and repeatable: the same profile always proposes the same style. */
export function proposeStyleFromProfile(profile: Pick<ReferenceProfileAnswer, "palette" | "captions" | "beats" | "pacing">,
  input: { analysisId: string; name?: string }): BrandStyleProposal {
  const { palette, warnings } = paletteFromReference(profile.palette);
  const emphasis = profile.captions.present ? profile.captions.emphasis_style : "none";
  const cutEvery = Math.round(profile.pacing.layer_change_every_s * 10) / 10 || 0.1, motion = motionOf(cutEvery);
  const fonts = emphasis === "none" ? FACES_BY_MOTION[motion] : FACES_BY_EMPHASIS[emphasis];
  warnings.push(`the reference's typeface is not read: ${fonts.display} and ${fonts.body} are picked from our faces by its ` +
    `${emphasis === "none" ? "pace" : "caption look"}`);
  const counts = new Map<(typeof REFERENCE_TRANSITIONS)[number], number>();
  for (const beat of profile.beats) counts.set(beat.transition_in, (counts.get(beat.transition_in) ?? 0) + 1);
  const transitions = [...counts].map(([transition, beats]) => ({ transition, beats }))
    .sort((a, b) => b.beats - a.beats || REFERENCE_TRANSITIONS.indexOf(a.transition) - REFERENCE_TRANSITIONS.indexOf(b.transition));
  const top = transitions[0]!.transition;
  const devices = profile.beats.filter(beat => beat.transition_in === top && beat.transition_device).map(beat => beat.transition_device!);
  const styleDesign: DesignInput = { palette, fonts, radius: RADIUS_BY_EMPHASIS[emphasis], motion };
  const habits: BrandStyleHabits = { transition: top, ...(top === "other" && devices[0] ? { transition_device: devices[0] } : {}), cut_every_s: cutEvery,
    captions: { position: profile.captions.position, emphasis } };
  return brandStyleProposal.parse({
    style: { name: input.name ?? `ref-${input.analysisId.slice(4, 12)}`, design: styleDesign, habits, source_analysis_id: input.analysisId },
    evidence: { palette: profile.palette, transitions },
    theme_overrides: { palette, fonts },
    warnings,
  });
}
