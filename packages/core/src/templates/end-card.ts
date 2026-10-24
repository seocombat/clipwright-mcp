import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";

/** The footprint is this many site font sizes high (pill, gap and call to action); the site at medium is the tag's 92 px. */
export const END_CARD_RECT_EMS = 3.4;
const data = z.object({ site: z.string().min(1).max(32), cta: z.string().min(1).max(48).optional(), size: templateSize }).strict();

/** The closing card in the caption spot: the site on the gradient pill and an optional call to action under it. */
export const endCard: TemplateKind<typeof data> = {
  kind: "end_card",
  kindVersion: 1,
  description: "a site pill with an optional call to action in the caption spot; captions are hidden while it shows",
  placements: ["over"],
  data,
  text: { site: 32, cta: 48 },
  slots: {},
  hidesCaptions: () => true,
  onInserts: false,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, short = Math.min(w, h), scale = sizedScale(value.size, canvas);
    const width = Math.round(Math.min(0.9 * w, 1.25 * short * scale)), height = Math.round(END_CARD_RECT_EMS * 92 * scale);
    return { left: Math.round((w - width) / 2) / w, top: Math.round(0.72 * h - height / 2) / h, width: width / w, height: height / h };
  },
  sample: { site: "clipwright.io", cta: "make your first video" },
};
