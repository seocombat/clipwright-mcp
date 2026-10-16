import { expect, it } from "vitest";
import * as core from "./index.js";

const source = { width: 1080, height: 1920 };
const center = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };
const bare = { captions: false };

it("proves the intersection visible throughout the native PAN, rather than source aspect alone", () => {
  const proof = core.protectedFacelessPlacement(source, center, bare);
  expect(proof).not.toBeNull();
  expect(proof!.visibleArea.x).toBeCloseTo(1 / 27, 12);
  expect(proof!.visibleArea.y).toBeCloseTo(5 / 72, 12);
  expect(proof!.visibleArea.width).toBeCloseTo(25 / 27, 12);
  expect(proof!.visibleArea.height).toBeCloseTo(31 / 36, 12);
});
it("accepts the exact visible boundary and refuses a source feature just beyond it", () => {
  const boundary = { x: 1 / 27, y: 5 / 72, width: 25 / 27, height: 31 / 36 };
  expect(core.protectedFacelessPlacement(source, boundary, bare)).not.toBeNull();
  expect(core.protectedFacelessPlacement(source, { ...boundary, x: boundary.x - 0.000001 }, bare)).toBeNull();
  expect(core.protectedFacelessPlacement(source, { x: 0, y: 0, width: 1, height: 1 }, bare)).toBeNull();
});
it("takes the actual caption setting into account before promising a protected feature", () => {
  const underCaptions = { x: 0.4, y: 0.66, width: 0.1, height: 0.06 };
  expect(core.protectedFacelessPlacement(source, underCaptions, bare)).not.toBeNull();
  expect(core.protectedFacelessPlacement(source, underCaptions, { captions: true })).toBeNull();
  expect(core.protectedFacelessPlacement(source, center, { captions: true })).not.toBeNull();
  expect(core.protectedFacelessPlacement(source, { x: 0.4, y: 0.8, width: 0.1, height: 0.05 }, { captions: true })).not.toBeNull();
});
it.each([0.04, 0.93])("preserves a protected feature horizontally outside the caption band at x=%f", x => {
  const area = { x, y: 0.66, width: 0.03, height: 0.06 };
  expect(core.protectedFacelessPlacement(source, area, bare)).not.toBeNull();
  expect(core.protectedFacelessPlacement(source, area, { captions: true })).not.toBeNull();
});
it.each([
  [{ width: 0, height: 1920 }, center, bare],
  [{ width: Infinity, height: 1920 }, center, bare],
  [source, { ...center, x: NaN }, bare],
  [source, { ...center, width: 0 }, bare],
  [source, { ...center, y: -0.1 }, bare],
  [source, { ...center, width: 2 }, bare],
  [source, center, { captions: false, cropBottomPx: -1 }],
  [source, center, { captions: false, cropBottomPx: 1920 }],
])("refuses invalid placement dimensions and source bounds %#", (size, area, options) => {
  expect(core.protectedFacelessPlacement(size, area, options)).toBeNull();
});
