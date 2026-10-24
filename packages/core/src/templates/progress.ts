import { z } from "zod";
import { faceZone, frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";

/** A step's label at medium on a 1080 short side. */
export const PROGRESS_FONT_PX = 56;
/** Label sizes: a step's row, the card's padding above and below, and the card's width. */
export const PROGRESS_EMS = { row: 1.6, pad: 0.4, width: 12 } as const;
const data = z.object({ steps: z.array(z.string().min(1).max(20)).min(2).max(5), advance_at: z.array(z.string().min(1).max(200)).min(2).max(5).optional(),
  size: templateSize }).strict().superRefine((value, context) => {
  if (value.advance_at && value.advance_at.length !== value.steps.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["advance_at"], message: `gives ${value.advance_at.length} quotes for ${value.steps.length} steps: one per step` });
  }
});

/** Steps in a column on a card, completing in turn: below the face in tall and square frames, beside it in wide ones. */
export const progress: TemplateKind<typeof data> = {
  kind: "progress",
  kindVersion: 1,
  description: "2–5 steps in a column on a card, each completing with a check in turn, on its advance_at quote (one per step, in order) or " +
    "spread evenly; below the face",
  placements: ["over"],
  data,
  text: { steps: 20 },
  quotes: ["advance_at"],
  beatsFrom: 9,
  spreads: "steps",
  slots: {},
  hidesCaptions: () => false,
  onInserts: false,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, margin = Math.round(0.04 * Math.min(w, h)), face = faceZone(aspectRatio);
    const ems = value.steps.length * PROGRESS_EMS.row + 2 * PROGRESS_EMS.pad, below = Math.round((face.top + face.height + 0.01) * h);
    const wide = w > h, room = wide ? h - 2 * margin : h - margin - below;
    // The size scales the card, and a frame without room under the face shrinks it to fit.
    const em = Math.min(PROGRESS_FONT_PX * sizedScale(value.size, canvas), room / ems), height = Math.round(ems * em);
    const width = Math.round(Math.min(wide ? face.left * w - 2 * margin : 0.9 * w, PROGRESS_EMS.width * em));
    const left = wide ? margin : Math.round((w - width) / 2);
    const top = wide ? Math.round((h - height) / 2) : Math.min(h - margin - height, Math.max(below, Math.round(0.71 * h - height / 2)));
    return { left: left / w, top: top / h, width: width / w, height: height / h };
  },
  sample: { steps: ["call answered", "slot found", "visit booked"], advance_at: ["answers", "finds", "books"] },
};
