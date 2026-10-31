import { z } from "zod";
import { SKILLS } from "./skills.js";

/** `GET /health`: the API process answers. */
export const healthResponse = z.strictObject({ ok: z.literal(true) });

/** `GET /v1/public/skills`: the skills open right now, without a key; a closed skill is absent. */
export const publicSkillsResponse = z.strictObject({
  skills: z.array(z.strictObject({
    slug: z.enum(SKILLS), name: z.string().min(1), version: z.string().min(1), description: z.string().min(1),
  })),
});
export type PublicSkillsResponse = z.infer<typeof publicSkillsResponse>;
