import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fullWidth, sizedScale, templateSize } from "./size.js";

/** The command's text at medium on a 1080 short side: its lowercase letters at least 36 px tall, as captions keep (#1128). */
export const TERMINAL_FONT_PX = 74;
/** Text sizes: the title bar, the command (up to three lines), the status line and the padding; a diff's line (#1119); the card's width is the
 * full frame's. */
export const TERMINAL_EMS = { bar: 1.6, command: 3.9, status: 1.7, pad: 0.6, line: 1.15 } as const;
export const TERMINAL_CHANGES = ["add", "del"] as const;
const line = z.object({ text: z.string().min(1).max(36), change: z.enum(TERMINAL_CHANGES).optional() }).strict();
const diff = z.object({ lines: z.array(line).min(2).max(7), at: z.string().min(1).max(200).optional() }).strict();
const data = z.object({ title: z.string().min(1).max(24).optional(), command: z.string().min(1).max(100), diff: diff.optional(),
  status: z.string().min(1).max(40), at: z.string().min(1).max(200).optional(), size: templateSize }).strict().superRefine((value, context) => {
  if (value.diff && !value.diff.lines.some(entry => entry.change)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["diff", "lines"], message: "a diff marks at least one line add or del" });
  }
});
type Data = z.infer<typeof data>;

/** The card's height in text sizes: the command's three lines, the diff's lines under it, the status. */
export const terminalEms = (value: { diff?: { lines: readonly unknown[] } | undefined }) => TERMINAL_EMS.bar + TERMINAL_EMS.command + TERMINAL_EMS.status +
  2 * TERMINAL_EMS.pad + (value.diff?.lines.length ?? 0) * TERMINAL_EMS.line;

/** A dark terminal card on a full frame: the command types in, a diff's lines change, then a checked status line shows, each on its beat. */
export const terminal: TemplateKind<typeof data> = {
  kind: "terminal",
  kindVersion: 2,
  description: "a full-frame dark terminal card: the command types in; a diff under it collapses its del lines (red) and opens its add lines " +
    "(green) on diff.at; then a checked status line shows on at; title names the card",
  placements: ["full"],
  data,
  text: { title: 24, command: 100, "diff.lines.text": 36, status: 40 },
  quotes: ["diff.at", "at"],
  // The card is in by frame 6 and the command types for at least 4 frames before the status.
  beatsFrom: 10,
  slots: {},
  hidesCaptions: () => true,
  onInserts: false,
  rect: (value: Data, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), ems = terminalEms(value);
    const em = Math.min(TERMINAL_FONT_PX * sizedScale(value.size, canvas), (0.92 * canvas.height) / ems);
    return centredArea(canvas, fullWidth(value.size, canvas), ems * em);
  },
  sample: { title: "Terminal", command: "git apply fix.patch", diff: { lines: [{ text: "const fps = 25" }, { text: "render(clip)", change: "del" },
    { text: "render(clip, { fps })", change: "add" }], at: "applies" }, status: "patch applied", at: "applied" },
};

/** Version 1: a command only; its footprint is version 2's for the same data. */
export const terminalV1 = { ...terminal, kindVersion: 1 } as TemplateKind<typeof data>;
