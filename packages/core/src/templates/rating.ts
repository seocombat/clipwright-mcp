import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";

/** A star's size at medium on a 1080 short side. */
export const RATING_STAR_PX = 104;
/** Star sizes: the card's height with the row of stars, the label's band under it, and the card's width (five stars, four gaps, padding). */
export const RATING_EMS = { row: 1.44, label: 0.62, width: 6.32 } as const;
const data = z.object({ stars: z.number().min(1).max(5).multipleOf(0.5), label: z.string().min(1).max(32).optional(), size: templateSize }).strict();

/** Five stars on a card filling in turn up to a score, with an optional label: at chest level, off the face. */
export const rating: TemplateKind<typeof data> = {
  kind: "rating",
  kindVersion: 1,
  description: "five stars on a card filling in turn up to stars (1–5 in halves, a half star half filled), an optional label under them; " +
    "at chest level",
  placements: ["over"],
  data,
  text: { label: 32 },
  slots: {},
  hidesCaptions: () => false,
  onInserts: false,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, star = RATING_STAR_PX * sizedScale(value.size, canvas);
    const width = Math.round(Math.min(0.9 * w, RATING_EMS.width * star)), height = Math.round((RATING_EMS.row + (value.label ? RATING_EMS.label : 0)) * star);
    // At chest level, as the stat over the presenter, off the face (62–80% of the height).
    return { left: Math.round((w - width) / 2) / w, top: Math.round(0.71 * h - height / 2) / h, width: width / w, height: height / h };
  },
  sample: { stars: 4.5, label: "rated by 312 patients" },
};
