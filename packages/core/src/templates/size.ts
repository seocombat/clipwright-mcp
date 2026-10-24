import { z } from "zod";

/** How large a kind draws; absent is medium, the reference scale (#778 S3, owner 2026-10-22). No default in the schema (A8). */
export const TEMPLATE_SIZES = ["small", "medium", "large"] as const;
export const templateSize = z.enum(TEMPLATE_SIZES).optional();
const SCALE = { small: 0.75, medium: 1, large: 1.3 } as const;

/** Pixels per pixel at a 1080 short side, times the size's scale. */
export function sizedScale(size: (typeof TEMPLATE_SIZES)[number] | undefined, canvas: { width: number; height: number }): number {
  return (Math.min(canvas.width, canvas.height) / 1080) * SCALE[size ?? "medium"];
}
