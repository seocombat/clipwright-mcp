import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, sizedScale, templateSize } from "./size.js";

export const WORD_TITLE_REVEALS = ["replace", "build"] as const;
/** A word at medium on a 1080 short side; the area is this many sizes high: three lines of a built title. */
export const WORD_TITLE_FONT_PX = 150;
export const WORD_TITLE_RECT_EMS = 3.8;
const word = z.object({ text: z.string().min(1).max(16), at: z.string().min(1).max(200).optional() }).strict();
const data = z.object({ words: z.array(word).min(1).max(8), reveal: z.enum(WORD_TITLE_REVEALS).optional(), size: templateSize }).strict();

/** A kinetic title on a full frame: each entry shows on its beat, replacing the one before or building the line. */
export const wordTitle: TemplateKind<typeof data> = {
  kind: "word_title",
  kindVersion: 1,
  description: "a full-frame kinetic title in the accent colour: the first entry shows from the template's first frame, each later entry on " +
    "its at quote (usually the same words, as spoken), or spread evenly; reveal replace (default) shows one entry at a time, build adds each to the title",
  placements: ["full"],
  data,
  text: { "words.text": 16 },
  quotes: ["words.at"],
  spreads: "words",
  // The title has no enter of its own: its first entry shows from the first frame, so the frame is never bare (#1129).
  beatsFrom: 0,
  firstBeatAtStart: true,
  slots: {},
  hidesCaptions: () => true,
  onInserts: false,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), em = WORD_TITLE_FONT_PX * sizedScale(value.size, canvas);
    return centredArea(canvas, Math.min(0.9 * canvas.width, 6.6 * em), Math.min(0.9 * canvas.height, WORD_TITLE_RECT_EMS * em));
  },
  sample: { words: [{ text: "in", at: "in" }, { text: "under", at: "under" }, { text: "a", at: "a" }, { text: "minute", at: "minute" }] },
};
