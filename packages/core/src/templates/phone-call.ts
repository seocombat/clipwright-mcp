import { z } from "zod";
import { faceZone, frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";
import { templateMedia } from "./slot.js";

/** The phone's width at medium on a 1080 short side; it is twice as high. */
export const PHONE_CALL_WIDTH_PX = 360;
const data = z.object({ caller: z.string().min(1).max(24), subtitle: z.string().min(1).max(32).optional(), avatar: templateMedia.optional(),
  answer_at: z.string().min(1).max(200), side: z.enum(["left", "right"]).optional(), size: templateSize }).strict();

/** An incoming call on a neutral phone at the side of the frame, ringing until it is answered on a word (reference seconds 26–43). */
export const phoneCall: TemplateKind<typeof data> = {
  kind: "phone_call",
  kindVersion: 1,
  description: "an incoming call on a neutral phone at the side (right unless side left): the caller, a subtitle and a round avatar ring, then " +
    "the call is answered on answer_at and its timer runs; beside the face in wide frames, under it in tall ones",
  placements: ["over"],
  data,
  text: { caller: 24, subtitle: 32 },
  quotes: ["answer_at"],
  beatsFrom: 9,
  slots: { avatar: { type: "image", cover: 1 } },
  hidesCaptions: () => false,
  onInserts: false,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, margin = Math.round(0.04 * Math.min(w, h)), face = faceZone(aspectRatio);
    let width = Math.round(PHONE_CALL_WIDTH_PX * sizedScale(value.size, canvas)), top = Math.round((face.top + face.height + 0.01) * h);
    // A frame at least as wide as high has room beside the face, from the top; a tall one under it, down the side.
    if (w >= h) {
      width = Math.min(width, Math.floor((w * (1 - face.left - face.width) - 2 * margin) / 2) * 2, Math.floor((h - 2 * margin) / 4) * 2);
      top = margin;
    }
    const left = value.side === "left" ? margin : w - margin - width;
    return { left: left / w, top: top / h, width: width / w, height: (2 * width) / h };
  },
  sample: { caller: "+1 (305) 555-0147", subtitle: "incoming call", answer_at: "answers", side: "right" },
};
