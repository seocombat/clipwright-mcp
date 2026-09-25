import { z } from "zod";

// Rate-limit body shape, header names and limits in one home: REST, SDK and MCP take them
// from here, since a header name drifting between server and client is caught by neither side.

/** Header with the bucket size: how many requests the window allows in total. */
export const RATE_LIMIT_LIMIT_HEADER = "X-RateLimit-Limit";

/** How many requests remain in the current window. Zero is a legal value. */
export const RATE_LIMIT_REMAINING_HEADER = "X-RateLimit-Remaining";

/** SECONDS until the remainder grows by at least one: a delta, not Unix time, so client */
/** clock skew does not matter, matching `Retry-After`. The window slides; it never resets. */
export const RATE_LIMIT_RESET_HEADER = "X-RateLimit-Reset";

/** Standard `Retry-After` (RFC 9110), in seconds. Only on 429. */
export const RETRY_AFTER_HEADER = "Retry-After";

/** Window length, shared by both buckets: "per minute" is what is published. */
export const RATE_LIMIT_WINDOW_SECONDS = 60;

/** PAID bucket: 60 requests per minute, the published figure. */
export const RATE_LIMIT_PAID_PER_MINUTE = 60;

/** FREE bucket: 300 per minute, counted separately so run polling (~12/min per run, three */
/** runs at once) never starves paid calls. A ceiling: a looping client hits it in seconds. */
export const RATE_LIMIT_FREE_PER_MINUTE = 300;

/** Concurrent renders per account: 3. Excess runs are queued (202), not refused, so agents */
/** need no scheduler of their own. It sits under the Trigger.dev plan limit, not instead of it. */
export const MAX_CONCURRENT_RENDERS_PER_ACCOUNT = 3;

/** The bucket: also the counter axis in the DB and the `bucket` column value. It lives here */
/** because the client-facing message names it. */
export type RateLimitScope = "paid" | "free";

/** 429 body. The numbers sit INSIDE `error`, like the money refusals in `errors.ts`: an */
/** error response has one envelope. */
export const rateLimitedError = z.object({
  error: z.object({
    code: z.literal("rate_limited"),
    message: z.string().min(1),
    /** Size of the bucket the request fell into. */
    limit: z.number().int().positive(),
    /** Window length in seconds; `limit` means nothing without it. */
    window_seconds: z.number().int().positive(),
    /** Seconds until a retry. Matches `Retry-After`. */
    retry_after_seconds: z.number().int().positive(),
  }),
});
export type RateLimitedError = z.infer<typeof rateLimitedError>;

/** Builds the "too many requests" body. The message NAMES the bucket, so an agent hitting */
/** the paid limit does not stop polling runs it already started. */
export function rateLimitedBody(args: {
  limit: number;
  windowSeconds: number;
  retryAfterSeconds: number;
  scope: RateLimitScope;
  /** Whether the refused request was ADDRESSED to run creation; only the caller knows. The */
  /** "second paid render" advice appears only then. "Addressed", since later checks may still refuse. */
  targetsRunCreation?: boolean;
}): RateLimitedError {
  // The paid bucket also catches any unknown authenticated path, and the text says so.
  const surface =
    args.scope === "paid"
      ? "paid requests (starting a run, and any unrecognised authenticated path)"
      : "free requests (quotes, voices, run status, account)";

  // No claim that no run exists: the paid limit precedes the handler, so a retry may own
  // a run. Key advice only for run creation, which only the middleware can tell.
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

/** "Too many failed authentication attempts" in the same 429 shape, so clients parse it with */
/** one schema. Only the message differs: the caller has no account, so no idempotency advice. */
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

/** Per-account `create_actor` limits over a sliding day. Creations count runs of any */
/** outcome; refusals and unusable portraits count worker events. */
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
