import { z } from "zod";

// Run preflight facts: what cannot be derived on read because it needs the network.
// A fact is stored rather than a ready-made line, so the reader derives the text.

/** Frame source probe; `not_probed` means no network call happened (no `image`). */
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

/** Preflight of a RAW `voice_id`; a preset does not query the catalog. */
export const voicePreflightFact = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not_probed") }),
  z.object({ kind: z.literal("catalog_incomplete") }),
  z.object({ kind: z.literal("verified") }),
]);
export type VoicePreflightFact = z.infer<typeof voicePreflightFact>;

// A missing family key ≠ `not_probed`: the first means "not recorded" (older runs look
// like that); the second is recorded knowledge that no probe happened.
export const runPreflight = z.object({
  aspect: aspectProbeFact.optional(),
  voice: voicePreflightFact.optional(),
});
export type RunPreflight = z.infer<typeof runPreflight>;

/** Family names, also the merge keys in `jsonb`. */
export type RunPreflightFamily = keyof RunPreflight;

// The text lives next to the fact: both ends print it, `quote` and the column reader.
export function sourceNotProbedWarning(errorClass: string): string {
  return `source could not be probed (${errorClass})`;
}

/** The voice catalog is truncated, so a raw `voice_id` cannot be confirmed. FAIL-OPEN. */
export const VOICE_CATALOG_INCOMPLETE_WARNING =
  "voice catalog incomplete — voice_id could not be verified";

// Families parse independently: a corrupt one does not take down a sound one.
// An unreadable value gives an empty set of facts.
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
