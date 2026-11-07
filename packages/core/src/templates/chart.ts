import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fullWidth, sizedScale, templateSize } from "./size.js";

/** The text size at medium on a 1080 short side: the title's lowercase letters at least 36 px tall, as captions keep (#1128). */
export const CHART_FONT_PX = 85;
/** Text sizes: the title, the plot (its values above the bars or points), the labels under it and the padding; the width is the full frame's. */
export const CHART_EMS = { title: 1.7, plot: 11, label: 1.5, pad: 0.7 } as const;
export const CHART_TYPES = ["bar", "line"] as const;
const quote = z.string().min(1).max(200);
const point = z.object({ label: z.string().min(1).max(12), value: z.number().min(0).max(999_999_999).multipleOf(0.01), at: quote.optional() }).strict();
const data = z.object({ type: z.enum(CHART_TYPES), title: z.string().min(1).max(40).optional(), suffix: z.string().min(1).max(6).optional(),
  points: z.array(point).min(2).max(6), size: templateSize }).strict();

/** The card's height in text sizes. */
export const chartEms = () => CHART_EMS.title + CHART_EMS.plot + CHART_EMS.label + 2 * CHART_EMS.pad;

/** A bar or line chart on a full frame: each point lands on its beat, a bar growing or the line drawing on to it, its value counting up (#1120). */
export const chart: TemplateKind<typeof data> = {
  kind: "chart",
  kindVersion: 1,
  description: "a full-frame bar or line chart of 2–6 labelled points on a card: on each point's at, or spread evenly, its bar grows or the line " +
    "draws on to it and its value counts up, suffix after it; title above",
  placements: ["full"],
  data,
  text: { title: 40, suffix: 6, "points.label": 12 },
  quotes: ["points.at"],
  // The card is in by frame 6; the first point lands after it.
  beatsFrom: 8,
  slots: {},
  hidesCaptions: () => true,
  onInserts: false,
  rect: (value, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), ems = chartEms();
    const em = Math.min(CHART_FONT_PX * sizedScale(value.size, canvas), (0.92 * canvas.height) / ems);
    return centredArea(canvas, fullWidth(value.size, canvas), ems * em);
  },
  sample: { type: "bar", title: "Views per video", suffix: "k", points: [{ label: "Before", value: 12, at: "before" }, { label: "Week 1", value: 31, at: "week" },
    { label: "Week 4", value: 87, at: "month" }] },
};
