import { z } from "zod";
import { CANVAS_FPS } from "../media-timebase.js";
import { estimateWordsPerSecond, PAUSE_TRIM_PACE_FACTOR } from "../pacing.js";
import { lexicalTokens } from "../semantic-inserts.js";
import { type AnchoredItem, frameCanvasOf, layerWordRange } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fillingStep, templateSize } from "./size.js";
import { templateMedia } from "./slot.js";

export const SERIES_ITEM_LOOKS = ["card", "orbit", "ui", "phone", "editor"] as const;
export const SERIES_ITEMS = { min: 3, max: 17 } as const;
export const SERIES_ONE_COLUMN_MAX = 6;
export const SERIES_ITEM_FLOOR_SEC = { ui: 2.4, other: 1.2, least: 0.8 } as const;
export const SERIES_LOOP_FRAMES = 10;
export const SERIES_MAX_FRAMES = Math.round(SERIES_ITEMS.max * SERIES_ITEM_FLOOR_SEC.ui * CANVAS_FPS) + SERIES_LOOP_FRAMES;
export const SERIES_ASPECT = "9:16";

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
const floorsOf = (value: Data, other: number, fps: number) =>
  value.items.map(entry => Math.round((entry.look === "ui" ? SERIES_ITEM_FLOOR_SEC.ui : other) * fps));

export function seriesFrameMoments(value: Data, beats: readonly (number | undefined)[], duration: number, fps: number, id: string,
  most = duration): { moments: number[]; warnings: string[]; frames?: number } {
  const loop = value.loop === false ? 0 : SERIES_LOOP_FRAMES, count = value.items.length, warnings: string[] = [];
  const usual = floorsOf(value, SERIES_ITEM_FLOOR_SEC.other, fps), sum = (floors: number[]) => floors.reduce((total, floor) => total + floor, 0);
  const floors = sum(usual) <= duration - loop ? usual : floorsOf(value, SERIES_ITEM_FLOOR_SEC.least, fps), need = sum(floors);
  const frames = Math.max(duration, Math.min(need + loop, most)), room = frames - loop, fits = need <= room;
  const rule = `${floors === usual ? SERIES_ITEM_FLOOR_SEC.other : SERIES_ITEM_FLOOR_SEC.least} s each, ${SERIES_ITEM_FLOOR_SEC.ui} s for a ui item`;
  if (floors !== usual) {
    warnings.push(`template "${id}": its ${count} items need ${seconds(sum(usual), fps)} at ${SERIES_ITEM_FLOOR_SEC.other} s each ` +
      `(${SERIES_ITEM_FLOOR_SEC.ui} s for a ui item) and its words give ${seconds(duration - loop, fps)}, so items other than ui show for as little ` +
      `as ${SERIES_ITEM_FLOOR_SEC.least} s`);
  }
  if (frames > duration) warnings.push(`template "${id}" runs ${seconds(frames - duration, fps)} past its words so that more of its ${count} items show (${rule})`);
  const anchors = Array.from({ length: count + 1 }, (_, index) => (index === 0 ? 0 : index === count ? room : beats[index]));
  const targets: number[] = [0];
  for (let from = 0; from < count;) {
    let to = from + 1;
    while (to < count && anchors[to] === undefined) to++;
    const start = targets[from]!, end = Math.max(start, anchors[to]!), weight = sum(floors.slice(from, to));
    let used = 0;
    for (let at = from + 1; at < to; at++) { used += floors[at - 1]!; targets[at] = Math.round(start + ((end - start) * used) / weight); }
    if (to < count) targets[to] = anchors[to]!;
    from = to;
  }
  const moments = targets.map(target => target);
  for (let index = 1; index < count; index++) moments[index] = Math.max(targets[index]!, moments[index - 1]! + floors[index - 1]!);
  if (fits) for (let index = count - 1; index > 0; index--) moments[index] = Math.min(moments[index]!, (moments[index + 1] ?? room) - floors[index]!);
  for (const [index, moment] of moments.entries()) {
    const target = targets[index]!, quote = `template "${id}" items.${index}.at "${value.items[index]!.at}" is spoken`;
    if (beats[index] === undefined || index === 0 || moment >= room || moment === target) continue;
    warnings.push(moment > target ? `${quote} ${seconds(moment - target, fps)} before the item ahead of it has had its ${seconds(floors[index - 1]!, fps)}: ` +
      `the item starts ${seconds(moment - target, fps)} later` : `${quote} ${seconds(target - moment, fps)} after the item starts: the items from it on ` +
      `need their time before the series ends`);
  }
  if (!fits) {
    const unseen = moments.filter(at => at >= room).length;
    warnings.push(`template "${id}": the series has ${seconds(room, fps)} and its ${count} items need ${seconds(need, fps)} at the least (${rule}), ` +
      `and the video has no more room for it, so ${unseen ? `the last ${unseen} ${unseen === 1 ? "item is" : "items are"} not shown` : "the last item is cut short"}`);
  }
  const shown = moments.filter(at => at < room);
  if (shown.length < SERIES_ITEMS.min) {
    throw new Error(`its ${seconds(room, fps)} show ${shown.length} of its ${count} items, and a series shows at least ${SERIES_ITEMS.min}`);
  }
  return { moments: shown, warnings, ...(frames > duration ? { frames } : {}) };
}

export function seriesLeastFrames(value: unknown, fps: number): number | undefined {
  const parsed = data.safeParse(value);
  if (!parsed.success) return undefined;
  return parsed.data.items.reduce((sum, entry) => sum + Math.round((entry.look === "ui" ? SERIES_ITEM_FLOOR_SEC.ui : SERIES_ITEM_FLOOR_SEC.least) * fps), 0) +
    (parsed.data.loop === false ? 0 : Math.round((SERIES_LOOP_FRAMES / CANVAS_FPS) * fps));
}

export function seriesFitWarnings(input: { script?: unknown; templates?: unknown; pause_trim?: unknown }): string[] {
  if (typeof input.script !== "string" || !Array.isArray(input.templates)) return [];
  const tokens = lexicalTokens(input.script), trimmed = typeof input.pause_trim === "object" && input.pause_trim !== null;
  const pace = estimateWordsPerSecond(input.script) * (trimmed ? PAUSE_TRIM_PACE_FACTOR : 1);
  return (input.templates as Partial<AnchoredItem & { kind: string; data: unknown }>[]).flatMap(item => {
    const frames = item.kind === "series_frame" ? seriesLeastFrames(item.data, CANVAS_FPS) : undefined;
    const range = frames !== undefined && item.anchor ? layerWordRange(tokens, item as AnchoredItem) : undefined;
    if (frames === undefined || range === undefined || typeof range === "string") return [];
    const count = (item.data as { items: unknown[] }).items.length, id = String(item.id);
    const least = frames / CANVAS_FPS, spoken = (range.coverWord - range.startWord) / pace;
    if (least <= spoken) return [];
    return [`template "${id}": the list of ${count} items needs at least ${least.toFixed(1)} s of speech; its sentence gives about ` +
      `${spoken.toFixed(1)} s; ${range.coverWord >= tokens.length ? `the video runs ${(least - spoken).toFixed(1)} s past its last word so all ${count} ` +
        `items of template "${id}" show` : "the list will run on past it and the next template starts later"}; lengthen the sentence to keep the list on it`];
  });
}

export const seriesFrame: TemplateKind<typeof data> = {
  kind: "series_frame",
  kindVersion: 1,
  description: "a full-frame numbered list video in 9:16: the title and the list of 3–17 items stay on a page while each item in turn " +
    "plays its clip (muted), or the presenter's own take when it names no clip, with its number NN/N and its name, the current item marked " +
    "and the done ones ticked; look card (a tilted card), orbit (the card with two tiles orbiting it), ui (the clip attached in a chat, " +
    "the prompt typed and sent), phone (the clip on a phone's screen) or editor (the view pulls back from the clip into an editor); items " +
    `change with a blur dissolve on their at quote, the rest share the time evenly, each at least ${SERIES_ITEM_FLOOR_SEC.other} s ` +
    `(${SERIES_ITEM_FLOOR_SEC.ui} s for ui); over a short sentence items other than ui show for as little as ${SERIES_ITEM_FLOOR_SEC.least} s, ` +
    "and when even that does not fit the list runs on past its sentence and the next template starts later, or, at the end of the video, " +
    "the video holds its last frame past the last word until every item has shown; unless loop is false the last " +
    "dissolves back into the first, so the video loops",
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
  timing: (value, beats, duration, fps, id, most) => seriesFrameMoments(value, beats, duration, fps, id, most),
  hidesCaptions: () => true,
  onInserts: false,
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
