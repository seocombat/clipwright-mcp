import { z } from "zod";
import { shotId } from "./edit-primitives.js";

const size = z.number().int().positive().safe();

/** What outlives a signed URL: where the object is and what it measures. No URL and no expiry. */
export const storedObject = z.strictObject({
  kind: z.enum(["image", "video", "audio"]),
  key: z.string().min(1).max(1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: size,
  width: size.nullable(), height: size.nullable(),
  duration_sec: z.number().positive().nullable(),
});
export type StoredObject = z.infer<typeof storedObject>;

/** The media a faceless run was made from, written by the worker beside the plan. */
export const facelessMediaRecord = z.strictObject({
  v: z.literal(1),
  shots: z.array(z.strictObject({ id: shotId, source: z.enum(["generated", "customer"]),
    motion: z.enum(["PAN_UP", "PAN_DOWN"]).nullable(), media: storedObject })),
  /** The picture under shot 0, whose own media is the clip made from it. */
  opener_still: storedObject,
  references: z.array(storedObject.extend({ role: z.enum(["style", "character"]), from: z.enum(["customer", "lead_picture"]) })),
  narration: storedObject,
  settings: z.strictObject({ captions: z.boolean(), character_reference: z.boolean(), character_details: z.string().nullable(),
    image_model: z.string(), voice: z.string().nullable(), lambda_site_sha256: z.string() }),
});
export type FacelessMediaRecord = z.infer<typeof facelessMediaRecord>;
