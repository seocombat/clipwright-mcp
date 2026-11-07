import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fillingStep, fullWidth, sizedScale, templateSize } from "./size.js";
import { templateMedia } from "./slot.js";

export const VIDEO_GRID_LAYOUTS = ["2x2", "3x1"] as const;
/** A cell is a 9:16 tile; the title above the grid at medium on a 1080 short side. */
export const VIDEO_GRID_CELL_SHAPE = 9 / 16;
export const VIDEO_GRID_FONT_PX = 84;
/** The title's band in title sizes; the gap and the raised left column's offset in tile widths, as the reference's 2×2 collage. */
export const VIDEO_GRID_EMS = { title: 1.5, gap: 0.03, offset: 0.08 } as const;
const data = z.object({ layout: z.enum(VIDEO_GRID_LAYOUTS).optional(), cell_1: templateMedia, cell_2: templateMedia, cell_3: templateMedia,
  cell_4: templateMedia.optional(), title: z.string().min(1).max(40).optional(), size: templateSize }).strict().superRefine((value, context) => {
  const four = value.layout === "2x2";
  if (value.layout !== undefined && four !== (value.cell_4 !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["cell_4"], message: four ? "a 2x2 grid takes four cells: give cell_4" : "a 3x1 grid takes three cells: leave out cell_4" });
  }
});
type Data = z.infer<typeof data>;

/** The layout drawn: the one named, else 2x2 for four cells and 3x1 for three. */
export const videoGridLayout = (value: { layout?: Data["layout"]; cell_4?: unknown } & Record<string, unknown>): NonNullable<Data["layout"]> =>
  value.layout ?? (value.cell_4 === undefined ? "3x1" : "2x2");

/** The grid's shape in tile widths: its width and its height, the stagger of the raised column included. */
export function videoGridShape(layout: Data["layout"]): { columns: number; rows: number; width: number; height: number } {
  const columns = layout === "3x1" ? 3 : 2, rows = layout === "3x1" ? 1 : 2, gap = VIDEO_GRID_EMS.gap;
  return { columns, rows, width: columns + (columns - 1) * gap, height: rows / VIDEO_GRID_CELL_SHAPE + (rows - 1) * gap + (rows > 1 ? VIDEO_GRID_EMS.offset : 0) };
}

/** 2×2 or 3×1 tiles of the account's clips on a full frame, each popping in after the one before, with an optional title above. */
export const videoGrid: TemplateKind<typeof data> = {
  kind: "video_grid",
  kindVersion: 1,
  description: "a full-frame grid of the account's video assets as 9:16 tiles, 2x2 (cells 1–4, the left column raised) or 3x1 (cells 1–3); without layout, the cells given decide, " +
    "each tile popping in after the one before and playing muted, with an optional title above",
  placements: ["full"],
  data,
  text: { title: 40 },
  slots: { cell_1: { type: "video", cover: VIDEO_GRID_CELL_SHAPE }, cell_2: { type: "video", cover: VIDEO_GRID_CELL_SHAPE },
    cell_3: { type: "video", cover: VIDEO_GRID_CELL_SHAPE }, cell_4: { type: "video", cover: VIDEO_GRID_CELL_SHAPE } },
  hidesCaptions: () => true,
  onInserts: false,
  fillsFrame: true,
  rect: (value: Data, aspectRatio) => {
    const layout = videoGridLayout(value), canvas = frameCanvasOf(aspectRatio), shape = videoGridShape(layout), step = fillingStep(value.size);
    const title = VIDEO_GRID_EMS.title * VIDEO_GRID_FONT_PX * sizedScale("medium", canvas);
    // A tile's width at medium: the full frame's width over the grid's, or whatever keeps the grid and its title inside 95% of the frame's
    // height (#1128); the size then scales the grid and its title together.
    const tile = Math.min(fullWidth("medium", canvas) / shape.width, (0.95 * canvas.height - title) / shape.height);
    return centredArea(canvas, step * shape.width * tile, step * (shape.height * tile + title));
  },
  sample: { cell_1: { asset_id: `ast_${"1".repeat(32)}` }, cell_2: { asset_id: `ast_${"2".repeat(32)}` }, cell_3: { asset_id: `ast_${"3".repeat(32)}` },
    cell_4: { asset_id: `ast_${"4".repeat(32)}` }, title: "ten ads, three languages" },
};
