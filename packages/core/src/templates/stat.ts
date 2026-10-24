import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";

/** The number at medium on a 1080 short side over the presenter; on a full frame it draws 1.6 times larger. */
export const STAT_FONT_PX = 120;
const FULL_SCALE = 1.6;
/** The drawn area is this many number sizes high: the number and its label; the composition reads the size back. */
export const STAT_RECT_EMS = 1.9;
const data = z.object({ value: z.number().min(0).max(999_999_999).multipleOf(0.01), prefix: z.string().min(1).max(6).optional(),
  suffix: z.string().min(1).max(6).optional(), label: z.string().min(1).max(32).optional(), size: templateSize }).strict();

/** A number that counts up from zero to `value`, with an optional prefix, suffix and label under it. */
export const stat: TemplateKind<typeof data> = {
  kind: "stat",
  kindVersion: 1,
  description: "a number counting up from 0 to value (up to 2 decimals), with prefix and suffix around it and a label under it; " +
    "full fills the frame, over sits at chest level on a card",
  placements: ["full", "over"],
  data,
  text: { prefix: 6, suffix: 6, label: 32 },
  slots: {},
  hidesCaptions: () => false,
  onInserts: false,
  rect: (value, aspectRatio, placement) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, short = Math.min(w, h);
    const scale = sizedScale(value.size, canvas) * (placement === "full" ? FULL_SCALE : 1);
    const width = Math.round(Math.min(0.9 * w, 1.1 * short * Math.min(scale, 1))), height = Math.round(STAT_RECT_EMS * STAT_FONT_PX * scale);
    // Over the presenter it sits at chest level, as the reference's toggle card (62–80% of the height), off the face.
    const centre = placement === "full" ? 0.5 : 0.71;
    return { left: Math.round((w - width) / 2) / w, top: Math.round(centre * h - height / 2) / h, width: width / w, height: height / h };
  },
  sample: { value: 17, prefix: "$", suffix: "M", label: "raised this year" },
};
