import { z } from "zod";

export const BROLL_POLICIES = ["anyone", "no_actor", "no_people"] as const;
export const DEFAULT_BROLL_POLICY = "no_people" as const;
export const BROLL_POLICY_DESCRIPTION =
  "Saved policy for B-roll: anyone allows people including the actor; no_actor excludes the actor; " +
  "no_people excludes all people, including hands. Segmented media generation is closed. " +
  "This setting is stored only and has no effect on actor-only videos. " +
  "Run override wins over the account actor default; otherwise no_people.";
export const brollPolicy = z.enum(BROLL_POLICIES).describe(BROLL_POLICY_DESCRIPTION);
export type BrollPolicy = z.infer<typeof brollPolicy>;
export const actorDefaultsInput = z.strictObject({ broll_policy: brollPolicy });
export const actorDefaults = z.object({ actor_id: z.string(), broll_policy: brollPolicy });
export type ActorDefaultsInput = z.infer<typeof actorDefaultsInput>;
export type ActorDefaults = z.infer<typeof actorDefaults>;
export const ACTOR_DEFAULTS_PATH = "/v1/actors/:id/defaults";
export const actorDefaultsPath = (id: string): string => `/v1/actors/${encodeURIComponent(id)}/defaults`;

export function resolveBrollPolicy(override: BrollPolicy | undefined, actorDefault: unknown): BrollPolicy {
  if (override !== undefined) return brollPolicy.parse(override);
  const parsed = brollPolicy.safeParse(actorDefault);
  return parsed.success ? parsed.data : DEFAULT_BROLL_POLICY;
}

export function storedBrollPolicy(input: unknown): BrollPolicy {
  const value = input && typeof input === "object" && "resolved_broll_policy" in input
    ? input.resolved_broll_policy : undefined;
  return resolveBrollPolicy(undefined, value);
}
