import { z } from "zod";
import { assetId } from "./asset-identity.js";
import { FILM_MAX_BEATS, FILM_STYLES, filmBeat } from "./film-styles.js";
import { resolvedSkillTheme, skillThemeOverrides } from "./skill-theme.js";

// A film draft of the «own agent» mode (#1291 F2): your agent keeps its scene files, anchors and sound events here between calls, under the
// brand theme frozen when the draft was made. Stills and the render read a revision of it; the draft itself is free.

export const FILM_DRAFTS_PATH = "/v1/film-drafts";
export const FILM_DRAFT_PATH = "/v1/film-drafts/:id";
export const FILM_DRAFT_FILES_PATH = "/v1/film-drafts/:id/files";
export const filmDraftId = z.string().regex(/^fdr_[a-f0-9]{32}$/);
export const FILM_SKILLS = ["explainer"] as const;

/** The scene gate's bounds, checked again where the code runs. */
export const FILM_MAX_FILES = 12, FILM_FILE_MAX_BYTES = 40_000;
export const FILM_FILE_NAME = /^[A-Za-z][\w-]{0,40}\.tsx?$/;
/** A draft lives this long after its last change, and an account keeps at most this many. */
export const FILM_DRAFT_TTL_DAYS = 7, FILM_DRAFTS_PER_ACCOUNT = 20;
export const FILM_MAX_CUES = 200, FILM_MAX_SFX = 400, FILM_SFX_MAX_REPEATS = 40, FILM_CAPTIONS_MAX_CHARS = 4000;

const ANCHOR = z.string().regex(/^[A-Za-z_]\w{0,40}$/, "an anchor is an identifier");
const moment = z.union([ANCHOR, z.number().min(0).max(600)]);
/** One sound event: one sound, a series (`n` × `step`), or key strokes on every word between `from` and `to`. */
export const filmSfxEvent = z.strictObject({
  s: z.string().min(1).max(80).describe("A built-in sound (thud pop tick click key swish whoosh marker stamp ding confetti popper rise) or one named in words"),
  at: moment.optional(), dt: z.number().min(-5).max(5).optional(),
  n: z.number().int().min(1).max(FILM_SFX_MAX_REPEATS).optional(), step: z.number().min(0).max(2).optional(),
  g: z.number().min(0).max(3).optional(),
  from: moment.optional(), to: moment.optional(),
}).refine(e => e.at !== undefined || e.from !== undefined || e.to !== undefined, "an event has `at`, or both `from` and `to`")
  .refine(e => (e.from === undefined) === (e.to === undefined), "`from` and `to` come together")
  .refine(e => !(e.at !== undefined && e.from !== undefined), "an event has `at` or `from`/`to`, not both");
export type FilmSfxEvent = z.infer<typeof filmSfxEvent>;

export const createFilmDraftInput = z.strictObject({
  skill: z.enum(FILM_SKILLS).default("explainer"),
  mascot_id: assetId.optional().describe("A saved mascot (list_assets with mascot true) as the film's hero; the brand kit's when omitted"),
  language: z.string().regex(/^[a-z]{2}$/).optional().describe("The script's language (ISO 639-1); a brand face without its letters keeps the kit's"),
  theme_overrides: skillThemeOverrides.optional().describe("Palette roles, faces or variation over the brand kit, for this film only"),
  style: z.enum(FILM_STYLES).optional()
    .describe("A drawn style: the film is drawn from the draft's beats in this style and the brand's colours, not from scene files"),
});
export type CreateFilmDraftInput = z.infer<typeof createFilmDraftInput>;

export const putFilmFilesInput = z.strictObject({
  base_revision: z.number().int().min(0).describe("The revision these changes apply to; a stale one is refused with 409"),
  files: z.record(z.string(), z.string().max(FILM_FILE_MAX_BYTES).nullable()).default({})
    .describe("Scene files by name (Movie.tsx, ch1.tsx…): text replaces the file, null deletes it, an omitted file stays"),
  cues: z.record(ANCHOR, z.number().min(0).max(600)).optional()
    .describe("Every anchor the scenes read, in seconds; when sent, replaces the draft's anchors; omitted, the draft's stay"),
  sfx: z.array(filmSfxEvent).max(FILM_MAX_SFX).optional().describe("The sound events; when sent, replaces the draft's; omitted, the draft's stay"),
  captions: z.string().max(FILM_CAPTIONS_MAX_CHARS).optional()
    .describe("One caption phrase per line, *word* the phrase's accent; when sent, replaces the draft's; omitted, the draft's stay"),
  beats: z.array(filmBeat).min(1).max(FILM_MAX_BEATS).optional()
    .describe("A styled draft's beats in order, each drawn until the next starts; replaces the draft's"),
});
export type PutFilmFilesInput = z.infer<typeof putFilmFilesInput>;

export const filmDraft = z.strictObject({
  draft_id: filmDraftId,
  skill: z.enum(FILM_SKILLS),
  revision: z.number().int().min(0),
  theme: resolvedSkillTheme,
  theme_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mascot_id: assetId.nullable(),
  language: z.string().nullable(),
  files: z.array(z.strictObject({ name: z.string(), bytes: z.number().int().min(0) })),
  cues: z.record(z.string(), z.number()),
  sfx: z.array(filmSfxEvent),
  captions: z.string().nullable(),
  // An answer from before styled drafts (#1338) carries neither: a draft of scene files.
  style: z.enum(FILM_STYLES).nullable().default(null),
  beats: z.array(filmBeat).default([]),
  warnings: z.array(z.string()),
  created_at: z.string(),
  expires_at: z.string(),
});
export type FilmDraft = z.infer<typeof filmDraft>;

/** The draft's files after a patch, or the sentences saying why the patch is refused. Bytes are UTF-8, as the gate counts them. */
export function patchFilmFiles(current: Readonly<Record<string, string>>, patch: Readonly<Record<string, string | null>>):
  { files: Record<string, string> } | { refusals: string[] } {
  const refusals: string[] = [], files: Record<string, string> = { ...current };
  for (const [name, text] of Object.entries(patch)) {
    if (!FILM_FILE_NAME.test(name)) { refusals.push(`${name}: a file name is a letter, then letters, digits, - or _, ending .ts or .tsx`); continue; }
    if (text === null) { delete files[name]; continue; }
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > FILM_FILE_MAX_BYTES) { refusals.push(`${name}: ${bytes} bytes is over ${FILM_FILE_MAX_BYTES}`); continue; }
    files[name] = text;
  }
  if (Object.keys(files).length > FILM_MAX_FILES) refusals.push(`the film would hold ${Object.keys(files).length} files, over ${FILM_MAX_FILES}`);
  return refusals.length ? { refusals } : { files };
}
