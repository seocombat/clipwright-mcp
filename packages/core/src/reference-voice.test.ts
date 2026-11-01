import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { narrationPaceFromVoice, NARRATION_BASELINE_WPS, REFERENCE_VOICE_VERSION, referenceAnalysisWarnings, referenceProfileInput as referenceProfile, referenceVoice,
  VOICE_PACE_MAX, VOICE_PACE_MIN } from "./index.js";

const PROFILE = JSON.parse(readFileSync(new URL("./fixtures/reference-profile-reel.json", import.meta.url), "utf8"));
const summary = (count: number, median: number | null) => ({ count, median_s: median, p90_s: median, count_ge150ms: 0 });
const kind = (count: number, median: number | null) => ({ timestamp: summary(count, median), acoustic_pause: summary(count, median),
  cut_safe: summary(0, null), acoustic_no_dip_count: 0, acoustic_unconfirmed_count: 0 });
/** The reference reel's presenter as the analyzer measured her: 3.087 words/s, hinge 7 of 13, F0 228 Hz. */
const speaker = (extra: Record<string, unknown> = {}) => ({
  speaker: "speaker_0", word_count: 158, sentence_count: 16,
  pace: { status: "measured", words_per_second: 3.0871, basis: "sentence_spans" },
  pauses: { sentence_end: kind(14, 0.18), comma: kind(10, 0.22), mid_phrase: kind(132, 0.06) }, long_pause_count: 0,
  hinge: { status: "measured", sentence_share: 7 / 13, evaluated_sentences: 13, coverage: 13 / 16, timestamp_sentence_share: 0.6875,
    median_position: 0.6, median_seconds: 0.17 },
  pitch: { status: "measured", ceiling_hz: 400, ceiling_basis: "default", median_hz: 228.05, p10_hz: 113.7, p90_hz: 315, range_st: 17.6, voiced_frames: 3538 },
  loudness: { status: "measured", range_db_p10_p90: 20.5 },
  warnings: [], ...extra,
});
const voice = (speakers = [speaker()], presenter: string | null = "speaker_0") => ({
  version: REFERENCE_VOICE_VERSION, method: { pause_drop_db: 12, pause_min_run_s: 0.04, cut_safe_db: -40, pitch: "yin", sample_rate: 44100 },
  presenter_speaker: presenter, speakers,
});
const issues = (value: unknown) => referenceVoice.safeParse(value).error?.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`) ?? [];

describe("reference voice profile (reference-elements S7)", () => {
  it("rides in the reference profile as an optional section; a profile from before S7 still parses", () => {
    expect(referenceProfile.safeParse({ ...PROFILE, voice: voice() }).success).toBe(true);
    expect(referenceProfile.safeParse(PROFILE).success).toBe(true);
    expect(issues(voice())).toEqual([]);
  });

  /** Mutant: drop the status pairing, and an unmeasured pitch is stored as 0 Hz and read as a very low voice. */
  it("keeps an unmeasured metric null with its status, never 0 and never a number under an unmeasured status", () => {
    const silentPitch = speaker({ pitch: { status: "no_voiced_frames", ceiling_hz: 400, ceiling_basis: "default", median_hz: null, p10_hz: null, p90_hz: null,
      range_st: null, voiced_frames: 0 } });
    expect(issues(voice([silentPitch]))).toEqual([]);
    expect(issues(voice([speaker({ pitch: { ...speaker().pitch, median_hz: 0 } })]))).toEqual([expect.stringMatching(/^speakers\.0\.pitch\.median_hz: /)]);
    expect(issues(voice([speaker({ pitch: { ...silentPitch.pitch, median_hz: 228 } })]))).toEqual([expect.stringMatching(/^speakers\.0\.pitch: .*no_voiced_frames/)]);
    expect(issues(voice([speaker({ pace: { status: "measured", words_per_second: null, basis: "sentence_spans" } })])))
      .toEqual([expect.stringMatching(/^speakers\.0\.pace: /)]);
    expect(issues(voice([speaker({ hinge: { ...speaker().hinge, status: "not_evaluated" } })]))).toEqual([expect.stringMatching(/^speakers\.0\.hinge: /)]);
  });

  it("names a presenter that is one of its speakers, once each", () => {
    expect(issues(voice([speaker()], "speaker_9"))).toEqual([expect.stringMatching(/^presenter_speaker: /)]);
    expect(issues(voice([speaker(), speaker()]))).toEqual([expect.stringMatching(/^speakers\.1\.speaker: /)]);
    expect(issues(voice([speaker()], null))).toEqual([]);
  });

  /** Mutant: free-text speaker ids, and a transcript line rides in the profile as a speaker name. */
  it("takes speaker ids in the vendor's shape only", () => {
    expect(issues(voice([speaker({ speaker: "Hi, I'm Ana" })], null))).toEqual([expect.stringMatching(/^speakers\.0\.speaker: /)]);
  });
});

describe("narration pace from the reference voice", () => {
  const paceOf = (value: unknown) => narrationPaceFromVoice(value === undefined ? undefined : referenceVoice.parse(value));
  /** Mutant: forget the clamp, and the plan asks the voice for a speed the vendor refuses. */
  it("maps the presenter's pace to a speed against our baseline, clamped to the vendor's range with the wanted value named", () => {
    expect(paceOf(voice())).toEqual({ kind: "paced", target_wps: 3.09, voice_pace: VOICE_PACE_MAX, wanted: 1.22, clamped: true });
    const calm = voice([speaker({ pace: { status: "measured", words_per_second: 2.6, basis: "sentence_spans" } })]);
    expect(paceOf(calm)).toEqual({ kind: "paced", target_wps: 2.6, voice_pace: 1.02, wanted: 1.02, clamped: false });
    const slow = voice([speaker({ pace: { status: "measured", words_per_second: 1.2, basis: "sentence_spans" } })]);
    expect(paceOf(slow)).toMatchObject({ voice_pace: VOICE_PACE_MIN, clamped: true });
    expect(NARRATION_BASELINE_WPS).toBeGreaterThan(2);
  });

  it("says why there is no pace: no voice section, no presenter, or an unmeasured pace", () => {
    expect(paceOf(undefined)).toEqual({ kind: "unmeasured", reason: "the reference voice was not measured" });
    expect(paceOf(voice([speaker()], null))).toEqual({ kind: "unmeasured", reason: "the reference has no presenter voice" });
    const unmeasured = voice([speaker({ pace: { status: "unmeasured", words_per_second: null, basis: "sentence_spans" } })]);
    expect(paceOf(unmeasured)).toEqual({ kind: "unmeasured", reason: "the presenter's pace was not measured" });
  });
});

describe("analysis warnings", () => {
  /** Mutant: keep the voice pass's failure inside the profile only, and warnings[] says nothing (rule 3). */
  it("lists the analysis's own warnings next to the unmapped ones", () => {
    const profile = referenceProfile.parse({ ...PROFILE, analysis: { ...PROFILE.analysis, warnings: ["voice profile not measured: the audio could not be decoded"] } });
    expect(referenceAnalysisWarnings(profile)).toEqual([...referenceAnalysisWarnings(referenceProfile.parse(PROFILE)),
      "voice profile not measured: the audio could not be decoded"]);
  });
});
