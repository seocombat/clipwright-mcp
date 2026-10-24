import { describe, expect, it } from "vitest";

import {
  agentFailureReport,
  UPLOAD_NOT_FINISHED_NEXT_ACTION,
  isRetryableFailure,
  parseApiFailure,
  parseRetryAfterSeconds,
  retryDelayMs,
} from "./api-failure.js";
import { QUEUE_PROMISES } from "./__fixtures__/queue-promises.js";
import {
  accountNotAdmittedBody,
  apiErrorBody,
  debtOutstandingBody,
  editCeilingReachedBody,
  editConflictBody,
  editingDisabledBody,
  editingNotPricedBody,
  editInvalidBody,
  insufficientCreditsBody,
  runNotEditableBody,
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

describe("the two refusals of a draft carry their fields", () => {
  const CONFLICT = editConflictBody({ baseVersion: 4, version: 7 });
  const UNSUPPORTED = runNotEditableBody({ runId: "run_a1", state: "unsupported_line", reason: "this line has no editor yet" });
  const STATELESS = runNotEditableBody({ runId: "run_a1", state: "retired", reason: null });
  const parsed = (status: number, body: unknown) => parseApiFailure({ status, bodyText: JSON.stringify(body), now: NOW });

  it("409 edit_conflict carries the stored version; 409 run_not_editable carries the state and the reason, a null reason included", () => {
    expect(parsed(409, CONFLICT)).toEqual({ kind: "edit_conflict", status: 409, message: CONFLICT.error.message, version: 7 });
    expect(parsed(409, editConflictBody({ baseVersion: 2, version: 0 }))).toMatchObject({ kind: "edit_conflict", version: 0 });
    expect(parsed(409, UNSUPPORTED)).toEqual({ kind: "run_not_editable", status: 409, message: UNSUPPORTED.error.message,
      state: "unsupported_line", reason: "this line has no editor yet" });
    expect(parsed(409, STATELESS)).toEqual({ kind: "run_not_editable", status: 409, message: STATELESS.error.message,
      state: "retired", reason: null });
  });

  it("neither is retried, and each report repeats its fields in the fields and in the imperative", () => {
    const conflict = agentFailureReport(parsed(409, CONFLICT));
    expect(conflict).toMatchObject({ status: "FAILED", code: "edit_conflict", retryable: false, version: 7 });
    expect(conflict.next_action).toContain("version 7");
    expect(conflict.next_action).toContain("Read the draft");
    expect(conflict).not.toHaveProperty("state");

    const unsupported = agentFailureReport(parsed(409, UNSUPPORTED));
    expect(unsupported).toMatchObject({ status: "FAILED", code: "run_not_editable", retryable: false,
      state: "unsupported_line", reason: "this line has no editor yet" });
    expect(unsupported.next_action).toContain("its state is unsupported_line (this line has no editor yet)");
    expect(unsupported).not.toHaveProperty("version");
    const stateless = agentFailureReport(parsed(409, STATELESS));
    expect(stateless).toMatchObject({ state: "retired", reason: null });
    expect(stateless.next_action).toContain("its state is retired. Nothing was stored");

    for (const body of [CONFLICT, UNSUPPORTED, STATELESS]) expect(isRetryableFailure(parsed(409, body))).toBe(false);
  });

  it("each is recognized on 409 only: on another status the class comes from the status and the code is dropped; another 409 keeps its code", () => {
    for (const body of [CONFLICT, UNSUPPORTED, STATELESS]) {
      // Every status an error can carry but the one: a status with typed refusals of its own (402, 403, 429) included.
      for (let status = 400; status <= 599; status += 1) {
        if (status === 409) continue;
        const failure = parsed(status, body);
        expect(["edit_conflict", "run_not_editable"], String(status)).not.toContain(failure.kind);
        expect(["edit_conflict", "run_not_editable"], String(status)).not.toContain(agentFailureReport(failure).code);
      }
      for (const status of [400, 404, 429, 503]) expect(parsed(status, body).message).toBe(body.error.message);
    }
    const reused = parsed(409, { error: { code: "idempotency_key_reused", message: "the key was spent" } });
    expect(reused).toEqual({ kind: "client_error", status: 409, message: "the key was spent", code: "idempotency_key_reused" });
    // A conflict body without its version is not the typed refusal, and its code does not pose as one.
    const versionless = parsed(409, { error: { code: "edit_conflict", message: "moved" } });
    expect(versionless).toEqual({ kind: "client_error", status: 409, message: "moved", code: undefined });
  });
});

describe("the revision refusals carry their kinds and fields", () => {
  const parsed = (status: number, body: unknown) => parseApiFailure({ status, bodyText: JSON.stringify(body), now: NOW });
  const DISABLED = editingDisabledBody({ reason: "flag_off" });
  const UNSET_CEILING = editingDisabledBody({ reason: "ceiling_not_set" });
  const NOT_PRICED = editingNotPricedBody({ seams: ["unit", "zero_unit"] });
  const NO_WINDOW = apiErrorBody({ code: "editing_window_not_set", message: "paid edits have no window yet." });
  const IN_FLIGHT = editCeilingReachedBody({ limit: "in_flight", root_run_id: "run_root", allowed: 1, counted: 1, run_ids: ["run_busy"] });
  // Counted above allowed (a ceiling lowered after the failures), so a swap of the two fields shows.
  const FAILED = editCeilingReachedBody({ limit: "failed_or_unfinished", root_run_id: "run_root", allowed: 3, counted: 4,
    run_ids: ["run_f1", "run_f2", "run_f3", "run_f4"] });
  const INVALID = editInvalidBody({ issues: [
    { code: "overlap", shot_id: "beat-2", from_frame: 40, to_frame: 52, message: "beat-2 overlaps beat-1" },
    { code: "uncovered", shot_id: "beat-4", message: "a gap before beat-4" },
  ] });
  const NO_CHANGES = apiErrorBody({ code: "no_changes", message: "the document changes nothing." });
  const NEEDS_UNIT = apiErrorBody({ code: "revision_needs_generated_unit", message: "needs a generated unit." });

  it("each of the seven revision codes on its own status parses to its kind with its fields", () => {
    const table: [number, unknown, unknown][] = [
      [503, DISABLED, { kind: "editing_closed", status: 503, message: DISABLED.error.message, code: "editing_disabled", reason: "flag_off", seams: null }],
      [503, UNSET_CEILING, { kind: "editing_closed", status: 503, message: UNSET_CEILING.error.message, code: "editing_disabled", reason: "ceiling_not_set", seams: null }],
      [503, NOT_PRICED, { kind: "editing_closed", status: 503, message: NOT_PRICED.error.message, code: "editing_not_priced", reason: null, seams: ["unit", "zero_unit"] }],
      [503, NO_WINDOW, { kind: "editing_closed", status: 503, message: NO_WINDOW.error.message, code: "editing_window_not_set", reason: null, seams: null }],
      [409, IN_FLIGHT, { kind: "edit_ceiling_reached", status: 409, message: IN_FLIGHT.error.message, limit: "in_flight",
        rootRunId: "run_root", allowed: 1, counted: 1, runIds: ["run_busy"] }],
      [409, FAILED, { kind: "edit_ceiling_reached", status: 409, message: FAILED.error.message, limit: "failed_or_unfinished",
        rootRunId: "run_root", allowed: 3, counted: 4, runIds: ["run_f1", "run_f2", "run_f3", "run_f4"] }],
      [422, INVALID, { kind: "edit_invalid", status: 422, message: INVALID.error.message, issues: INVALID.error.issues }],
      [422, NO_CHANGES, { kind: "client_error", status: 422, message: NO_CHANGES.error.message, code: "no_changes" }],
      [422, NEEDS_UNIT, { kind: "client_error", status: 422, message: NEEDS_UNIT.error.message, code: "revision_needs_generated_unit" }],
    ];
    for (const [status, body, expected] of table) expect(parsed(status, body), JSON.stringify(body)).toEqual(expected);
  });

  it("a reason, limit or issue code of a newer server still parses to its kind, and a body missing a field does not", () => {
    const later = (body: { error: object }, error: object) => ({ error: { ...body.error, ...error } });
    expect(parsed(503, later(DISABLED, { reason: "paused" }))).toMatchObject({ kind: "editing_closed", reason: "paused" });
    expect(parsed(503, later(NOT_PRICED, { seams: ["voice"] }))).toMatchObject({ kind: "editing_closed", seams: ["voice"] });
    expect(parsed(409, later(IN_FLIGHT, { limit: "per_day" }))).toMatchObject({ kind: "edit_ceiling_reached", limit: "per_day" });
    expect(parsed(422, later(INVALID, { issues: [{ code: "voice_gap", message: "no voice" }] })))
      .toMatchObject({ kind: "edit_invalid", issues: [{ code: "voice_gap", message: "no voice" }] });
    const { run_ids: _runIds, ...countless } = IN_FLIGHT.error;
    expect(parsed(409, { error: countless })).toEqual({ kind: "client_error", status: 409, message: IN_FLIGHT.error.message, code: undefined });
    expect(parsed(422, later(INVALID, { issues: [] }))).toMatchObject({ kind: "client_error", code: undefined });
  });

  it("the three closed-door 503s are not retryable", () => {
    for (const body of [DISABLED, UNSET_CEILING, NOT_PRICED, NO_WINDOW]) {
      const failure = parsed(503, body);
      expect(isRetryableFailure(failure), JSON.stringify(body)).toBe(false);
      expect(agentFailureReport(failure)).toMatchObject({ status: "FAILED", retryable: false, code: body.error.code });
    }
    for (const body of [IN_FLIGHT, FAILED, INVALID]) expect(isRetryableFailure(parsed(body === INVALID ? 422 : 409, body))).toBe(false);
  });

  it("off its own status a revision code is dropped and the class follows the status", () => {
    const own = new Map<unknown, number>([[DISABLED, 503], [NOT_PRICED, 503], [NO_WINDOW, 503], [IN_FLIGHT, 409], [INVALID, 422]]);
    for (const [body, home] of own) {
      for (let status = 400; status <= 599; status += 1) {
        if (status === home) continue;
        const failure = parsed(status, body);
        expect(["editing_closed", "edit_ceiling_reached", "edit_invalid"], String(status)).not.toContain(failure.kind);
        expect(failure.kind === "client_error" ? failure.code : undefined, String(status)).toBeUndefined();
        expect(failure.kind, String(status)).toBe(status === 429 ? "rate_limited" : status >= 500 ? "server_error" : "client_error");
      }
    }
  });

  it("a 503 with a foreign body is still server_error", () => {
    expect(parseApiFailure({ status: 503, bodyText: "<html>Service Unavailable</html>", now: NOW }).kind).toBe("server_error");
    expect(parsed(503, { error: { code: "maintenance", message: "back soon" } }).kind).toBe("server_error");
    expect(isRetryableFailure(parsed(503, { error: { code: "maintenance", message: "back soon" } }))).toBe(true);
  });

  it("the ceiling refusal reports ceiling, allowed, counted and run_ids, and leaves limit unset", () => {
    const inFlight = agentFailureReport(parsed(409, IN_FLIGHT));
    expect(inFlight).toMatchObject({ code: "edit_ceiling_reached", ceiling: "in_flight", root_run_id: "run_root",
      allowed: 1, counted: 1, run_ids: ["run_busy"] });
    expect(inFlight).not.toHaveProperty("limit");
    expect(inFlight.next_action).toContain("still running (run_busy)");
    expect(inFlight.next_action).toContain("held for review, contact support");
    const failed = agentFailureReport(parsed(409, FAILED));
    expect(failed).toMatchObject({ ceiling: "failed_or_unfinished", allowed: 3, counted: 4 });
    expect(failed.next_action).toContain("run_root has 4 of 3 failed or unfinished paid edits");
    expect(failed.next_action).toContain("support can raise the revision limit");
    expect(failed).not.toHaveProperty("limit");
  });

  it("the closed door names its code and reason or seams; the invalid document names its first issue", () => {
    expect(agentFailureReport(parsed(503, DISABLED))).toMatchObject({ reason: "flag_off", seams: null });
    expect(agentFailureReport(parsed(503, DISABLED)).next_action).toContain("(editing_disabled: flag_off)");
    expect(agentFailureReport(parsed(503, NOT_PRICED)).next_action).toContain("(editing_not_priced: unit, zero_unit)");
    expect(agentFailureReport(parsed(503, NOT_PRICED))).toMatchObject({ reason: null, seams: ["unit", "zero_unit"] });
    expect(agentFailureReport(parsed(503, NO_WINDOW)).next_action).toContain("(editing_window_not_set)");
    const invalid = agentFailureReport(parsed(422, INVALID));
    expect(invalid).toMatchObject({ code: "edit_invalid", issues: INVALID.error.issues });
    expect(invalid.next_action).toContain("Fix the request: beat-2 overlaps beat-1.");
  });

  /** Mutant: a report that says "revision" or "document", and an agent creating a candidate is told about a run it never started. */
  it("the candidate refusals reach the same kinds, and their reports name neither a revision nor a document", () => {
    const inFlight = editCeilingReachedBody({ limit: "in_flight", root_run_id: "run_root", allowed: 1, counted: 1,
      run_ids: ["run_cand1"] }, "candidate");
    const failed = editCeilingReachedBody({ limit: "failed_or_unfinished", root_run_id: "run_root", allowed: 3, counted: 3,
      run_ids: ["run_c1", "run_c2", "run_c3"] }, "candidate");
    const notOffered = editInvalidBody({ issues: [{ code: "action_not_allowed", shot_id: "beat-2", message: "beat-2 does not offer animate" }] });
    expect(parsed(409, inFlight)).toMatchObject({ kind: "edit_ceiling_reached", limit: "in_flight", runIds: ["run_cand1"] });
    expect(parsed(409, failed)).toMatchObject({ kind: "edit_ceiling_reached", counted: 3, allowed: 3 });
    expect(parsed(422, notOffered)).toMatchObject({ kind: "edit_invalid", issues: notOffered.error.issues });
    expect(parsed(503, editingNotPricedBody({ seams: ["candidate_policy"] }))).toMatchObject({ kind: "editing_closed", seams: ["candidate_policy"] });
    for (const [status, body] of [[409, inFlight], [409, failed], [422, notOffered]] as const) {
      const report = agentFailureReport(parsed(status, body));
      expect(report.retryable, JSON.stringify(body)).toBe(false);
      expect(report.next_action, JSON.stringify(body)).not.toMatch(/A revision of|unfinished revisions|revisions counted|the document/i);
    }
    expect(agentFailureReport(parsed(409, inFlight)).next_action).toContain("A paid edit of run_root is still running (run_cand1)");
    expect(agentFailureReport(parsed(409, failed)).next_action).toContain("revisions and shot candidates are counted apart");
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

/** Mutant: drop the upload branch, and the agent is told to STOP instead of finishing its upload (clipwright#758). */
describe("upload_not_finished", () => {
  it("409 upload_not_finished tells the agent to PUT the file and confirm it, and is not retried as it is", () => {
    const failure = parseApiFailure({ status: 409,
      bodyText: JSON.stringify(apiErrorBody({ code: "upload_not_finished", message: "no file yet" })), now: NOW });
    const report = agentFailureReport(failure);
    expect(report).toMatchObject({ status: "FAILED", code: "upload_not_finished", retryable: false,
      next_action: UPLOAD_NOT_FINISHED_NEXT_ACTION });
    expect(UPLOAD_NOT_FINISHED_NEXT_ACTION).toMatch(/PUT the file to the put_url .*get_upload.*repeat this call/);
    expect(report.next_action).not.toMatch(/^STOP/);
  });

  // The same 409 says "is finishing, retry in a few seconds" while another read holds the lease (#766): the file is there.
  it("the finishing variant is named, so the agent waits instead of uploading again", async () => {
    expect(UPLOAD_NOT_FINISHED_NEXT_ACTION).toMatch(/says the upload is finishing, the file is already there: wait a few seconds and repeat/);
  });
});

/** Mutant: the branch dropped, and a closed door reads as http_503 to repeat in a few seconds. */
describe("a closed generation door (clipwright#724)", () => {
  it.each(["generations_disabled", "generations_marking_pending", "assets_disabled", "url_import_disabled"] as const)(
    "503 %s keeps its code and is not retried", (code) => {
    const failure = parseApiFailure({ status: 503, bodyText: JSON.stringify(apiErrorBody({ code, message: "closed" })), now: NOW });
    expect(failure).toEqual({ kind: "client_error", status: 503, message: "closed", code });
    expect(isRetryableFailure(failure)).toBe(false);
    expect(agentFailureReport(failure)).toMatchObject({ status: "FAILED", code, retryable: false });
  });

  it("another 503 stays a server error to retry", () => {
    const failure = parseApiFailure({ status: 503, bodyText: JSON.stringify(apiErrorBody({ code: "paid_render_disabled", message: "off" })), now: NOW });
    expect(failure.kind).toBe("server_error");
  });
});
