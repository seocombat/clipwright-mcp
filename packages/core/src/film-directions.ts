import { z } from "zod";

// What a workflow method requires of an explainer film (#1461): exact phrases on screen at their words, and whether the run's pictures are
// captures to show as supplied. A run stores it beside its request; a public body never carries it.

export const FILM_DIRECTION_METHODS = ["kinetic-launch", "website-proof-demo"] as const;
export type FilmDirectionMethod = (typeof FILM_DIRECTION_METHODS)[number];

/** text: the phrase is on screen from the end of its words; hold: from the end of its words to the end of the film. */
export const filmMoment = z.strictObject({
  id: z.string().trim().min(1).max(64),
  kind: z.enum(["text", "hold"]),
  quote: z.string().trim().min(1).max(500),
  occurrence: z.number().int().nonnegative().optional(),
});
export type FilmMoment = z.infer<typeof filmMoment>;

export const filmDirections = z.strictObject({
  method: z.enum(FILM_DIRECTION_METHODS),
  moments: z.array(filmMoment).max(100),
  /** The run's pictures are captures of a known product state: shown as supplied, never redrawn. */
  captures: z.boolean(),
});
export type FilmDirections = z.infer<typeof filmDirections>;

/** Code points the film's scene fonts draw (latin, latin-ext and cyrillic subsets the kit loads; Vietnamese letters are another subset). */
const KIT_GLYPHS = /^[ -~ -ɏЀ-џҐґҰұḀ-ẟỲ-ỿ -⁯₠-⃏№™−]*$/u;

/** The characters of `text` the film's scene fonts cannot draw, each once, in order. */
export function missingKitGlyphs(text: string): string[] {
  const normalized = text.normalize("NFC");
  if (KIT_GLYPHS.test(normalized)) return [];
  return [...new Set([...normalized].filter(char => !KIT_GLYPHS.test(char)))];
}
