import { describe, expect, it } from "vitest";

import {
  API_ERROR_CODES,
  apiError,
  debtOutstandingBody,
  debtOutstandingError,
  editCeilingReachedBody,
  editConflictBody,
  editConflictError,
  editInvalidBody,
  editingDisabledBody,
  editingNotPricedBody,
  runNotEditableBody,
  runNotEditableError,
  insufficientCreditsBody,
  insufficientCreditsError,
} from "./errors.js";

describe("money refusal bodies", () => {
  it('publishes every workflow refusal code in the public error registry', () => {
    expect(API_ERROR_CODES).toEqual(expect.arrayContaining(['workflow_invalid', 'workflow_conflict', 'workflow_not_ready']));
  });
  it("the two refusals differ by SCHEMA, not only by text", () => {
    // Answering debt with an `insufficient_credits` body would tell a client with money
    // that credits are short and report the balance instead of the debt.
    const broke = insufficientCreditsBody({ balanceCredits: 0, requiredCredits: 90 });
    const indebted = debtOutstandingBody({ debtCredits: 40 });

    expect(debtOutstandingError.safeParse(broke).success).toBe(false);
    expect(insufficientCreditsError.safeParse(indebted).success).toBe(false);
  });

  it("the debt body NAMES THE REMEDY: a purchase, not contacting us", () => {
    // No schema or type guards this text. It is not compared word for word with the agent's
    // `next_action`: different readers, but both must name buying as the remedy.
    const body = debtOutstandingBody({ debtCredits: 40 });

    expect(body.error.message).toContain("40");
    // The whole phrase: "Buy credits" alone would also match "Do not Buy credits".
    expect(body.error.message).toContain("Buy credits to clear it");
    // The caveat about the run's other conditions must sit next to the remedy.
    expect(body.error.message).toContain("enough credits of its own");
    expect(body.error.message).not.toContain("topping up");
    // The true claim is about the PURCHASE, not the account: "nothing to spend" is false
    // with a non-zero balance, the very case this code exists for.
    expect(body.error.message).toContain("adds nothing to the balance");
    expect(body.error.message).not.toContain("nothing to spend");
  });

  it("both stay ordinary API errors for a client unaware of money", () => {
    // The generic envelope is a supertype: numbers in the body must not break older parsers.
    expect(
      apiError.safeParse(
        insufficientCreditsBody({ balanceCredits: 12, requiredCredits: 90 }),
      ).success,
    ).toBe(true);
    expect(apiError.safeParse(debtOutstandingBody({ debtCredits: 40 })).success).toBe(
      true,
    );
  });

  it("the message ITSELF names both numbers, not only the fields next to it", () => {
    // The agent shows `message` to a person; "not enough credits" without numbers decides nothing.
    const body = insufficientCreditsBody({ balanceCredits: 12, requiredCredits: 90 });

    expect(body.error.message).toContain("90");
    expect(body.error.message).toContain("12");
  });

  it("a ZERO debt is not a refusal, and such a body cannot be built", () => {
    // `debt_outstanding` with zero would block without a reason.
    expect(() => debtOutstandingBody({ debtCredits: 0 })).toThrow();
  });

  it("a negative balance cannot be built: the zero floor is part of the contract", () => {
    // Anything below zero lives in `debt_credits`; a negative balance would count debt twice.
    expect(() =>
      insufficientCreditsBody({ balanceCredits: -5, requiredCredits: 90 }),
    ).toThrow();
  });
});

describe("refusal bodies of the draft of an edit", () => {
  it("a conflict states the stored version as a field and both versions in words", () => {
    const body = editConflictBody({ baseVersion: 3, version: 5 });

    expect(body).toEqual({ error: { code: "edit_conflict", version: 5,
      message: "the draft is at version 5, this save was written against version 3. " +
        "Nothing was stored. Read the draft, apply the change to it and save with its version." } });
    expect(editConflictError.parse(body)).toEqual(body);
    expect(apiError.safeParse(body).success).toBe(true);
    // Version 0 is a run with no draft stored: a legal answer to a save written against a draft that is gone.
    expect(editConflictBody({ baseVersion: 2, version: 0 }).error.version).toBe(0);
    expect(() => editConflictBody({ baseVersion: 0, version: -1 })).toThrow();
    expect(() => editConflictBody({ baseVersion: 0, version: 1.5 })).toThrow();
  });

  it("a run that cannot be edited states the state and the reason its shots give, as fields and in words", () => {
    const body = runNotEditableBody({ runId: "run_a1", state: "expired", reason: "the run's media are past their storage time" });

    expect(body).toEqual({ error: { code: "run_not_editable", state: "expired", reason: "the run's media are past their storage time",
      message: "run run_a1 cannot be edited (expired): the run's media are past their storage time. Nothing was stored." } });
    expect(runNotEditableError.parse(body)).toEqual(body);
    expect(apiError.safeParse(body).success).toBe(true);
    // A state stated without a reason is named alone, and no reason is invented for it.
    expect(runNotEditableBody({ runId: "run_b2", state: "not_recorded", reason: null })).toEqual({ error: { code: "run_not_editable",
      state: "not_recorded", reason: null, message: "run run_b2 cannot be edited (not_recorded). Nothing was stored." } });
    expect(() => runNotEditableBody({ runId: "run_b2", state: "", reason: null })).toThrow();
  });

  it("the two differ by schema, and both are in the published list of codes", () => {
    const conflict = editConflictBody({ baseVersion: 0, version: 1 });
    const closed = runNotEditableBody({ runId: "run_a1", state: "expired", reason: null });

    expect(runNotEditableError.safeParse(conflict).success).toBe(false);
    expect(editConflictError.safeParse(closed).success).toBe(false);
    expect(API_ERROR_CODES).toContain("edit_conflict");
    expect(API_ERROR_CODES).toContain("run_not_editable");
  });
});

describe("refusal bodies of a revision", () => {
  it("each of the seven codes is published, and the four typed bodies carry their fields", () => {
    for (const code of ["editing_disabled", "editing_not_priced", "editing_window_not_set", "edit_invalid", "no_changes",
      "revision_needs_generated_unit", "edit_ceiling_reached"]) expect(API_ERROR_CODES).toContain(code);
    expect(editingDisabledBody({ reason: "ceiling_not_set" }).error).toMatchObject({ code: "editing_disabled", reason: "ceiling_not_set" });
    expect(editingNotPricedBody({ seams: ["unit", "zero_unit"] }).error).toMatchObject({ seams: ["unit", "zero_unit"],
      message: expect.stringContaining("(unit, zero_unit)") });
    expect(editingNotPricedBody({ seams: [] }).error.message).toMatch(/^this revision would cost nothing/);
    const issues = [{ code: "unknown_asset" as const, shot_id: "beat-3", message: "upl_x is not an upload of this account" }];
    expect(editInvalidBody({ issues }).error).toMatchObject({ code: "edit_invalid", issues });
    expect(() => editInvalidBody({ issues: [] })).toThrow();
    expect(editCeilingReachedBody({ limit: "in_flight", root_run_id: "run_root1", allowed: 1, counted: 1, run_ids: ["run_q1"] }).error)
      .toMatchObject({ code: "edit_ceiling_reached", limit: "in_flight", root_run_id: "run_root1", allowed: 1, counted: 1, run_ids: ["run_q1"],
        message: expect.stringContaining("Nothing was charged") });
  });
});
