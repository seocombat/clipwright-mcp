import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { fillingStep, fullWidth, templateSize } from "./size.js";
import { templateMedia } from "./slot.js";

/** The card is 3:5, as tall as the reference's, and both pictures are cut to fill it; at medium it takes the full frame's width, or less where a
 * 3:5 card would run past the frame's height (square and wide frames). */
export const COMPARE_CARD_SHAPE = 3 / 5;
/** How the after picture comes in: on a diagonal from the right, wiped across from the left behind a divider (#1119), or wiped on until the
 * divider slides out and the after picture fills the card (#1159). */
export const COMPARE_REVEALS = ["sweep", "wipe", "wipe_full"] as const;
const data = z.object({ before: templateMedia, after: templateMedia,
  labels: z.object({ before: z.string().min(1).max(20).optional(), after: z.string().min(1).max(20).optional() }).strict().optional(),
  reveal_at: z.string().min(1).max(200), reveal: z.enum(COMPARE_REVEALS).optional(), size: templateSize }).strict();

/** Expectation against reality on a full frame: the before picture on a card, the after one swept in on a diagonal on a word (ref 50–55 s). */
export const compare: TemplateKind<typeof data> = {
  kind: "compare",
  kindVersion: 3,
  description: "a full-frame 3:5 card showing the before image; on reveal_at the after image sweeps in on a diagonal (reveal absent) or wipes in " +
    "from the left to a middle divider, and both stay; wipe_full wipes on until the after image fills the card; optional label pills",
  placements: ["full"],
  data,
  text: { "labels.before": 20, "labels.after": 20 },
  quotes: ["reveal_at"],
  beatsFrom: 9,
  slots: { before: { type: "image", cover: COMPARE_CARD_SHAPE }, after: { type: "image", cover: COMPARE_CARD_SHAPE } },
  hidesCaptions: () => true,
  onInserts: false,
  fillsFrame: true,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas;
    const width = Math.round(fillingStep(value.size) * Math.min(fullWidth("medium", canvas), 0.92 * h * COMPARE_CARD_SHAPE));
    const height = Math.round(width / COMPARE_CARD_SHAPE);
    return { left: Math.round((w - width) / 2) / w, top: Math.round((h - height) / 2) / h, width: width / w, height: height / h };
  },
  sample: { before: { asset_id: `ast_${"b".repeat(32)}` }, after: { asset_id: `ast_${"a".repeat(32)}` }, labels: { before: "expectation", after: "reality" },
    reveal_at: "in reality" },
};

/** Version 1: the sweep only; version 2 adds the half wipe. Both keep version 3's footprint. */
export const compareV1 = { ...compare, kindVersion: 1 } as TemplateKind<typeof data>;
export const compareV2 = { ...compare, kindVersion: 2 } as TemplateKind<typeof data>;
