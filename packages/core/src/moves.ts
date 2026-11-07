import { z } from "zod";
import { DESIGN_MOTIONS } from "./design.js";
import { lexicalTokens } from "./semantic-inserts.js";
import { layerWordRange } from "./ugc-layers.js";

// Moves (#1175): our catalogue of motion and graphics devices as a client agent reads it and puts it on lines of a script.

export const MOVES_PATH = "/v1/moves";
/** The script line a move serves, finer than hook, proof and call to action. */
export const MOVE_BEATS = ["hook", "problem", "demo", "proof", "social_proof", "offer", "cta", "transition"] as const;
export type MoveBeat = (typeof MOVE_BEATS)[number];
/** What the move shows, so the agent knows what to pass in data. */
export const MOVE_CONTENTS = ["none", "words", "number", "list", "quote", "rating", "photo", "screenshot", "footage", "link"] as const;
export type MoveContent = (typeof MOVE_CONTENTS)[number];
/** Where it draws: over the presenter, on the full frame, on the presenter's shot, on the captions, on a picture, on a graphic, or between shots. */
export const MOVE_SURFACES = ["over", "full", "presenter", "captions", "picture", "layer", "transition"] as const;
export type MoveSurface = (typeof MOVE_SURFACES)[number];
export const MOVE_SKILLS = ["make_ugc", "make_faceless", "plan_reference_remake"] as const;
export type MoveSkill = (typeof MOVE_SKILLS)[number];
/** soon: listed so the agent knows it is coming, refused when named. */
export const MOVE_STATUSES = ["ready", "soon"] as const;
export const MAX_MOVES = 40;
export const MOVES_PAGE_DEFAULT = 40;
export const MOVES_PAGE_MAX = 100;

export const moveName = z.string().min(1).max(48).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "a move name is as list_moves names it, such as stat-count-up");

/** One catalogue line: the short read carries the first fields, detail=full all of them. */
export const motionMove = z.strictObject({
  name: moveName,
  status: z.enum(MOVE_STATUSES),
  purpose: z.string().describe("What it does for the viewer."),
  beats: z.array(z.enum(MOVE_BEATS)).min(1),
  content: z.enum(MOVE_CONTENTS),
  surface: z.enum(MOVE_SURFACES),
  credits: z.number().int().min(0).describe("Credits per use, on the quote; 0 is free."),
  look: z.string().optional().describe("What the viewer sees."),
  moods: z.array(z.enum(DESIGN_MOTIONS)).optional(),
  seconds: z.number().min(0).optional().describe("How long its motion takes; a full-frame stop card plays this long from its first word, " +
    "then the presenter or the next shot takes the rest of its words."),
  per_video: z.number().int().min(1).optional().describe("The most uses one video takes before it tires."),
  skills: z.array(z.enum(MOVE_SKILLS)).optional().describe("Where it can be drawn."),
  needs: z.string().nullable().optional().describe("What must already be on its line, or null."),
  data: z.string().nullable().optional().describe("The fields moves[].data takes, or null."),
  pairs_with: z.array(moveName).optional(),
  preview_url: z.string().url().nullable().optional(),
});
export type MotionMove = z.infer<typeof motionMove>;

export const motionMovesQuery = z.strictObject({
  beat: z.enum(MOVE_BEATS).optional(),
  content: z.enum(MOVE_CONTENTS).optional(),
  surface: z.enum(MOVE_SURFACES).optional(),
  mood: z.enum(DESIGN_MOTIONS).optional(),
  skill: z.enum(MOVE_SKILLS).optional(),
  q: z.string().trim().min(1).max(60).optional().describe("Words to find in a move's name, purpose and look."),
  names: z.string().min(1).max(600).optional().describe("Comma-separated names: those moves only, as their full lines."),
  detail: z.enum(["short", "full"]).optional().describe("short (default): name, purpose, beats, content, surface, credits, status."),
  limit: z.coerce.number().int().min(1).max(MOVES_PAGE_MAX).optional(),
  cursor: z.string().regex(/^\d{1,4}$/).optional().describe("next_cursor of the page before."),
});
export type MotionMovesQuery = z.infer<typeof motionMovesQuery>;
export type MotionMovesQueryArgs = z.input<typeof motionMovesQuery>;

export const motionMovesList = z.strictObject({
  moves: z.array(motionMove),
  total: z.number().int().min(0),
  next_cursor: z.string().nullable(),
  contract_version: z.string(),
});
export type MotionMovesList = z.infer<typeof motionMovesList>;

/** A move put on the script's words. */
export const ugcMove = z.strictObject({
  name: moveName,
  anchor: z.strictObject({ quote: z.string().trim().min(1).max(2000), occurrence: z.number().int().nonnegative().optional() })
    .describe("The words it lands on, quoted from the script."),
  cover_words: z.number().int().positive().max(10000).optional().describe("How many spoken words it stays, from the anchor's first; omitted, the anchor's."),
  placement: z.enum(["over", "full"]).optional().describe("For a move drawn over or on the full frame, where list_moves allows both."),
  data: z.record(z.string(), z.unknown()).optional().describe("What it shows, as list_moves detail=full names in data."),
});
export type UgcMove = z.infer<typeof ugcMove>;

export const MOVES_DESCRIPTION = "Moves from list_moves on your words: each { name, anchor: { quote }, cover_words?, placement?, data? }. " +
  "Each is drawn as its line in list_moves says; data takes the fields it names. A move that cannot be drawn on its words or in this video " +
  "is named in warnings[] and left out, never dropped silently. Its credits are on the quote.";

/** Moves sit on the script's words: an anchor that names none is refused before any charge. */
export function moveRefusals(input: { script?: string | undefined; segments?: unknown; moves?: readonly UgcMove[] | undefined }):
  { path: (string | number)[]; message: string }[] {
  if (!input.moves?.length) return [];
  if (input.script === undefined || input.segments !== undefined) return [{ path: ["moves"], message: "moves require script and cannot be combined with segments" }];
  const tokens = lexicalTokens(input.script);
  return input.moves.flatMap((move, index) => {
    const range = layerWordRange(tokens, { id: move.name, anchor: move.anchor, cover_words: move.cover_words });
    return typeof range === "string" ? [{ path: ["moves", index, "anchor"], message: range }] : [];
  });
}
