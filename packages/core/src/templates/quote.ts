import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { fullWidth, sizedScale, templateSize } from "./size.js";
import { templateMedia } from "./slot.js";

export const QUOTE_FONT_PX = 72;
export const QUOTE_RECT_EMS = 9.5;
const data = z.object({ text: z.string().min(1).max(120), author: z.string().min(1).max(32).optional(), photo: templateMedia.optional(),
  size: templateSize }).strict();

export const quote: TemplateKind<typeof data> = {
  kind: "quote",
  kindVersion: 1,
  description: "a full-frame quote card: marks, the text in up to four lines, then the author with an optional round photo, cut to a circle",
  placements: ["full"],
  data,
  text: { text: 120, author: 32 },
  slots: { photo: { type: "image", cover: 1 } },
  hidesCaptions: () => true,
  onInserts: false,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, scale = sizedScale(value.size, canvas);
    const width = Math.round(fullWidth(value.size, canvas)), height = Math.round(Math.min(0.92 * h, QUOTE_RECT_EMS * QUOTE_FONT_PX * scale));
    return { left: Math.round((w - width) / 2) / w, top: Math.round((h - height) / 2) / h, width: width / w, height: height / h };
  },
  sample: { text: "It answered every call while I was with patients, and nobody could tell.", author: "Maya Chen" },
};
