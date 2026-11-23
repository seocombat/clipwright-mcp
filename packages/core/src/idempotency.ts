import { createHash } from "node:crypto";

import { createActorInput } from "./account-actors.js";
import { createAssetRequest } from "./assets.js";
import { candidateRequest } from "./edit-candidate.js";
import { revisionRequest } from "./edit-revision.js";
import { makeFacelessInput } from "./faceless-public.js";
import { filmCutPreviewInput, filmCutRunInput } from "./film-cut.js";
import { generateImageRequest, generateVideoRequest } from "./generations.js";
import { filmEditInput, filmHeroInput, filmRenderInput, filmStillsInput, filmVoiceInput, takeCheckInput, takeFramesInput } from "./own-agent-runs.js";
import type { OwnAgentSkill } from "./own-agent-price.js";
import { runId } from "./runs.js";
import { upscaleRequest } from "./upscale.js";
import { measuredVideoSize, type RunVideo } from "./video-size.js";
import { makeUgcInput } from "./skills.js";
import { uploadImportRequest, uploadIntentRequest } from "./uploads.js";

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

export function requestHash(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)))
    .digest("hex");
}

export function measuredRunVideo(finalOutput: unknown): RunVideo | null {
  return measuredVideoSize(finalOutput, (proof) => requestHash(proof.record) === proof.record_hash);
}

export function idempotencyKeyFor(input: unknown, clientId: string): string {
  const parsed = makeUgcInput.parse(input);
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(parsed)))
    .digest("hex");
}

export function actorIdempotencyKeyFor(input: unknown, clientId: string): string {
  const parsed = createActorInput.parse(input);
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(parsed)))
    .digest("hex");
}

export function revisionIdempotencyKeyFor(sourceRunId: string, request: unknown, clientId: string): string {
  const parsed = { source_run_id: runId.parse(sourceRunId), request: revisionRequest.parse(request) };
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(parsed)))
    .digest("hex");
}

export function candidateIdempotencyKeyFor(sourceRunId: string, request: unknown, clientId: string): string {
  const parsed = { source_run_id: runId.parse(sourceRunId), candidate: candidateRequest.parse(request) };
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(parsed)))
    .digest("hex");
}

export function generationIdempotencyKeyFor(skill: "generate_image" | "generate_video", request: unknown, clientId: string): string {
  const parsed = { skill, request: skill === "generate_image" ? generateImageRequest.parse(request) : generateVideoRequest.parse(request) };
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(parsed)))
    .digest("hex");
}

export function upscaleIdempotencyKeyFor(request: unknown, clientId: string): string {
  const parsed = { op: "upscale", request: upscaleRequest.parse(request) };
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(parsed)))
    .digest("hex");
}

export function ownAgentIdempotencyKeyFor(skill: OwnAgentSkill, request: unknown, clientId: string): string {
  const schema = skill === "film_stills" ? filmStillsInput : skill === "film_voice" ? filmVoiceInput : skill === "film_hero" ? filmHeroInput
    : skill === "film_edit" ? filmEditInput : skill === "film_take_frames" ? takeFramesInput : skill === "film_take_check" ? takeCheckInput
    : skill === "film_cut" ? filmCutRunInput : skill === "film_cut_preview" ? filmCutPreviewInput : filmRenderInput;
  return createHash("sha256").update(clientId + JSON.stringify(canonicalize({ skill, request: schema.parse(request) }))).digest("hex");
}

export function uploadRequestIdentity(kind: "import" | "intent", input: unknown): unknown {
  if (kind === "import") return { kind, url: uploadImportRequest.parse(input).url };
  const { media_type, bytes, sha256 } = uploadIntentRequest.parse(input);
  return { kind, media_type, bytes, sha256 };
}

export function uploadRequestIdempotencyKeyFor(kind: "import" | "intent", input: unknown, clientId: string): string {
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(uploadRequestIdentity(kind, input))))
    .digest("hex");
}

export function assetRequestIdentity(input: unknown, legacy = false): unknown {
  const { source, role, name, analysis_only } = createAssetRequest.parse(input);
  const named = !("base64" in source) ? source : legacy
    ? { base64_sha256: createHash("sha256").update(source.base64).digest("hex"), media_type: source.media_type }
    : { sha256: createHash("sha256").update(Buffer.from(source.base64, "base64")).digest("hex"), media_type: source.media_type };
  return { kind: "asset", role, name, source: named, ...(analysis_only ? { analysis_only } : {}) };
}

export function assetBytesIdentity(input: { role: string; name: string; sha256: string; analysis_only?: boolean | undefined }): unknown {
  return { kind: "asset_bytes", role: input.role, name: input.name.trim(), sha256: input.sha256,
    ...(input.analysis_only ? { analysis_only: true } : {}) };
}

export function assetBytesIdempotencyKeyFor(input: { role: string; name: string; bytes: Uint8Array; analysis_only?: boolean },
  clientId: string): string {
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(assetBytesIdentity({ role: input.role, name: input.name, sha256,
      analysis_only: input.analysis_only }))))
    .digest("hex");
}

export function assetRequestIdempotencyKeyFor(input: unknown, clientId: string): string {
  return createHash("sha256").update(clientId + JSON.stringify(canonicalize(assetRequestIdentity(input)))).digest("hex");
}

export function facelessIdempotencyKeyFor(input: unknown, clientId: string): string {
  const parsed = makeFacelessInput.parse(input);
  return createHash("sha256")
    .update(clientId + JSON.stringify(canonicalize(parsed)))
    .digest("hex");
}
