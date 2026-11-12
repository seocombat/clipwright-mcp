import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fillingStep, templateSize } from "./size.js";
import { templateMedia } from "./slot.js";

/** How an item shows its clip: a tilted card on the page, the card with two tiles orbiting it, the clip as an attachment in a chat,
 *  the clip on a phone's screen, or the view pulling back from the clip into an editor. */
export const SERIES_ITEM_LOOKS = ["card", "orbit", "ui", "phone", "editor"] as const;
export const SERIES_ITEMS = { min: 3, max: 17 } as const;
/** Lists longer than this take two columns. */
export const SERIES_ONE_COLUMN_MAX = 6;
/** The least time an item keeps on screen: a chat item types its prompt, so it keeps twice as long. */
export const SERIES_ITEM_FLOOR_SEC = { ui: 2.4, other: 1.2 } as const;
/** Frames the last item takes to dissolve back into the first, so the video loops. */
export const SERIES_LOOP_FRAMES = 10;
/** The one format the page is drawn in. */
export const SERIES_ASPECT = "9:16";

/** On only where the flag says so; off, a series_frame template is refused before any reserve. */
export function isSeriesFrameEnabled(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): boolean {
  return env.CLIPWRIGHT_SERIES_FRAME === "1";
}
export const SERIES_FRAME_DISABLED_MESSAGE = "series_frame is not available right now; use another template kind";

const item = z.object({
  name: z.string().min(1).max(24),
  clip: templateMedia.optional(),
  look: z.enum(SERIES_ITEM_LOOKS).optional(),
  prompt: z.string().min(1).max(32).optional(),
  at: z.string().min(1).max(200).optional(),
}).strict();

const data = z.object({
  title: z.string().min(1).max(40),
  accent: z.string().min(1).max(24).optional(),
  items: z.array(item).min(SERIES_ITEMS.min).max(SERIES_ITEMS.max),
  loop: z.boolean().optional(),
  size: templateSize,
}).strict().superRefine((value, context) => {
  if (value.accent !== undefined && !value.title.includes(value.accent)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["accent"], message: "accent names words of the title, as written there" });
  }
  value.items.forEach((entry, index) => {
    if (entry.prompt !== undefined && entry.look !== "ui") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["items", index, "prompt"], message: "prompt is typed in the chat of a ui item only" });
    }
  });
});
type Data = z.infer<typeof data>;

const seconds = (frames: number, fps: number) => `${(frames / fps).toFixed(1)} s`;

/** Each item's first frame from the template's start: an item with `at` starts on its words, the others share the time between evenly, a
 *  chat item twice the share; every item keeps its floor, and what that moves or leaves off screen is named. */
export function seriesFrameMoments(value: Data, beats: readonly (number | undefined)[], duration: number, fps: number, id: string):
  { moments: number[]; warnings: string[] } {
  const floors = value.items.map(entry => Math.round((entry.look === "ui" ? SERIES_ITEM_FLOOR_SEC.ui : SERIES_ITEM_FLOOR_SEC.other) * fps));
  const room = duration - (value.loop === false ? 0 : SERIES_LOOP_FRAMES), count = floors.length, warnings: string[] = [];
  const anchors = Array.from({ length: count + 1 }, (_, index) => (index === 0 ? 0 : index === count ? room : beats[index]));
  const targets: number[] = [0];
  for (let from = 0; from < count;) {
    let to = from + 1;
    while (to < count && anchors[to] === undefined) to++;
    const start = targets[from]!, end = Math.max(start, anchors[to]!), weight = floors.slice(from, to).reduce((sum, floor) => sum + floor, 0);
    let used = 0;
    for (let at = from + 1; at < to; at++) { used += floors[at - 1]!; targets[at] = Math.round(start + ((end - start) * used) / weight); }
    if (to < count) targets[to] = anchors[to]!;
    from = to;
  }
  const moments: number[] = [];
  for (const [index, target] of targets.entries()) {
    const earliest = index === 0 ? 0 : moments[index - 1]! + floors[index - 1]!;
    moments.push(Math.max(target, earliest));
    if (target < earliest && beats[index] !== undefined) {
      warnings.push(`template "${id}" items.${index}.at "${value.items[index]!.at}" is spoken ${seconds(earliest - target, fps)} before the item ` +
        `ahead of it has had its ${seconds(floors[index - 1]!, fps)}: the item starts ${seconds(earliest - target, fps)} later`);
    }
  }
  const need = floors.reduce((sum, floor) => sum + floor, 0), unseen = moments.filter(at => at >= room).length;
  if (moments.at(-1)! + floors.at(-1)! > room) {
    warnings.push(`template "${id}": the series has ${seconds(room, fps)} and its ${count} items need ${seconds(need, fps)} at the least ` +
      `(${SERIES_ITEM_FLOOR_SEC.other} s each, ${SERIES_ITEM_FLOOR_SEC.ui} s for a ui item): each item keeps that time, so ` +
      (unseen ? `the last ${unseen} ${unseen === 1 ? "item is" : "items are"} not shown` : "the last item is cut short"));
  }
  return { moments, warnings };
}

/** A full-frame series: the title, the numbered list with the current item marked and the done ones ticked, the current item's clip
 *  in its look with its number and name, a blur dissolve between items, and the last item dissolving back into the first. */
export const seriesFrame: TemplateKind<typeof data> = {
  kind: "series_frame",
  kindVersion: 1,
  description: "a full-frame numbered list video in 9:16: the title and the list of 3–17 items stay on a page while each item in turn " +
    "plays its clip (muted), or the presenter's own take when it names no clip, with its number NN/N and its name, the current item marked " +
    "and the done ones ticked; look card (a tilted card), orbit (the card with two tiles orbiting it), ui (the clip attached in a chat, " +
    "the prompt typed and sent), phone (the clip on a phone's screen) or editor (the view pulls back from the clip into an editor); items " +
    `change with a blur dissolve on their at quote, the rest share the time evenly, each at least ${SERIES_ITEM_FLOOR_SEC.other} s ` +
    `(${SERIES_ITEM_FLOOR_SEC.ui} s for ui); unless loop is false the last dissolves back into the first, so the video loops`,
  placements: ["full"],
  aspects: [SERIES_ASPECT],
  data,
  text: { title: 40, accent: 24, "items.name": 24, "items.prompt": 32 },
  quotes: ["items.at"],
  spreads: "items",
  firstBeatAtStart: true,
  fillsFrame: true,
  slots: { "items.clip": { type: "video", cover: 9 / 16 } },
  maxMedia: SERIES_ITEMS.max,
  timing: (value, beats, duration, fps, id) => seriesFrameMoments(value, beats, duration, fps, id),
  hidesCaptions: () => true,
  onInserts: false,
  // The page fills the frame at medium; small draws it a quarter smaller on the theme's ground.
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), step = fillingStep(value.size);
    return centredArea(canvas, step * canvas.width, step * canvas.height);
  },
  sample: { title: "5 AI tools for faster edits", accent: "AI tools", items: [
    { name: "Auto captions", look: "card", at: "captions" },
    { name: "Orbit intro", clip: { asset_id: `ast_${"2".repeat(32)}` }, look: "orbit", at: "intro" },
    { name: "Chat edits", clip: { asset_id: `ast_${"3".repeat(32)}` }, look: "ui", prompt: "make it pop", at: "chat" },
    { name: "Phone preview", look: "phone", at: "phone" },
    { name: "Timeline view", clip: { asset_id: `ast_${"5".repeat(32)}` }, look: "editor", at: "timeline" },
  ] },
};
