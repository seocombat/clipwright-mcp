import { z } from "zod";
import { faceZone, frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";

export const CHECKLIST_ICONS = ["phone", "briefcase", "user", "clock", "chat", "star"] as const;
export const CHECKLIST_FONT_PX = 60;
export const CHECKLIST_EMS = { row: 1.9, gap: 0.3, cursor: 1.5, width: 14 } as const;
const item = z.object({ label: z.string().min(1).max(24), on: z.boolean(), icon: z.enum(CHECKLIST_ICONS).optional() }).strict();
const click = z.object({ item: z.number().int().min(0).max(3), quote: z.string().min(1).max(200).optional() }).strict();
const data = z.object({ items: z.array(item).min(2).max(4), clicks: z.array(click).max(6).optional(), style: z.enum(["switch", "check"]).optional(),
  size: templateSize }).strict().superRefine((value, context) => {
  for (const [index, entry] of (value.clicks ?? []).entries()) {
    if (entry.item >= value.items.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["clicks", index, "item"], message: `item ${entry.item} is past the ${value.items.length} items` });
  }
});

export const checklist: TemplateKind<typeof data> = {
  kind: "checklist",
  kindVersion: 1,
  description: "2–4 rows, each an optional icon, a label and a switch or check box set on or off; a cursor clicks rows in turn (item is the " +
    "row's index from 0), each click flipping it; below the face",
  placements: ["over"],
  data,
  text: { "items.label": 24 },
  quotes: ["clicks.quote"],
  beatsFrom: 12,
  slots: {},
  hidesCaptions: () => false,
  onInserts: false,
  rect: (value, aspectRatio, _placement, framing) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, margin = Math.round(0.04 * Math.min(w, h)), face = faceZone(aspectRatio, framing);
    const rows = value.items.length, ems = rows * CHECKLIST_EMS.row + (rows - 1) * CHECKLIST_EMS.gap + CHECKLIST_EMS.cursor;
    const wide = w > h, room = wide ? h - 2 * margin : h - margin - Math.round((face.top + face.height + 0.01) * h);
    const em = Math.min(CHECKLIST_FONT_PX * sizedScale(value.size, canvas), room / ems), height = Math.round(ems * em);
    const width = Math.round(Math.min(wide ? face.left * w - 2 * margin : 0.9 * w, (CHECKLIST_EMS.width + CHECKLIST_EMS.cursor) * em));
    const left = wide ? margin : Math.round((w - width) / 2);
    const top = wide ? Math.round((h - height) / 2) : Math.min(h - margin - height, Math.max(Math.round((face.top + face.height + 0.01) * h),
      Math.round(0.71 * h - height / 2)));
    return { left: left / w, top: top / h, width: width / w, height: height / h };
  },
  sample: { items: [{ label: "answers calls", on: true, icon: "phone" }, { label: "works 24/7", on: false, icon: "briefcase" },
    { label: "gets annoyed", on: true, icon: "user" }], clicks: [{ item: 1, quote: "all day" }, { item: 2, quote: "never" }] },
};
