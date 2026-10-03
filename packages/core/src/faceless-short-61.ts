import { z } from "zod";

import { brollPolicy } from "./broll-policy.js";
import { CANVAS_FPS } from "./media-timebase.js";
import { ELEVENLABS_TTS_MODELS, speechTextFor, TTS_MODEL_CHAR_CAP } from "./voices.js";

export const SHORT61_BOUNDARIES = [
  0, 93, 162, 309, 412, 472, 562, 643, 753, 822, 902, 948,
  1010, 1081, 1192, 1243, 1316, 1344, 1373, 1410, 1447, 1484, 1522,
] as const;

const id = z.string().trim().min(1);
const imageAsset = z.strictObject({
  id,
  role: z.enum(["scene", "style", "character"]),
  prompt: z.string().trim().min(1),
  origin: z.enum(["prior_probe", "new"]),
  styleAssetId: id.optional(),
  characterAssetIds: z.array(id).optional(),
});
const replacementAttempt = z.strictObject({
  id,
  replacesAssetId: id,
  prompt: z.string().trim().min(1),
});
const shot = z.strictObject({
  id,
  mediaType: z.enum(["video", "image"]),
  assetId: id,
  startFrame: z.number().int().nonnegative().safe(),
  endFrame: z.number().int().positive().safe(),
  motion: z.enum(["PAN_UP", "PAN_DOWN"]).optional(),
});
const captionPhrase = z.strictObject({
  wordStart: z.number().int().nonnegative(),
  wordEnd: z.number().int().positive(),
  accentWord: z.number().int().nonnegative(),
});
const plan = z.strictObject({
  version: z.literal("faceless_short_61_v1"),
  pricingVersion: z.literal("faceless-image-v1-shadow"),
  budgetVersion: z.literal("short61-five-usd-provisional-v1"),
  aspectRatio: z.literal("9:16"),
  resolution: z.literal("1080p"),
  brollPolicy,
  script: z.string().trim().min(1),
  voice: z.strictObject({ model: z.enum(ELEVENLABS_TTS_MODELS), voiceId: id }),
  styleAssetId: id,
  characterAssetId: id,
  imageAssets: z.array(imageAsset),
  replacementAttempts: z.array(replacementAttempt),
  openingVideo: z.strictObject({ assetId: id, prompt: z.string().trim().min(1) }),
  shots: z.array(shot).length(22),
  captionPhrases: z.array(captionPhrase).min(1),
});

export type Short61Plan = z.infer<typeof plan>;
export type Short61Report = {
  outputFrames: 1522;
  imageAllowance: 24;
  baseGeneratedImages: number;
  replacementAttempts: number;
  retryHeadroom: number;
  imageOnlyComparisonCredits: 200;
  videoPriceStatus: "unpriced";
  maxPaidAttempts: 0;
  maxUsdSpend: 0;
};

export function parseShort61Plan(input: unknown): Short61Plan {
  const parsed = plan.parse(input);
  if (speechTextFor(parsed.script, parsed.voice.model).length > TTS_MODEL_CHAR_CAP[parsed.voice.model]) {
    throw new Error("short61 script exceeds the selected speech model limit");
  }
  if (parsed.brollPolicy !== "anyone") throw new Error("short61 Mira scenes require the anyone policy");

  const assets = new Map<string, Short61Plan["imageAssets"][number]>();
  for (const asset of parsed.imageAssets) {
    if (assets.has(asset.id) || asset.id === parsed.openingVideo.assetId) throw new Error(`duplicate short61 asset ID: ${asset.id}`);
    assets.set(asset.id, asset);
  }
  if (assets.get(parsed.styleAssetId)?.role !== "style" || assets.get(parsed.characterAssetId)?.role !== "character") {
    throw new Error("short61 style and character references have wrong roles");
  }
  if (parsed.styleAssetId === parsed.characterAssetId) throw new Error("short61 reference IDs must differ");

  const sceneAssets = parsed.imageAssets.filter(asset => asset.role === "scene");
  if (sceneAssets.length !== 21 || parsed.imageAssets.length !== 23) {
    throw new Error("short61 requires 21 scenes and two shared references");
  }
  for (const asset of parsed.imageAssets) {
    if (asset.role !== "scene") {
      if (asset.styleAssetId !== undefined || asset.characterAssetIds !== undefined) {
        throw new Error(`short61 references belong only on scene assets: ${asset.id}`);
      }
      continue;
    }
    if (asset.styleAssetId !== parsed.styleAssetId ||
        asset.characterAssetIds?.length !== 1 ||
        asset.characterAssetIds[0] !== parsed.characterAssetId) {
      throw new Error(`short61 scene ${asset.id} must use shared style and Mira references`);
    }
  }

  const usedImages = new Set<string>();
  const shotIds = new Set<string>();
  for (let i = 0; i < parsed.shots.length; i++) {
    const current = parsed.shots[i]!;
    if (shotIds.has(current.id)) throw new Error(`duplicate short61 shot ID: ${current.id}`);
    shotIds.add(current.id);
    if (current.id !== `shot_${i + 1}` ||
        current.startFrame !== SHORT61_BOUNDARIES[i] ||
        current.endFrame !== SHORT61_BOUNDARIES[i + 1] ||
        current.mediaType !== (i === 0 ? "video" : "image") ||
        (i === 0 && (current.assetId !== parsed.openingVideo.assetId || current.motion !== undefined)) ||
        (i > 0 && current.motion !== (i % 2 === 1 ? "PAN_UP" : "PAN_DOWN"))) {
      throw new Error(`short61 shot ${i + 1} differs from the frozen frame plan`);
    }
    if (i > 0) {
      if (assets.get(current.assetId)?.role !== "scene" || usedImages.has(current.assetId)) {
        throw new Error(`short61 shot ${i + 1} needs a distinct scene image`);
      }
      usedImages.add(current.assetId);
    }
  }
  for (const asset of sceneAssets) {
    if (!usedImages.has(asset.id)) throw new Error(`unreferenced short61 scene image: ${asset.id}`);
  }

  const attemptIds = new Set(assets.keys());
  attemptIds.add(parsed.openingVideo.assetId);
  for (const attempt of parsed.replacementAttempts) {
    if (attemptIds.has(attempt.id)) throw new Error(`duplicate short61 replacement ID: ${attempt.id}`);
    attemptIds.add(attempt.id);
    if (assets.get(attempt.replacesAssetId)?.role !== "scene") {
      throw new Error(`short61 replacement target is not a scene: ${attempt.replacesAssetId}`);
    }
  }
  const outputFrames = SHORT61_BOUNDARIES.at(-1)!;
  const imageAllowance = Math.floor(24 * outputFrames / (60 * CANVAS_FPS));
  if (parsed.imageAssets.length + parsed.replacementAttempts.length > imageAllowance) {
    throw new Error("short61 image allowance exceeded");
  }
  for (const phrase of parsed.captionPhrases) {
    if (phrase.wordEnd <= phrase.wordStart || phrase.accentWord < phrase.wordStart || phrase.accentWord >= phrase.wordEnd) {
      throw new Error("short61 caption phrase indices are invalid");
    }
  }
  return parsed;
}

export function reportShort61(input: unknown): Short61Report {
  const parsed = parseShort61Plan(input);
  const baseGeneratedImages = parsed.imageAssets.length;
  const replacementAttempts = parsed.replacementAttempts.length;
  return {
    outputFrames: 1522,
    imageAllowance: 24,
    baseGeneratedImages,
    replacementAttempts,
    retryHeadroom: 24 - baseGeneratedImages - replacementAttempts,
    imageOnlyComparisonCredits: 200,
    videoPriceStatus: "unpriced",
    maxPaidAttempts: 0,
    maxUsdSpend: 0,
  };
}
