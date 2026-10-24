import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";
import { templateMedia } from "./slot.js";

/** The card's width at medium on a 1080 short side; it is 3:5, as tall as the reference's, and both pictures are cut to fill it. */
export const COMPARE_WIDTH_PX = 760;
export const COMPARE_CARD_SHAPE = 3 / 5;
const data = z.object({ before: templateMedia, after: templateMedia,
  labels: z.object({ before: z.string().min(1).max(20).optional(), after: z.string().min(1).max(20).optional() }).strict().optional(),
  reveal_at: z.string().min(1).max(200), size: templateSize }).strict();

/** Expectation against reality on a full frame: the before picture on a card, the after one swept in on a diagonal on a word (ref 50–55 s). */
export const compare: TemplateKind<typeof data> = {
  kind: "compare",
  kindVersion: 1,
  description: "a full-frame card showing the before image, then the after image sweeps in on a diagonal on reveal_at and both stay side by side, " +
    "each with an optional label pill; both images are cut to fill a 3:5 card",
  placements: ["full"],
  data,
  text: { "labels.before": 20, "labels.after": 20 },
  quotes: ["reveal_at"],
  beatsFrom: 9,
  slots: { before: { type: "image", cover: COMPARE_CARD_SHAPE }, after: { type: "image", cover: COMPARE_CARD_SHAPE } },
  hidesCaptions: () => true,
  onInserts: false,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas;
    let width = COMPARE_WIDTH_PX * sizedScale(value.size, canvas);
    width = Math.round(Math.min(width, 0.92 * w, 0.92 * h * COMPARE_CARD_SHAPE));
    const height = Math.round(width / COMPARE_CARD_SHAPE);
    return { left: Math.round((w - width) / 2) / w, top: Math.round((h - height) / 2) / h, width: width / w, height: height / h };
  },
  sample: { before: { asset_id: `ast_${"b".repeat(32)}` }, after: { asset_id: `ast_${"a".repeat(32)}` }, labels: { before: "expectation", after: "reality" },
    reveal_at: "in reality" },
};
