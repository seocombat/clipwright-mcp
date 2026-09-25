import { describe, expect, it } from "vitest";

import {
  markVendorJobVerdict,
  markVendorResponse,
  markVendorUnsent,
  vendorDispatchFact,
  vendorJobVerdict,
} from "./vendor-response.js";

// Vendor operation accounting rests on three claims: unmarked means UNKNOWN, a mark reads
// back exactly as written, and marking does not damage the error itself.

describe("the default is ignorance, not refusal", () => {
  it("an unmarked error claims nothing", () => {
    // Fail-closed: returning `unsent` would make a dropped connection read as "not charged".
    expect(vendorDispatchFact(new Error("fetch failed"))).toBeUndefined();
  });

  it.each([[null], [undefined], ["boom"], [42]])(
    "a non-object (%s) claims nothing and does not crash the reader",
    (value) => {
      expect(vendorDispatchFact(value)).toBeUndefined();
    },
  );

  it("a foreign object with a lookalike field is not taken for a mark", () => {
    expect(vendorDispatchFact({ clipwrightVendorDispatchFact: "responded" })).toBeUndefined();
    expect(
      vendorDispatchFact({ clipwrightVendorDispatchFact: { kind: "responded" } }),
    ).toBeUndefined();
  });
});

describe("marks read back", () => {
  it("unsent", () => {
    expect(vendorDispatchFact(markVendorUnsent(new Error("guard")))).toEqual({
      kind: "unsent",
    });
  });

  it.each([[200], [402], [429], [500]])("responded %i", (status) => {
    expect(vendorDispatchFact(markVendorResponse(new Error("http"), status))).toEqual({
      kind: "responded",
      status,
    });
  });

  it("an outer layer may refine the fact over an inner one", () => {
    // A second mark must not throw TypeError, or the adapter would crash on its own bookkeeping.
    const error = markVendorUnsent(new Error("x"));
    expect(vendorDispatchFact(markVendorResponse(error, 500))).toEqual({
      kind: "responded",
      status: 500,
    });
  });
});

describe("marking does not damage the error", () => {
  it("returns THE SAME error, not a copy", () => {
    // Callers write `throw markVendorUnsent(error)`; a copy would lose the stack, `cause`
    // and type, breaking `instanceof SpendRefusedError` in settlement.
    const error = new Error("x");
    expect(markVendorUnsent(error)).toBe(error);
    expect(markVendorResponse(error, 402)).toBe(error);
  });

  it("the property is non-enumerable: serializing the error adds no clutter", () => {
    const error = markVendorResponse(new Error("x"), 402);
    expect(Object.keys(error)).toEqual([]);
    expect(JSON.stringify({ ...error })).toBe("{}");
  });

  it("a non-object is returned as is", () => {
    expect(markVendorUnsent("boom")).toBe("boom");
  });
});

describe("the vendor's job verdict is a second, independent axis", () => {
  it("an unmarked error carries no verdict", () => {
    // Polling broke or timed out: the vendor said nothing terminal, and closing the
    // operation on that would invent a verdict.
    expect(vendorJobVerdict(new Error("poll timed out"))).toBeUndefined();
  });

  it.each([["succeeded"], ["failed"]] as const)("the \"%s\" mark reads back", (verdict) => {
    expect(vendorJobVerdict(markVendorJobVerdict(new Error("x"), verdict))).toBe(verdict);
  });

  it("the axes do not interfere: request fate and verdict live apart", () => {
    // The request got a 200, and the job failed ten minutes later; one field would lose one.
    const error = markVendorJobVerdict(markVendorResponse(new Error("x"), 200), "failed");
    expect(vendorDispatchFact(error)).toEqual({ kind: "responded", status: 200 });
    expect(vendorJobVerdict(error)).toBe("failed");
  });

  it("a foreign object with a lookalike field is not taken for a verdict", () => {
    expect(vendorJobVerdict({ clipwrightVendorJobVerdict: "maybe" })).toBeUndefined();
  });

  it("a non-object carries no verdict and does not crash the reader", () => {
    expect(vendorJobVerdict("boom")).toBeUndefined();
    expect(markVendorJobVerdict("boom", "failed")).toBe("boom");
  });
});
