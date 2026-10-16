import type { AssetBinding } from "./contracts/v1/workflow-evidence.js";

/** Includes the live caption box's stroke/shadow; rendering tests check this bound. */
export const FACELESS_CAPTION_OCCLUSION = Object.freeze({ left: 48, top: 1296, right: 1032, bottom: 1392 });

/** The source rectangle must survive every native PAN position, including a swept caption overlap. */
export function protectedFacelessPlacement(source: { width: number; height: number },
  area: NonNullable<AssetBinding["protected_area"]>, options: { captions: boolean; cropBottomPx?: number }):
  { visibleArea: { x: number; y: number; width: number; height: number } } | null {
  const crop = options.cropBottomPx ?? 0;
  if (![source.width, source.height, area.x, area.y, area.width, area.height, crop].every(Number.isFinite) ||
      source.width <= 0 || source.height <= 0 || crop < 0 || crop >= source.height || typeof options.captions !== "boolean" ||
      area.x < 0 || area.y < 0 || area.width <= 0 || area.height <= 0 || area.x + area.width > 1 || area.y + area.height > 1) return null;
  const kept = source.height - crop, scale = 1.08 * Math.max(1080 / source.width, 1920 / kept);
  const width = source.width * scale, height = source.height * scale;
  const left = (1080 - width) / 2, top = (1920 - kept * scale) / 2, travel = 0.035 * 1920;
  if (![scale, width, height, left, top].every(Number.isFinite)) return null;
  const firstTop = top - travel, lastTop = top + travel;
  const x = Math.max(0, -left / width), right = Math.min(1, (1080 - left) / width);
  const y = Math.max(0, -firstTop / height), bottom = Math.min(kept / source.height, (1920 - lastTop) / height);
  const epsilon = 1e-12;
  if (area.x < x - epsilon || area.x + area.width > right + epsilon || area.y < y - epsilon || area.y + area.height > bottom + epsilon) return null;
  if (options.captions) {
    const band = FACELESS_CAPTION_OCCLUSION;
    const swept = { left: left + area.x * width, right: left + (area.x + area.width) * width,
      top: firstTop + area.y * height, bottom: lastTop + (area.y + area.height) * height };
    if (swept.left < band.right && swept.right > band.left && swept.top < band.bottom && swept.bottom > band.top) return null;
  }
  return { visibleArea: { x, y, width: right - x, height: bottom - y } };
}
