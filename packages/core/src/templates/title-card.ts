import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";
import { templateMedia } from "./slot.js";

export const TITLE_CARD_FONT_PX = 96;
export const TITLE_CARD_RECT_EMS = 5;
const data = z.object({ title: z.string().min(1).max(48), chip: z.string().min(1).max(32).optional(), logo: templateMedia.optional(),
  size: templateSize }).strict();

export const titleCard: TemplateKind<typeof data> = {
  kind: "title_card",
  kindVersion: 1,
  description: "a full-frame hook card: the title (up to two lines) on a white card beside an optional logo image, and an optional chip under it",
  placements: ["full"],
  data,
  text: { title: 48, chip: 32 },
  slots: { logo: { type: "image" } },
  hidesCaptions: () => true,
  onInserts: false,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, scale = sizedScale(value.size, canvas);
    const width = Math.round(Math.min(0.95 * w, 1022 * scale)), height = Math.round(TITLE_CARD_RECT_EMS * TITLE_CARD_FONT_PX * scale);
    return { left: Math.round((w - width) / 2) / w, top: Math.round((h > w ? 0.38 : 0.5) * h - height / 2) / h, width: width / w, height: height / h };
  },
  sample: { title: "fonio.ai", chip: "raised $17 million" },
};
