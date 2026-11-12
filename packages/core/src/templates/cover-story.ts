import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fillingStep, templateSize } from "./size.js";

const data = z.object({
  masthead: z.string().min(1).max(10).regex(/^\S+$/u, "masthead is one word, without spaces"),
  issue: z.string().min(1).max(28).optional(),
  number: z.string().min(1).max(4).optional(),
  cover_line: z.string().min(1).max(32),
  size: templateSize,
}).strict();

/** A magazine cover over the whole frame, its masthead behind the presenter's head (#1428): the presenter is cut out and stands in front. */
export const coverStory: TemplateKind<typeof data> = {
  kind: "cover_story",
  kindVersion: 1,
  description: "a magazine cover filling the frame: the presenter stands in front of a huge masthead word, with an issue line, a big " +
    "number and a cover line around them; it drops in over its first 10 frames; on a plain script run (no inserts, overlays, layout_windows, " +
    "framing, call, interview or shots); free",
  placements: ["full"],
  data,
  text: { masthead: 10, issue: 28, number: 4, cover_line: 32 },
  slots: {},
  cutout: true,
  fillsFrame: true,
  hidesCaptions: () => true,
  onInserts: false,
  // The type's area: the whole frame, a quarter smaller at small; the presenter is drawn over the whole frame at every size.
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), step = fillingStep(value.size);
    return centredArea(canvas, step * canvas.width, step * canvas.height);
  },
  sample: { masthead: "FOCUS", issue: "ISSUE 17 · NOVEMBER", number: "17", cover_line: "ONE HABIT, NO EDITOR" },
};
