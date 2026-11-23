import { z } from "zod";
import { AD_SLOT_STATES, adTake, DIY_MAX_SLOTS } from "./ads.js";
import { cutId, cutSlotId } from "./cut-ids.js";
import { diyBlocked, diyNext } from "./diy-next.js";
import { FILM_CUT_FORMATS } from "./film-cut.js";
import { runId } from "./runs.js";


export { cutId, cutSlotId } from "./cut-ids.js";

export const CUTS_PATH = "/v1/cuts";
export const CUT_PATH = "/v1/cuts/:id";
export const CUT_MAX_SLOTS = DIY_MAX_SLOTS.faceless;
export const CUT_RECORDS_PER_DAY = 50;
export const CUT_SLOT_NEEDS = ["take", "picture", "card", "footage"] as const;

export const facelessBrief = z.strictObject({
  format: z.enum(FILM_CUT_FORMATS).describe("The video: story, list (facts, tips or steps), own_pictures or cartoon"),
  topic: z.string().trim().min(1).max(200).describe("What the video is about, in a line"),
  look: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/u, "a short snake_case tag, such as flat_2d").optional()
    .describe("The look picked from the guide's menu, by its tag"),
  language: z.string().trim().min(1).max(40).optional().describe("The language the voice speaks"),
  script: z.string().trim().min(1).max(5000).optional().describe("The script as approved"),
  voice_run_id: runId.optional().describe("A delivered make_voice run of this account: the video's voice"),
  notes: z.string().trim().min(1).max(2000).optional().describe("Anything else the video must keep: the user's wishes, the reference it follows"),
});
export type FacelessBrief = z.infer<typeof facelessBrief>;

export const cutSlot = z.strictObject({
  id: cutSlotId,
  needs: z.enum(CUT_SLOT_NEEDS).describe("take: a clip made with generate_video from its picture; picture: a picture; card: a " +
    "text card; footage: the user's own video"),
  shot: z.string().trim().min(1).max(500).describe("What the shot shows, in a line, and the words it plays on"),
});
export type CutSlot = z.infer<typeof cutSlot>;

const slots = z.array(cutSlot).min(1).max(CUT_MAX_SLOTS)
  .refine(list => new Set(list.map(slot => slot.id)).size === list.length, "each slot id is used once")
  .describe(`The shot plan in order, 1 to ${CUT_MAX_SLOTS} slots`);

export const createCutInput = z.strictObject({ brief: facelessBrief, slots });
export type CreateCutInput = z.infer<typeof createCutInput>;

export const updateCutInput = z.strictObject({
  brief: facelessBrief.optional().describe("Replaces the brief"),
  slots: slots.optional().describe("Replaces the shot plan; a slot that already has a checked take stays in it"),
}).refine(change => change.brief !== undefined || change.slots !== undefined, "send brief, slots or both");
export type UpdateCutInput = z.infer<typeof updateCutInput>;

const cutRun = z.strictObject({ run_id: runId, state: z.string(), credits_charged: z.number().int().nonnegative().nullable(), created_at: z.string() });

export const cutRecord = z.strictObject({
  cut_id: cutId,
  brief: facelessBrief,
  guide_version: z.string(),
  voice: z.strictObject({ run_id: runId, state: z.string(), duration_sec: z.number().positive().nullable() }).nullable(),
  slots: z.array(z.strictObject({ id: cutSlotId, needs: z.enum(CUT_SLOT_NEEDS), shot: z.string(), state: z.enum(AD_SLOT_STATES).nullable(),
    takes: z.array(adTake).optional() })),
  previews: z.array(cutRun),
  renders: z.array(cutRun),
  next: diyNext.nullable(),
  blocked: diyBlocked.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type CutRecord = z.infer<typeof cutRecord>;
