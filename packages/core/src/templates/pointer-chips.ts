import { z } from "zod";
import { faceZone, frameCanvasOf, type LayerRect, type PresenterFraming } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { sizedScale, templateSize } from "./size.js";

/** A chip's text at medium on a 1080 short side. */
export const POINTER_CHIPS_FONT_PX = 44;
/** Text sizes: a chip's row, the gap between rows, the column's width, and the dot's radius at a target. */
export const POINTER_CHIPS_EMS = { row: 1.6, gap: 0.5, width: 9, dot: 0.35 } as const;
const percent = z.number().min(0).max(100);
const item = z.object({ target: z.object({ x: percent, y: percent }).strict(), text: z.string().min(1).max(20), at: z.string().min(1).max(200).optional() })
  .strict();
const data = z.object({ items: z.array(item).min(1).max(4), side: z.enum(["left", "right"]).optional(), size: templateSize }).strict();
type Data = z.infer<typeof data>;

/** The chips' column below the face at the side, in every format, and a dot's radius in pixels. */
export function pointerChipsParts(value: Data, aspectRatio: string, framing: PresenterFraming = "close"): { chips: LayerRect; dot: number } {
  const canvas = frameCanvasOf(aspectRatio), { width: w, height: h } = canvas, margin = Math.round(0.04 * Math.min(w, h)), face = faceZone(aspectRatio, framing);
  const rows = value.items.length, ems = rows * POINTER_CHIPS_EMS.row + (rows - 1) * POINTER_CHIPS_EMS.gap, below = Math.round((face.top + face.height + 0.01) * h);
  const em = Math.min(POINTER_CHIPS_FONT_PX * sizedScale(value.size, canvas), (h - margin - below) / ems), height = Math.round(ems * em);
  const width = Math.round(Math.min(0.6 * w, POINTER_CHIPS_EMS.width * em));
  const right = (value.side ?? "right") === "right", left = right ? w - margin - width : margin;
  const top = Math.min(h - margin - height, Math.max(below, Math.round(0.71 * h - height / 2)));
  return { chips: { left: left / w, top: top / h, width: width / w, height: height / h }, dot: Math.ceil(POINTER_CHIPS_EMS.dot * em) + 2 };
}

/** The footprint: the column and every target with its dot, cropped to the frame; the lines run between them, inside it. */
function footprint(value: Data, aspectRatio: string, _placement?: unknown, framing?: PresenterFraming): LayerRect {
  const { width: w, height: h } = frameCanvasOf(aspectRatio), { chips, dot } = pointerChipsParts(value, aspectRatio, framing);
  const xs = [chips.left * w, (chips.left + chips.width) * w, ...value.items.flatMap(entry => [(entry.target.x / 100) * w - dot, (entry.target.x / 100) * w + dot])];
  const ys = [chips.top * h, (chips.top + chips.height) * h, ...value.items.flatMap(entry => [(entry.target.y / 100) * h - dot, (entry.target.y / 100) * h + dot])];
  const [left, top] = [Math.max(0, Math.floor(Math.min(...xs))), Math.max(0, Math.floor(Math.min(...ys)))];
  const [right, bottom] = [Math.min(w, Math.ceil(Math.max(...xs))), Math.min(h, Math.ceil(Math.max(...ys)))];
  return { left: left / w, top: top / h, width: (right - left) / w, height: (bottom - top) / h };
}

/** Labelled chips in a column, each joined by a curved line to a point of the frame, appearing in turn; the chips keep off the face. */
export const pointerChips: TemplateKind<typeof data> = {
  kind: "pointer_chips",
  kindVersion: 1,
  description: "1–4 chips in a column below the face (right unless side left), each joined by a curved line to a " +
    "dot on its target {x,y} in % of the frame from its top left, appearing in turn on its at quote or spread evenly; the lines may cross " +
    "the face, the chips keep off it; also over an insert",
  placements: ["over"],
  data,
  text: { "items.text": 20 },
  quotes: ["items.at"],
  spreads: "items",
  beatsFrom: 1,
  slots: {},
  hidesCaptions: () => false,
  onInserts: true,
  rect: footprint,
  parts: (value, aspectRatio, framing) => ({ chips: pointerChipsParts(value, aspectRatio, framing).chips }),
  faceRect: (value, aspectRatio, framing) => pointerChipsParts(value, aspectRatio, framing).chips,
  sample: { items: [{ target: { x: 30, y: 62 }, text: "hook", at: "hook" }, { target: { x: 38, y: 74 }, text: "scenes", at: "scenes" },
    { target: { x: 46, y: 86 }, text: "comments", at: "comments" }] },
};
