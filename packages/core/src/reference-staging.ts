import { z } from "zod";
import { REFERENCE_SOURCE_KINDS } from "./reference-kinds.js";

// Staging measured from a reference (#914 D1): each element's place, entry, exit, layer and motion, and each freeze's pose. Every number names the
// method that produced it; an absent field was not measured and `analysis.warnings` says why. Words come from closed lists, never the reference.

export const REFERENCE_STAGING_VERSION = "reference-staging-v1";
export const STAGING_METHODS = ["cv-cells/v1", "cv-template/v1", "cv-parallax/v1", "cv-before-after/v1", "yunet-native/v1", "vision-video",
  "vision-still"] as const;
export const STAGING_ANCHOR_KINDS = ["cut", "flash", "freeze_start", "freeze_end", "beat"] as const;
export const STAGING_ENTRY_STYLES = ["pop", "fade", "blur_in", "slide", "scale_up", "tilt_in", "typewriter", "wipe", "unknown"] as const;
export const STAGING_EXIT_STYLES = [...STAGING_ENTRY_STYLES, "cut", "flash"] as const;
export const STAGING_SIDES = ["left", "right", "top", "bottom", "lower_left", "lower_right", "upper_left", "upper_right", "none"] as const;
export const STAGING_LAYERS = ["in_front_of_presenter", "behind_presenter", "no_overlap", "presenter_absent", "unknown"] as const;
export const STAGING_COVERS = ["hair", "face", "shoulder", "hand", "body", "chair", "microphone", "desk", "other"] as const;
export type StagingCover = (typeof STAGING_COVERS)[number];
export const STAGING_MOTIONS = ["static", "float", "drift", "scale", "moves_with_frame", "pushed"] as const;
export const STAGING_GAZES = ["camera", "up_left", "up_right", "left", "right", "down", "element", "closed"] as const;
/** The image side the top of the head leans to; a roll within ±5° is upright. */
export const STAGING_HEAD_ROLLS = ["left", "right", "upright"] as const;
export const STAGING_EXPRESSIONS = ["neutral", "smile", "surprised", "thinking", "other"] as const;
export const STAGING_HANDS = ["at_chest", "gesturing", "out_of_frame", "other"] as const;
export const STAGING_FREEZE_ENDS = ["cut", "flash", "unfreeze", "end"] as const;

const frac = z.number().min(0).max(1);
const seconds = z.number().min(0);
const anchorId = z.string().regex(new RegExp(`^(${STAGING_ANCHOR_KINDS.join("|")})#\\d+$`));
const method = z.enum(STAGING_METHODS);

export const stagingRect = z.strictObject({ left: frac, top: frac, width: frac, height: frac });
export type StagingRect = z.infer<typeof stagingRect>;
/** A rect in face units: origin the face centre, unit the face height in pixels, so x and y share one scale. */
const faceUnits = z.number().min(-20).max(20);
export const stagingFaceRect = z.strictObject({ left: faceUnits, top: faceUnits, width: z.number().positive().max(20), height: z.number().positive().max(20) });
/** A moment named by its anchor: the nearest anchor on a side is never used, because it moves when the edit does. */
export const stagingAnchorRef = z.strictObject({ id: anchorId, offset_s: z.number() });

const entry = z.strictObject({
  first_visible_s: seconds, settled_s: seconds, anchors: z.array(stagingAnchorRef).max(3),
  style: z.enum(STAGING_ENTRY_STYLES), from: z.enum(STAGING_SIDES), duration_s: seconds,
  displacement: z.tuple([z.number(), z.number()]).describe("Settled minus first position, in shares of width and height."),
  scale_from: z.number().positive().optional(), method,
}).partial();

const exit = z.strictObject({
  last_visible_s: seconds, anchors: z.array(stagingAnchorRef).max(3), style: z.enum(STAGING_EXIT_STYLES), to: z.enum(STAGING_SIDES),
  duration_s: seconds, displacement: z.tuple([z.number(), z.number()]), method,
}).partial();

export const stagingElement = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]{1,24}$/),
  beat_index: z.number().int().min(0),
  graphic_index: z.number().int().min(0).nullable().describe("Its graphic in beats[beat_index].graphics; null when the beat pass missed it."),
  kind: z.enum(REFERENCE_SOURCE_KINDS),
  rect_hold: stagingRect.optional(),
  rect_hold_face: stagingFaceRect.optional(),
  rect_method: method.optional(),
  rects: z.array(z.strictObject({ t_s: seconds, rect: stagingRect, visible: frac })).max(60).optional(),
  entry: entry.optional(),
  exit: exit.optional(),
  layer: z.strictObject({
    value: z.enum(STAGING_LAYERS), method,
    covered_by: z.array(z.enum(STAGING_COVERS)).max(6),
    face_clear: z.boolean().optional().describe("The face core stays clear in every measured frame of the element's life."),
    face_core_cover_max: frac.optional().describe("The largest share of the face core the element covers in any measured frame."),
    face_covered_share: frac.optional().describe("The share of measured frames in which the element covers the face core."),
    blurs_presenter: z.boolean().optional(),
  }).optional(),
  motion: z.strictObject({
    kind: z.enum(STAGING_MOTIONS), drift_per_s: z.tuple([z.number(), z.number()]).optional(), scale_per_s: z.number().optional(),
    wobble: z.strictObject({ amplitude: frac, period_s: seconds }).optional(),
  }).partial().optional(),
});
export type StagingElement = z.infer<typeof stagingElement>;

export const stagingFreeze = z.strictObject({
  start_s: seconds, end_s: seconds, anchors: z.array(stagingAnchorRef).max(3),
  face_box_start: stagingRect, face_box_end: stagingRect,
  roll_deg: z.number().min(-90).max(90), yaw: z.number().min(-3).max(3), pitch: z.number().min(0).max(3),
  gaze: z.enum(STAGING_GAZES).optional(), head_roll: z.enum(STAGING_HEAD_ROLLS),
  expression: z.enum(STAGING_EXPRESSIONS).optional(), hands: z.enum(STAGING_HANDS).optional(),
  frame_motion: z.strictObject({ scale_end: z.number().positive().max(4), centre_shift: z.tuple([z.number(), z.number()]) }).optional(),
  ends_with: z.enum(STAGING_FREEZE_ENDS),
});
export type StagingFreeze = z.infer<typeof stagingFreeze>;

/** Elements one staging holds, measured or kept with only the vision pass's box and times (#930 S2). */
export const MAX_STAGING_ELEMENTS = 40;

export const referenceStaging = z.strictObject({
  version: z.literal(REFERENCE_STAGING_VERSION),
  analysis_width: z.number().int().positive(),
  anchors: z.array(z.strictObject({ id: anchorId, t_s: seconds })).max(80),
  elements: z.array(stagingElement).max(MAX_STAGING_ELEMENTS),
  freezes: z.array(stagingFreeze).max(8),
});
export type ReferenceStaging = z.infer<typeof referenceStaging>;

/** Cross-field checks a profile runs on its staging: the beats and graphics it names exist, its anchors exist, and its times are ordered. */
export function stagingIssues(staging: ReferenceStaging, beats: readonly { graphics: readonly unknown[] }[], duration: number): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = [];
  const ids = new Set<string>();
  staging.anchors.forEach((anchor, index) => {
    if (ids.has(anchor.id)) out.push({ path: ["anchors", index, "id"], message: `${anchor.id} is named twice` });
    ids.add(anchor.id);
    if (anchor.t_s > duration) out.push({ path: ["anchors", index, "t_s"], message: `lies past the source's ${duration} s` });
  });
  const refs = (path: (string | number)[], list: readonly { id: string }[] | undefined) => list?.forEach((ref, index) => {
    if (!ids.has(ref.id)) out.push({ path: [...path, index, "id"], message: `${ref.id} is not in staging.anchors` });
  });
  const ordered = (path: (string | number)[], times: [string, number | undefined][]) => {
    const known = times.filter((entry): entry is [string, number] => entry[1] !== undefined);
    known.forEach(([field, t], index) => {
      if (t > duration) out.push({ path: [...path, field], message: `lies past the source's ${duration} s` });
      const before = known[index - 1];
      if (before && t < before[1]) out.push({ path: [...path, field], message: `comes before ${before[0]}` });
    });
  };
  staging.elements.forEach((element, index) => {
    const path = ["elements", index];
    const beat = beats[element.beat_index];
    if (!beat) out.push({ path: [...path, "beat_index"], message: `there are ${beats.length} beats` });
    else if (element.graphic_index !== null && element.graphic_index >= beat.graphics.length) {
      out.push({ path: [...path, "graphic_index"], message: `beat ${element.beat_index} has ${beat.graphics.length} graphics` });
    }
    refs([...path, "entry", "anchors"], element.entry?.anchors);
    refs([...path, "exit", "anchors"], element.exit?.anchors);
    ordered(path, [["entry.first_visible_s", element.entry?.first_visible_s], ["entry.settled_s", element.entry?.settled_s],
      ["exit.last_visible_s", element.exit?.last_visible_s]]);
    element.rects?.forEach((sample, at) => { if (sample.t_s > duration) out.push({ path: [...path, "rects", at, "t_s"], message: `lies past the source's ${duration} s` }); });
  });
  staging.freezes.forEach((freeze, index) => {
    refs(["freezes", index, "anchors"], freeze.anchors);
    if (freeze.end_s <= freeze.start_s) out.push({ path: ["freezes", index, "end_s"], message: "ends where or before the freeze starts" });
    if (freeze.end_s > duration) out.push({ path: ["freezes", index, "end_s"], message: `lies past the source's ${duration} s` });
  });
  return out;
}

/** A frame rect in face units: origin the face box's centre, unit its height in pixels (Q2: our actor does not sit where theirs does). */
export function faceRelativeRect(rect: StagingRect, face: StagingRect, width: number, height: number): z.infer<typeof stagingFaceRect> {
  const unit = face.height * height, cx = (face.left + face.width / 2) * width, cy = (face.top + face.height / 2) * height;
  const round = (value: number) => Math.round(value * 1e4) / 1e4;
  return { left: round((rect.left * width - cx) / unit), top: round((rect.top * height - cy) / unit), width: round((rect.width * width) / unit),
    height: round((rect.height * height) / unit) };
}

/** Samples thinned to change points: one is kept when an edge moved more than `tolerance` since the last kept, and the last always stays. */
export function thinStagingRects<T extends { rect: StagingRect }>(samples: readonly T[], tolerance = 0.003, max = 60): T[] {
  const kept: T[] = [];
  samples.forEach((sample, index) => {
    const last = kept.at(-1);
    const moved = !last || (["left", "top", "width", "height"] as const).some(edge => Math.abs(sample.rect[edge] - last.rect[edge]) > tolerance);
    if (moved || index === samples.length - 1) kept.push(sample);
  });
  if (kept.length <= max) return kept;
  const step = (kept.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => kept[Math.round(index * step)]!);
}
