import { z } from "zod";
import { brandGuideBlock } from "./design.js";

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
  "src/lib/depth.tsx",
  "src/lib/split.tsx",
  "src/lib/charts.tsx",
  "src/lib/type.tsx",
  "src/lib/captions.tsx",
  "src/lib/transitions.tsx",
  "src/lib/video.tsx",
  "src/lib/sound.tsx",
  "src/lib/chapters.tsx",
  "src/lib/panels.tsx",
  "src/lib/actor.tsx",
  "src/Film.tsx",
  "src/types.ts",
  "src/theme.ts",
  "src/hero/HeroSticker.tsx",
  "films/espresso-hit/Movie.tsx",
  "films/espresso-hit/scenes.tsx",
  "CATALOGUE.md",
  "catalogue/recipes-1.md",
  "catalogue/recipes-2.md",
  "catalogue/asks.md",
  "src/lib/tiles.tsx",
  "src/lib/apps.tsx",
  "src/lib/installer.tsx",
  "src/lib/screens.tsx",
  "src/lib/cards.tsx",
  "src/lib/devices.tsx",
  "src/lib/media.tsx",
  "src/lib/boards.tsx",
  "src/lib/data.tsx",
  "src/lib/grids.tsx",
  "src/lib/course.tsx",
  "src/lib/series.tsx",
  "src/lib/badges.tsx",
  "src/lib/route.tsx",
  "src/lib/calls.tsx",
] as const;
export type FilmKitFile = (typeof FILM_KIT_FILES)[number];
/** Whether a path names one of the kit's files. The query checks it against the list while its schema says only "a string", so a new kit */
/** file grows neither the tool list nor the answers an older client parses. */
export const isFilmKitFile = (path: string): path is FilmKitFile => (FILM_KIT_FILES as readonly string[]).includes(path);
/** A kit file's path in an answer: any path, so a client built before a file was added still reads a kit that has it. */
const kitPath = z.string().min(1);

/** The videos the guide teaches: the explainer film, and the faceless videos an agent cuts from its own pictures, clips and voice. */
export const FILM_GUIDE_FORMATS = ["explainer", "story", "list", "own_pictures", "cartoon"] as const;
export type FilmGuideFormat = (typeof FILM_GUIDE_FORMATS)[number];
/** The parts of a faceless format's guide: its steps, then the craft by theme. */
export const FILM_GUIDE_SECTIONS = ["steps", "story", "words", "captions", "voice", "consistency", "pictures", "motion", "density", "repair"] as const;
export type FilmGuideSection = (typeof FILM_GUIDE_SECTIONS)[number];

/** The most recent looks a faceless guide lists: enough to steer away from a repeat, few enough to leave the menu open. */
export const RECENT_LOOKS_MAX = 5;

/** The guides this account is served (#1666): which tool and format reads each, when it fits, and its version, the same `version` the guide */
/** answers; a version you saw before that differs means the guide changed since. */
export const guideCatalog = z.array(z.strictObject({
  tool: z.enum(["get_ad_guide", "get_film_guide"]),
  format: z.enum(FILM_GUIDE_FORMATS).optional(),
  use_when: z.string().min(1),
  version: z.string().regex(/^[a-f0-9]{12}$/),
})).describe("Every guide this account can read, each with its version: read the one that fits the video before its first tool call");
export type GuideCatalog = z.infer<typeof guideCatalog>;

/** The tool sets a guide catalog opens: the ad tools where it lists the ad guide, the faceless tools where it lists a faceless format. */
export function guideModesOf(guides: GuideCatalog | undefined): { adGuide: boolean; facelessDiy: boolean } {
  const listed = guides ?? [];
  return { adGuide: listed.some(entry => entry.tool === "get_ad_guide"),
    facelessDiy: listed.some(entry => entry.tool === "get_film_guide" && entry.format !== undefined && entry.format !== "explainer") };
}

export const filmGuideQuery = z.strictObject({
  format: z.enum(FILM_GUIDE_FORMATS).optional().describe("The video to make: explainer (the default, a coded film), story, list (facts or " +
    "tips), own_pictures (the user's own pictures) or cartoon (a drawn hero in generated pictures)"),
  section: z.enum(FILM_GUIDE_SECTIONS).optional()
    .describe("One part of a story, list, own_pictures or cartoon guide instead of all of it: steps, or one theme of the craft"),
}).refine(query => query.section === undefined || (query.format !== undefined && query.format !== "explainer"),
  { message: "section reads one part of a story, list, own_pictures or cartoon guide: name that format too", path: ["section"] });
export type FilmGuideQuery = z.infer<typeof filmGuideQuery>;

/** The most kept sounds the guide names, as many as the hosted writer is shown. */
export const FILM_KEPT_SOUNDS_MAX = 60;

const kitVersion =z.string().regex(/^[a-f0-9]{12}$/).describe("The kit's version: a digest of its files, which changes when any of them does");

export const filmGuide = z.strictObject({
  brand: brandGuideBlock.optional(),
  guide: z.string().min(1).describe("The explainer guide, Markdown: the steps, the tools and routes, the rules the checks refuse"),
  method: z.string().min(1).describe("Its appendix, Markdown: the craft behind every step"),
  kit_version: kitVersion,
  kit_files: z.array(z.strictObject({ path: kitPath, bytes: z.number().int().positive() }))
    .describe("The scene kit's files get_film_kit serves, in reading order"),
  kept_sounds: z.array(z.string()).max(FILM_KEPT_SOUNDS_MAX)
    .describe("Sounds your account's films made and kept, newest first: name one exactly in sfx and it plays again, made nothing new"),
  version: z.string().regex(/^[a-f0-9]{12}$/).optional()
    .describe("The guide's version: a digest of the whole guide of this format, the same whichever section is read"),
  guides: guideCatalog.optional(),
  recent_looks: z.array(z.strictObject({ look: z.string(), format: z.enum(FILM_GUIDE_FORMATS), made_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .max(RECENT_LOOKS_MAX).optional()
    .describe("The looks this account's latest faceless videos used, newest first: pick another unless the user keeps their style"),
});
export type FilmGuide = z.infer<typeof filmGuide>;

export const filmKitQuery = z.strictObject({
  path: z.string().refine(isFilmKitFile, { message: "not a kit file: kit_files of get_film_guide lists them" }).optional()
    .describe("One kit file as kit_files of get_film_guide names it; omitted, the list of files with their size and what each holds"),
});
export type FilmKitQuery = z.infer<typeof filmKitQuery>;

export const filmKit = z.strictObject({
  kit_version: kitVersion,
  files: z.array(z.strictObject({ path: kitPath, text: z.string() })).describe("The file asked for by path; none without a path"),
  index: z.array(z.strictObject({ path: kitPath, bytes: z.number().int().positive(), about: z.string() })).optional()
    .describe("Without a path: every kit file in reading order, its size and what it holds; read each one with path"),
});
export type FilmKit = z.infer<typeof filmKit>;
