import { z } from "zod";
import { CAPTION_EDGES, captionEdgeAt, type CaptionEdge } from "./caption-geometry.js";
import { faceZone, overlayRect, type LayerRect, type OverlayPosition, type PresenterFraming } from "./ugc-layers.js";

// Free placement of a layer (#973 S1): a box on the frame, on the presenter's face, or next to the face or another layer. A placed layer is pinned.

export const PLACE_FITS = ["contain", "cover"] as const;
export type PlaceFit = (typeof PLACE_FITS)[number];
export const PLACE_SIDES = ["below", "above", "left", "right", "over"] as const;
export const PLACE_ALIGNS = ["start", "center", "end"] as const;
/** The gap next to an anchor when none is given, as a share of the frame height. */
export const PLACE_DEFAULT_GAP = 0.01;

/** A rect in face units: origin the face centre, unit the face height in pixels, so x and y share one scale. */
const faceUnits = z.number().min(-20).max(20);
export const faceUnitsRect = z.strictObject({ left: faceUnits, top: faceUnits, width: z.number().positive().max(20), height: z.number().positive().max(20) });
const share = z.number().min(-0.5).max(1.5);
const span = z.number().min(0.02).max(1.5);
const layerId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const options = {
  fit: z.enum(PLACE_FITS).optional().describe("contain (default): the whole picture inside the box, centred; cover: it fills the box, cut to fit."),
  allow_face: z.literal(true).optional().describe("Cover the presenter's face on purpose; without it a box on the face is refused."),
};

export const placeFrame = z.strictObject({ relative_to: z.literal("frame"),
  rect: z.strictObject({ left: share, top: share, width: span, height: span }).describe("In shares of the frame's width and height."), ...options });
export const placeFace = z.strictObject({ relative_to: z.literal("face"),
  rect: faceUnitsRect.describe("Origin the presenter's face centre, unit the face height, on both axes."), ...options });
export const placeNextTo = z.strictObject({
  relative_to: z.union([z.enum(["face", "captions"]), z.strictObject({ layer: layerId })])
    .describe("The presenter's face, the captions as drawn (side below or above), or another overlay placed with place."),
  side: z.enum(PLACE_SIDES),
  gap: z.number().min(0).max(0.2).optional().describe("Space to the anchor, as a share of the frame height; default 0.01."),
  align: z.enum(PLACE_ALIGNS).optional().describe("Along the anchor's side; default center."),
  width: z.number().positive().max(4).optional(),
  height: z.number().positive().max(4).optional(),
  size_unit: z.enum(["frame", "face"]).optional().describe("frame (default): shares of the frame's width and height; face: face heights."),
  ...options,
}).refine(item => item.width !== undefined || item.height !== undefined, { message: "pass width, height or both", path: ["width"] });
/** Where an overlay is drawn instead of a preset position; no rule moves it. */
export const place = z.union([placeFrame, placeFace, placeNextTo]);
export type Place = z.infer<typeof place>;
export type PlaceNextTo = z.infer<typeof placeNextTo>;

export interface PlaceContext {
  canvas: { width: number; height: number };
  /** The presenter's face box on the frame. */
  face: LayerRect;
  /** Boxes of the layers a place may name, by id. */
  layers?: ReadonlyMap<string, LayerRect> | undefined;
  /** The caption block a place next to the captions stands by; the composition moves it to the page it draws. */
  captions?: LayerRect | undefined;
  /** The picture's pixels; a box given one side takes the picture's shape, a square without it. */
  media?: { width: number; height: number } | undefined;
}

/** The layer a place is next to, or undefined. */
export const placeAnchorOf = (item: Place): string | undefined =>
  "side" in item && typeof item.relative_to === "object" ? item.relative_to.layer : undefined;

/** Whether a place reads the presenter's face. */
export const placeReadsFace = (item: Place): boolean => item.relative_to === "face";

/** Whether a place stands next to the captions, so it follows the page drawn and never moves them. */
export const placeByCaptions = (item: Place | undefined): item is PlaceNextTo & { relative_to: "captions" } =>
  item !== undefined && "side" in item && item.relative_to === "captions";

/** The box a place resolves to, in shares of the frame; it may reach past the frame, which the rails judge. */
export function resolvePlace(item: Place, ctx: PlaceContext): LayerRect {
  const { width: W, height: H } = ctx.canvas, face = ctx.face;
  const unitW = (face.height * H) / W;
  if (item.relative_to === "frame") return { ...item.rect };
  if ("rect" in item) {
    const cx = face.left + face.width / 2, cy = face.top + face.height / 2;
    return { left: cx + item.rect.left * unitW, top: cy + item.rect.top * face.height, width: item.rect.width * unitW, height: item.rect.height * face.height };
  }
  const anchor = typeof item.relative_to === "object" ? ctx.layers?.get(item.relative_to.layer) : item.relative_to === "captions" ? ctx.captions : face;
  if (!anchor) throw new Error("place names a layer with no box");
  const byFace = item.size_unit === "face", aspect = ctx.media ? ctx.media.height / ctx.media.width : 1;
  let width = item.width === undefined ? undefined : item.width * (byFace ? unitW : 1);
  let height = item.height === undefined ? undefined : item.height * (byFace ? face.height : 1);
  width ??= ((height ?? 0) * H) / (aspect * W);
  height ??= (width * W * aspect) / H;
  const gapY = item.gap ?? PLACE_DEFAULT_GAP, gapX = (gapY * H) / W;
  const along = (start: number, length: number, size: number) =>
    item.align === "start" ? start : item.align === "end" ? start + length - size : start + (length - size) / 2;
  const centred = { left: along(anchor.left, anchor.width, width), top: along(anchor.top, anchor.height, height) };
  switch (item.side) {
    case "below": return { left: centred.left, top: anchor.top + anchor.height + gapY, width, height };
    case "above": return { left: centred.left, top: anchor.top - gapY - height, width, height };
    case "right": return { left: anchor.left + anchor.width + gapX, top: centred.top, width, height };
    case "left": return { left: anchor.left - gapX - width, top: centred.top, width, height };
    case "over": return { left: anchor.left + (anchor.width - width) / 2, top: anchor.top + (anchor.height - height) / 2, width, height };
  }
}

/** The rect a picture takes in its box: the whole box for cover, else the picture's shape fitted and centred. */
export function fitPlacedRect(box: LayerRect, media: { width: number; height: number }, canvas: { width: number; height: number },
  fit: PlaceFit = "contain"): LayerRect {
  if (fit === "cover") return box;
  const scale = Math.min((box.width * canvas.width) / media.width, (box.height * canvas.height) / media.height);
  const width = (media.width * scale) / canvas.width, height = (media.height * scale) / canvas.height;
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
}

/** A preset position as a place: it resolves to the footprint the preset reserves, `overlayRect`. */
export function presetPlace(position: OverlayPosition, canvas: { width: number; height: number }): z.infer<typeof placeFrame> {
  return { relative_to: "frame", rect: overlayRect(position, canvas) };
}

/** The presenter's usual face box, before the take shows it: two thirds of the face zone's height, centred in it, 3:4 in pixels. */
export function usualFace(aspectRatio: string, canvas: { width: number; height: number }, framing: PresenterFraming = "close"): LayerRect {
  const zone = faceZone(aspectRatio, framing), height = (zone.height * 2) / 3, width = (0.75 * height * canvas.height) / canvas.width;
  return { left: zone.left + (zone.width - width) / 2, top: zone.top + (zone.height - height) / 2, width, height };
}

/** Captions at a height of their own (#973 S2): pinned, so no overlay moves them. */
export const captionPlace = z.strictObject({
  relative_to: z.enum(["frame", "face"]),
  y: z.number().min(-20).max(20).describe("frame: a share of the height from the top; face: face heights from the face centre, down positive."),
  edge: z.enum(CAPTION_EDGES).optional().describe("The edge of the caption block at y; default top at or above the middle, bottom below it."),
  max_width: z.number().min(0.3).max(0.95).optional().describe("The widest a caption line may run, as a share of the frame's width."),
});
export type CaptionPlace = z.infer<typeof captionPlace>;

/** The presenter's face size and place in the frame (#973 S2b). */
export const presenterPlace = z.strictObject({
  face_height: z.number().min(0.08).max(0.6).describe("The face's height as a share of the frame's height."),
  face_centre: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).describe("The face centre [x, y] in shares of the frame."),
});
export type PresenterPlace = z.infer<typeof presenterPlace>;

/** A close view's face height, measured on a delivered 9:16 close take (#973 S0, job-01 v1: 0.273–0.277); a smaller face starts from the wide view. */
export const CLOSE_VIEW_FACE_HEIGHT = 0.275;
/** Whether presenter_place starts from the actor's wide view: the crop only frames tighter, so a face smaller than the close view's needs it. */
export const presenterPlaceWantsWide = (item: { face_height: number } | undefined): boolean => item !== undefined && item.face_height < CLOSE_VIEW_FACE_HEIGHT;

/** The face a presenter_place asks for, 3:4 in pixels as the usual face. */
export function presenterPlaceFace(item: PresenterPlace, canvas: { width: number; height: number }): LayerRect {
  const height = item.face_height, width = (0.75 * height * canvas.height) / canvas.width;
  return { left: item.face_centre[0] - width / 2, top: item.face_centre[1] - height / 2, width, height };
}

/** The face admission plans by: the one presenter_place asks for, else the usual one of the framing. */
export const plannedFace = (aspectRatio: string, canvas: { width: number; height: number }, framing: PresenterFraming,
  item?: PresenterPlace | undefined): LayerRect => item ? presenterPlaceFace(item, canvas) : usualFace(aspectRatio, canvas, framing);

/** A caption place's height in percent of the frame and the edge it anchors by, on the face given. */
export function captionPlaceAt(item: CaptionPlace, face: LayerRect): { vertical: number; edge: CaptionEdge } {
  const share = item.relative_to === "frame" ? item.y : face.top + face.height / 2 + item.y * face.height, vertical = Math.round(1e6 * share) / 1e4;
  return { vertical, edge: captionEdgeAt(vertical, item.edge) };
}

/** The area two rects share, in squared shares of the frame. */
export const sharedArea = (a: LayerRect, b: LayerRect): number =>
  Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
