import { z } from "zod";

const identifier = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const voicePreviewBindingSchema = z.object({
  version: z.literal(1),
  accountId: identifier,
  fullScript: z.string().min(1),
  resolvedVoiceId: identifier,
  modelId: identifier,
  effectivePace: z.number().finite().positive(),
  synthesisSettingsRevision: identifier,
  previewWordLimit: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict().readonly();

export const voicePreviewArtifactSchema = z.object({
  version: z.literal(1),
  previewId: identifier,
  accountId: identifier,
  bindingSha256: digest,
  audioSha256: digest,
  audioBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAtMs: timestamp,
  expiresAtMs: timestamp,
}).strict().refine(value => value.expiresAtMs > value.createdAtMs, "expiry must follow creation").readonly();

export const voicePreviewApprovalSchema = z.object({
  previewId: identifier,
  audioSha256: digest,
}).strict().readonly();

export type VoicePreviewBinding = z.infer<typeof voicePreviewBindingSchema>;
export type VoicePreviewArtifact = z.infer<typeof voicePreviewArtifactSchema>;
