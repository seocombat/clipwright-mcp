import { z } from "zod";


export const FILM_DIRECTION_METHODS = ["kinetic-launch", "website-proof-demo"] as const;
export type FilmDirectionMethod = (typeof FILM_DIRECTION_METHODS)[number];

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
  captures: z.boolean(),
});
export type FilmDirections = z.infer<typeof filmDirections>;

const KIT_GLYPHS = /^[ -~ -ɏЀ-џҐґҰұḀ-ẟỲ-ỿ -⁯₠-⃏№™−]*$/u;

export function missingKitGlyphs(text: string): string[] {
  const normalized = text.normalize("NFC");
  if (KIT_GLYPHS.test(normalized)) return [];
  return [...new Set([...normalized].filter(char => !KIT_GLYPHS.test(char)))];
}
