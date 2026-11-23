import { ASPECT_RATIOS, type AspectRatio, type Resolution } from "./skills.js";
import type { AspectSource } from "./default-actor.js";

export const ASPECT_RATIO_VALUES: Record<AspectRatio, number> = {
  "9:16": 9 / 16,
  "1:1": 1,
  "16:9": 16 / 9,
};

export const DEFAULT_ASPECT_RATIO: AspectRatio = "9:16";


export const ASPECT_MATCH_THRESHOLD = 0.02;
export const ASPECT_SNAP_THRESHOLD = 0.15;

export function aspectDistance(a: number, b: number): number {
  return Math.abs(a - b) / Math.min(a, b);
}

export function snapAspect(ratio: number): AspectRatio {
  let best: AspectRatio = ASPECT_RATIOS[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of ASPECT_RATIOS) {
    const distance = aspectDistance(ASPECT_RATIO_VALUES[candidate], ratio);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

export type AspectResolution =
  | { kind: "resolved"; aspectRatio: AspectRatio; warnings: string[] }
  | { kind: "rejected"; message: string };

export interface ResolveAspectInput {
  requested: AspectRatio | undefined;
  source: AspectSource | null;
}

export function resolveAspectRatio(input: ResolveAspectInput): AspectResolution {
  const { requested, source } = input;

  if (source === null) {
    return {
      kind: "resolved",
      aspectRatio: requested ?? DEFAULT_ASPECT_RATIO,
      warnings: [
        "source dimensions could not be probed; the format was not verified against the image",
      ],
    };
  }

  const sourceRatio = source.width / source.height;
  const target = requested ?? snapAspect(sourceRatio);
  const distance = aspectDistance(ASPECT_RATIO_VALUES[target], sourceRatio);

  if (distance <= ASPECT_MATCH_THRESHOLD) {
    return { kind: "resolved", aspectRatio: target, warnings: [] };
  }

  const targetRatio = ASPECT_RATIO_VALUES[target];
  const snapWarning =
    targetRatio > sourceRatio
      ? `source is ${source.width}×${source.height}; rendering ${target} is wider than the source, ` +
        "so the vendor pads the frame with white bars — we do not crop the source ourselves"
      : `source is ${source.width}×${source.height}; rendering ${target} is taller than the source, ` +
        "so the vendor center-crops the sides — we do not crop it ourselves";

  if (distance <= ASPECT_SNAP_THRESHOLD || requested === undefined) {
    return { kind: "resolved", aspectRatio: target, warnings: [snapWarning] };
  }

  const cure =
    source.origin === "default"
      ? `the default actor is ${snapAspect(sourceRatio)} (${source.width}×${source.height}); ` +
        `pass \`image\` with a source close to ${target} to render ${target}`
      : `the source is ${source.width}×${source.height}; pass an \`image\` closer to ${target}, ` +
        `or request ${snapAspect(sourceRatio)} instead`;

  return {
    kind: "rejected",
    message: `requested aspect_ratio ${target} conflicts with the source by ${Math.round(
      distance * 100,
    )}%: ${cure}`,
  };
}

export function exactAspectLabel(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const w = Math.round(width);
  const h = Math.round(height);
  if (w <= 0 || h <= 0) return `${w}:${h}`;
  const divisor = gcd(w, h);
  return `${w / divisor}:${h / divisor}`;
}

export interface DeliveredClip {
  width: number;
  height: number;
  durationSec: number;
  videoDurationSec?: number;
}

export function deliveryWarnings(args: {
  predicted: DeliveredClip;
  actual: DeliveredClip;
  durationToleranceSec?: number;
}): string[] {
  const { predicted, actual } = args;
  const tolerance = args.durationToleranceSec ?? 0.05;
  const warnings: string[] = [];

  if (predicted.width !== actual.width || predicted.height !== actual.height) {
    warnings.push(
      `the clip came back ${actual.width}×${actual.height} instead of ${predicted.width}×${predicted.height}`,
    );
  }

  const durationDelta = actual.durationSec - predicted.durationSec;
  if (Math.abs(durationDelta) > tolerance) {
    const paddedToWholeSecond =
      durationDelta > 0 && Number.isInteger(actual.durationSec) && actual.durationSec <= 1;

    warnings.push(
      paddedToWholeSecond
        ? `the clip was padded to ${actual.durationSec}s from ${predicted.durationSec}s of audio`
        : `the clip came back ${actual.durationSec}s instead of ${predicted.durationSec}s`,
    );
  }

  return warnings;
}

export function upscaleWarning(
  source: AspectSource | null,
  resolution: Resolution,
  aspectRatio: AspectRatio,
): string | null {
  if (source === null || source.origin !== "probed") return null;
  const frame = outputFrame(resolution, aspectRatio);
  const sourceShort = Math.min(source.width, source.height);
  const frameShort = Math.min(frame.width, frame.height);
  if (sourceShort >= frameShort) return null;
  return (
    `image is ${source.width}×${source.height} and the output is ${frame.width}×${frame.height}: ` +
    `the source is upscaled, which softens the picture. Send at least ${frameShort} px ` +
    "on the short side to avoid it."
  );
}

const SHORT_SIDE_BY_RESOLUTION: Record<Resolution, number> = {
  "720p": 720,
  "1080p": 1080,
  "4k": 2160,
};

export function deliveredResolutionWarning(
  requested: Resolution,
  delivered: { width: number; height: number },
): string | null {
  if (Math.min(delivered.width, delivered.height) === SHORT_SIDE_BY_RESOLUTION[requested]) return null;
  return `resolution ${requested} was requested, but the video is delivered at ` +
    `${delivered.width}×${delivered.height}; resolution does not change the price`;
}

export function outputFrame(
  resolution: Resolution,
  aspectRatio: AspectRatio,
): { width: number; height: number } {
  const short = SHORT_SIDE_BY_RESOLUTION[resolution];
  const ratio = ASPECT_RATIO_VALUES[aspectRatio];
  const even = (value: number): number => {
    const rounded = Math.round(value);
    return rounded % 2 === 0 ? rounded : rounded + 1;
  };

  return ratio >= 1
    ? { width: even(short * ratio), height: even(short) }
    : { width: even(short), height: even(short / ratio) };
}
