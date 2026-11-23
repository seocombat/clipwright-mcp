import { z } from "zod";

export const TEMPLATE_SIZES = ["small", "medium", "large"] as const;
export const templateSize = z.enum(TEMPLATE_SIZES).optional();
const SCALE = { small: 0.75, medium: 1, large: 1.3 } as const;

export const FULL_WIDTH = 0.96;
export function fullWidth(size: (typeof TEMPLATE_SIZES)[number] | undefined, canvas: { width: number; height: number }): number {
  return Math.min(FULL_WIDTH * canvas.width, FULL_WIDTH * Math.min(canvas.width, canvas.height) * fillingStep(size));
}
export const fillingStep = (size: (typeof TEMPLATE_SIZES)[number] | undefined): number => (size === "small" ? SCALE.small : 1);

export function centredArea(canvas: { width: number; height: number }, width: number, height: number) {
  const { width: w, height: h } = canvas, [rw, rh] = [Math.round(width), Math.round(height)];
  return { left: Math.round((w - rw) / 2) / w, top: Math.round((h - rh) / 2) / h, width: rw / w, height: rh / h };
}

export function sizedScale(size: (typeof TEMPLATE_SIZES)[number] | undefined, canvas: { width: number; height: number }): number {
  return (Math.min(canvas.width, canvas.height) / 1080) * SCALE[size ?? "medium"];
}
