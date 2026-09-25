import { z } from "zod";
import { brollPolicy } from "./broll-policy.js";
import { CANVAS_FPS } from "./media-timebase.js";
import { MAX_URL_LENGTH } from "./skills.js";
import { DEFAULT_TTS_MODEL, speechTextFor, TTS_MODEL_CHAR_CAP } from "./voices.js";

const id = z.string().min(1);
const suppliedSource = z.strictObject({
  kind: z.literal("supplied"),
  // Offline source eligibility only: remote bytes and geometry remain unqualified.
  url: z.url().max(MAX_URL_LENGTH).refine(url => {
    const source = new URL(url);
    return source.protocol === "https:" && /\.(png|jpe?g)$/i.test(source.pathname);
  }, "supplied image URL must use HTTPS with a PNG or JPEG path suffix"),
});
const generatedSource = z.strictObject({
  kind: z.literal("generated"),
  prompt: z.string().trim().min(1),
  styleId: id.optional(),
  characterIds: z.array(id).optional(),
});
const asset = z.strictObject({
  id,
  role: z.enum(["scene", "style", "character"]),
  source: z.discriminatedUnion("kind", [suppliedSource, generatedSource]),
});
const scene = z.strictObject({
  id,
  assetId: id,
  durationFrames: z.number().int().positive().refine(Number.isSafeInteger, "durationFrames must be a safe integer"),
  motion: z.strictObject({ direction: z.enum(["in", "out"]), amount: z.number().min(0).lt(1) }).optional(),
});
const plan = z.strictObject({
  version: z.literal("faceless_image_v1"),
  script: z.string().trim().min(1).refine(
    text => speechTextFor(text, DEFAULT_TTS_MODEL).length <= TTS_MODEL_CHAR_CAP[DEFAULT_TTS_MODEL],
    `script exceeds ${DEFAULT_TTS_MODEL} limit of ${TTS_MODEL_CHAR_CAP[DEFAULT_TTS_MODEL]} characters after stress normalization`,
  ),
  aspectRatio: z.literal("9:16"),
  resolution: z.literal("1080p"),
  brollPolicy,
  assets: z.array(asset).min(1),
  scenes: z.array(scene).min(1).max(100),
});

export type FacelessImagePlan = z.infer<typeof plan>;

export function parseFacelessImagePlan(input: unknown): FacelessImagePlan {
  const parsed = plan.parse(input);
  const assets = new Map<string, FacelessImagePlan["assets"][number]>();
  for (const entry of parsed.assets) {
    if (assets.has(entry.id)) throw new Error(`duplicate faceless IMAGE asset ID: ${entry.id}`);
    if (entry.role !== "scene" && entry.source.kind === "generated" &&
        (entry.source.styleId !== undefined || entry.source.characterIds !== undefined)) {
      throw new Error(`faceless IMAGE references belong on scene assets: ${entry.id}`);
    }
    assets.set(entry.id, entry);
  }

  const used = new Set<string>();
  const sceneIds = new Set<string>();
  let sharedStyleId: string | undefined;
  for (const entry of parsed.scenes) {
    if (sceneIds.has(entry.id)) throw new Error(`duplicate faceless IMAGE scene ID: ${entry.id}`);
    sceneIds.add(entry.id);
    const image = assets.get(entry.assetId);
    if (image?.role !== "scene") throw new Error(`faceless IMAGE scene asset missing or wrong role: ${entry.assetId}`);
    used.add(image.id);
    if (image.source.kind === "generated") {
      const style = image.source.styleId === undefined ? undefined : assets.get(image.source.styleId);
      if (style?.role !== "style") throw new Error(`faceless IMAGE style asset missing or wrong role: ${image.id}`);
      if (sharedStyleId !== undefined && sharedStyleId !== style.id) throw new Error("faceless IMAGE scenes require one shared style anchor");
      sharedStyleId = style.id;
      used.add(style.id);
      const characters = image.source.characterIds ?? [];
      if (parsed.brollPolicy !== "anyone" && characters.length > 0) throw new Error("character references require the anyone policy");
      if (new Set(characters).size !== characters.length) throw new Error(`duplicate character reference: ${image.id}`);
      for (const characterId of characters) {
        const character = assets.get(characterId);
        if (character?.role !== "character") throw new Error(`faceless IMAGE character asset missing or wrong role: ${characterId}`);
        used.add(characterId);
      }
    }
  }
  for (const entry of parsed.assets) {
    if (!used.has(entry.id)) throw new Error(`unreferenced faceless IMAGE asset: ${entry.id}`);
  }
  const outputFrames = parsed.scenes.reduce((sum, entry) => sum + entry.durationFrames, 0);
  if (!Number.isSafeInteger(outputFrames) || outputFrames > 300 * CANVAS_FPS) throw new Error("faceless IMAGE exceeds 300 seconds");
  const maxGeneratedImages = Math.floor((24 * outputFrames) / (60 * CANVAS_FPS));
  const baseGeneratedImages = parsed.assets.filter(entry => entry.source.kind === "generated").length;
  if (baseGeneratedImages > maxGeneratedImages) throw new Error("faceless IMAGE exceeds generated image allowance");
  return parsed;
}

export function quoteFacelessImage(input: unknown) {
  const parsed = parseFacelessImagePlan(input);
  const outputFrames = parsed.scenes.reduce((sum, entry) => sum + entry.durationFrames, 0);
  const maxGeneratedImages = Math.floor((24 * outputFrames) / (60 * CANVAS_FPS));
  const baseGeneratedImages = parsed.assets.filter(entry => entry.source.kind === "generated").length;
  const raw = (180n * BigInt(outputFrames) + BigInt(60 * CANVAS_FPS - 1)) / BigInt(60 * CANVAS_FPS);
  const credits = Number(raw > 200n ? raw : 200n);
  const assetById = new Map(parsed.assets.map(entry => [entry.id, entry]));
  return {
    pricingVersion: "faceless-image-v1-shadow" as const,
    aspectRatio: parsed.aspectRatio,
    resolution: parsed.resolution,
    outputFrames,
    outputSeconds: outputFrames / CANVAS_FPS,
    credits,
    customerCreditCeiling: credits,
    baseGeneratedImages,
    maxGeneratedImages,
    retryHeadroom: maxGeneratedImages - baseGeneratedImages,
    costBreakdown: {
      generatedImages: {
        status: "unmeasured" as const,
        usd: null,
        exposureBasis: "hypothetical_two_attempts_per_generated_asset_within_shared_allowance" as const,
        maxPaidAttemptsPerAsset: 2,
        maxPaidImageCalls: Math.min(maxGeneratedImages, 2 * baseGeneratedImages),
      },
      tts: { status: "unmeasured" as const, usd: null },
      rendering: { status: "unmeasured" as const, usd: null },
      storage: { status: "unmeasured" as const, usd: null },
      paymentFees: { status: "unmeasured" as const, usd: null },
      paidFailures: { status: "unmeasured" as const, usd: null },
    },
    totalCostUsd: null,
    contributionMargin: null,
    costQualified: false,
    marginQualified: false,
    sceneCount: parsed.scenes.length,
    sceneSources: parsed.scenes.map(entry => ({
      sceneId: entry.id,
      assetId: entry.assetId,
      sourceKind: assetById.get(entry.assetId)!.source.kind,
    })),
    maxPaidAttempts: 0 as const,
    maxUsdSpend: 0 as const,
  };
}
