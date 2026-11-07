import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";

/** How the bar draws and enters (#1119): a card wiped in with a tab, a rule beside the text, a rounded pill with a dot, or the name revealed
 * behind a sweeping bar. */
export const LOWER_THIRD_STYLES = ["clean_bar", "side_rule", "soft_pill", "mask_reveal"] as const;
const data = z.object({ name: z.string().min(1).max(28), role: z.string().min(1).max(36).optional(), side: z.enum(["left", "right"]),
  style: z.enum(LOWER_THIRD_STYLES).optional(), size: templateSize }).strict();

/** A name bar low in the frame, in the caption spot: captions step aside while it shows. */
export const lowerThird: TemplateKind<typeof data> = {
  kind: "lower_third",
  kindVersion: 2,
  description: "a name and role bar low in the frame; captions are hidden while it shows; style absent is clean_bar",
  placements: ["over"],
  data,
  text: { name: 28, role: 36 },
  slots: {},
  hidesCaptions: () => true,
  onInserts: false,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, margin = Math.round(0.04 * Math.min(w, h));
    const scale = sizedScale(value.size, canvas);
    const width = Math.round(Math.min(w - 2 * margin, 760 * scale)), height = Math.round(227 * scale);
    const left = value.side === "left" ? margin : w - margin - width;
    return { left: left / w, top: (Math.round(0.86 * h) - height) / h, width: width / w, height: height / h };
  },
  sample: { name: "Maya Chen", role: "Founder, Northwind Dental", side: "left" },
};

/** Version 1: no style; its footprint is version 2's. */
export const lowerThirdV1 = { ...lowerThird, kindVersion: 1 } as TemplateKind<typeof data>;
