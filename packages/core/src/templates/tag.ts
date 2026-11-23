import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";

export const TAG_POSITIONS = ["top", "center", "bottom"] as const;
const CENTRES = { top: 0.22, center: 0.5, bottom: 0.78, caption: 0.66 } as const;
export const TAG_FONT_PX = 92;
export const TAG_RECT_EMS = 1.6;
const data = z.object({ text: z.string().min(1).max(32), position: z.enum(TAG_POSITIONS).optional(), size: templateSize }).strict();

export const tag: TemplateKind<typeof data> = {
  kind: "tag",
  kindVersion: 1,
  description: "a short gradient pill over the presenter or an insert; without position it sits in the caption spot and hides captions while it shows",
  placements: ["over"],
  data,
  text: { text: 32 },
  slots: {},
  hidesCaptions: value => value.position === undefined,
  onInserts: true,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, short = Math.min(w, h), scale = sizedScale(value.size, canvas);
    const width = Math.round(Math.min(0.9 * w, 1.25 * short * scale)), height = Math.round(TAG_RECT_EMS * TAG_FONT_PX * scale);
    return { left: Math.round((w - width) / 2) / w, top: Math.round(CENTRES[value.position ?? "caption"] * h - height / 2) / h, width: width / w,
      height: height / h };
  },
  sample: { text: "sounds natural", position: "center" },
};
