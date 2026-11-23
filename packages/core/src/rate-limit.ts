import { z } from "zod";

export const RATE_LIMIT_LIMIT_HEADER = "X-RateLimit-Limit";

export const RATE_LIMIT_REMAINING_HEADER = "X-RateLimit-Remaining";

export const RATE_LIMIT_RESET_HEADER = "X-RateLimit-Reset";

export const RETRY_AFTER_HEADER = "Retry-After";

export const RATE_LIMIT_WINDOW_SECONDS = 60;

export const RATE_LIMIT_PAID_PER_MINUTE = 60;

export const RATE_LIMIT_FREE_PER_MINUTE = 300;

export const MAX_CONCURRENT_RENDERS_PER_ACCOUNT = 3;

export const MAX_CONCURRENT_FACELESS_PER_ACCOUNT = 2;

export type RateLimitScope = "paid" | "free";

export const rateLimitedError = z.object({
  error: z.object({
    code: z.literal("rate_limited"),
    message: z.string().min(1),
    limit: z.number().int().positive(),
    window_seconds: z.number().int().positive(),
    retry_after_seconds: z.number().int().positive(),
  }),
});
export type RateLimitedError = z.infer<typeof rateLimitedError>;

export function rateLimitedBody(args: {
  limit: number;
  windowSeconds: number;
  retryAfterSeconds: number;
  scope: RateLimitScope;
  targetsRunCreation?: boolean;
}): RateLimitedError {
  const surface =
    args.scope === "paid"
      ? "paid requests (starting a run, and any unrecognised authenticated path)"
      : "free requests (quotes, voices, run status, account)";

  const tail =
    args.scope === "free"
      ? "nothing was charged; runs already started keep going and stay retrievable."
      : args.targetsRunCreation === true
        ? "nothing was charged. If this request carried an Idempotency-Key, retry with the SAME key: a new key can start a second paid render."
        : "nothing was charged.";
  return rateLimitedError.parse({
    error: {
      code: "rate_limited",
      message:
        `Rate limit of ${args.limit} ${surface} per ${args.windowSeconds} seconds is exhausted ` +
        `for this account. Retry in ${args.retryAfterSeconds} seconds; ${tail}`,
      limit: args.limit,
      window_seconds: args.windowSeconds,
      retry_after_seconds: args.retryAfterSeconds,
    },
  });
}

export function authThrottledBody(args: {
  limit: number;
  windowSeconds: number;
  retryAfterSeconds: number;
}): RateLimitedError {
  return rateLimitedError.parse({
    error: {
      code: "rate_limited",
      message:
        `Too many failed authentication attempts: ${args.limit} per ${args.windowSeconds} seconds ` +
        `from this address. Retry in ${args.retryAfterSeconds} seconds. ` +
        `Nothing was charged, and no account was identified.`,
      limit: args.limit,
      window_seconds: args.windowSeconds,
      retry_after_seconds: args.retryAfterSeconds,
    },
  });
}

export const ACTOR_LIMIT_WINDOW_SECONDS = 86_400;
export const ACTOR_LIMIT_KINDS = ["creations", "prompt_refusals", "unusable_portraits"] as const;
export type ActorLimitKind = (typeof ACTOR_LIMIT_KINDS)[number];
export const ACTOR_LIMITS: Readonly<Record<ActorLimitKind, number>> = {
  creations: 20,
  prompt_refusals: 3,
  unusable_portraits: 5,
};

export const actorCreationLimitedError = z.object({
  error: z.object({
    code: z.literal("actor_creation_limited"),
    message: z.string().min(1),
    limit_kind: z.enum(ACTOR_LIMIT_KINDS),
    limit: z.number().int().positive(),
    window_seconds: z.number().int().positive(),
    retry_after_seconds: z.number().int().positive(),
  }),
});
export type ActorCreationLimitedError = z.infer<typeof actorCreationLimitedError>;

const ACTOR_LIMIT_SUBJECTS: Readonly<Record<ActorLimitKind, string>> = {
  creations: "create_actor runs",
  prompt_refusals: "descriptions refused as naming or resembling a real person",
  unusable_portraits: "portraits refused for not showing exactly one face",
};

export function actorCreationLimitedBody(args: {
  kind: ActorLimitKind;
  retryAfterSeconds: number;
}): ActorCreationLimitedError {
  const limit = ACTOR_LIMITS[args.kind];
  const advice = args.kind === "prompt_refusals" ? " Describe a fictional adult." : "";
  return actorCreationLimitedError.parse({
    error: {
      code: "actor_creation_limited",
      message:
        `This account reached ${limit} ${ACTOR_LIMIT_SUBJECTS[args.kind]} in the last ` +
        `${ACTOR_LIMIT_WINDOW_SECONDS / 3600} hours. Retry in ${args.retryAfterSeconds} seconds; ` +
        `nothing was charged and no run was created.${advice}`,
      limit_kind: args.kind,
      limit,
      window_seconds: ACTOR_LIMIT_WINDOW_SECONDS,
      retry_after_seconds: args.retryAfterSeconds,
    },
  });
}
