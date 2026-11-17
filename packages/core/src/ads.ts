import { z } from "zod";
import { adId, adSlotId } from "./ad-ids.js";
import { assetId } from "./asset-identity.js";
import { diyBlocked, diyNext } from "./diy-next.js";
import { FILM_EDIT_MAX_CLIPS, takeCheckVerdict } from "./own-agent-runs.js";
import { runId } from "./runs.js";

// An ad record (#1539): one per ad a customer's own agent makes, tying its brief, the slots of its shot list, each slot's takes with their
// check_take verdicts, and its edits. Free; the record also says which call comes next and what blocks the edit.

export { adId, adSlotId } from "./ad-ids.js";

export const ADS_PATH = "/v1/ads";
export const AD_PATH = "/v1/ads/:id";
/** The kinds of video a DIY record holds, and the most slots each kind's record has (the database checks the same numbers). */
export const DIY_RECORD_KINDS = ["ad"] as const;
export type DiyRecordKind = (typeof DIY_RECORD_KINDS)[number];
export const DIY_MAX_SLOTS: Readonly<Record<DiyRecordKind, number>> = { ad: FILM_EDIT_MAX_CLIPS };
/** An ad's slots: one cut each, as many as an edit takes. */
export const AD_MAX_SLOTS = DIY_MAX_SLOTS.ad;
/** The most ad records an account starts in any 24 h: free, so capped like every free write. */
export const AD_RECORDS_PER_DAY = 50;

export const adBrief = z.strictObject({
  product: z.string().trim().min(1).max(200).describe("The product the ad sells, as the buyer knows it"),
  audience: z.string().trim().min(1).max(300).optional().describe("Who the ad speaks to, and whom they trust on screen"),
  message: z.string().trim().min(1).max(500).optional().describe("The one benefit the ad leads with, and the objection it answers"),
  notes: z.string().trim().min(1).max(2000).optional().describe("Anything else the ad must keep: facts from the product page, the reference it follows"),
});
export type AdBrief = z.infer<typeof adBrief>;

export const adSlot = z.strictObject({
  id: adSlotId,
  shot: z.string().trim().min(1).max(500).describe("What the shot shows, in a line: its action and the spoken line it carries"),
});
export type AdSlot = z.infer<typeof adSlot>;

const slots = z.array(adSlot).min(1).max(AD_MAX_SLOTS)
  .refine(list => new Set(list.map(slot => slot.id)).size === list.length, "each slot id is used once")
  .describe(`The shot list in cut order, 1 to ${AD_MAX_SLOTS} slots: one per shot you will make takes for`);

export const createAdInput = z.strictObject({ brief: adBrief, slots });
export type CreateAdInput = z.infer<typeof createAdInput>;

export const updateAdInput = z.strictObject({
  brief: adBrief.optional().describe("Replaces the brief"),
  slots: slots.optional().describe("Replaces the shot list; a slot that already has a checked take stays in it"),
}).refine(change => change.brief !== undefined || change.slots !== undefined, "send brief, slots or both");
export type UpdateAdInput = z.infer<typeof updateAdInput>;

/** `no_take`: nothing checked yet; `checking`: a check is running and none passed; `failed`: every checked take failed; `passed`: the edit
 *  admits a take of the slot (own footage counts without a passing check). */
export const AD_SLOT_STATES = ["no_take", "checking", "failed", "passed"] as const;

const adCheck = z.strictObject({
  run_id: runId,
  state: z.string(),
  /** Whether the verdict passed: no defect over the whole take and a clean window left; null until the check delivered. */
  passed: z.boolean().nullable(),
  verdict: takeCheckVerdict.nullable(),
  created_at: z.string(),
});
const adTake = z.strictObject({
  run_id: runId.nullable().describe("The take's generate_video run, or null for a video asset"),
  asset_id: assetId.nullable(),
  own_footage: z.boolean().describe("Your own footage, not a clip made with generate_video: the edit needs no check of it, and its checks are advice"),
  /** Whether render_edit with this ad_id cuts the take now: own footage always; a clip made with generate_video when it was checked in this
   *  slot and the latest verdict on its file, from any check, passed. */
  passed: z.boolean(),
  checks: z.array(adCheck),
});

export const adRecord = z.strictObject({
  ad_id: adId,
  brief: adBrief,
  /** The version of get_ad_guide current when the record was made. */
  guide_version: z.string(),
  slots: z.array(z.strictObject({ id: adSlotId, shot: z.string(), state: z.enum(AD_SLOT_STATES), takes: z.array(adTake) })),
  edits: z.array(z.strictObject({ run_id: runId, state: z.string(), credits_charged: z.number().int().nonnegative().nullable(), created_at: z.string() })),
  next: diyNext.nullable(),
  blocked: diyBlocked.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type AdRecord = z.infer<typeof adRecord>;
