import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fullWidth, sizedScale, templateSize } from "./size.js";

/** The text size at medium on a 1080 short side: the title's lowercase letters at least 36 px tall, as captions keep (#1128). */
export const RACE_FONT_PX = 90;
/** Text sizes: the title, one row per name, the round's label under the rows and the padding; the width is the full frame's. */
export const RACE_EMS = { title: 1.7, row: 1.9, round: 2.2, pad: 0.7 } as const;
const value = z.number().min(0).max(999_999_999).multipleOf(0.01);
const round = z.object({ label: z.string().min(1).max(10).optional(), values: z.array(value).min(3).max(6), at: z.string().min(1).max(200).optional() }).strict();
const data = z.object({ title: z.string().min(1).max(40).optional(), suffix: z.string().min(1).max(6).optional(), names: z.array(z.string().min(1).max(14)).min(3).max(6),
  rounds: z.array(round).min(2).max(5), size: templateSize }).strict().superRefine((entry, context) => {
  for (const [index, each] of entry.rounds.entries()) if (each.values.length !== entry.names.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["rounds", index, "values"], message: `a round takes one value per name (${entry.names.length})` });
  }
});
type Data = z.infer<typeof data>;

/** The card's height in text sizes, with one row per name. */
export const raceEms = (names: number) => RACE_EMS.title + names * RACE_EMS.row + RACE_EMS.round + 2 * RACE_EMS.pad;

/** A ranked bar race on a full frame: the first round's bars grow in, then on each later round's beat the bars move to its values and the rows
 * trade places by rank (#1120). */
export const race: TemplateKind<typeof data> = {
  kind: "race",
  kindVersion: 1,
  description: "a full-frame ranked bar race: one bar per name, longest on top; the first round's values show from the start, then on each later " +
    "round's at, or spread evenly, the bars move to its values and swap places by rank, the round's label showing under them",
  placements: ["full"],
  data,
  text: { title: 40, suffix: 6, names: 14, "rounds.label": 10 },
  quotes: ["rounds.at"],
  // The first round is the start: its bars grow in from the first frame, so a full frame is never bare.
  firstBeatAtStart: true,
  slots: {},
  hidesCaptions: () => true,
  onInserts: false,
  rect: (value: Data, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), ems = raceEms(value.names.length);
    const em = Math.min(RACE_FONT_PX * sizedScale(value.size, canvas), (0.92 * canvas.height) / ems);
    return centredArea(canvas, fullWidth(value.size, canvas), ems * em);
  },
  sample: { title: "Signups by channel", suffix: "k", names: ["Search", "Shorts", "Referrals"], rounds: [{ label: "May", values: [40, 25, 10], at: "may" },
    { label: "June", values: [44, 61, 18], at: "june" }] },
};
