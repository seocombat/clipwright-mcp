export const CANVAS_FPS = 25;
export const NARRATION_SAMPLE_RATE = 48_000;

// The composition keeps its own copy of these two (`apps/web/remotion/timeline.ts`): its bundler resolves no other package.
// `apps/web/remotion/timeline-parity.test.ts` holds the two copies equal.

/** A duration in canvas frames, rounded up: one frame too few cuts the end of a line, one too many shows a still frame. */
export function secondsToFrames(seconds: number, fps: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`secondsToFrames: seconds must be positive, got ${seconds}`);
  }
  const frames = seconds * fps;
  const whole = Math.round(frames);
  // Floating-point multiplication can turn exactly seven frames into 7.000000000000001.
  return whole > 0 && Math.abs(frames - whole) <= Number.EPSILON * Math.max(1, Math.abs(frames))
    ? whole : Math.ceil(frames);
}

/** Count only complete source frames; allocating a speech/image slot uses secondsToFrames instead. */
export function completeFrames(seconds: number, fps: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isSafeInteger(fps) || fps <= 0) {
    throw new Error("invalid measured duration or frame rate");
  }
  const raw = seconds * fps;
  const frames = Math.floor(raw + Number.EPSILON * Math.max(1, Math.abs(raw)));
  if (!Number.isSafeInteger(frames) || frames < 1) throw new Error("source shorter than one frame");
  return frames;
}
