import { z } from "zod";

// Voice profile of a reference (reference-elements S7): pace, pauses, pitch and loudness per speaker, measured in our worker from the Scribe
// words and the decoded audio; the method is the owner's analyzer (video-style-analyzer, docs/voice-profile.md). Numbers only, no words.

export const REFERENCE_VOICE_VERSION = "voice-profile-v1";
export const REFERENCE_VOICE_WARNINGS = ["no_sentence_terminal_punctuation_pace_uses_turn_spans",
  "background_music_present_f0_and_intensity_may_be_contaminated"] as const;
export const MAX_REFERENCE_VOICE_SPEAKERS = 6;

/** Words per second of our English default (eleven_v4) at speed 1 on the reference reel's text, measured 25.10 (tone-reel-atoms.md). */
export const NARRATION_BASELINE_WPS = 2.54;
/** ElevenLabs' speed range; make_ugc's voice_pace accepts the same. */
export const VOICE_PACE_MIN = 0.7;
export const VOICE_PACE_MAX = 1.2;

/** No trimmed pause gets shorter than this, whatever the reference measured. */
export const PAUSE_TRIM_FLOOR_S = 0.05;
/** The longest target make_ugc takes; a reference pause above it is compiled to it, with a plan note. */
export const PAUSE_TRIM_CEILING_S = 2;
const pauseTarget = z.number().min(PAUSE_TRIM_FLOOR_S).max(PAUSE_TRIM_CEILING_S).optional();
/** make_ugc's opt-in: per gap class, the length a longer pause is cut down to; quiet audio only, a joint that would click is kept. */
export const pauseTrim = z.strictObject({ sentence_end_s: pauseTarget, comma_s: pauseTarget, mid_phrase_s: pauseTarget })
  .refine(targets => Object.values(targets).some(value => value !== undefined), "name at least one gap class");
export type PauseTrimTargets = z.infer<typeof pauseTrim>;

const customIssue = "custom" as const;
const count = z.number().int().min(0);
const seconds = z.number().min(0);
const share = z.number().min(0).max(1);
const pauseSummary = z.strictObject({ count, median_s: seconds.nullable(), p90_s: seconds.nullable(), count_ge150ms: count });
/** Three layers per gap kind: the ASR word gap, a local energy dip (12 dB below the neighbouring words, 40 ms), and cut-safe quiet (−40 dB). */
const pauseKind = z.strictObject({ timestamp: pauseSummary, acoustic_pause: pauseSummary, cut_safe: pauseSummary,
  acoustic_no_dip_count: count, acoustic_unconfirmed_count: count });

/** A measured value is a number and an unmeasured one null: an absent pitch is never 0 Hz. */
function pairs(status: string, measured: string, values: Record<string, number | null>, ctx: z.RefinementCtx) {
  const nulls = Object.entries(values).filter(([, value]) => value === null).map(([key]) => key);
  if (status === measured && nulls.length) ctx.addIssue({ code: customIssue, message: `${status} needs ${nulls.join(", ")}` });
  if (status !== measured && nulls.length < Object.keys(values).length) ctx.addIssue({ code: customIssue, message: `${status} keeps its values null` });
}

const referenceVoiceSpeaker = z.strictObject({
  speaker: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).describe("The transcription vendor's speaker id."),
  word_count: count,
  sentence_count: count,
  pace: z.strictObject({ status: z.enum(["measured", "unmeasured"]), words_per_second: z.number().positive().nullable()
    .describe("Words over the sum of sentence spans: pauses inside a sentence count, gaps between sentences and other speakers do not."),
    basis: z.enum(["sentence_spans", "turn_spans"]) })
    .superRefine((pace, ctx) => pairs(pace.status, "measured", { words_per_second: pace.words_per_second }, ctx)),
  pauses: z.strictObject({ sentence_end: pauseKind, comma: pauseKind, mid_phrase: pauseKind }),
  long_pause_count: count.describe("Same-speaker pauses over two seconds, kept with their punctuation kind."),
  hinge: z.strictObject({ status: z.enum(["measured", "not_evaluated"]),
    sentence_share: share.nullable().describe("Share of acoustically evaluated sentences with an internal pause of 150 ms or more; not all sentences."),
    evaluated_sentences: count, coverage: share.nullable(), timestamp_sentence_share: share.nullable(),
    median_position: share.nullable().describe("Where the hinge falls, as the share of the sentence's words before it."), median_seconds: seconds.nullable() })
    .superRefine((hinge, ctx) => pairs(hinge.status, "measured", { sentence_share: hinge.sentence_share }, ctx)),
  pitch: z.strictObject({ status: z.enum(["measured", "no_voiced_frames"]), ceiling_hz: z.number().positive(),
    ceiling_basis: z.enum(["default", "low_f0", "configured"]).describe("default 400 Hz; low_f0: a median under 165 Hz at 400 is measured again at 300 Hz."),
    median_hz: z.number().positive().nullable(), p10_hz: z.number().positive().nullable(), p90_hz: z.number().positive().nullable(),
    range_st: z.number().min(0).nullable(), voiced_frames: count })
    .superRefine((pitch, ctx) => pairs(pitch.status, "measured",
      { median_hz: pitch.median_hz, p10_hz: pitch.p10_hz, p90_hz: pitch.p90_hz, range_st: pitch.range_st }, ctx)),
  loudness: z.strictObject({ status: z.enum(["measured", "unmeasured"]), range_db_p10_p90: z.number().min(0).nullable() })
    .superRefine((loudness, ctx) => pairs(loudness.status, "measured", { range_db_p10_p90: loudness.range_db_p10_p90 }, ctx)),
  warnings: z.array(z.enum(REFERENCE_VOICE_WARNINGS)).max(REFERENCE_VOICE_WARNINGS.length),
});
export type ReferenceVoiceSpeaker = z.infer<typeof referenceVoiceSpeaker>;

export const referenceVoice = z.strictObject({
  version: z.literal(REFERENCE_VOICE_VERSION),
  method: z.strictObject({ pause_drop_db: z.number().positive(), pause_min_run_s: z.number().positive(), cut_safe_db: z.number().negative(),
    pitch: z.literal("yin"), sample_rate: z.number().int().positive() }),
  presenter_speaker: z.string().nullable(),
  speakers: z.array(referenceVoiceSpeaker).min(1).max(MAX_REFERENCE_VOICE_SPEAKERS),
}).superRefine((voice, ctx) => {
  voice.speakers.forEach((entry, index) => {
    if (voice.speakers.findIndex(other => other.speaker === entry.speaker) < index) {
      ctx.addIssue({ code: customIssue, path: ["speakers", index, "speaker"], message: "names a speaker twice" });
    }
  });
  if (voice.presenter_speaker !== null && !voice.speakers.some(entry => entry.speaker === voice.presenter_speaker)) {
    ctx.addIssue({ code: customIssue, path: ["presenter_speaker"], message: "is not one of the speakers" });
  }
});
export type ReferenceVoice = z.infer<typeof referenceVoice>;

export type NarrationPace = { kind: "paced"; target_wps: number; voice_pace: number; wanted: number; clamped: boolean } | { kind: "unmeasured"; reason: string };

/** The presenter's pace as make_ugc's voice_pace against our baseline voice, clamped to the vendor's range. */
export function narrationPaceFromVoice(voice: ReferenceVoice | undefined): NarrationPace {
  if (!voice) return { kind: "unmeasured", reason: "the reference voice was not measured" };
  const presenter = voice.speakers.find(entry => entry.speaker === voice.presenter_speaker);
  if (!presenter) return { kind: "unmeasured", reason: "the reference has no presenter voice" };
  const target = presenter.pace.words_per_second;
  if (target === null) return { kind: "unmeasured", reason: "the presenter's pace was not measured" };
  const wanted = Math.round((target / NARRATION_BASELINE_WPS) * 100) / 100;
  const pace = Math.min(VOICE_PACE_MAX, Math.max(VOICE_PACE_MIN, wanted));
  return { kind: "paced", target_wps: Math.round(target * 100) / 100, voice_pace: pace, wanted, clamped: pace !== wanted };
}

export type PauseTrimFromVoice = { targets: PauseTrimTargets; capped: { key: keyof PauseTrimTargets; median_s: number }[] };

/** The presenter's word-gap medians as trim targets within [floor, ceiling], naming each capped one; undefined when nothing was measured. */
export function pauseTrimFromVoice(voice: ReferenceVoice | undefined): PauseTrimFromVoice | undefined {
  const presenter = voice?.speakers.find(entry => entry.speaker === voice.presenter_speaker);
  if (!presenter) return undefined;
  const capped: PauseTrimFromVoice["capped"] = [];
  const targets = Object.fromEntries(([["sentence_end_s", presenter.pauses.sentence_end], ["comma_s", presenter.pauses.comma],
    ["mid_phrase_s", presenter.pauses.mid_phrase]] as const).flatMap(([key, kind]) => {
    const median = kind.timestamp.median_s;
    if (median === null) return [];
    if (median > PAUSE_TRIM_CEILING_S) capped.push({ key, median_s: median });
    return [[key, Math.min(PAUSE_TRIM_CEILING_S, Math.max(PAUSE_TRIM_FLOOR_S, median))]];
  })) as PauseTrimTargets;
  return Object.keys(targets).length ? { targets, capped } : undefined;
}
