import { expect, it } from "vitest";
import { makeUgcInput } from "./skills.js";

const actor = { kind: "actor", script: "Hello there" };
const image = { kind: "media", media_url: "https://example.com/source.mp4", media_type: "image", duration_seconds: 2,
  image_motion: { direction: "in", amount: 0.1 } };

it("keeps the explicit image type, duration and motion regardless of the URL", () => {
  const parsed = makeUgcInput.parse({ segments: [actor, image] });
  expect(parsed.segments![1]).toEqual(image);
});

it.each([
  { ...image, duration_seconds: undefined }, { ...image, duration_seconds: 0 },
  { ...image, duration_seconds: Infinity }, { ...image, media_type: "gif" },
  { ...image, image_motion: { direction: "left", amount: 0.1 } },
  { ...image, image_motion: { direction: "in", amount: 1 } },
  { ...image, image_motion: { direction: "out", amount: -0.1 } },
  { ...image, media_type: "video" },
  { kind: "media", media_url: "https://example.com/clip", duration_seconds: 2 },
])("refuses an incomplete or contradictory image segment: %j", segment => {
  expect(makeUgcInput.safeParse({ segments: [actor, segment] }).success).toBe(false);
});

it.each(["media_type", "duration_seconds", "image_motion"] as const)("refuses field %s on an actor", field => {
  expect(makeUgcInput.safeParse({ segments: [{ ...actor, [field]: image[field] }] }).success).toBe(false);
});

it("keeps the previous video shape and adds no default motion", () => {
  const media = { kind: "media", media_url: "https://example.com/source.jpg" };
  const parsed = makeUgcInput.parse({ segments: [actor, media] });
  expect(parsed.segments![1]).toEqual(media);
  expect(makeUgcInput.parse({ segments: [actor, { ...image, image_motion: undefined }] }).segments![1]!.image_motion).toBeUndefined();
});
