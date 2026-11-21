import { z } from "zod";
import { assetId } from "./asset-identity.js";

/** The poses a mascot holds: the nine an explainer's hero takes. */
export const MASCOT_POSES = ["up", "palm", "point", "celebrate", "surprise", "think", "shrug", "wink", "neutral"] as const;
export type MascotPoseName = (typeof MASCOT_POSES)[number];

const share = z.number().min(0).max(1);

/** Pictures of a pose redrawn with one change each, aligned with it pixel for pixel: a film lays one over the pose only inside
 *  a feathered region, so the mouth opens with the voice and the eyes blink in the character's own drawing. */
export const MASCOT_SPRITES = ["half", "open", "blink", "smile", "surprise", "look_left", "look_right"] as const;
export type MascotSpriteName = (typeof MASCOT_SPRITES)[number];
/** What a talking pose carries: the mouth half and fully open, and the eyes shut. A head carries every sprite. */
export const MASCOT_TALK_SPRITES = ["half", "open", "blink"] as const satisfies readonly MascotSpriteName[];
/** One stored sprite: the pose's size, so only its object, size and digest are kept. */
export const mascotSprite = z.strictObject({
  key: z.string().min(1).max(300),
  bytes: z.number().int().positive().max(32 * 1024 ** 2),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type MascotSprite = z.infer<typeof mascotSprite>;
const point = z.strictObject({ x: share, y: share });
/** Where the sprites' regions sit, shares of the picture: both eyes, the viewer's left first, and the middle of the mouth. Measured from where the
 *  sprites differ from the pose, never from a look at the face. */
export const mascotAnchors = z.strictObject({ eyes: z.tuple([point, point]), mouth: point });
export type MascotAnchors = z.infer<typeof mascotAnchors>;

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
  /** Its face could not be read on our side: it keeps its drawn mouth, and it is not charged. */
  unread: z.literal(true).optional(),
  /** Its sprites (a pose with them carries `anchors` and never `mouth` or `eyes`: its own mouth is kept, never erased). */
  sprites: z.partialRecord(z.enum(MASCOT_SPRITES), mascotSprite).optional(),
  anchors: mascotAnchors.optional(),
  /** The whole mascot is this one picture, a head with no body: it carries every sprite. */
  head: z.literal(true).optional(),
  /** A pose of a sprite hero that does not talk by design: its mouth stays as drawn, and it is charged as a pose. */
  quiet: z.literal(true).optional(),
}).superRefine((pose, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (pose.sprites && !pose.anchors) issue("a pose with sprites carries their anchors");
  if (pose.anchors && !pose.sprites) issue("anchors come with sprites");
  if (pose.sprites && (pose.mouth || pose.eyes)) issue("a pose with sprites keeps its own mouth: no mouth or eyes to draw");
  if (pose.head && !MASCOT_SPRITES.every(name => pose.sprites?.[name])) issue("a head carries every sprite");
  if (pose.quiet && (pose.sprites || pose.mouth || pose.eyes)) issue("a quiet pose has no face to move");
});
export type MascotPose = z.infer<typeof mascotPose>;

/** `works`: a photo, an erased mouth (`ink`) or mouth sprites; `still`: a face whose mouth cannot move, not charged; `faceless`: no face to
 *  animate, charged; `quiet`: a sprite hero's pose that does not talk by design, charged. Anything unrecognised is `faceless`, never free. */
export type MascotPoseFace = "works" | "still" | "faceless" | "quiet";
export function mascotPoseFace(pose: unknown): MascotPoseFace {
  if (typeof pose !== "object" || pose === null) return "faceless";
  const { photo, mouth, eyes, unread, sprites, anchors, quiet } = pose as { photo?: unknown; mouth?: unknown; eyes?: unknown; unread?: unknown;
    sprites?: unknown; anchors?: unknown; quiet?: unknown };
  if (photo === true) return "works";
  // Sprites decide before any drawn face: a pose whose mouth sprites are not both there moves no mouth, and is never charged.
  if (typeof sprites === "object" && sprites !== null) {
    // A stored sprite is an object; a picture handed to a film carries it as its address.
    const has = (name: string) => { const s = (sprites as Record<string, unknown>)[name]; return (typeof s === "object" && s !== null) || typeof s === "string"; };
    return has("half") && has("open") && typeof anchors === "object" && anchors !== null ? "works" : "still";
  }
  if (quiet === true) return "quiet";
  if (typeof mouth === "object" && mouth !== null) {
    const ink = (mouth as { ink?: unknown }).ink;
    return typeof ink === "string" ? "works" : !Object.hasOwn(mouth, "ink") ? "still" : "faceless";
  }
  const points = typeof eyes === "object" && eyes !== null ? (eyes as { points?: unknown }).points : undefined;
  return unread === true || (Array.isArray(points) && points.length > 0) ? "still" : "faceless";
}
/** Whether a pose's mouth moves with the voice in a film (the explainer's bill counts only these). */
export const mascotPoseWorks = (pose: unknown): boolean => mascotPoseFace(pose) === "works";

// Words that ask for a photoreal hero; a bare "photo" names the reference, not a look. A drawn style named beside them wins.
const PHOTO_LOOK = /\b(?:photo[- ]?real\w*|photographic|hyper[- ]?real\w*|realistic|life[- ]?like|true[- ]to[- ]life|live[- ]action|real[- ]photo|keep (?:\w+ )?(?:as )?(?:a |the )?photo|as (?:a |in the )?photo)\b/i;
const DRAWN_LOOK = /\b(?:cartoon\w*|drawn|drawing|illustrat\w*|animated|anime|[23]d|comic\w*|sketch\w*|styli[sz]ed|caricature\w*)\b/i;

/** The hero's look by its words: a photo only when they ask for a photoreal one and name no drawn style. A photo hero's face never moves. */
export function heroLook(details: string | null | undefined): "drawn" | "photo" {
  return details && PHOTO_LOOK.test(details) && !DRAWN_LOOK.test(details) ? "photo" : "drawn";
}

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
  /** A head with no body (make_film_hero head): one picture that talks, blinks, smiles and looks aside; a film's actor wears it. */
  head: z.boolean().optional(),
});
export type MascotSummary = z.infer<typeof mascotSummary>;
