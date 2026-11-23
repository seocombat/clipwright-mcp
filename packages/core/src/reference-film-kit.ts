import { z } from "zod";
import { FILM_GUIDE_PATH } from "./film-guide.js";

export const MAX_FILM_KIT_USES = 160;
export const filmKitBeat = z.strictObject({
  beat_index: z.number().int().min(0),
  start_s: z.number().min(0), end_s: z.number().min(0),
  uses: z.array(z.strictObject({
    term: z.string().regex(/^[a-z_]+:[a-z0-9_]+$/).describe("The analysis's term, axis:value, such as graphic:stat or transition_device:whip"),
    elements: z.array(z.string().min(1)).min(1).describe("The film kit elements that draw it, as get_film_kit exports them"),
  })).min(1).max(MAX_FILM_KIT_USES),
});
export type FilmKitBeat = z.infer<typeof filmKitBeat>;
export const filmKitMap = z.array(filmKitBeat).max(120)
  .describe("Each beat's terms in film kit elements: what a coded film draws the beat with. Beats with nothing the kit draws are left out.");

export const FILM_NEXT_STEPS = ["get_film_kit", "quote_voice", "make_voice", "create_film_draft", "put_film_files", "check_film", "quote_stills",
  "preview_stills", "quote_render", "render_film"] as const;

export const referenceFilmNext = z.strictObject({
  action: z.literal("get_film_guide"), method: z.literal("GET"), path: z.literal(FILM_GUIDE_PATH),
  steps: z.array(z.enum(FILM_NEXT_STEPS)).describe("The calls after the guide, in order"),
  share: z.number().min(0).max(1).describe("The share of the reel's seconds made by software or recorded from a screen"),
  credits_estimate: z.number().int().nonnegative().describe("The voice and the render at the reel's length; the quotes give the price"),
  note: z.string(),
});
export type ReferenceFilmNext = z.infer<typeof referenceFilmNext>;
