export const CANVAS_FPS = 25;
export const NARRATION_SAMPLE_RATE = 48_000;

export function secondsToFrames(seconds: number, fps: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`secondsToFrames: seconds must be positive, got ${seconds}`);
  }
  const frames = seconds * fps;
  const whole = Math.round(frames);
  return whole > 0 && Math.abs(frames - whole) <= Number.EPSILON * Math.max(1, Math.abs(frames))
    ? whole : Math.ceil(frames);
}

export function completeFrames(seconds: number, fps: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isSafeInteger(fps) || fps <= 0) {
    throw new Error("invalid measured duration or frame rate");
  }
  const raw = seconds * fps;
  const frames = Math.floor(raw + Number.EPSILON * Math.max(1, Math.abs(raw)));
  if (!Number.isSafeInteger(frames) || frames < 1) throw new Error("source shorter than one frame");
  return frames;
}
