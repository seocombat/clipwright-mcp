import { createHash } from "node:crypto";

import { createActorInput } from "./account-actors.js";
import { makeUgcInput } from "./skills.js";

// Request fingerprint and per-client idempotency key. A subpath export, not the barrel:
// `node:crypto` in the barrel would break Next client bundles.

/** Canonical JSON: object keys sorted, array order kept (order is part of an array's value), */
/** `undefined` dropped. Semantically equal bodies must hash alike, or a retry gets a 409. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) {
        result[key] = canonicalize(source[key]);
      }
    }
    return result;
  }

  return value;
}

/** Hashes the input AFTER zod parsing, defaults filled in: "captions omitted" and */
/** "captions: false" are one request. Hashing the raw body would 409 on extra whitespace. */
export function requestHash(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)))
    .digest("hex");
}

/** Idempotency key from input AND client identity. Parses inside so defaults are filled */
/** before hashing; `clientId` prefixes the hash so clients never share a run. */
export function idempotencyKeyFor(input: unknown, clientId: string): string {
  const parsed = makeUgcInput.parse(input);
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(parsed)))
    .digest("hex");
}

/** The same key for `create_actor`, with its own schema and defaults: the `make_ugc` */
/** parse would strip every actor field. */
export function actorIdempotencyKeyFor(input: unknown, clientId: string): string {
  const parsed = createActorInput.parse(input);
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(parsed)))
    .digest("hex");
}
