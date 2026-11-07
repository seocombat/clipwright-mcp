import { z } from "zod";
import { shotId } from "./edit-primitives.js";
import { EDIT_MAX_SHOTS } from "./edit-rules.js";
import { TEMPLATE_SOUNDS } from "./templates/sounds.js";

const size = z.number().int().positive().safe();

/** What outlives a signed URL: where the object is and what it measures. No URL and no expiry. */
export const storedObject = z.strictObject({
  kind: z.enum(["image", "video", "audio"]),
  key: z.string().min(1).max(1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  /** New marked bytes keep their retained pre-marking identity; historical records omit it. */
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  bytes: size,
  width: size.nullable(), height: size.nullable(),
  duration_sec: z.number().positive().nullable(),
});
export type StoredObject = z.infer<typeof storedObject>;

/** The looks a faceless cut can take. */
export const FACELESS_TRANSITION_LOOKS = ["flash", "light_leak"] as const;
/** The cut transitions a run drew: the look, and the shots whose cut in it falls on. */
export const facelessRecordTransitions = z.strictObject({
  look: z.enum(FACELESS_TRANSITION_LOOKS),
  at: z.array(shotId).min(1).max(EDIT_MAX_SHOTS),
});
export type FacelessRecordTransitions = z.infer<typeof facelessRecordTransitions>;
/** Cut transitions as a revision asks for them: every scene change, or the cuts into the named shots. */
export const facelessShotTransitions = facelessRecordTransitions.extend({
  at: z.union([z.literal("scene_changes"), facelessRecordTransitions.shape.at]).default("scene_changes"),
});
export type FacelessShotTransitions = z.infer<typeof facelessShotTransitions>;
/** The sounds a run chose by beat (#1067), `{}` when muted; a run that chose nothing records none and plays the looks' defaults. */
export const facelessRecordSounds = z.strictObject({ flash: z.enum(TEMPLATE_SOUNDS.flash.names).optional(),
  whoosh: z.enum(TEMPLATE_SOUNDS.whoosh.names).optional(), edit: z.enum(TEMPLATE_SOUNDS.edit.names).optional() });
export type FacelessRecordSounds = z.infer<typeof facelessRecordSounds>;

/** The media a faceless run was made from, written by the run beside the plan. */
export const facelessMediaRecord = z.strictObject({
  v: z.literal(1),
  shots: z.array(z.strictObject({ id: shotId, source: z.enum(["generated", "customer"]),
    motion: z.enum(["PAN_UP", "PAN_DOWN", "ZOOM_IN", "ZOOM_OUT"]).nullable(), media: storedObject })),
  /** The picture under shot 0, whose own media is the clip made from it. */
  opener_still: storedObject,
  references: z.array(storedObject.extend({ role: z.enum(["style", "character", "product"]), from: z.enum(["customer", "lead_picture"]) })),
  narration: storedObject,
  settings: z.strictObject({ captions: z.boolean(), character_reference: z.boolean(), character_details: z.string().nullable(),
    image_model: z.string(), voice: z.string().nullable(), lambda_site_sha256: z.string(),
    /** Present only on a run drawn with transitions: a revision keeps them unless its document says otherwise. */
    transitions: facelessRecordTransitions.optional(), sounds: facelessRecordSounds.optional() }),
});
export type FacelessMediaRecord = z.infer<typeof facelessMediaRecord>;
