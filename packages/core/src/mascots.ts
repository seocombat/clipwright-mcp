import { z } from "zod";
import { assetId } from "./asset-identity.js";

export const MASCOT_POSES = ["up", "palm", "point", "celebrate", "surprise", "think", "shrug", "wink", "neutral"] as const;
export type MascotPoseName = (typeof MASCOT_POSES)[number];

const share = z.number().min(0).max(1);

export const MASCOT_SPRITES = ["half", "open", "blink", "smile", "surprise", "look_left", "look_right"] as const;
export type MascotSpriteName = (typeof MASCOT_SPRITES)[number];
export const MASCOT_TALK_SPRITES = ["half", "open", "blink"] as const satisfies readonly MascotSpriteName[];
export const mascotSprite = z.strictObject({
  key: z.string().min(1).max(300),
  bytes: z.number().int().positive().max(32 * 1024 ** 2),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type MascotSprite = z.infer<typeof mascotSprite>;
const point = z.strictObject({ x: share, y: share });
export const mascotAnchors = z.strictObject({ eyes: z.tuple([point, point]), mouth: point });
export type MascotAnchors = z.infer<typeof mascotAnchors>;

export const mascotPose = z.strictObject({
  key: z.string().min(1).max(300),
  bytes: z.number().int().positive().max(32 * 1024 ** 2),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mouth: z.strictObject({ x: share, y: share, w: share, ink: z.string().regex(/^#[0-9A-F]{6}$/).optional() }).optional(),
  eyes: z.strictObject({ points: z.array(z.strictObject({ x: share, y: share })).min(1).max(4), w: share, h: share, skin: z.string().min(1).max(40) }).optional(),
  rig: z.string().min(1).max(300).optional(),
  photo: z.literal(true).optional(),
  unread: z.literal(true).optional(),
  sprites: z.partialRecord(z.enum(MASCOT_SPRITES), mascotSprite).optional(),
  anchors: mascotAnchors.optional(),
  head: z.literal(true).optional(),
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

export type MascotPoseFace = "works" | "still" | "faceless" | "quiet";
export function mascotPoseFace(pose: unknown): MascotPoseFace {
  if (typeof pose !== "object" || pose === null) return "faceless";
  const { photo, mouth, eyes, unread, sprites, anchors, quiet } = pose as { photo?: unknown; mouth?: unknown; eyes?: unknown; unread?: unknown;
    sprites?: unknown; anchors?: unknown; quiet?: unknown };
  if (photo === true) return "works";
  if (typeof sprites === "object" && sprites !== null) {
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
export const mascotPoseWorks = (pose: unknown): boolean => mascotPoseFace(pose) === "works";

const PHOTO_LOOK = /\b(?:photo[- ]?real\w*|photographic|hyper[- ]?real\w*|realistic|life[- ]?like|true[- ]to[- ]life|live[- ]action|real[- ]photo|keep (?:\w+ )?(?:as )?(?:a |the )?photo|as (?:a |in the )?photo)\b/i;
const DRAWN_LOOK = /\b(?:cartoon\w*|drawn|drawing|illustrat\w*|animated|anime|[23]d|comic\w*|sketch\w*|styli[sz]ed|caricature\w*)\b/i;

export function heroLook(details: string | null | undefined): "drawn" | "photo" {
  return details && PHOTO_LOOK.test(details) && !DRAWN_LOOK.test(details) ? "photo" : "drawn";
}

export const mascotPoses = z.partialRecord(z.enum(MASCOT_POSES), mascotPose)
  .refine((poses) => poses.neutral !== undefined, { message: "a mascot holds its neutral pose" });
export type MascotPoses = z.infer<typeof mascotPoses>;

export const pinnedMascot = z.strictObject({ asset_id: assetId, poses: mascotPoses });
export type PinnedMascot = z.infer<typeof pinnedMascot>;

export const mascotSummary = z.strictObject({
  poses: z.array(z.enum(MASCOT_POSES)).min(1),
  character: z.string().min(1).nullable(),
  head: z.boolean().optional(),
});
export type MascotSummary = z.infer<typeof mascotSummary>;
