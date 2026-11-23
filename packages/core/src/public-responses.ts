import { z } from "zod";
import { SKILLS } from "./skills.js";

export const healthResponse = z.strictObject({ ok: z.literal(true) });

export const publicSkillsResponse = z.strictObject({
  skills: z.array(z.strictObject({
    slug: z.enum(SKILLS), name: z.string().min(1), version: z.string().min(1), description: z.string().min(1),
  })),
});
export type PublicSkillsResponse = z.infer<typeof publicSkillsResponse>;
