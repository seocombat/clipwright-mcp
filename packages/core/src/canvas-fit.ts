export const EXACT_FIT_EPSILON = 0.002;

export function isExactFit(picture: { width: number; height: number }, canvas: { width: number; height: number }, epsilon: number): boolean {
  return Math.abs(picture.width / picture.height - canvas.width / canvas.height) <= epsilon;
}
