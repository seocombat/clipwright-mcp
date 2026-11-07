import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fullWidth, sizedScale, templateSize } from "./size.js";
import { templateMedia } from "./slot.js";

/** The word's size at medium on a 1080 short side; a long word shrinks to the area's width. */
export const WORD_FILL_FONT_PX = 300;
/** The area's height in word sizes: one line of letters stretched up, with room for their rim. */
export const WORD_FILL_EMS = { height: 1.8 } as const;
const data = z.object({ word: z.string().min(1).max(10).regex(/^\S+$/u, "word is one word, without spaces"), clip: templateMedia, size: templateSize })
  .strict();

/** One huge word on a full frame whose letters are windows onto the account's clip (#1175 S5 C2). */
export const wordFill: TemplateKind<typeof data> = {
  kind: "word_fill",
  kindVersion: 1,
  description: "a full-frame single huge word whose letters show your video (clip, playing muted), the rest of the frame the theme's ground; " +
    "it grows in over its first 10 frames",
  placements: ["full"],
  data,
  text: { word: 10 },
  slots: { clip: { type: "video" } },
  hidesCaptions: () => true,
  onInserts: false,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), em = WORD_FILL_FONT_PX * sizedScale(value.size, canvas);
    return centredArea(canvas, fullWidth(value.size, canvas), Math.min(0.9 * canvas.height, WORD_FILL_EMS.height * em));
  },
  sample: { word: "FOCUS", clip: { asset_id: `ast_${"5".repeat(32)}` } },
};
