import { expect, it } from "vitest";
import { parseShort61Plan, reportShort61 } from "./faceless-short-61.js";

const boundaries = [
  0, 93, 162, 309, 412, 472, 562, 643, 753, 822, 902, 948,
  1010, 1081, 1192, 1243, 1316, 1344, 1373, 1410, 1447, 1484, 1522,
];

function validPlan() {
  return {
    version: "faceless_short_61_v1",
    pricingVersion: "faceless-image-v1-shadow",
    budgetVersion: "short61-five-usd-provisional-v1",
    aspectRatio: "9:16",
    resolution: "1080p",
    brollPolicy: "anyone",
    script: "Mira finds hidden letters.",
    voice: { model: "eleven_v3", voiceId: "narrator_fixture" },
    styleAssetId: "style_gouache",
    characterAssetId: "character_mira",
    imageAssets: [
      { id: "style_gouache", role: "style", prompt: "copper gouache palette", origin: "prior_probe" },
      { id: "character_mira", role: "character", prompt: "fictional courier Mira", origin: "prior_probe" },
      ...Array.from({ length: 21 }, (_, i) => ({
        id: `scene_${i + 2}`, role: "scene", prompt: `Mira at story beat ${i + 2}`,
        origin: "new", styleAssetId: "style_gouache", characterAssetIds: ["character_mira"],
      })),
    ],
    replacementAttempts: [] as Array<{ id: string; replacesAssetId: string; prompt: string }>,
    openingVideo: { assetId: "opening_t2v", prompt: "A rainy tram passes Mira" },
    shots: Array.from({ length: 22 }, (_, i) => ({
      id: `shot_${i + 1}`, mediaType: i === 0 ? "video" : "image",
      assetId: i === 0 ? "opening_t2v" : `scene_${i + 1}`,
      startFrame: boundaries[i]!, endFrame: boundaries[i + 1]!,
      ...(i === 0 ? {} : { motion: i % 2 === 1 ? "PAN_UP" : "PAN_DOWN" }),
    })),
    captionPhrases: [{ wordStart: 0, wordEnd: 4, accentWord: 2 }],
  };
}

it("freezes 22 half-open shots and counts shared references once", () => {
  const parsed = parseShort61Plan(validPlan());
  expect(parsed.shots.map(shot => [shot.startFrame, shot.endFrame])).toEqual(
    boundaries.slice(0, -1).map((start, i) => [start, boundaries[i + 1]]),
  );
  expect(parsed.shots.slice(1).map(shot => shot.motion)).toEqual(
    Array.from({ length: 21 }, (_, i) => i % 2 === 0 ? "PAN_UP" : "PAN_DOWN"),
  );
  expect(reportShort61(parsed)).toMatchObject({
    outputFrames: 1522, imageAllowance: 24, baseGeneratedImages: 23,
    retryHeadroom: 1, imageOnlyComparisonCredits: 200,
    videoPriceStatus: "unpriced", maxPaidAttempts: 0, maxUsdSpend: 0,
  });
});

it.each([
  ["independent rounding", (p: ReturnType<typeof validPlan>) => { p.shots[1]!.endFrame += 1; }],
  ["gap", (p: ReturnType<typeof validPlan>) => { p.shots[2]!.startFrame += 1; }],
  ["overlap", (p: ReturnType<typeof validPlan>) => { p.shots[2]!.startFrame -= 1; }],
  ["duplicate shot ID", (p: ReturnType<typeof validPlan>) => { p.shots[2]!.id = "shot_2"; }],
  ["swapped PAN", (p: ReturnType<typeof validPlan>) => { p.shots[1]!.motion = "PAN_DOWN"; }],
  ["second VIDEO", (p: ReturnType<typeof validPlan>) => { p.shots[1]!.mediaType = "video"; }],
  ["repeated scene image", (p: ReturnType<typeof validPlan>) => { p.shots[2]!.assetId = "scene_2"; }],
  ["empty script", (p: ReturnType<typeof validPlan>) => { p.script = " "; }],
  ["invalid reference role", (p: ReturnType<typeof validPlan>) => { p.imageAssets[0]!.role = "scene"; }],
  ["unused asset", (p: ReturnType<typeof validPlan>) => { p.imageAssets.push({ id: "unused", role: "scene", prompt: "unused", origin: "new", styleAssetId: "style_gouache", characterAssetIds: ["character_mira"] }); }],
])("rejects %s before any media work", (_name, mutate) => {
  const plan = validPlan();
  mutate(plan);
  expect(() => parseShort61Plan(plan)).toThrow();
});

it("counts one paid replacement inside the 24-image allowance and refuses a second", () => {
  const plan = validPlan();
  plan.replacementAttempts.push({ id: "retry_1", replacesAssetId: "scene_7", prompt: "Mira running through market" });
  expect(reportShort61(plan)).toMatchObject({ baseGeneratedImages: 23, replacementAttempts: 1, retryHeadroom: 0 });
  plan.replacementAttempts.push({ id: "retry_2", replacesAssetId: "scene_16", prompt: "Letters rising" });
  expect(() => parseShort61Plan(plan)).toThrow(/allowance/);
});

it("rejects duplicate asset IDs and unknown fields", () => {
  const plan = validPlan();
  plan.imageAssets[2]!.id = "style_gouache";
  expect(() => parseShort61Plan(plan)).toThrow();
  expect(() => parseShort61Plan({ ...validPlan(), publicPriceCredits: 200 })).toThrow();
});
