import { z } from "zod";

// The «own agent» explainer's guide and scene kit, served read-only (#1356): the guide a customer's agent writes its film from, its method
// appendix, and the kit's sources with a reference film, so the agent reads the props it draws with instead of guessing them.

export const FILM_GUIDE_PATH = "/v1/film-guide";
export const FILM_KIT_PATH = "/v1/film-kit";

/** The kit files an agent reads, relative to the kit's root, in reading order: the module a film imports, the drawers behind it, the film
 *  frame, then the reference film. */
export const FILM_KIT_FILES = [
  "index.ts",
  "src/lib/motion.ts",
  "src/lib/frame.tsx",
  "src/lib/marks.tsx",
  "src/lib/ui.tsx",
  "src/lib/objects.tsx",
  "src/lib/product.tsx",
  "src/Film.tsx",
  "src/types.ts",
  "src/theme.ts",
  "src/hero/HeroSticker.tsx",
  "films/espresso-hit/Movie.tsx",
  "films/espresso-hit/scenes.tsx",
] as const;
export type FilmKitFile = (typeof FILM_KIT_FILES)[number];

/** The most kept sounds the guide names, as many as the hosted writer is shown. */
export const FILM_KEPT_SOUNDS_MAX = 60;

const kitVersion =z.string().regex(/^[a-f0-9]{12}$/).describe("The kit's version: a digest of its files, which changes when any of them does");

export const filmGuide = z.strictObject({
  guide: z.string().min(1).describe("The explainer guide, Markdown: the steps, the tools and routes, the rules the checks refuse"),
  method: z.string().min(1).describe("Its appendix, Markdown: the craft behind every step"),
  kit_version: kitVersion,
  kit_files: z.array(z.strictObject({ path: z.enum(FILM_KIT_FILES), bytes: z.number().int().positive() }))
    .describe("The scene kit's files get_film_kit serves, in reading order"),
  kept_sounds: z.array(z.string()).max(FILM_KEPT_SOUNDS_MAX)
    .describe("Sounds your account's films made and kept, newest first: name one exactly in sfx and it plays again, made nothing new"),
});
export type FilmGuide = z.infer<typeof filmGuide>;

export const filmKitQuery = z.strictObject({
  path: z.enum(FILM_KIT_FILES).optional().describe("One kit file; every file when omitted"),
});
export type FilmKitQuery = z.infer<typeof filmKitQuery>;

export const filmKit = z.strictObject({
  kit_version: kitVersion,
  files: z.array(z.strictObject({ path: z.enum(FILM_KIT_FILES), text: z.string() })),
});
export type FilmKit = z.infer<typeof filmKit>;
