import { z } from "zod";
import { assetId } from "./asset-identity.js";

/** The poses a mascot holds: the nine an explainer's hero takes. */
export const MASCOT_POSES = ["up", "palm", "point", "celebrate", "surprise", "think", "shrug", "wink", "neutral"] as const;
export type MascotPoseName = (typeof MASCOT_POSES)[number];

const share = z.number().min(0).max(1);
/** One cut-out pose picture: where its object is stored, its size, and where its face was found (as shares of the picture) when it was. */
export const mascotPose = z.strictObject({
  key: z.string().min(1).max(300),
  /** The object's size and digest: a run that reuses the pose reads it held to both. */
  bytes: z.number().int().positive().max(32 * 1024 ** 2),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** `ink`: the closed mouth's line colour, present when the picture carries no mouth of its own. */
  mouth: z.strictObject({ x: share, y: share, w: share, ink: z.string().regex(/^#[0-9A-F]{6}$/).optional() }).optional(),
  eyes: z.strictObject({ points: z.array(z.strictObject({ x: share, y: share })).min(1).max(4), w: share, h: share, skin: z.string().min(1).max(40) }).optional(),
  /** The pose's saved face rig, an object key; absent for a mascot made without one. */
  rig: z.string().min(1).max(300).optional(),
  /** A photo of a person, kept as one on request: no mouth is drawn or moved on it. */
  photo: z.literal(true).optional(),
});
export type MascotPose = z.infer<typeof mascotPose>;

/** The saved set: every pose it holds, the neutral always, since the hero shows it wherever a pose is missing. */
export const mascotPoses = z.partialRecord(z.enum(MASCOT_POSES), mascotPose)
  .refine((poses) => poses.neutral !== undefined, { message: "a mascot holds its neutral pose" });
export type MascotPoses = z.infer<typeof mascotPoses>;

/** What a run that reuses a mascot carries, pinned by admission: the asset and the poses it held then, so the render reads no other row. */
export const pinnedMascot = z.strictObject({ asset_id: assetId, poses: mascotPoses });
export type PinnedMascot = z.infer<typeof pinnedMascot>;

/** What an asset answer says of a mascot: the poses its set holds, in the composition's order. */
export const mascotSummary = z.strictObject({
  poses: z.array(z.enum(MASCOT_POSES)).min(1),
  character: z.string().min(1).nullable(),
});
export type MascotSummary = z.infer<typeof mascotSummary>;
