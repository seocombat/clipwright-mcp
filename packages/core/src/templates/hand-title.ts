import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fullWidth, sizedScale, templateSize } from "./size.js";

/** The title's handwriting at medium on a 1080 short side; on a full frame it draws this much larger. */
export const HAND_TITLE_FONT_PX = 110;
const FULL_SCALE = 1.3;
/** Text sizes: two lines of the title with the marker's room around them; the width is the full frame's. */
export const HAND_TITLE_EMS = { height: 2.9 } as const;
/** The marker's strokes: a broad swipe behind the words, a wavy line under them, or a loop around them. */
export const HAND_MARKS = ["highlight", "underline", "circle"] as const;
/** The marked words by position, so they are always words the title holds: the first's index from 0 and how many (absent: one). */
const mark = z.object({ word: z.number().int().min(0).max(9), words: z.number().int().min(1).max(4).optional(), style: z.enum(HAND_MARKS),
  at: z.string().min(1).max(200).optional() }).strict();
const data = z.object({ text: z.string().min(1).max(40), mark: mark.optional(), size: templateSize }).strict().superRefine((value, context) => {
  const count = value.text.split(" ").filter(Boolean).length;
  if (value.mark && value.mark.word + (value.mark.words ?? 1) > count) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["mark", "word"], message: `the marked words run past the title's ${count} words` });
  }
});

/** A title written out letter by letter in a hand-drawn face, then a marker stroke drawn on chosen words on their beat (#1120). Over the presenter
 * it sits in the caption spot and hides captions. */
export const handTitle: TemplateKind<typeof data> = {
  kind: "hand_title",
  kindVersion: 1,
  description: "a title written out stroke by stroke in a handwriting face (up to two lines), then a marker drawn on the title's words from " +
    "mark.word (index from 0) for mark.words (absent 1), on mark.at or late in the template; over sits in the caption spot and hides captions",
  placements: ["full", "over"],
  data,
  text: { text: 40 },
  quotes: ["mark.at"],
  // The title writes for at least the first 12 frames.
  beatsFrom: 14,
  slots: {},
  hidesCaptions: () => true,
  onInserts: false,
  rect: (value, aspectRatio, placement) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas;
    const em = HAND_TITLE_FONT_PX * sizedScale(value.size, canvas) * (placement === "full" ? FULL_SCALE : 1), height = HAND_TITLE_EMS.height * em;
    if (placement === "full") return centredArea(canvas, fullWidth(value.size, canvas), Math.min(0.92 * h, height));
    const width = Math.round(fullWidth(value.size, canvas)), tall = Math.round(Math.min(0.3 * h, height));
    // Over the presenter it sits in the caption spot, low enough to keep off a wide presenter's face at every size.
    return { left: Math.round((w - width) / 2) / w, top: Math.round(0.7 * h - tall / 2) / h, width: width / w, height: tall / h };
  },
  sample: { text: "Posted daily for 30 days", mark: { word: 3, words: 2, style: "underline", at: "results" } },
};
