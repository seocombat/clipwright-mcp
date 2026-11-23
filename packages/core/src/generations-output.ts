import { z } from "zod";

export const GENERATION_KINDS = ["image", "video"] as const;
export type GenerationKind = (typeof GENERATION_KINDS)[number];

export const runGeneration = z.strictObject({
  kind: z.enum(GENERATION_KINDS),
  model: z.string().min(1),
  url: z.string().url(),
  mime: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration_s: z.number().positive().nullable(),
  reusable_until: z.string().datetime().describe("Until then, create_asset with source.run_id turns this file into an asset_id for templates and inserts."),
  thumbnail_urls: z.array(z.string().url()).max(3).optional(),
  upscaled_from: z.strictObject({ ref: z.string().min(1), width: z.number().int().positive(), height: z.number().int().positive() }).optional()
    .describe("The source an upscale was made from: its run_id, asset_id or upload_id, and its width and height."),
});
export type RunGeneration = z.infer<typeof runGeneration>;
