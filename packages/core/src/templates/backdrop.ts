import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fillingStep, templateSize } from "./size.js";
import { templateMedia } from "./slot.js";

/** What stands behind, between and around the presenter (#1428 S2); each is one recipe of the same layers. */
export const BACKDROP_STYLES = ["swap", "wall", "gallery", "sticker", "doodle", "glass", "pop_out", "vertigo"] as const;
export type BackdropStyle = (typeof BACKDROP_STYLES)[number];
/** The styles that show `notes` and the ones that take a `picture`; any other style refuses them rather than drop them unseen. */
export const BACKDROP_NOTES_STYLES: readonly BackdropStyle[] = ["wall"];
export const BACKDROP_PICTURE_STYLES: readonly BackdropStyle[] = ["swap", "gallery"];

const data = z.object({
  style: z.enum(BACKDROP_STYLES),
  title: z.string().min(1).max(16),
  notes: z.array(z.string().min(1).max(24)).min(1).max(3).optional(),
  picture: templateMedia.optional(),
  size: templateSize,
}).strict().superRefine((value, context) => {
  if (value.notes && !BACKDROP_NOTES_STYLES.includes(value.style)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["notes"], message: `notes show on style ${BACKDROP_NOTES_STYLES.join(" or ")}, not ${value.style}` });
  }
  if (value.picture && !BACKDROP_PICTURE_STYLES.includes(value.style)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["picture"], message: `picture shows on style ${BACKDROP_PICTURE_STYLES.join(" or ")}, not ${value.style}` });
  }
});

/** A new backdrop behind the presenter, who is cut out of the take and stands in front of it (#1428 S2). */
export const backdrop: TemplateKind<typeof data> = {
  kind: "backdrop",
  kindVersion: 1,
  description: "the presenter stands in front of a new backdrop filling the frame; style: swap (a green screen that turns into a new " +
    "background, picture if given, title on a tag), wall (paper headlines pinned on the wall behind the head: title and up to 3 notes), " +
    "gallery (framed prints popping onto the wall behind, picture in the first frame if given, title on a plaque), sticker (the presenter " +
    "as a paper sticker with a thick white edge on kraft paper, title on a taped label), doodle (a white edge around the presenter with " +
    "hand-drawn crown, star, heart and the title wobbling), glass (the title huge behind a frosted glass panel), pop_out (the presenter " +
    "breaking out of a card, title under it), vertigo (a corridor rushing behind the presenter, title at its end); it settles within its " +
    "first second; on a plain script run (no inserts, overlays, layout_windows, framing, call, interview or shots); free",
  placements: ["full"],
  data,
  text: { title: 16, notes: 24 },
  slots: { picture: { type: "image" } },
  cutout: true,
  fillsFrame: true,
  hidesCaptions: () => true,
  onInserts: false,
  // The words' area: the whole frame, a quarter smaller at small; the backdrop and the presenter always fill the frame.
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), step = fillingStep(value.size);
    return centredArea(canvas, step * canvas.width, step * canvas.height);
  },
  sample: { style: "wall", title: "NO EDITOR", notes: ["ONE TAKE", "ZERO CUTS"] },
};
