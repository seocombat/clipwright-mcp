import { describe, expect, it } from "vitest";

import {
  agentFailureReport,
  isRetryableFailure,
  parseApiFailure,
  parseRetryAfterSeconds,
  retryDelayMs,
} from "./api-failure.js";
import { QUEUE_PROMISES } from "./__fixtures__/queue-promises.js";
import {
  accountNotAdmittedBody,
  debtOutstandingBody,
  insufficientCreditsBody,
} from "./errors.js";
import {
  RATE_LIMIT_PAID_PER_MINUTE,
  RATE_LIMIT_WINDOW_SECONDS,
  rateLimitedBody,
} from "./rate-limit.js";

// Our bodies come from the same builders the API uses, so a form change turns these red.
// Only bodies our server never sends (proxy HTML, empty, truncated JSON) are hand-written.

const NOW = new Date("2026-07-29T12:00:00.000Z");

/** Our 429 body, from the same builder the middleware uses. */
const RATE_LIMITED = rateLimitedBody({
  limit: RATE_LIMIT_PAID_PER_MINUTE,
  windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
  retryAfterSeconds: 7,
  scope: "paid",
  targetsRunCreation: true,
});

const INSUFFICIENT = insufficientCreditsBody({ balanceCredits: 3, requiredCredits: 8 });
const DEBT = debtOutstandingBody({ debtCredits: 120 });

describe("parseRetryAfterSeconds — both RFC 9110 forms", () => {
  it("parses delta-seconds as a number", () => {
    expect(parseRetryAfterSeconds("7", NOW)).toBe(7);
    expect(parseRetryAfterSeconds("  7  ", NOW)).toBe(7);
    expect(parseRetryAfterSeconds("0", NOW)).toBe(0);
  });

  it("parses an HTTP-date into remaining seconds, not NaN", () => {
    // Without the date branch this is undefined and the proxy's wait is lost.
    const at = new Date(NOW.getTime() + 30_000).toUTCString();
    expect(parseRetryAfterSeconds(at, NOW)).toBe(30);
  });

  it("expands an RFC 850 two-digit year by the RFC rule, not the V8 rule", () => {
    // V8 reads "75" as 1975; RFC 9110 moves a year back only if it is over 50 years ahead.
    const seconds = parseRetryAfterSeconds("Monday, 29-Jul-75 12:00:30 GMT", NOW);
    expect(seconds).toBeGreaterThan(40 * 365 * 24 * 3600);

    // Exactly 50 years ahead is still the future: pins `> 50` against `>= 50`.
    expect(parseRetryAfterSeconds("Wednesday, 29-Jul-76 12:00:30 GMT", NOW)).toBeGreaterThan(0);

    // More than 50 years ahead moves to the past and yields zero.
    expect(parseRetryAfterSeconds("Monday, 29-Jul-77 12:00:30 GMT", NOW)).toBe(0);
  });

  it("reads asctime as UTC, not as the machine's local time", () => {
    // The zone is set explicitly: under TZ=UTC a `Date.parse` regression would pass.
    // The date is in the future because a past date gives zero under both readings.
    const savedTz = process.env.TZ;
    process.env.TZ = "Europe/Minsk";
    try {
      // Guard: if the zone switch did not apply, the check is meaningless and must say so.
      expect(
        new Date("2026-07-29T12:00:00.000Z").getHours(),
        "process.env.TZ change had no effect — the asctime check is meaningless",
      ).toBe(15);

      const at = new Date("2026-07-29T12:00:00.000Z");
      expect(parseRetryAfterSeconds("Wed Jul 29 15:00:30 2026", at)).toBe(3 * 3600 + 30);
    } finally {
      if (savedTz === undefined) delete process.env.TZ;
      else process.env.TZ = savedTz;
    }
  });

  it("rejects a nonexistent date instead of normalizing it to a neighbor", () => {
    // `Date.UTC` rolls July 32 into August 1, turning a garbage header into a days-long wait.
    for (const raw of [
      "Sun, 32 Jul 2026 12:00:00 GMT", // no 32nd day
      "Sun, 00 Jul 2026 12:00:00 GMT", // no zeroth day either
      "Sun, 31 Feb 2026 12:00:00 GMT", // February is shorter
      "Sun, 29 Feb 2026 12:00:00 GMT", // 2026 is not a leap year
      // Exact bounds: 24 and 60 are the first illegal values.
      "Sun, 06 Nov 1994 24:00:00 GMT", // hours 0..23
      "Sun, 06 Nov 1994 25:00:00 GMT",
      "Sun, 06 Nov 1994 12:60:00 GMT", // minutes 0..59
      "Sun, 06 Nov 1994 12:61:00 GMT",
      "Sun, 06 Nov 1994 12:00:61 GMT", // second 60 is legal, 61 is not
      // Years before 1900: `Date.UTC` maps 0..99 to 1900+year, giving a zero wait.
      "Sun, 01 Jan 0099 00:00:00 GMT",
      "Sun, 01 Jan 0000 00:00:00 GMT",
      "Sun, 01 Jan 1899 00:00:00 GMT",
    ]) {
      expect(parseRetryAfterSeconds(raw, NOW), raw).toBeUndefined();
    }

    // February 29 of a leap year is legal and must pass.
    expect(parseRetryAfterSeconds("Sat, 29 Feb 2028 12:00:00 GMT", NOW)).toBeGreaterThan(0);

    // A leap second 60 is legal per RFC.
    expect(parseRetryAfterSeconds("Tue, 30 Jun 2026 23:59:60 GMT", NOW)).toBeDefined();

    // Legal values at the range edges pass too.
    expect(parseRetryAfterSeconds("Sun, 06 Nov 2094 23:59:59 GMT", NOW)).toBeGreaterThan(0);
    expect(parseRetryAfterSeconds("Sun, 06 Nov 2094 00:00:00 GMT", NOW)).toBeGreaterThan(0);
  });

  it("accepts all three RFC 9110 forms and nothing else", () => {
    // A weekday-prefix check let `Mon 1/2/2099` through as a decades-long wait.
    expect(parseRetryAfterSeconds("Sun, 06 Nov 1994 08:49:37 GMT", NOW)).toBe(0);
    expect(parseRetryAfterSeconds("Sunday, 06-Nov-94 08:49:37 GMT", NOW)).toBe(0);
    expect(parseRetryAfterSeconds("Sun Nov  6 08:49:37 1994", NOW)).toBe(0);

    // Garbage the legacy date parser accepts silently.
    for (const raw of [
      "Mon 1/2/2099",
      "Sun blah 2099",
      "Tue 2099",
      "Wed, 99",
      "Fri 12",
      "Sun, 06 Nov 1994 08:49:37",
      "Sun, 6 Nov 1994 08:49:37 GMT",
    ]) {
      expect(parseRetryAfterSeconds(raw, NOW), `Retry-After: ${raw}`).toBeUndefined();
    }
  });

  it("gives zero for a past date, not a negative number", () => {
    // A negative value would drag a downstream `Math.max` below the caller's step.
    const past = new Date(NOW.getTime() - 30_000).toUTCString();
    expect(parseRetryAfterSeconds(past, NOW)).toBe(0);
  });

  it("gives undefined, not NaN, for garbage, an empty string and a missing header", () => {
    // NaN passes arithmetic silently and becomes no wait at all. V8's legacy parser
    // reads `-5` and `7.5` as 2001 dates.
    for (const raw of ["later", "", "   ", "-5", "7.5", "0x10", null, undefined]) {
      expect(parseRetryAfterSeconds(raw, NOW), `Retry-After: ${String(raw)}`).toBeUndefined();
    }
  });
});

describe("parseApiFailure — our bodies parse with all their numbers", () => {
  it("429: numbers come from the body, not the header", () => {
    // The header disagrees on purpose: a proxy may rewrite it, the body is ours.
    const failure = parseApiFailure({
      status: 429,
      bodyText: JSON.stringify(RATE_LIMITED),
      retryAfterHeader: "999",
      now: NOW,
    });

    expect(failure).toEqual({
      kind: "rate_limited",
      status: 429,
      message: RATE_LIMITED.error.message,
      retryAfterSeconds: 7,
      limit: RATE_LIMIT_PAID_PER_MINUTE,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    });
  });

  it("402 insufficient_credits carries the balance and the requirement", () => {
    const failure = parseApiFailure({
      status: 402,
      bodyText: JSON.stringify(INSUFFICIENT),
      now: NOW,
    });
    expect(failure).toEqual({
      kind: "insufficient_credits",
      status: 402,
      message: INSUFFICIENT.error.message,
      balanceCredits: 3,
      requiredCredits: 8,
    });
  });

  it("403 account_not_admitted is terminal and does not ask to fix the call", () => {
    const failure = parseApiFailure({
      status: 403,
      bodyText: JSON.stringify(accountNotAdmittedBody()),
      now: NOW,
    });

    expect(failure.kind).toBe("not_admitted");
    expect(isRetryableFailure(failure)).toBe(false);

    const report = agentFailureReport(failure);
    expect(report.code).toBe("account_not_admitted");
    expect(report.retryable).toBe(false);
    // Neither fixing the call nor buying credits lifts the block.
    expect(report.next_action).not.toContain("fix the call");
    expect(report.next_action).toContain("operator");
    // No timeline: a 403 says only that access is missing, possibly revoked.
    expect(report.next_action).not.toContain("queue");
  });

  it("no surface promises a timeline, starting with the one that builds the text", () => {
    // Checks the source body and both derived texts at once. The word list is shared
    // with the docs guard so the two cannot drift.
    const body = accountNotAdmittedBody().error.message;
    const report = agentFailureReport(
      parseApiFailure({
        status: 403,
        bodyText: JSON.stringify(accountNotAdmittedBody()),
        now: NOW,
      }),
    );

    for (const promise of QUEUE_PROMISES) {
      expect(body.toLowerCase(), `refusal body promises "${promise}"`).not.toContain(promise);
      expect(report.message.toLowerCase(), `agent message promises "${promise}"`).not.toContain(
        promise,
      );
      expect(
        report.next_action.toLowerCase(),
        `next_action promises "${promise}"`,
      ).not.toContain(promise);
    }
  });

  it("mismatched pair: 402 with an account_not_admitted body does not surface the code", () => {
    // A behavioral code is recognized only on its own status, or a cached body would
    // tell the agent credits are not needed on a money refusal.
    const failure = parseApiFailure({
      status: 402,
      bodyText: JSON.stringify(accountNotAdmittedBody()),
      now: NOW,
    });

    expect(failure.kind).toBe("client_error");
    if (failure.kind !== "client_error") return;
    expect(failure.code).toBeUndefined();
    // The text survives even when the code is suppressed.
    expect(failure.message).toContain("not admitted");
  });

  it("402 debt_outstanding is its own kind, not a shade of the previous one", () => {
    const failure = parseApiFailure({
      status: 402,
      bodyText: JSON.stringify(DEBT),
      now: NOW,
    });
    expect(failure).toEqual({
      kind: "debt_outstanding",
      status: 402,
      message: DEBT.error.message,
      debtCredits: 120,
    });
  });

  it("the body does not reclassify the status: the failure class comes from the status", () => {
    // A caching proxy may pair one response's body with another's status. The costly
    // case: a 429 with a stale debt body turned terminal and abandoned a paid run.
    const staleDebtOn429 = parseApiFailure({
      status: 429,
      bodyText: JSON.stringify(DEBT),
      now: NOW,
      retryAfterHeader: "5",
    });
    expect(staleDebtOn429.kind).toBe("rate_limited");
    expect(isRetryableFailure(staleDebtOn429)).toBe(true);
    // The text is kept: it is all that survives of the body.
    expect(staleDebtOn429.message).toBe(DEBT.error.message);

    // Mirror case: a 402 with a rate_limited body must not become retryable.
    const limitedOn402 = parseApiFailure({
      status: 402,
      bodyText: JSON.stringify(RATE_LIMITED),
      now: NOW,
    });
    expect(isRetryableFailure(limitedOn402)).toBe(false);

    // Hence "402 but retry" cannot exist for any pairing.
    for (const status of [402, 429, 400, 500]) {
      for (const body of [RATE_LIMITED, INSUFFICIENT, DEBT]) {
        const failure = parseApiFailure({ status, bodyText: JSON.stringify(body), now: NOW });
        expect(failure.status).toBe(status);
        if (status === 402) expect(isRetryableFailure(failure)).toBe(false);
      }
    }
  });
});

describe("parseApiFailure — foreign bodies do not break parsing", () => {
  it("proxy HTML on a 429 gives a meaningful failure, not a parser error", () => {
    // An unconditional JSON.parse would throw "Unexpected token <" here.
    const failure = parseApiFailure({
      status: 429,
      bodyText: "<html><head><title>429 Too Many Requests</title></head>\n<body>error code: 1015</body></html>",
      retryAfterHeader: "3",
      now: NOW,
    });

    expect(failure.kind).toBe("rate_limited");
    expect(failure.message).toContain("429");
    // The body excerpt lets the reader learn the cause without proxy logs.
    expect(failure.message).toContain("error code: 1015");
    expect(failure).toMatchObject({ retryAfterSeconds: 3, limit: undefined });
  });

  it("truncates a long foreign body instead of carrying it whole", () => {
    const failure = parseApiFailure({
      status: 503,
      bodyText: "x".repeat(5_000),
      now: NOW,
    });
    expect(failure.kind).toBe("server_error");
    expect(failure.message.length).toBeLessThan(400);
    expect(failure.message).toContain("…");
  });

  it("does not present an unread body as a foreign one", () => {
    // Headers may come straight from our API with only the body lost, so no gateway is blamed.
    const unread = parseApiFailure({ status: 429, bodyText: undefined, retryAfterHeader: "2", now: NOW });
    expect(unread.kind).toBe("rate_limited");
    expect(unread.message).toContain("could not be read");
    expect(unread.message).not.toMatch(/intermediary|gateway|CDN/i);
    // The header wait survives: it did not arrive in the body.
    expect(unread).toMatchObject({ retryAfterSeconds: 2 });

    // An empty body is different: it was read, so it can be judged.
    const empty = parseApiFailure({ status: 429, bodyText: "", now: NOW });
    expect(empty.message).not.toContain("could not be read");
  });

  it("parses an empty body and truncated JSON by status", () => {
    for (const bodyText of ["", '{"error":{"code":']) {
      const failure = parseApiFailure({ status: 500, bodyText, now: NOW });
      expect(failure.kind).toBe("server_error");
      expect(failure.message).toContain("500");
    }
  });

  it("a behavioral code from a foreign body does not survive a status mismatch", () => {
    // Otherwise a 403 with a rate_limited body reports "wait and retry" with `retryable: false`.
    const limitedBodyOn403 = parseApiFailure({
      status: 403,
      bodyText: JSON.stringify(RATE_LIMITED),
      retryAfterHeader: "5",
      now: NOW,
    });
    const report = agentFailureReport(limitedBodyOn403);
    expect(report.retryable).toBe(false);
    expect(report.code).toBe("http_403");
    // The body text is kept: it is all that survives of the foreign response.
    expect(report.message).toBe(RATE_LIMITED.error.message);

    // The invariant: code and retry flag never contradict for any status/body pair.
    for (const status of [400, 401, 402, 403, 404, 429, 500, 503]) {
      for (const body of [RATE_LIMITED, INSUFFICIENT, DEBT]) {
        const each = agentFailureReport(
          parseApiFailure({ status, bodyText: JSON.stringify(body), now: NOW }),
        );
        if (each.code === "rate_limited") expect(each.retryable).toBe(true);
        if (each.code === "insufficient_credits" || each.code === "debt_outstanding") {
          expect(each.retryable).toBe(false);
        }
      }
    }
  });

  it("passes a non-behavioral code from the body through unchanged", () => {
    // Only behavioral codes are dropped; an ordinary code stays useful.
    const failure = parseApiFailure({
      status: 403,
      bodyText: JSON.stringify({ error: { code: "forbidden", message: "no access" } }),
      now: NOW,
    });
    expect(agentFailureReport(failure).code).toBe("forbidden");
  });

  it("parses a generic envelope without numbers by code and text", () => {
    const failure = parseApiFailure({
      status: 400,
      bodyText: JSON.stringify({ error: { code: "invalid_input", message: "script is required" } }),
      now: NOW,
    });
    expect(failure).toEqual({
      kind: "client_error",
      status: 400,
      message: "script is required",
      code: "invalid_input",
    });
  });

  it("5xx takes the wait from the header, including the HTTP-date form", () => {
    const at = new Date(NOW.getTime() + 12_000).toUTCString();
    const failure = parseApiFailure({
      status: 503,
      bodyText: "",
      retryAfterHeader: at,
      now: NOW,
    });
    expect(failure).toMatchObject({ kind: "server_error", retryAfterSeconds: 12 });
  });
});

describe("retry policy — one for every surface", () => {
  it("retries 429 and 5xx; not either 402 nor other 4xx", () => {
    // A retryable 402 would spin on a money refusal and burn the rate limit.
    const retryable = [
      parseApiFailure({ status: 429, bodyText: JSON.stringify(RATE_LIMITED), now: NOW }),
      parseApiFailure({ status: 500, bodyText: "", now: NOW }),
      parseApiFailure({ status: 503, bodyText: "", now: NOW }),
    ];
    const terminal = [
      parseApiFailure({ status: 402, bodyText: JSON.stringify(INSUFFICIENT), now: NOW }),
      parseApiFailure({ status: 402, bodyText: JSON.stringify(DEBT), now: NOW }),
      parseApiFailure({ status: 400, bodyText: "", now: NOW }),
      parseApiFailure({ status: 401, bodyText: "", now: NOW }),
      parseApiFailure({ status: 404, bodyText: "", now: NOW }),
    ];

    expect(retryable.map(isRetryableFailure)).toEqual([true, true, true]);
    expect(terminal.map(isRetryableFailure)).toEqual([false, false, false, false, false]);
  });

  it("waits no less than the caller's own step and honors Retry-After", () => {
    const limited = parseApiFailure({
      status: 429,
      bodyText: JSON.stringify(RATE_LIMITED),
      now: NOW,
    });
    // The server said 7 s: wait 7, not the own step of 5.
    expect(retryDelayMs(limited, 5_000)).toBe(7_000);

    // The server said nothing: wait the own step, not zero.
    const silent = parseApiFailure({ status: 503, bodyText: "", now: NOW });
    expect(retryDelayMs(silent, 5_000)).toBe(5_000);
  });
});

describe("agentFailureReport — a failure the agent can act on", () => {
  it("both 402s are terminal, carry numbers and forbid a retry outright", () => {
    const insufficient = agentFailureReport(
      parseApiFailure({ status: 402, bodyText: JSON.stringify(INSUFFICIENT), now: NOW }),
    );
    expect(insufficient).toMatchObject({
      status: "FAILED",
      code: "insufficient_credits",
      retryable: false,
      balance_credits: 3,
      required_credits: 8,
    });
    expect(insufficient.next_action).toContain("Do NOT retry");
    // Numbers must sit in the imperative too: the agent shows the user one line.
    expect(insufficient.next_action).toContain("3");
    expect(insufficient.next_action).toContain("8");

    const debt = agentFailureReport(
      parseApiFailure({ status: 402, bodyText: JSON.stringify(DEBT), now: NOW }),
    );
    expect(debt).toMatchObject({
      status: "FAILED",
      code: "debt_outstanding",
      retryable: false,
      debt_credits: 120,
    });
    // "Buy credits" is right: incoming credits clear debt first. The whole imperative
    // is matched, since "buy credits" alone would also match "Do not buy credits".
    expect(debt.next_action).toContain("Tell the user to buy credits");
    // The debt number sits in the imperative too.
    expect(debt.next_action).toContain("120");
    // Same anchor as in `errors.test.ts`: about the purchase, not the account.
    expect(debt.next_action).toContain("adds nothing to the balance");
    expect(debt.next_action).not.toContain("nothing to spend");
  });

  it("429 says to wait the given seconds and repeat the SAME call", () => {
    const report = agentFailureReport(
      parseApiFailure({ status: 429, bodyText: JSON.stringify(RATE_LIMITED), now: NOW }),
    );
    expect(report).toMatchObject({
      status: "RETRY_LATER",
      code: "rate_limited",
      retryable: true,
      retry_after_seconds: 7,
      limit: RATE_LIMIT_PAID_PER_MINUTE,
    });
    expect(report.next_action).toContain("7 seconds");
    // A new idempotency key on a retried run start is a second paid render.
    expect(report.next_action).toContain("SAME call");
  });

  it("the 429 report claims nothing about money", () => {
    // A 429 can hit a status poll of a charged run; the server's own wording is in `message`.
    const report = agentFailureReport(
      parseApiFailure({ status: 429, bodyText: JSON.stringify(RATE_LIMITED), now: NOW }),
    );
    expect(report.next_action).not.toMatch(/charged|billed|free|refund/i);
    // The imperative stays an action.
    expect(report.next_action).toContain("SAME call");

    // The server's wording arrives untouched: it is the source of truth about money.
    expect(report.message).toBe(RATE_LIMITED.error.message);
  });

  it("a foreign 429 without numbers does not invent them but still says to wait", () => {
    const report = agentFailureReport(
      parseApiFailure({ status: 429, bodyText: "<html>1015</html>", now: NOW }),
    );
    expect(report.status).toBe("RETRY_LATER");
    expect(report.retryable).toBe(true);
    expect(report.retry_after_seconds).toBeUndefined();
    expect(report.limit).toBeUndefined();
  });

  it("the report does not attribute the failure to a source it cannot know", () => {
    // 429 and 5xx come alike from our server, a gateway or a CDN. The body excerpt may
    // quote such words; only our own claim about the source is forbidden.
    for (const status of [429, 500, 502, 503]) {
      for (const bodyText of [undefined, "", "<html>maintenance</html>"]) {
        const report = agentFailureReport(parseApiFailure({ status, bodyText, now: NOW }));
        const where = `${status} / ${String(bodyText)}`;
        // Both texts are checked: the guess once lived in `message`, where people read it.
        for (const text of [report.next_action, report.message]) {
          expect(text, where).not.toMatch(/Clipwright API failed|on its side/i);
          expect(text, where).not.toMatch(/intermediary|gateway|CDN|proxy/i);
        }
        // The imperative remains: an unknown culprit does not mean nothing to do.
        expect(report.next_action).toMatch(/repeat the SAME call/i);
      }
    }
  });

  it("status and retry flag cannot diverge", () => {
    // Two fields for one fact are a convenience and must never become two sources.
    const failures = [
      parseApiFailure({ status: 429, bodyText: "", now: NOW }),
      parseApiFailure({ status: 500, bodyText: "", now: NOW }),
      parseApiFailure({ status: 402, bodyText: JSON.stringify(DEBT), now: NOW }),
      parseApiFailure({ status: 400, bodyText: "", now: NOW }),
    ];
    for (const failure of failures) {
      const report = agentFailureReport(failure);
      expect(report.retryable).toBe(report.status === "RETRY_LATER");
      expect(report.retryable).toBe(isRetryableFailure(failure));
    }
  });
});

// `invalid_request` describes the request shape, not the account state: a repeat gets
// the same refusal, so it is deliberately not a behavioral code.
describe("invalid_request is not a behavioral code", () => {
  const VALIDATION_BODY = JSON.stringify({
    error: {
      code: "invalid_request",
      message: "script: script has 5001 characters; eleven_v3 allows at most 5000 characters",
    },
  });

  it("the code reaches the caller instead of being suppressed", () => {
    const failure = parseApiFailure({ status: 400, bodyText: VALIDATION_BODY, now: NOW });
    expect(failure.kind).toBe("client_error");
    expect((failure as { code?: string }).code).toBe("invalid_request");
  });

  it("the message itself arrives along with the code", () => {
    // A code without the reason does not tell the user what to fix.
    const failure = parseApiFailure({ status: 400, bodyText: VALIDATION_BODY, now: NOW });
    expect(failure.message).toContain("eleven_v3 allows at most 5000 characters");
    expect(failure.message).not.toContain("not a Clipwright error object");
  });

  it("is not retried: the input will not become valid on its own", () => {
    const failure = parseApiFailure({ status: 400, bodyText: VALIDATION_BODY, now: NOW });
    expect(isRetryableFailure(failure)).toBe(false);
  });
});
