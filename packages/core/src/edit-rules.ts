import { z } from "zod";
import { frameCount } from "./edit-primitives.js";
import { FACELESS_IMAGE_MAX_FRAMES, FACELESS_IMAGE_MIN_FRAMES, FACELESS_OPENER_MAX_FRAMES,
  FACELESS_OPENER_MIN_FRAMES } from "./faceless-public-plan.js";

export const EDIT_LINES = ["faceless", "long_form", "ugc"] as const;
export type EditLine = (typeof EDIT_LINES)[number];
export const SHOT_KINDS = ["picture", "clip", "presenter"] as const;
export type ShotKind = (typeof SHOT_KINDS)[number];
export const SHOT_TRACKS = ["visual", "presenter"] as const;
export type ShotTrack = (typeof SHOT_TRACKS)[number];
export const SHOT_SOURCES = ["generated", "customer", "candidate", "upload", "unknown"] as const;
export type ShotSource = (typeof SHOT_SOURCES)[number];
export const SHOT_ACTIONS = ["retake", "new_picture", "edit_picture", "animate", "upload", "retime", "delete", "cover"] as const;
export type ShotAction = (typeof SHOT_ACTIONS)[number];

/** Above today's 100 slots and the 420 of clipwright#275. */
export const EDIT_MAX_SHOTS = 500;
export const EDIT_MAX_DISCARDED = 500;

export const kindRule = z.strictObject({ min_frames: frameCount, max_frames: frameCount, movable: z.boolean(), resizable: z.boolean() });

/** What a line allows on its timeline. The validator reads these and never the line's name. */
export const editRules = z.strictObject({
  // A kind without an entry is not allowed on this timeline.
  kinds: z.partialRecord(z.enum(SHOT_KINDS), kindRule),
  output_coverage: z.enum(["visual", "union"]),
  first_visual_kind: z.enum(SHOT_KINDS).nullable(),
  picture_assets_unique: z.boolean(),
  visual_covers_presenter: z.boolean(),
  add_visual: z.enum(["never", "over_presenter"]),
  reuse_source_asset: z.boolean(),
  upload_aspect: z.strictObject({ max_distance: z.number().positive() }).nullable(),
  max_generated_per_revision: z.number().int().positive(),
});
export type EditRules = z.infer<typeof editRules>;

export const FACELESS_EDIT_RULES: EditRules = {
  kinds: {
    picture: { min_frames: FACELESS_IMAGE_MIN_FRAMES, max_frames: FACELESS_IMAGE_MAX_FRAMES, movable: true, resizable: true },
    clip: { min_frames: FACELESS_OPENER_MIN_FRAMES, max_frames: FACELESS_OPENER_MAX_FRAMES, movable: false, resizable: true },
  },
  output_coverage: "visual", first_visual_kind: "clip", picture_assets_unique: true, visual_covers_presenter: false,
  add_visual: "never", reuse_source_asset: false, upload_aspect: null, max_generated_per_revision: 8,
};

/** The actions a faceless shot offers: the opener by its place, a picture by where its image came from. */
export function facelessShotActions(shot: { index: number; source: ShotSource }): ShotAction[] {
  if (shot.index === 0) return ["retake", "animate", "new_picture", "retime"];
  if (shot.source === "generated") return ["retake", "new_picture", "upload", "retime", "delete"];
  if (shot.source === "customer") return ["upload", "retime", "delete"];
  return [];
}
