import { createHash } from "node:crypto";

import { createActorInput } from "./account-actors.js";
import { createAssetRequest } from "./assets.js";
import { candidateRequest } from "./edit-candidate.js";
import { revisionRequest } from "./edit-revision.js";
import { makeFacelessInput } from "./faceless-public.js";
import { generateImageRequest, generateVideoRequest } from "./generations.js";
import { runId } from "./runs.js";
import { makeUgcInput } from "./skills.js";
import { uploadImportRequest, uploadIntentRequest } from "./uploads.js";

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

/** The key of a revision: the source run and the request, parsed, under the client's prefix. */
export function revisionIdempotencyKeyFor(sourceRunId: string, request: unknown, clientId: string): string {
  const parsed = { source_run_id: runId.parse(sourceRunId), request: revisionRequest.parse(request) };
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(parsed)))
    .digest("hex");
}

/** The key of a shot candidate: the source run and the request with its take, parsed, under the client's prefix. */
export function candidateIdempotencyKeyFor(sourceRunId: string, request: unknown, clientId: string): string {
  const parsed = { source_run_id: runId.parse(sourceRunId), candidate: candidateRequest.parse(request) };
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(parsed)))
    .digest("hex");
}

/** The key of a single generation: the skill and its request, parsed, under the client's prefix. */
export function generationIdempotencyKeyFor(skill: "generate_image" | "generate_video", request: unknown, clientId: string): string {
  const parsed = { skill, request: skill === "generate_image" ? generateImageRequest.parse(request) : generateVideoRequest.parse(request) };
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(parsed)))
    .digest("hex");
}

/** What identifies an upload request: the url of an import, the declared file of an intent (`filename` is only a hint). */
export function uploadRequestIdentity(kind: "import" | "intent", input: unknown): unknown {
  if (kind === "import") return { kind, url: uploadImportRequest.parse(input).url };
  const { media_type, bytes, sha256 } = uploadIntentRequest.parse(input);
  return { kind, media_type, bytes, sha256 };
}

/** The key of an import or an intent: its identity under the client's prefix. */
export function uploadRequestIdempotencyKeyFor(kind: "import" | "intent", input: unknown, clientId: string): string {
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(uploadRequestIdentity(kind, input))))
    .digest("hex");
}

/** What identifies an asset creation: role, name and source; inline base64 by its digest, and the confirmation is no part. */
export function assetRequestIdentity(input: unknown): unknown {
  const { source, role, name } = createAssetRequest.parse(input);
  const named = "base64" in source
    ? { base64_sha256: createHash("sha256").update(source.base64).digest("hex"), media_type: source.media_type } : source;
  return { kind: "asset", role, name, source: named };
}

/** The identity of `POST /v1/assets/bytes`: the picture's digest with its role and name. */
export function assetBytesIdentity(input: { role: string; name: string; sha256: string }): unknown {
  return { kind: "asset_bytes", role: input.role, name: input.name.trim(), sha256: input.sha256 };
}

/** The key of `POST /v1/assets/bytes` for these bytes, as the server derives their identity. */
export function assetBytesIdempotencyKeyFor(input: { role: string; name: string; bytes: Uint8Array }, clientId: string): string {
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(assetBytesIdentity({ role: input.role, name: input.name, sha256 }))))
    .digest("hex");
}

/** The key of an asset creation: its identity under the client's prefix. */
export function assetRequestIdempotencyKeyFor(input: unknown, clientId: string): string {
  return createHash("sha256").update(clientId + JSON.stringify(canonicalize(assetRequestIdentity(input)))).digest("hex");
}

/** The same key for `make_faceless`, parsed by its own union schema. */
export function facelessIdempotencyKeyFor(input: unknown, clientId: string): string {
  const parsed = makeFacelessInput.parse(input);
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(parsed)))
    .digest("hex");
}
