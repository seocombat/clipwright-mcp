import { z } from "zod";

const count = z.number().int().nonnegative().safe();
const positiveCount = count.positive();
const finite = z.number().finite();
const nonnegative = finite.nonnegative();
const fraction = nonnegative.max(1);
const nonblank = z.string().trim().min(1);
const phase = z.enum(["setup", "development", "climax", "resolution"]);
const customIssue = "custom" as const;

function quantiles(value: z.ZodNumber) {
  return z.strictObject({
    p25: value.nullable(), p50: value.nullable(), p75: value.nullable(), n: count,
  }).superRefine((q, ctx) => {
    if (q.n === 0) {
      if (q.p25 !== null || q.p50 !== null || q.p75 !== null) {
        ctx.addIssue({ code: customIssue, message: "empty quantiles require null values" });
      }
    } else if (q.p25 === null || q.p50 === null || q.p75 === null || q.p25 > q.p50 || q.p50 > q.p75) {
      ctx.addIssue({ code: customIssue, message: "quantiles must be finite and ordered" });
    }
  });
}

const frameQuantiles = quantiles(count);
const signedQuantiles = quantiles(z.number().int().safe());
const speechClasses = ["sentence", "phrase", "pause", "word", "mid_word"] as const;
const speechCounts = z.partialRecord(z.enum(speechClasses), count);
const speechOffsets = z.strictObject({
  sentence: signedQuantiles,
  phrase: signedQuantiles,
  pause: signedQuantiles,
  word: signedQuantiles,
  mid_word: signedQuantiles,
});

const speech = z.strictObject({
  n: positiveCount,
  unknown: count,
  class_counts: speechCounts,
  offset_frames: speechOffsets,
}).superRefine((s, ctx) => {
  if (Object.values(s.class_counts).reduce((sum, n) => sum + n, 0) !== s.n) {
    ctx.addIssue({ code: customIssue, message: "speech class counts must equal n" });
  }
  for (const name of speechClasses) {
    if (s.offset_frames[name].n !== (s.class_counts[name] ?? 0)) {
      ctx.addIssue({ code: customIssue, message: `speech offset count differs for ${name}` });
    }
  }
});

const profile = z.strictObject({
  schema: z.literal("cut_style_profile_v1"),
  fps: z.literal(25),
  style_id: nonblank,
  sources: z.array(z.strictObject({
    sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
    reviewed_shots: positiveCount,
    image_shots: count,
    aligned_cuts: count,
  })).min(1),
  speech_rules_available: z.boolean(),
  pacing: z.strictObject({
    global_image_frames: frameQuantiles,
    by_phase: z.partialRecord(phase, frameQuantiles),
    short_bursts: z.strictObject({ shot_count: count, n: count }),
  }),
  motion: z.strictObject({
    pan_flip_probability: fraction.nullable(),
    pan_transition_n: count,
    pan_travel_fraction: fraction.nullable(),
    pan_travel_n: count,
  }),
  opening_video: z.strictObject({
    share: fraction,
    n: count,
    duration_frames: frameQuantiles,
  }),
  captions: z.strictObject({
    n: count,
    style: nonblank.nullable(), style_n: count,
    position_fraction: fraction.nullable(), position_fraction_n: count,
    color: nonblank.nullable(), color_n: count,
    accent: nonblank.nullable(), accent_n: count,
    changes_per_sec: quantiles(nonnegative),
  }),
  speech: speech.nullable(),
}).superRefine((p, ctx) => {
  if (p.pacing.global_image_frames.n === 0) {
    ctx.addIssue({ code: customIssue, message: "global image pace needs observations" });
  }
  if (p.speech_rules_available !== (p.speech !== null)) {
    ctx.addIssue({ code: customIssue, message: "speech availability requires measured speech" });
  }
  if (p.speech !== null && p.speech.n + p.speech.unknown !==
      p.sources.reduce((sum, source) => sum + source.aligned_cuts, 0)) {
    ctx.addIssue({ code: customIssue, message: "speech samples must match aligned source cuts" });
  }
  for (const source of p.sources) {
    if (source.aligned_cuts > Math.max(0, source.reviewed_shots - 1)) {
      ctx.addIssue({ code: customIssue, message: "aligned cuts exceed reviewed shot boundaries" });
    }
    if (source.image_shots > source.reviewed_shots) {
      ctx.addIssue({ code: customIssue, message: "image shots exceed reviewed shots" });
    }
  }
});

export type CutStyleProfile = z.infer<typeof profile>;

export function parseCutStyle(input: unknown): CutStyleProfile {
  return profile.parse(input);
}
