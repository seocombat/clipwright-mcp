import { expect, it } from "vitest";
import { faceDeliverySchema } from "./face-delivery.js";
import { ugcDeliveryEvidenceSchema } from "./ugc-delivery.js";

const measured = { version: 1, runId: "run_ugc", accountId: "acc", videoKey: "runs/run_ugc/final.mp4",
  sha256: "a".repeat(64), bytes: 1234, width: 1920, height: 1080, fps: 25, outputFrames: 270, durationSec: 10.8 };

const streamTimed = { ...measured, version: 2, outputFrames: 224, durationSec: 9.002667,
  videoDurationSec: 8.96, audioDurationSec: 9.002667, audioSampleRate: 48000 };
it.each([1, 2])("allows one measured frame of error, but not one and a half (v%s)", version => {
  const proof = (durationSec: number) => ({ ...(version === 1 ? measured : streamTimed), version,
    fps: 32, outputFrames: 32, durationSec,
    ...(version === 2 ? { videoDurationSec: durationSec, audioDurationSec: durationSec } : {}) });
  for (const duration of [0.96875, 1.03125]) expect(ugcDeliveryEvidenceSchema.safeParse(proof(duration)).success).toBe(true);
  for (const duration of [0.953125, 1.046875]) expect(ugcDeliveryEvidenceSchema.safeParse(proof(duration)).success).toBe(false);
});
it("bounds the measured audio rate inclusively at 8000 and 96000 Hz", () => {
  const proof = { ...streamTimed, durationSec: 8.96, audioDurationSec: 8.96 };
  for (const audioSampleRate of [8000, 96000]) expect(ugcDeliveryEvidenceSchema.safeParse({ ...proof, audioSampleRate }).success).toBe(true);
  for (const audioSampleRate of [96001, 192000]) expect(ugcDeliveryEvidenceSchema.safeParse({ ...proof, audioSampleRate }).success).toBe(false);
});
it("retains measured container and stream durations when AAC audio outlasts video", () => {
  expect(ugcDeliveryEvidenceSchema.parse(streamTimed)).toEqual(streamTimed);
  expect(ugcDeliveryEvidenceSchema.parse({ ...streamTimed, durationSec: 8.96, audioDurationSec: 8.9 }))
    .toEqual({ ...streamTimed, durationSec: 8.96, audioDurationSec: 8.9 });
});
it("bounds AAC tail by two 1024-sample frames at the measured sample rate", () => {
  for (const audioSampleRate of [24000, 48000]) {
    const end = streamTimed.videoDurationSec + 2048 / audioSampleRate;
    const proof = { ...streamTimed, audioSampleRate, audioDurationSec: end, durationSec: end };
    expect(ugcDeliveryEvidenceSchema.parse(proof)).toEqual(proof);
    expect(ugcDeliveryEvidenceSchema.safeParse({ ...proof, audioDurationSec: end + 0.00001, durationSec: end + 0.00001 }).success).toBe(false);
  }
});
it("allows only millisecond container timestamp rounding", () => {
  expect(ugcDeliveryEvidenceSchema.parse({ ...streamTimed, durationSec: streamTimed.durationSec + 0.0009 })).toBeDefined();
  expect(ugcDeliveryEvidenceSchema.safeParse({ ...streamTimed, durationSec: streamTimed.durationSec + 0.0011 }).success).toBe(false);
});
it("includes exact positive and negative millisecond timestamp edges", () => {
  const proof = { ...streamTimed, fps: 24, outputFrames: 12, videoDurationSec: 0.5, audioDurationSec: 0.5 };
  for (const durationSec of [0.499, 0.501]) expect(ugcDeliveryEvidenceSchema.parse({ ...proof, durationSec })).toBeDefined();
  for (const durationSec of [0.49899999, 0.50100001]) expect(ugcDeliveryEvidenceSchema.safeParse({ ...proof, durationSec }).success).toBe(false);
});
it.each([
  { version: 1 }, { version: 3 }, { outputFrames: 230 }, { fps: Number.MIN_VALUE },
  { videoDurationSec: 9.2 }, { audioDurationSec: 9.2 }, { durationSec: 9.2 },
  { videoDurationSec: 0 }, { audioDurationSec: Number.NaN }, { audioDurationSec: Number.POSITIVE_INFINITY },
  { audioSampleRate: 0 }, { audioSampleRate: 1.5 }, { audioSampleRate: 1000 }, { audioSampleRate: 1000000 },
])("refuses inconsistent or unmeasured stream timing %j", change => {
  expect(ugcDeliveryEvidenceSchema.safeParse({ ...streamTimed, ...change }).success).toBe(false);
});
it.each(["videoDurationSec", "audioDurationSec", "audioSampleRate"])("requires v2 %s without relaxing legacy frame checks", field => {
  const value: Record<string, unknown> = { ...streamTimed }; delete value[field];
  expect(ugcDeliveryEvidenceSchema.safeParse(value).success).toBe(false);
  expect(ugcDeliveryEvidenceSchema.safeParse({ ...measured, durationSec: 11 }).success).toBe(false);
});

it("accepts measured fractional frame rates without changing duration", () => {
  const proof = { ...measured, fps: 30000 / 1001, outputFrames: 300, durationSec: 10.01 };
  expect(ugcDeliveryEvidenceSchema.parse(proof)).toEqual(proof);
});

it("retains every identity already allowed by verified segmented delivery", () => {
  const face = faceDeliverySchema.parse({ ...measured, runId: "legacyDelivery", planHash: "b".repeat(64),
    videoKey: `runs/legacyDelivery/deliveries/${measured.sha256}.mp4` });
  const { planHash: _planHash, ...proof } = face;
  expect(ugcDeliveryEvidenceSchema.parse(proof)).toEqual(proof);
});

it("refuses positive finite fps whose implied frame duration overflows", () => {
  expect(ugcDeliveryEvidenceSchema.safeParse({ ...measured, fps: Number.MIN_VALUE }).success).toBe(false);
});

it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
  "refuses unmeasured byte/frame/dimension counts (%s)", value => {
    for (const key of ["bytes", "width", "height", "outputFrames"] as const) {
      expect(ugcDeliveryEvidenceSchema.safeParse({ ...measured, [key]: value }).success).toBe(false);
    }
  });
