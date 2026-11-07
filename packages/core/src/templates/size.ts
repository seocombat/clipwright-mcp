import { z } from "zod";

/** How large a kind draws; absent is medium, the reference scale. No default in the schema. */
export const TEMPLATE_SIZES = ["small", "medium", "large"] as const;
export const templateSize = z.enum(TEMPLATE_SIZES).optional();
const SCALE = { small: 0.75, medium: 1, large: 1.3 } as const;

/** The share of a tall frame's width a full-frame UI kind's area takes at medium and large, as reference reels fill it (#1128). */
export const FULL_WIDTH = 0.96;
/** A full-frame kind's area width: that share of the short side, a quarter less at small, never past that share of the frame's width. Its text
 * size moves with the size on its own, so large draws larger text in the same width. */
export function fullWidth(size: (typeof TEMPLATE_SIZES)[number] | undefined, canvas: { width: number; height: number }): number {
  return Math.min(FULL_WIDTH * canvas.width, FULL_WIDTH * Math.min(canvas.width, canvas.height) * fillingStep(size));
}
/** The size's step for a kind that fills the frame at medium: there is no room for large to grow, so it draws as medium, and small a quarter less. */
export const fillingStep = (size: (typeof TEMPLATE_SIZES)[number] | undefined): number => (size === "small" ? SCALE.small : 1);

/** Pixels per pixel at a 1080 short side, times the size's scale. */
/** A full frame's content area of `width` × `height` pixels, centred, as shares of the frame. */
export function centredArea(canvas: { width: number; height: number }, width: number, height: number) {
  const { width: w, height: h } = canvas, [rw, rh] = [Math.round(width), Math.round(height)];
  return { left: Math.round((w - rw) / 2) / w, top: Math.round((h - rh) / 2) / h, width: rw / w, height: rh / h };
}

export function sizedScale(size: (typeof TEMPLATE_SIZES)[number] | undefined, canvas: { width: number; height: number }): number {
  return (Math.min(canvas.width, canvas.height) / 1080) * SCALE[size ?? "medium"];
}
