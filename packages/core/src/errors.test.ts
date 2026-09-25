import { describe, expect, it } from "vitest";

import {
  apiError,
  debtOutstandingBody,
  debtOutstandingError,
  insufficientCreditsBody,
  insufficientCreditsError,
} from "./errors.js";

describe("money refusal bodies", () => {
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
