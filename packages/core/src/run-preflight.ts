import { z } from "zod";

export const aspectProbeFact = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not_probed") }),
  z.object({ kind: z.literal("failed"), error_class: z.string().min(1) }),
  z.object({
    kind: z.literal("ok"),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
]);
export type AspectProbeFact = z.infer<typeof aspectProbeFact>;

export const voicePreflightFact = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not_probed") }),
  z.object({ kind: z.literal("catalog_incomplete") }),
  z.object({ kind: z.literal("verified") }),
]);
export type VoicePreflightFact = z.infer<typeof voicePreflightFact>;

export const runPreflight = z.object({
  aspect: aspectProbeFact.optional(),
  voice: voicePreflightFact.optional(),
});
export type RunPreflight = z.infer<typeof runPreflight>;

export type RunPreflightFamily = keyof RunPreflight;

export function sourceNotProbedWarning(errorClass: string): string {
  return `source could not be probed (${errorClass})`;
}

export const VOICE_CATALOG_INCOMPLETE_WARNING =
  "voice catalog incomplete — voice_id could not be verified";

export function parseRunPreflight(stored: unknown): RunPreflight {
  if (typeof stored !== "object" || stored === null) return {};
  const raw = stored as Record<string, unknown>;
  const aspect = aspectProbeFact.safeParse(raw.aspect);
  const voice = voicePreflightFact.safeParse(raw.voice);
  return {
    ...(aspect.success ? { aspect: aspect.data } : {}),
    ...(voice.success ? { voice: voice.data } : {}),
  };
}
