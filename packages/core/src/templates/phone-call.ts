import { z } from "zod";
import { faceZone, frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";
import { templateMedia } from "./slot.js";

export const PHONE_CALL_WIDTH_PX = 360;
const data = z.object({ caller: z.string().min(1).max(24), subtitle: z.string().min(1).max(32).optional(), avatar: templateMedia.optional(),
  answer_at: z.string().min(1).max(200), side: z.enum(["left", "right"]).optional(), size: templateSize,
  banner: z.string().min(1).max(32).optional(), banner_note: z.string().min(1).max(48).optional(), mask_number: z.boolean().optional() }).strict();

export const phoneCall: TemplateKind<typeof data> = {
  kind: "phone_call",
  kindVersion: 2,
  description: "an incoming call on a neutral phone at the side (right unless side left): the caller, a subtitle and a round avatar ring, then " +
    "the call is answered on answer_at and its timer runs (or a hold banner shows); beside the face in wide frames, under it in tall ones",
  placements: ["over"],
  data,
  text: { caller: 24, subtitle: 32, banner: 32, banner_note: 48 },
  quotes: ["answer_at"],
  beatsFrom: 9,
  slots: { avatar: { type: "image", cover: 1 } },
  hidesCaptions: () => false,
  onInserts: false,
  rect: (value, aspectRatio, _placement, framing) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, margin = Math.round(0.04 * Math.min(w, h)), face = faceZone(aspectRatio, framing);
    let width = Math.round(PHONE_CALL_WIDTH_PX * sizedScale(value.size, canvas)), top = Math.round((face.top + face.height + 0.01) * h);
    if (w >= h) {
      width = Math.min(width, Math.floor((w * (1 - face.left - face.width) - 2 * margin) / 2) * 2, Math.floor((h - 2 * margin) / 4) * 2);
      top = margin;
    } else {
      width = Math.min(width, Math.floor((h - margin - top) / 4) * 2);
    }
    const left = value.side === "left" ? margin : w - margin - width;
    return { left: left / w, top: top / h, width: width / w, height: (2 * width) / h };
  },
  sample: { caller: "+1 (305) 555-0147", subtitle: "Brightline Plumbing", answer_at: "answers", side: "right", banner: "Hold This Call?",
    banner_note: "You'll be notified to pick up." },
};
