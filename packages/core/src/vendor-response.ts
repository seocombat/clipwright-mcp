// What happened to a paid request, as a flag on the error rather than a guess from its text.
// No flag means "unknown", not "unsent": fail-closed, so a possible charge is never hidden.

/** What is known about the paid request when it threw. `unsent`: it never left. `responded`: */
/** the vendor answered, with the status as a number, since 200 and 402 cost differently. */
export type VendorDispatchFact =
  | { readonly kind: "unsent" }
  | { readonly kind: "responded"; readonly status: number };

/** Property name, long and project-prefixed: it lands on foreign error objects, and a short */
/** name like `status` would overwrite someone else's field. */
const VENDOR_DISPATCH_FACT = "clipwrightVendorDispatchFact";

/** Shared flag writer. Non-enumerable, so it does not clutter serialized logs. A primitive */
/** cannot be marked and reads as unknown, which is the fail-closed side. */
function mark<E>(error: E, fact: VendorDispatchFact): E {
  if (typeof error !== "object" || error === null) {
    return error;
  }
  Object.defineProperty(error, VENDOR_DISPATCH_FACT, {
    value: fact,
    enumerable: false,
    writable: false,
    // `configurable` so a second mark does not throw: an outer adapter layer may
    // refine the fact.
    configurable: true,
  });
  return error;
}

/** The paid request never left: a preflight, a guard or a free step failed. */
export function markVendorUnsent<E>(error: E): E {
  return mark(error, { kind: "unsent" });
}

/** The vendor answered, with this status. */
export function markVendorResponse<E>(error: E, status: number): E {
  return mark(error, { kind: "responded", status });
}

/** What is known about the request. `undefined` means NOTHING is known, a statement of */
/** ignorance, not of refusal. Reads non-Error values too, since `catch` gets `unknown`. */
export function vendorDispatchFact(error: unknown): VendorDispatchFact | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const value = (error as Record<string, unknown>)[VENDOR_DISPATCH_FACT];
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const fact = value as { kind?: unknown; status?: unknown };
  if (fact.kind === "unsent") {
    return { kind: "unsent" };
  }
  if (fact.kind === "responded" && typeof fact.status === "number") {
    return { kind: "responded", status: fact.status };
  }
  return undefined;
}

/** The vendor's verdict on the job itself, an axis apart from dispatch: an accepted request */
/** may still fail later. `succeeded` means the vendor finished, even if we could not use it. */
export type VendorJobVerdict = "succeeded" | "failed";

const VENDOR_JOB_VERDICT = "clipwrightVendorJobVerdict";

/** Marks the error with what the vendor said about the job ITSELF. */
export function markVendorJobVerdict<E>(error: E, verdict: VendorJobVerdict): E {
  if (typeof error !== "object" || error === null) {
    return error;
  }
  Object.defineProperty(error, VENDOR_JOB_VERDICT, {
    value: verdict,
    enumerable: false,
    writable: false,
    configurable: true,
  });
  return error;
}

/** The vendor's verdict on the job. `undefined`: nothing terminal was said (polling broke, */
/** timed out, wrong status). That is ignorance, and an operation must not be closed on it. */
export function vendorJobVerdict(error: unknown): VendorJobVerdict | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const value = (error as Record<string, unknown>)[VENDOR_JOB_VERDICT];
  return value === "succeeded" || value === "failed" ? value : undefined;
}

/** Whose fault a vendor refusal is. `unknown` is the honest answer and keeps the previous */
/** behavior (not zero). */
export type VendorRefusalClass = "account_standing" | "vendor" | "unknown";

const VENDOR_REFUSAL_CLASS = "clipwrightVendorRefusalClass";

/** Marks the error with what the vendor itself said about the refusal cause. */
export function markVendorRefusal<E>(error: E, refusal: VendorRefusalClass): E {
  if (typeof error !== "object" || error === null) {
    return error;
  }
  Object.defineProperty(error, VENDOR_REFUSAL_CLASS, {
    value: refusal,
    enumerable: false,
    writable: false,
    configurable: true,
  });
  return error;
}

/** An unmarked error is `unknown`: fail-closed here means the previous behavior. */
export function vendorRefusalClass(error: unknown): VendorRefusalClass {
  if (typeof error !== "object" || error === null) {
    return "unknown";
  }
  const value = (error as Record<string, unknown>)[VENDOR_REFUSAL_CLASS];
  return value === "account_standing" || value === "vendor" ? value : "unknown";
}

/** Marks the refusal class with the adapter's OWN answer; otherwise the required member */
/** would ask the vendor a question whose answer goes nowhere. */
export async function withRefusalClass<T>(
  backend: { classifyRefusal(error: unknown): VendorRefusalClass },
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw markVendorRefusal(error, backend.classifyRefusal(error));
  }
}
