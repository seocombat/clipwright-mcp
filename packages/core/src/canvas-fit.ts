// Copies of `apps/web/remotion/fit.ts`, which the composition cannot import; `timeline-parity.test.ts` holds them equal.

/** Ratios this close, in absolute difference, fill the canvas with no bars. */
export const EXACT_FIT_EPSILON = 0.002;

/** Whether a picture fills the canvas exactly, as `fitClipToCanvas` decides `exact` at `EXACT_FIT_EPSILON`. */
export function isExactFit(picture: { width: number; height: number }, canvas: { width: number; height: number }, epsilon: number): boolean {
  return Math.abs(picture.width / picture.height - canvas.width / canvas.height) <= epsilon;
}
