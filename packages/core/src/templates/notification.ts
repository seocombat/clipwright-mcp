import { z } from "zod";
import { faceZone, frameCanvasOf } from "../ugc-layers.js";
import { CHECKLIST_ICONS } from "./checklist.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";

export const NOTIFICATION_FONT_PX = 38;
export const NOTIFICATION_EMS = { height: 3.6, width: 26, peek: 0.45 } as const;
const card = z.object({ app: z.string().min(1).max(20).optional(), title: z.string().min(1).max(32), body: z.string().min(1).max(80),
  icon: z.enum(CHECKLIST_ICONS).optional(), at: z.string().min(1).max(200).optional() }).strict();
const data = z.object({ app: z.string().min(1).max(20), title: z.string().min(1).max(32), body: z.string().min(1).max(80),
  icon: z.enum(CHECKLIST_ICONS).optional(), stack: z.array(card).min(1).max(2).optional(), size: templateSize }).strict();
type Data = z.infer<typeof data>;

export const notificationEms = (value: { stack?: readonly unknown[] | undefined }) => NOTIFICATION_EMS.height + (value.stack?.length ?? 0) * NOTIFICATION_EMS.peek;

export const notification: TemplateKind<typeof data> = {
  kind: "notification",
  kindVersion: 2,
  description: "a phone notification at the top, above the face: an icon (else the app's initial), the app, a title and a body line; it drops " +
    "in, holds at least 1.2 s and leaves before its span ends; each stack card drops in on top on its at, pushing earlier ones back",
  placements: ["over"],
  data,
  text: { app: 20, title: 32, body: 80, "stack.app": 20, "stack.title": 32, "stack.body": 80 },
  quotes: ["stack.at"],
  slots: {},
  hidesCaptions: () => false,
  onInserts: false,
  rect: (value: Data, aspectRatio, _placement, framing) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, ems = notificationEms(value);
    const top = Math.round(0.012 * h), room = Math.floor(faceZone(aspectRatio, framing).top * h) - top;
    const em = Math.min(NOTIFICATION_FONT_PX * sizedScale(value.size, canvas), room / ems);
    const width = Math.round(Math.min(0.92 * w, NOTIFICATION_EMS.width * em)), height = Math.round(ems * em);
    return { left: Math.round((w - width) / 2) / w, top: top / h, width: width / w, height: height / h };
  },
  sample: { app: "Front Desk", title: "New booking: Maya Chen", body: "Tomorrow at 10:30, teeth cleaning. Booked while you slept.", icon: "chat",
    stack: [{ app: "Front Desk", title: "New booking: Sam Ortiz", body: "Friday at 9:00, whitening.", icon: "chat", at: "Sam" }] },
};

export const notificationV1 = { ...notification, kindVersion: 1 } as TemplateKind<typeof data>;
