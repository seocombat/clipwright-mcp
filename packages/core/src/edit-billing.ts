import { z } from "zod";
import { SHOT_OPERATION_MODES } from "./edit-operations.js";
import { shotId } from "./edit-primitives.js";
import type { ShotKind } from "./edit-rules.js";

// A leaf: `runs.ts` imports it, so it reaches neither `edit-document.ts` nor `runs.ts`.
const credits = z.number().int().nonnegative().safe();

// Admission freezes these prices for the run.
/** Credits of each unit a revision or a shot candidate generates; a kept candidate is already paid. */
export const EDIT_UNIT_PRICES = Object.freeze({ picture: 7, clip: 49, clip_with_new_picture: 56, kept_picture: 0, kept_clip: 0 });
/** The re-render fee of a revision that generates at least one unit. */
export const EDIT_RENDER_PRICE = 13;
/** The price of a revision that generates nothing. */
export const EDIT_ZERO_UNIT_PRICE = 13;

const shotKind = z.enum(["picture", "clip", "presenter"] as const satisfies readonly ShotKind[]);

/** One priced line of a revision: a generated unit, or a kept candidate entering the video. */
export const revisionPriceLine = z.strictObject({
  shot_id: shotId,
  unit: z.enum(["picture", "clip", "clip_with_new_picture", "kept_picture", "kept_clip"]),
  credits,
});
export type RevisionPriceLine = z.infer<typeof revisionPriceLine>;

/** The price of a revision, frozen at admission. `zero_unit` names the rule a revision without generation took. */
export const revisionBilling = z.strictObject({
  tariff_id: z.string().min(1),
  lines: z.array(revisionPriceLine),
  render_credits: credits,
  zero_unit: z.enum(["priced", "free"]).nullable(),
  total_credits: credits,
});
export type RevisionBilling = z.infer<typeof revisionBilling>;

/** What a revision changes, as the server states it. */
export const editSummaryWire = z.strictObject({
  retimed: z.array(shotId),
  deleted: z.array(shotId),
  added: z.array(shotId),
  replaced: z.array(z.strictObject({ shot_id: shotId, from: z.enum(["candidate", "upload", "source"]) })),
  generated: z.array(z.strictObject({ shot_id: shotId, kind: shotKind, mode: z.enum(SHOT_OPERATION_MODES) })),
  changed: z.boolean(),
});
export type EditSummaryWire = z.infer<typeof editSummaryWire>;
