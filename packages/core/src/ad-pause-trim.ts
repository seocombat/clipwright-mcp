import type { PauseTrimTargets } from "./reference-voice.js";

// Ad-style runs trim narration pauses by default (#1136): graphics and live shots cut on the words, and long pauses read as a slow ad.

/** The pauses a run with templates, scenes or live shots is cut down to when it names no pause_trim. */
export const AD_PAUSE_TRIM = Object.freeze({ sentence_end_s: 0.15, comma_s: 0.08 }) satisfies PauseTrimTargets;
export const AD_PAUSE_TRIM_WARNING = `pause_trim: narration pauses are shortened to ${AD_PAUSE_TRIM.sentence_end_s} s after a sentence and ` +
  `${AD_PAUSE_TRIM.comma_s} s after a comma, the default for a video with graphics or live shots; pass pause_trim false to keep every pause, ` +
  "or your own targets";

interface AdStyleInput { templates?: readonly unknown[] | undefined; scenes?: readonly unknown[] | undefined; shots?: readonly unknown[] | undefined;
  pause_trim?: PauseTrimTargets | false | undefined; interview?: unknown }

/** A video that cuts graphics or live shots on its words; an interview keeps its own pauses. */
export const isAdStyleUgcInput = (input: AdStyleInput): boolean => input.interview === undefined &&
  [input.templates, input.scenes, input.shots].some(items => (items?.length ?? 0) > 0);

/** The request with the default pinned and marked, so the run and its record say it; a run that named pause_trim, false included, is left as asked. */
export function withAdPauseTrim<T extends AdStyleInput>(input: T): T & { pause_trim_source?: "ad_default" } {
  if (input.pause_trim !== undefined || !isAdStyleUgcInput(input)) return input;
  return { ...input, pause_trim: { ...AD_PAUSE_TRIM }, pause_trim_source: "ad_default" };
}
