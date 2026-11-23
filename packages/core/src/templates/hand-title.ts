import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fullWidth, sizedScale, templateSize } from "./size.js";

export const HAND_TITLE_FONT_PX = 110;
const FULL_SCALE = 1.3;
export const HAND_TITLE_EMS = { height: 2.9 } as const;
export const HAND_MARKS = ["highlight", "underline", "circle"] as const;
const mark = z.object({ word: z.number().int().min(0).max(9), words: z.number().int().min(1).max(4).optional(), style: z.enum(HAND_MARKS),
  at: z.string().min(1).max(200).optional() }).strict();
const data = z.object({ text: z.string().min(1).max(40), mark: mark.optional(), size: templateSize }).strict().superRefine((value, context) => {
  const count = value.text.split(" ").filter(Boolean).length;
  if (value.mark && value.mark.word + (value.mark.words ?? 1) > count) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["mark", "word"], message: `the marked words run past the title's ${count} words` });
  }
});

export const handTitle: TemplateKind<typeof data> = {
  kind: "hand_title",
  kindVersion: 1,
  description: "a title written out stroke by stroke in a handwriting face (up to two lines), then a marker drawn on the title's words from " +
    "mark.word (index from 0) for mark.words (absent 1), on mark.at or late in the template; over sits in the caption spot and hides captions",
  placements: ["full", "over"],
  data,
  text: { text: 40 },
  quotes: ["mark.at"],
  beatsFrom: 14,
  slots: {},
  hidesCaptions: () => true,
  onInserts: false,
  rect: (value, aspectRatio, placement) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas;
    const em = HAND_TITLE_FONT_PX * sizedScale(value.size, canvas) * (placement === "full" ? FULL_SCALE : 1), height = HAND_TITLE_EMS.height * em;
    if (placement === "full") return centredArea(canvas, fullWidth(value.size, canvas), Math.min(0.92 * h, height));
    const width = Math.round(fullWidth(value.size, canvas)), tall = Math.round(Math.min(0.3 * h, height));
    return { left: Math.round((w - width) / 2) / w, top: Math.round(0.7 * h - tall / 2) / h, width: width / w, height: tall / h };
  },
  sample: { text: "Posted daily for 30 days", mark: { word: 3, words: 2, style: "underline", at: "results" } },
};
