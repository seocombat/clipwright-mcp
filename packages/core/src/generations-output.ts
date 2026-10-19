import { z } from "zod";

/** Apart from `generations.ts`, which imports `runs.ts`: the run read can embed this block without a cycle. */
export const GENERATION_KINDS = ["image", "video"] as const;
export type GenerationKind = (typeof GENERATION_KINDS)[number];

/** The `generation` block of `GET /v1/runs/{id}`: the delivered file and how long its id serves as a reference. */
export const runGeneration = z.strictObject({
  kind: z.enum(GENERATION_KINDS),
  // A string, not an enum: a model added later must not break installed clients.
  model: z.string().min(1),
  url: z.string().url(),
  mime: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration_s: z.number().positive().nullable(),
  reusable_until: z.string().datetime(),
});
export type RunGeneration = z.infer<typeof runGeneration>;
