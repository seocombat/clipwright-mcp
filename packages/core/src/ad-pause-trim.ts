import type { PauseTrimTargets } from "./reference-voice.js";

export const AD_PAUSE_TRIM = Object.freeze({ sentence_end_s: 0.15, comma_s: 0.08 }) satisfies PauseTrimTargets;
export const AD_PAUSE_TRIM_WARNING = `pause_trim: narration pauses are shortened to ${AD_PAUSE_TRIM.sentence_end_s} s after a sentence and ` +
  `${AD_PAUSE_TRIM.comma_s} s after a comma, the default for a video with graphics or live shots; pass pause_trim false to keep every pause, ` +
  "or your own targets";

interface AdStyleInput { templates?: readonly unknown[] | undefined; scenes?: readonly unknown[] | undefined; shots?: readonly unknown[] | undefined;
  pause_trim?: PauseTrimTargets | false | undefined; interview?: unknown; format?: string | undefined }

export const isAdStyleUgcInput = (input: AdStyleInput): boolean => input.interview === undefined &&
  [input.templates, input.scenes, input.shots].some(items => (items?.length ?? 0) > 0);
const facelessDrawsOnWords = (input: Omit<AdStyleInput, "pause_trim">): boolean =>
  input.format === "explainer" || isAdStyleUgcInput({ templates: input.templates, scenes: input.scenes, shots: input.shots });

export function facelessPauseTrim(input: AdStyleInput): PauseTrimTargets | false | undefined {
  return input.pause_trim ?? (facelessDrawsOnWords(input) ? { ...AD_PAUSE_TRIM } : undefined);
}
export const facelessPauseTrimWarnings = (input: Omit<AdStyleInput, "pause_trim"> & { pause_trim?: unknown }): string[] =>
  input.pause_trim === undefined && facelessDrawsOnWords(input) ? [AD_PAUSE_TRIM_WARNING] : [];

export function withAdPauseTrim<T extends AdStyleInput>(input: T): T & { pause_trim_source?: "ad_default" } {
  if (input.pause_trim !== undefined || !isAdStyleUgcInput(input)) return input;
  return { ...input, pause_trim: { ...AD_PAUSE_TRIM }, pause_trim_source: "ad_default" };
}
