import { z } from "zod";

/** Looks the composition draws templates in (#778 S3, D8); presets are judged by eye on sheets, only a customer's colour is checked. */
export const TEMPLATE_PRESETS = ["clean_light", "bold_dark", "neon", "paper", "mono"] as const;
export type TemplatePreset = (typeof TEMPLATE_PRESETS)[number];
/** The look of a run whose `template_theme` names none; the schema has no default (A8). */
export const DEFAULT_TEMPLATE_PRESET: TemplatePreset = "clean_light";
/** The colours an accent meets in each look: the text drawn on it, and the grounds it is drawn on as ink. The composition's themes
 * hold the same values; a test keeps them equal. */
export const TEMPLATE_PRESET_SURFACES: Readonly<Record<TemplatePreset, { onAccent: string; grounds: readonly string[] }>> = {
  clean_light: { onAccent: "#FFFFFF", grounds: ["#FFFFFF", "#EAF1FC", "#D9E7FB"] },
  bold_dark: { onAccent: "#0B0F19", grounds: ["#1F2937", "#0B0F17", "#1C222C"] },
  neon: { onAccent: "#FFFFFF", grounds: ["#0A0E16", "#05070D", "#0A1428"] },
  paper: { onAccent: "#FFFFFF", grounds: ["#FDF8EF", "#F6EFE3", "#EADCC8"] },
  mono: { onAccent: "#FFFFFF", grounds: ["#FFFFFF", "#F4F4F4", "#E2E2E2"] },
};
/** Large text needs 3:1 (WCAG 1.4.3); every template text is large. */
export const TEMPLATE_MIN_CONTRAST = 3;

export const templateTheme = z.object({
  preset: z.enum(TEMPLATE_PRESETS).optional().describe("clean_light (light cards on our blue gradient), bold_dark (dark cards, a yellow accent), neon (black, " +
    "cyan to blue), paper (warm cream, terracotta) or mono (black and white); omitted is clean_light."),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "must be a #RRGGBB hex colour").optional()
    .describe("#RRGGBB in place of the preset's accent: the pills' fill and the accent text. Refused below 3:1 against the colours it meets."),
}).strict();
export type TemplateTheme = z.infer<typeof templateTheme>;

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
    .map(channel => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** The WCAG contrast ratio of two `#RRGGBB` colours. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Why a customer accent cannot be drawn in a look, or nothing: it is refused, never shifted (D8). */
export function templateAccentRefusal(preset: TemplatePreset, accent: string): string | undefined {
  const { onAccent, grounds } = TEMPLATE_PRESET_SURFACES[preset];
  const worst = [{ against: onAccent, role: `the ${onAccent} text drawn on it` },
    ...grounds.map(ground => ({ against: ground, role: `the ${ground} card or ground it is drawn on` }))]
    .map(entry => ({ ...entry, ratio: contrastRatio(accent, entry.against) })).sort((a, b) => a.ratio - b.ratio)[0]!;
  if (worst.ratio >= TEMPLATE_MIN_CONTRAST) return undefined;
  // Towards the nearest luminance that clears them all: in neon the white text and the dark grounds sit on opposite sides of it.
  const own = luminance(accent), levels = [onAccent, ...grounds].map(luminance);
  const nearest = Array.from({ length: 1001 }, (_, step) => step / 1000).filter(level => levels.every(other =>
    (Math.max(level, other) + 0.05) / (Math.min(level, other) + 0.05) >= TEMPLATE_MIN_CONTRAST)).sort((a, b) => Math.abs(a - own) - Math.abs(b - own))[0];
  return `${accent} reaches ${worst.ratio.toFixed(2)}:1 against ${worst.role} in ${preset}, under the ${TEMPLATE_MIN_CONTRAST}:1 large text needs: ` +
    (nearest === undefined ? "pick another preset" : `pick a ${nearest < own ? "darker" : "lighter"} accent or another preset`);
}
