import { z } from "zod";
import type { SpeechRhythmResult } from "./speech-rhythm.js";

const seconds = z.number().finite().nonnegative();
export const speechRhythmResult = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("available"),
    durationSec: z.number().finite().positive(),
    wordGapDurationSec: seconds,
    wordGapFraction: z.number().finite().min(0).max(1),
    leadingGapSec: seconds,
    trailingGapSec: seconds,
    interWordGapsSec: z.array(seconds),
    measuredSentenceGapCount: z.number().int().nonnegative(),
    sentenceGapMedianSec: seconds.nullable(),
  }),
  z.object({
    status: z.literal("unavailable"),
    reason: z.enum(["missing_timings", "invalid_duration", "invalid_timings", "unsupported_mode"]),
  }),
]).describe(
  "Gaps outside persisted TTS word intervals over the delivered clip duration, including leading and trailing gaps. " +
  "These are timing gaps, not acoustic silence. Sentence boundaries use terminal punctuation. " +
  "Timings extending beyond the delivered duration are unavailable, not clipped. Older runs may omit this field.",
) satisfies z.ZodType<SpeechRhythmResult>;
