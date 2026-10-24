import { z } from "zod";
import { faceZone, frameCanvasOf, type LayerRect, rectsOverlap } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";

export const CALLOUT_STYLES = ["arrow", "ring"] as const;
/** The label's text at medium on a 1080 short side. */
export const CALLOUT_FONT_PX = 60;
/** The pointer's square is this many label sizes wide, and the label's band this many high; the composition reads the size back from the band. */
export const CALLOUT_POINTER_EMS = 3.6;
export const CALLOUT_LABEL_EMS = 1.6;
const percent = z.number().min(0).max(100);
const data = z.object({ target: z.object({ x: percent, y: percent }).strict(), style: z.enum(CALLOUT_STYLES), text: z.string().min(1).max(24).optional(),
  size: templateSize }).strict();
type Data = z.infer<typeof data>;

/** The pointer's square centred on the target, uncropped, and the label's band below it, else above it, off the face when a side allows (D5). */
export function calloutParts(value: Data, aspectRatio: string): { pointer: LayerRect; label: LayerRect } {
  const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, scale = sizedScale(value.size, canvas);
  const side = Math.round(CALLOUT_POINTER_EMS * CALLOUT_FONT_PX * scale), band = Math.round(CALLOUT_LABEL_EMS * CALLOUT_FONT_PX * scale);
  const width = Math.round(Math.min(0.9 * w, 0.8 * Math.min(w, h) * scale));
  const x = Math.round((value.target.x / 100) * w), y = Math.round((value.target.y / 100) * h);
  const left = Math.min(Math.max(0, x - Math.round(width / 2)), w - width);
  const share = (l: number, t: number, rw: number, rh: number): LayerRect => ({ left: l / w, top: t / h, width: rw / w, height: rh / h });
  const sides = [y + Math.round(side / 2), y - Math.round(side / 2) - band].map(top => share(left, top, width, band));
  const fits = (rect: LayerRect) => rect.top >= 0 && rect.top + rect.height <= 1;
  const label = sides.find(rect => fits(rect) && !rectsOverlap(rect, faceZone(aspectRatio))) ?? sides.find(fits) ?? sides[0]!;
  return { pointer: share(x - Math.round(side / 2), y - Math.round(side / 2), side, side), label };
}

/** The footprint: the pointer's square cropped to the frame, and the label's band when there is text. */
function footprint(value: Data, aspectRatio: string): LayerRect {
  const { pointer, label } = calloutParts(value, aspectRatio);
  const boxes = [pointer, ...(value.text ? [label] : [])];
  const left = Math.max(0, Math.min(...boxes.map(box => box.left))), top = Math.max(0, Math.min(...boxes.map(box => box.top)));
  const right = Math.min(1, Math.max(...boxes.map(box => box.left + box.width))), bottom = Math.min(1, Math.max(...boxes.map(box => box.top + box.height)));
  return { left, top, width: right - left, height: bottom - top };
}

/** An arrow or ring on a point of the frame, with an optional label; it may point at the face, but its label keeps off it when it can. */
export const callout: TemplateKind<typeof data> = {
  kind: "callout",
  kindVersion: 1,
  description: "an arrow or ring that lands on a point of the frame and pulses, target {x,y} in % of the frame from its top left, with an " +
    "optional label pill below or above it; it may point at the face, its label keeps off the face where it can; also over an insert",
  placements: ["over"],
  data,
  text: { text: 24 },
  slots: {},
  hidesCaptions: () => false,
  onInserts: true,
  rect: footprint,
  parts: (value, aspectRatio) => calloutParts(value, aspectRatio),
  faceRect: (value, aspectRatio) => (value.text ? calloutParts(value, aspectRatio).label : undefined),
  sample: { target: { x: 50, y: 70 }, style: "ring", text: "tap to answer" },
};
