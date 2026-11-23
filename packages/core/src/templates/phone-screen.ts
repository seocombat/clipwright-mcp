import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fillingStep, fullWidth, sizedScale, templateSize } from "./size.js";
import { templateMedia } from "./slot.js";

export const PHONE_SCREEN_STATES = ["lock", "play", "liked", "counter", "timer", "tag"] as const;
export const PHONE_SCREEN_FONT_PX = 84;
export const PHONE_SCREEN_EMS = { phone: 11.5, phoneHeight: 21.2 } as const;
const state = z.object({ state: z.enum(PHONE_SCREEN_STATES), text: z.string().min(1).max(24).optional(), at: z.string().min(1).max(200).optional() })
  .strict();
const data = z.object({ screen: templateMedia.optional(), states: z.array(state).min(1).max(6), size: templateSize }).strict();

export const phoneScreen: TemplateKind<typeof data> = {
  kind: "phone_screen",
  kindVersion: 1,
  description: "a full-frame phone playing the screen video (muted; a gradient without one) whose states change in turn, each on its at " +
    "quote or spread evenly: lock (dimmed, a lock and the text), play (the video clear, the text at its top), liked (a heart and the text), counter (a pill " +
    "at the screen's foot), timer (a badge on its top edge), tag (a chip with a pointer line at the screen's side); lock, play and liked replace one " +
    "another, tags add up, a later counter or timer replaces the earlier",
  placements: ["full"],
  data,
  text: { "states.text": 24 },
  quotes: ["states.at"],
  spreads: "states",
  beatsFrom: 7,
  slots: { screen: { type: "video", cover: 9 / 16 } },
  hidesCaptions: () => true,
  onInserts: false,
  fillsFrame: true,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), em = fillingStep(value.size) * Math.min(PHONE_SCREEN_FONT_PX * sizedScale("medium", canvas),
      (0.92 * canvas.height) / PHONE_SCREEN_EMS.phoneHeight, fullWidth("medium", canvas) / PHONE_SCREEN_EMS.phone);
    return centredArea(canvas, fullWidth(value.size, canvas), PHONE_SCREEN_EMS.phoneHeight * em);
  },
  sample: { states: [{ state: "lock", text: "Log in to watch", at: "locked" }, { state: "play", text: "now playing", at: "plays" }, { state: "liked", text: "watch only", at: "like" },
    { state: "counter", text: "41 broken down", at: "forty" }, { state: "tag", text: "hook", at: "hook" }] },
};
