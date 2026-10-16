import { describe, expect, it } from "vitest";
import { agentFailureReport, isRetryableFailure, parseApiFailure } from "./api-failure.js";
import { workflowCommandErrorBody } from "./errors.js";

const issues = [
  { kind: "approval_required", path: "revision", message: "Approve this revision." },
  { kind: "future_capability", path: "brief.requirements.0", message: "This required capability is unavailable." },
];
const warnings = ["Authored visual beats are advisory.", "An original image cannot replace the opener."];
const cases = [["workflow_invalid", 400], ["workflow_conflict", 409], ["workflow_not_ready", 409]] as const;
const body = (code: typeof cases[number][0]) => workflowCommandErrorBody({ code, message: "Read the workflow refusal.", issues, warnings });
const conflictAdvice = "STOP. Read the current plan and compare its revision and quote with the original request. Recover an uncertain purchase with its ORIGINAL request and idempotency key; do not change the key to retry.";
const repairAdvice = "STOP. Read the plan and address every issue before purchase. Save the corrected document, obtain approval of its exact revision, then quote it. Approval and a paid launch are separate explicit actions; do not perform them automatically.";

describe("shared workflow refusal behavior", () => {
  it.each(cases)("retains every issue and warning for %s on HTTP %i", (code, status) => {
    const failure = parseApiFailure({ status, bodyText: JSON.stringify({ ...body(code), future: true,
      error: { ...body(code).error, future_error: { explanation: "Future server diagnostic" } } }) });
    expect(failure).toMatchObject({ kind: code, status, issues, warnings });
    expect(isRetryableFailure(failure)).toBe(false);
    expect(agentFailureReport(failure)).toMatchObject({ status: "FAILED", code, retryable: false, issues, warnings });
    expect(agentFailureReport(failure).next_action).toBe(code === 'workflow_conflict' ? conflictAdvice : repairAdvice);
  });

  it.each(cases)("does not give %s control of an off-status response", (code, correctStatus) => {
    for (const status of [400, 403, 409, 422, 429, 500, 503]) {
      if (status === correctStatus) continue;
      const failure = parseApiFailure({ status, bodyText: JSON.stringify(body(code)), retryAfterHeader: "7" });
      const report = agentFailureReport(failure);
      expect(failure.kind).not.toBe(code);
      expect(failure).toMatchObject({ issues, warnings });
      expect(report).toMatchObject({ issues, warnings });
      expect(report.code).not.toBe(code);
      expect(isRetryableFailure(failure)).toBe(status === 429 || status >= 500);
      if (status === 429 || status >= 500) expect(report.retry_after_seconds).toBe(7);
    }
  });

  it.each(cases)("does not treat malformed %s details as a structured workflow refusal", (code, status) => {
    for (const patch of [{ issues: "not an array" }, { warnings: [1] }, { issues: [{ kind: "missing_fields" }] }]) {
      const malformed = { error: { ...body(code).error, ...patch } };
      const failure = parseApiFailure({ status, bodyText: JSON.stringify(malformed) });
      expect(failure.kind).toBe("client_error");
      expect(agentFailureReport(failure)).not.toHaveProperty("issues");
    }
  });
});
