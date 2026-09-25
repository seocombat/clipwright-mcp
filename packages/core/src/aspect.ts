import { ASPECT_RATIOS, type AspectRatio, type Resolution } from "./skills.js";
// The frame source and the actor are one subject, so they share a module.
import type { AspectSource } from "./default-actor.js";

// Output format from the request and the source. We never crop: a mismatch is either
// a warning or a refusal before the paid call. Pure functions; probing lives in the worker.

/** Width-to-height ratio of each supported format. */
export const ASPECT_RATIO_VALUES: Record<AspectRatio, number> = {
  "9:16": 9 / 16,
  "1:1": 1,
  "16:9": 16 / 9,
};

/** Default format. A constant, not a schema `.default()`, so "asked for 9:16" stays */
/** distinguishable from "said nothing": only the latter never gets a refusal. */
export const DEFAULT_ASPECT_RATIO: AspectRatio = "9:16";


/** ≤2% counts as a match: the difference is invisible and needs no crop. */
export const ASPECT_MATCH_THRESHOLD = 0.02;
/** ≤15% snaps to a format with a warning about the vendor's center-crop. */
export const ASPECT_SNAP_THRESHOLD = 0.15;

/** Relative distance between two aspect ratios, divided by the SMALLER one: the larger */
/** error trips the threshold earlier, so a spend guard errs toward asking. */
export function aspectDistance(a: number, b: number): number {
  return Math.abs(a - b) / Math.min(a, b);
}

/** The supported format nearest to an arbitrary ratio. */
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

/** Resolver verdict: a format with explanations, or a refusal before the paid step. */
export type AspectResolution =
  | { kind: "resolved"; aspectRatio: AspectRatio; warnings: string[] }
  | { kind: "rejected"; message: string };

export interface ResolveAspectInput {
  /** What the client asked for; `undefined` means it said nothing. */
  requested: AspectRatio | undefined;
  /** The measured source. `null` only when a URL was given but probing failed; */
  /** without `image` the source is `DEFAULT_ACTOR_SOURCE`. */
  source: AspectSource | null;
}

/** Which format to render. A silent client is never refused; a refusal happens only when */
/** the client named a format more than 15% away from the source. */
export function resolveAspectRatio(input: ResolveAspectInput): AspectResolution {
  const { requested, source } = input;

  if (source === null) {
    // Probing the foreign URL failed. That is not a client claim about the format,
    // so the unverified format is a warning, not a refusal.
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

  // Measured vendor behavior depends on direction: a frame wider than the source is
  // padded white, a narrower one is scaled up and center-cropped at the sides.
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

  // Explicit conflict. The text must name the remedy: for an autonomous agent a
  // refusal without a next step is as bad as a failure.
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

/** Exact source ratio label, reduced by GCD: 432×768 → `9:16`, 1920×1080 → `16:9`. Unlike */
/** `snapAspect` (what we render), this reports what was sent, so a quote never misstates input. */
export function exactAspectLabel(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const w = Math.round(width);
  const h = Math.round(height);
  if (w <= 0 || h <= 0) return `${w}:${h}`;
  const divisor = gcd(w, h);
  return `${w / divisor}:${h / divisor}`;
}

/** The format we ask the VENDOR for is the one nearest the SOURCE, not the requested one: */
/** the vendor damages the frame only on a mismatch, and our own layout is declared in warnings. */
export function vendorAspectFor(
  source: AspectSource,
  supported: readonly AspectRatio[],
): AspectRatio {
  if (supported.length === 0) {
    throw new Error("vendorAspectFor: backend declares no supported aspect ratios");
  }

  const sourceRatio = source.width / source.height;
  let best = supported[0]!;
  let bestDistance = aspectDistance(ASPECT_RATIO_VALUES[best], sourceRatio);

  for (const candidate of supported) {
    const distance = aspectDistance(ASPECT_RATIO_VALUES[candidate], sourceRatio);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/** What we predicted and what the vendor actually delivered. */
export interface DeliveredClip {
  width: number;
  height: number;
  durationSec: number;
}

/** Compares vendor output with the prediction, so every paid run re-measures vendor */
/** behavior. Silent on a match: a warning on every run devalues all warnings. */
export function deliveryWarnings(args: {
  predicted: DeliveredClip;
  actual: DeliveredClip;
  /** Duration tolerance: the vendor rounds, and fractions of a second are not a mismatch. */
  durationToleranceSec?: number;
}): string[] {
  const { predicted, actual } = args;
  const tolerance = args.durationToleranceSec ?? 0.05;
  const warnings: string[] = [];

  if (predicted.width !== actual.width || predicted.height !== actual.height) {
    warnings.push(
      `vendor returned ${actual.width}×${actual.height} where ${predicted.width}×${predicted.height} was expected`,
    );
  }

  const durationDelta = actual.durationSec - predicted.durationSec;
  if (Math.abs(durationDelta) > tolerance) {
    // Padding to a whole second is a known, measured case (0.6 s of audio came back as
    // 1.0 s) and is named separately from unknown mismatches.
    const paddedToWholeSecond =
      durationDelta > 0 && Number.isInteger(actual.durationSec) && actual.durationSec <= 1;

    warnings.push(
      paddedToWholeSecond
        ? `vendor padded the clip to ${actual.durationSec}s from ${predicted.durationSec}s of audio` // skill-scope: dynamic — warning text, not SQL
        : `vendor returned ${actual.durationSec}s where ${predicted.durationSec}s was expected`,
    );
  }

  return warnings;
}

/** Upscaling is named, like a format snap, but only for a FOREIGN frame: our actor's */
/** dimensions are a product property. */
export function upscaleWarning(
  source: AspectSource | null,
  resolution: Resolution,
  aspectRatio: AspectRatio,
): string | null {
  if (source === null || source.origin !== "probed") return null;
  const frame = expectedVendorFrame(resolution, aspectRatio);
  const sourceShort = Math.min(source.width, source.height);
  const frameShort = Math.min(frame.width, frame.height);
  if (sourceShort >= frameShort) return null;
  return (
    `image is ${source.width}×${source.height} and the output is ${frame.width}×${frame.height}: ` +
    `the source is upscaled, which softens the picture. Send at least ${frameShort} px ` +
    "on the short side to avoid it."
  );
}

/** Short frame side per resolution, measured live. */
const SHORT_SIDE_BY_RESOLUTION: Record<Resolution, number> = {
  "720p": 720,
  "1080p": 1080,
  "4k": 2160,
};

/** The frame we expect from the vendor: format PLUS resolution. Format alone flagged */
/** every 720p run as a mismatch. */
export function expectedVendorFrame(
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
