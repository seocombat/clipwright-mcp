import { describe, expect, it } from "vitest";
import { measuredRunVideo, requestHash } from "./idempotency.js";
import { run } from "./runs.js";
import { measuredVideoSize, videoResolutionLabel } from "./video-size.js";

const proof = (width: number, height: number) => ({ version: 1, runId: "run_ugc", accountId: "acc", videoKey: "runs/run_ugc/final.mp4",
  sha256: "a".repeat(64), bytes: 1234, width, height, fps: 25, outputFrames: 270, durationSec: 10.8 });
const delivered = (width: number, height: number, seal?: string) => {
  const record = proof(width, height);
  return { video_key: record.videoKey, duration_seconds: record.durationSec,
    ugc_delivery_evidence: { record, record_hash: seal ?? requestHash(record) } };
};

describe("measuredRunVideo (#1188)", () => {
  it("reads the sealed proof of the file the output names", () => {
    expect(measuredRunVideo(delivered(720, 1280))).toEqual({ width: 720, height: 1280 });
    expect(measuredRunVideo(delivered(1080, 1920))).toEqual({ width: 1080, height: 1920 });
  });

  // Mutant: skip the seal, and a damaged proof still names a size.
  it("refuses a proof whose seal does not match", () => {
    expect(measuredRunVideo(delivered(720, 1280, "0".repeat(64)))).toBeNull();
  });

  // Mutant: trust a proof of another file, and a redelivered run shows the old file's size.
  it("refuses a proof of another file or another length", () => {
    expect(measuredRunVideo({ ...delivered(720, 1280), video_key: `runs/run_ugc/deliveries/${"c".repeat(64)}.mp4` })).toBeNull();
    expect(measuredRunVideo({ ...delivered(720, 1280), duration_seconds: 11 })).toBeNull();
  });

  // Mutant: fall through to loose keys when the proof is unreadable.
  it("does not fall back to loose keys beside an unreadable proof", () => {
    expect(measuredRunVideo({ video_key: "k", duration_seconds: 3, width: 1080, height: 1920, ugc_delivery_evidence: { record: {} } })).toBeNull();
  });

  it("reads the size written with a faceless delivery", () => {
    expect(measuredRunVideo({ video_key: "runs/run_f/deliveries/x.mp4", duration_seconds: 30, width: 1080, height: 1920 }))
      .toEqual({ width: 1080, height: 1920 });
  });

  // Mutant: fall back to the request or an aspect, and an unmeasured run gets a guessed size.
  it("is null without a measurement, whatever the request or the recorded aspect say", () => {
    for (const output of [null, undefined, "x", [], { video_key: "k", duration_seconds: 3 },
      { video_key: "k", duration_seconds: 3, final_aspect_ratio: "9:16", resolution: "4k" },
      { width: 0, height: 1920 }, { width: 1080.5, height: 1920 }, { width: "1080", height: "1920" }]) {
      expect(measuredRunVideo(output)).toBeNull();
    }
  });

  it("asks the seal only of a readable proof", () => {
    const seen: string[] = [];
    expect(measuredVideoSize(delivered(720, 1280), (sealed) => { seen.push(sealed.record_hash); return true; })).toEqual({ width: 720, height: 1280 });
    expect(seen).toHaveLength(1);
    expect(measuredVideoSize(delivered(720, 1280), () => false)).toBeNull();
  });
});

describe("videoResolutionLabel (#1188)", () => {
  it.each([
    [720, 1280, "720p"], [1280, 720, "720p"], [1080, 1920, "1080p"], [1920, 1080, "1080p"], [1080, 1080, "1080p"],
    [2160, 3840, "4K"], [3840, 2160, "4K"], [4096, 2160, "4K"], [480, 854, "480p"], [540, 960, "540p"], [1440, 2560, "1440p"],
    [704, 1280, "704×1280"], [1088, 1920, "1088×1920"],
  ])("%i×%i reads %s", (width, height, label) => {
    expect(videoResolutionLabel({ width, height })).toBe(label);
  });
});

describe("run.video", () => {
  const base = { run_id: "run_a", skill: "make_ugc", state: "succeeded", credits_reserved: 0, credits_charged: 0, error: null,
    final_output: null, created_at: "2026-11-07T00:00:00.000Z", finished_at: null };

  it("carries a measured frame and is optional", () => {
    expect(run.parse({ ...base, video: { width: 720, height: 1280 } }).video).toEqual({ width: 720, height: 1280 });
    expect(run.parse(base).video).toBeUndefined();
  });

  it("refuses a frame that is not whole positive pixels or carries other keys", () => {
    for (const video of [{ width: 0, height: 1 }, { width: 1.5, height: 2 }, { width: 720, height: 1280, label: "720p" }]) {
      expect(run.safeParse({ ...base, video }).success).toBe(false);
    }
  });
});
