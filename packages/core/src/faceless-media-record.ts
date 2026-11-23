import { z } from "zod";
import { shotId } from "./edit-primitives.js";
import { EDIT_MAX_SHOTS } from "./edit-rules.js";
import { MAX_TEMPLATE_MEDIA } from "./templates/index.js";
import { TEMPLATE_SOUNDS } from "./templates/sounds.js";

const size = z.number().int().positive().safe();

export const storedObject = z.strictObject({
  kind: z.enum(["image", "video", "audio"]),
  key: z.string().min(1).max(1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  bytes: size,
  width: size.nullable(), height: size.nullable(),
  duration_sec: z.number().positive().nullable(),
});
export type StoredObject = z.infer<typeof storedObject>;

export const FACELESS_TRANSITION_LOOKS = ["flash", "light_leak"] as const;
export const facelessRecordTransitions = z.strictObject({
  look: z.enum(FACELESS_TRANSITION_LOOKS),
  at: z.array(shotId).min(1).max(EDIT_MAX_SHOTS),
});
export type FacelessRecordTransitions = z.infer<typeof facelessRecordTransitions>;
export const facelessShotTransitions = facelessRecordTransitions.extend({
  at: z.union([z.literal("scene_changes"), facelessRecordTransitions.shape.at]).default("scene_changes"),
});
export type FacelessShotTransitions = z.infer<typeof facelessShotTransitions>;
export const facelessRecordSounds = z.strictObject({ flash: z.enum(TEMPLATE_SOUNDS.flash.names).optional(),
  whoosh: z.enum(TEMPLATE_SOUNDS.whoosh.names).optional(), edit: z.enum(TEMPLATE_SOUNDS.edit.names).optional() });
export type FacelessRecordSounds = z.infer<typeof facelessRecordSounds>;

export const facelessMediaRecord = z.strictObject({
  v: z.literal(1),
  shots: z.array(z.strictObject({ id: shotId, source: z.enum(["generated", "customer"]),
    motion: z.enum(["PAN_UP", "PAN_DOWN", "ZOOM_IN", "ZOOM_OUT"]).nullable(), media: storedObject })),
  opener_still: storedObject,
  references: z.array(storedObject.extend({ role: z.enum(["style", "character", "product"]), from: z.enum(["customer", "lead_picture"]) })),
  narration: storedObject,
  template_media: z.array(z.strictObject({ template_id: z.string().min(1).max(64), slot: z.string().min(1).max(32), media: storedObject }))
    .max(MAX_TEMPLATE_MEDIA).optional(),
  settings: z.strictObject({ captions: z.boolean(), character_reference: z.boolean(), character_details: z.string().nullable(),
    image_model: z.string(), voice: z.string().nullable(), lambda_site_sha256: z.string(),
    transitions: facelessRecordTransitions.optional(), sounds: facelessRecordSounds.optional() }),
});
export type FacelessMediaRecord = z.infer<typeof facelessMediaRecord>;
