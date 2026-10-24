import { z } from "zod";
import { faceZone, frameCanvasOf } from "../ugc-layers.js";
import { CHECKLIST_ICONS } from "./checklist.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";

/** The title's line at medium on a 1080 short side; the band above the face shrinks it in square and wide frames. */
export const NOTIFICATION_FONT_PX = 38;
/** Font sizes: the card's height (app, title and body lines with padding) and its widest. */
export const NOTIFICATION_EMS = { height: 3.6, width: 26 } as const;
const data = z.object({ app: z.string().min(1).max(20), title: z.string().min(1).max(32), body: z.string().min(1).max(80),
  icon: z.enum(CHECKLIST_ICONS).optional(), size: templateSize }).strict();

/** A phone notification in the band above the face, centred at the top of every format. */
export const notification: TemplateKind<typeof data> = {
  kind: "notification",
  kindVersion: 1,
  description: "a phone notification at the top, above the face: an icon (else the app's initial), the app, a title and a body line; it " +
    "drops in, holds at least 1.2 s, then leaves before its span ends",
  placements: ["over"],
  data,
  text: { app: 20, title: 32, body: 80 },
  slots: {},
  hidesCaptions: () => false,
  onInserts: false,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas;
    const top = Math.round(0.012 * h), room = Math.floor(faceZone(aspectRatio).top * h) - top;
    const em = Math.min(NOTIFICATION_FONT_PX * sizedScale(value.size, canvas), room / NOTIFICATION_EMS.height);
    const width = Math.round(Math.min(0.92 * w, NOTIFICATION_EMS.width * em)), height = Math.round(NOTIFICATION_EMS.height * em);
    return { left: Math.round((w - width) / 2) / w, top: top / h, width: width / w, height: height / h };
  },
  sample: { app: "Front Desk", title: "New booking: Maya Chen", body: "Tomorrow at 10:30, teeth cleaning. Booked while you slept.", icon: "chat" },
};
