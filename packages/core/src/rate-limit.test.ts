import { describe, expect, it } from "vitest";

import { apiError } from "./errors.js";
import {
  MAX_CONCURRENT_FACELESS_PER_ACCOUNT,
  MAX_CONCURRENT_RENDERS_PER_ACCOUNT,
  RATE_LIMIT_FREE_PER_MINUTE,
  RATE_LIMIT_PAID_PER_MINUTE,
  RATE_LIMIT_WINDOW_SECONDS,
  rateLimitedBody,
  rateLimitedError,
} from "./rate-limit.js";

describe("429 refusal body", () => {
  it("stays an ordinary API error for a client unaware of limits", () => {
    // The generic envelope is a supertype: extra numbers must not break older parsers.
    const body = rateLimitedBody({
      limit: RATE_LIMIT_PAID_PER_MINUTE,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
      retryAfterSeconds: 7,
      scope: "paid",
    });

    expect(apiError.safeParse(body).success).toBe(true);
    expect(rateLimitedError.safeParse(body).success).toBe(true);
  });

  it("the message ITSELF says how long to wait and which bucket's limit it is", () => {
    // The agent shows `message` to a person and acts on it; "too often" without seconds helps neither.
    const paid = rateLimitedBody({
      limit: 60,
      windowSeconds: 60,
      retryAfterSeconds: 7,
      scope: "paid",
    });
    const free = rateLimitedBody({
      limit: 300,
      windowSeconds: 60,
      retryAfterSeconds: 2,
      scope: "free",
    });

    expect(paid.error.message).toContain("7");
    expect(paid.error.message).toContain("60");
    expect(free.error.message).toContain("2");
    expect(free.error.message).toContain("300");
  });

  it("the bucket is NAMED: paid and free differ in text", () => {
    // Otherwise an agent at the paid limit would stop polling runs already paid for.
    const paid = rateLimitedBody({
      limit: 60,
      windowSeconds: 60,
      retryAfterSeconds: 7,
      scope: "paid",
    });
    const free = rateLimitedBody({
      limit: 300,
      windowSeconds: 60,
      retryAfterSeconds: 7,
      scope: "free",
    });

    expect(paid.error.message).not.toEqual(free.error.message);

    // The paid bucket also catches any unknown authenticated path, and the text says so.
    expect(paid.error.message).toContain("any unrecognised authenticated path");
  });

  it("NO refusal claims that the run does not exist", () => {
    // Free: a 429 hits status polls of started runs. Paid: it hits a retry whose key
    // already owns a run, and "no run" pushes the agent to a new key and a second render.
    const free = rateLimitedBody({
      limit: 300,
      windowSeconds: 60,
      retryAfterSeconds: 2,
      scope: "free",
    });
    const paid = rateLimitedBody({
      limit: 60,
      windowSeconds: 60,
      retryAfterSeconds: 2,
      scope: "paid",
    });

    expect(free.error.message).not.toContain("no run was created");
    expect(paid.error.message).not.toContain("no run was created");
  });

  it("the paid refusal CONDITIONALLY says to retry with the same idempotency key", () => {
    // True for a first request and for a retry alike; without it the agent pays twice.
    const paid = rateLimitedBody({
      limit: 60,
      windowSeconds: 60,
      retryAfterSeconds: 2,
      scope: "paid",
      targetsRunCreation: true,
    });

    // Conditional because a request without a key also gets a 429 here.
    expect(paid.error.message).toContain("If this request carried an Idempotency-Key");
    expect(paid.error.message).toContain("SAME key");
    expect(paid.error.message).toContain("second paid render");
  });

  it("a paid refusal of a non-run request says nothing about keys", () => {
    // A path typo or unsupported method renders nothing, whatever the key.
    const notARun = rateLimitedBody({
      limit: 60,
      windowSeconds: 60,
      retryAfterSeconds: 2,
      scope: "paid",
    });

    expect(notARun.error.message).not.toContain("second paid render");
    expect(notARun.error.message).not.toContain("Idempotency-Key");
    expect(notARun.error.message).toContain("nothing was charged");
  });

  it("both refusals say nothing was charged", () => {
    for (const scope of ["paid", "free"] as const) {
      const body = rateLimitedBody({
        limit: 60,
        windowSeconds: 60,
        retryAfterSeconds: 2,
        scope,
      });
      expect(body.error.message).toContain("nothing was charged");
    }
  });

  it("\"retry in zero seconds\" cannot be built", () => {
    // Zero would say "retry now" in a refusal of exactly that. The schema requires a
    // positive number, and `admitRequest` rounds the window remainder UP.
    expect(() =>
      rateLimitedBody({
        limit: 60,
        windowSeconds: 60,
        retryAfterSeconds: 0,
        scope: "paid",
      }),
    ).toThrow();
  });
});

describe("limit numbers", () => {
  it("the free bucket is HIGHER than the paid one, not equal", () => {
    // Polling every ~5 s is 12 requests per minute per run; three runs would take 36 of 60.
    expect(RATE_LIMIT_FREE_PER_MINUTE).toBeGreaterThan(RATE_LIMIT_PAID_PER_MINUTE);
  });

  it("the free bucket fits the normal loop at full concurrency", () => {
    // The floor is computed: 12 polls per minute for each run an account may have in flight,
    // three with a presenter and two faceless, plus a `quote` before each start.
    const pollsPerRunPerMinute = Math.floor(RATE_LIMIT_WINDOW_SECONDS / 5);
    const floorRps = pollsPerRunPerMinute * (MAX_CONCURRENT_RENDERS_PER_ACCOUNT + MAX_CONCURRENT_FACELESS_PER_ACCOUNT);

    expect(MAX_CONCURRENT_FACELESS_PER_ACCOUNT).toBe(2);
    expect(floorRps).toBe(60);
    expect(RATE_LIMIT_FREE_PER_MINUTE).toBeGreaterThan(floorRps * 2);
  });
});
