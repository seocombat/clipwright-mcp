import { expect, it, vi } from "vitest";
import { parseFacelessImagePlan, quoteFacelessImage } from "./faceless-image-qualification.js";

const supplied = { id: "frame_a", role: "scene", source: { kind: "supplied", url: "https://example.com/a.png" } } as const;
const base = { version: "faceless_image_v1", script: "A short fictional story.", aspectRatio: "9:16", resolution: "1080p",
  brollPolicy: "no_people", assets: [supplied], scenes: [{ id: "scene_1", assetId: "frame_a", durationFrames: 25,
    motion: { direction: "in", amount: 0.05 } }] } as const;

it("charges a nonzero minimum for zero presenter frames", () => {
  expect(quoteFacelessImage(base).credits).toBe(200);
});
it("quotes 2:23 once from output frames, not from scene or image count", () => {
  const plan = { ...base, scenes: [{ id: "scene_1", assetId: "frame_a", durationFrames: 2000 },
    { id: "scene_2", assetId: "frame_a", durationFrames: 1575 }] };
  expect(quoteFacelessImage(plan)).toMatchObject({ outputFrames: 3575, credits: 429, baseGeneratedImages: 0 });
});
it("counts generated references and retry headroom", () => {
  const plan = { ...base, brollPolicy: "anyone", assets: [
    { id: "style", role: "style", source: { kind: "generated", prompt: "sepia archive" } },
    { id: "person", role: "character", source: { kind: "generated", prompt: "fictional traveller" } },
    { id: "frame", role: "scene", source: { kind: "generated", prompt: "traveller by train", styleId: "style", characterIds: ["person"] } },
  ], scenes: [{ id: "scene_1", assetId: "frame", durationFrames: 250 }] };
  expect(quoteFacelessImage(plan)).toMatchObject({ baseGeneratedImages: 3, maxGeneratedImages: 4, retryHeadroom: 1 });
});

it.each(["no_actor", "no_people"])("rejects character references under %s", brollPolicy => {
  const plan = { ...base, brollPolicy, assets: [
    { id: "style", role: "style", source: { kind: "supplied", url: "https://example.com/style.png" } },
    { id: "person", role: "character", source: { kind: "supplied", url: "https://example.com/person.png" } },
    { id: "frame", role: "scene", source: { kind: "generated", prompt: "Fictional traveller", styleId: "style", characterIds: ["person"] } },
  ], scenes: [{ id: "s", assetId: "frame", durationFrames: 250 }] };
  expect(() => parseFacelessImagePlan(plan)).toThrow();
  expect(() => parseFacelessImagePlan({ ...plan, brollPolicy: "anyone" })).not.toThrow();
});

it.each([
  { durationFrames: 250, allowance: 4, maxPaidImageCalls: 4 },
  { durationFrames: 750, allowance: 12, maxPaidImageCalls: 6 },
])("reports unmeasured costs and bounded image exposure at $durationFrames frames", ({ durationFrames, allowance, maxPaidImageCalls }) => {
  const quote = quoteFacelessImage({ ...base, brollPolicy: "anyone", assets: [
    { id: "style", role: "style", source: { kind: "generated", prompt: "Sepia archive" } },
    { id: "person", role: "character", source: { kind: "generated", prompt: "Fictional traveller" } },
    { id: "frame", role: "scene", source: { kind: "generated", prompt: "Traveller by train", styleId: "style", characterIds: ["person"] } },
  ], scenes: [{ id: "s", assetId: "frame", durationFrames }] });
  expect(quote).toMatchObject({
    baseGeneratedImages: 3, maxGeneratedImages: allowance,
    costBreakdown: {
      generatedImages: { status: "unmeasured", usd: null, maxPaidAttemptsPerAsset: 2, maxPaidImageCalls },
      tts: { status: "unmeasured", usd: null },
      rendering: { status: "unmeasured", usd: null },
      storage: { status: "unmeasured", usd: null },
      paymentFees: { status: "unmeasured", usd: null },
      paidFailures: { status: "unmeasured", usd: null },
    },
    totalCostUsd: null, contributionMargin: null, costQualified: false, marginQualified: false,
    maxPaidAttempts: 0, maxUsdSpend: 0,
  });
});

it("does not model paid image attempts for an entirely supplied plan", () => {
  expect(quoteFacelessImage({ ...base, scenes: [{ ...base.scenes[0], durationFrames: 750 }] })).toMatchObject({
    maxGeneratedImages: 12,
    costBreakdown: { generatedImages: { maxPaidImageCalls: 0, usd: null } },
  });
});

it("quotes the 30-second and five-minute endpoints from frames", () => {
  expect(quoteFacelessImage({ ...base, scenes: [{ id: "s", assetId: "frame_a", durationFrames: 750 }] }).credits).toBe(200);
  expect(quoteFacelessImage({ ...base, scenes: [{ id: "s", assetId: "frame_a", durationFrames: 7500 }] }).credits).toBe(900);
});
it("accepts 300 seconds and rejects 301 seconds", () => {
  expect(quoteFacelessImage({ ...base, scenes: [{ id: "s", assetId: "frame_a", durationFrames: 7500 }] }).outputSeconds).toBe(300);
  expect(() => quoteFacelessImage({ ...base, scenes: [{ id: "s", assetId: "frame_a", durationFrames: 7525 }] })).toThrow();
});
it("accepts 100 scenes and rejects 101", () => {
  const scenes = Array.from({ length: 101 }, (_, i) => ({ id: `s_${i}`, assetId: "frame_a", durationFrames: 25 }));
  expect(quoteFacelessImage({ ...base, scenes: scenes.slice(0, 100) }).sceneCount).toBe(100);
  expect(() => quoteFacelessImage({ ...base, scenes })).toThrow();
});
it("accepts the exact generated-image allowance and rejects one over", () => {
  const style = { id: "style", role: "style", source: { kind: "supplied", url: "https://example.com/style.png" } };
  const generated = Array.from({ length: 12 }, (_, i) => ({ id: `g_${i}`, role: "scene", source: { kind: "generated", prompt: `Scene ${i}`, styleId: "style" } }));
  const scenes = generated.map((asset, i) => ({ id: `s_${i}`, assetId: asset.id, durationFrames: 25 }));
  expect(quoteFacelessImage({ ...base, assets: [style, ...generated], scenes: [...scenes, { id: "end", assetId: "g_0", durationFrames: 450 }] }).retryHeadroom).toBe(0);
  expect(() => quoteFacelessImage({ ...base, assets: [style, ...generated, { id: "g_12", role: "scene", source: { kind: "generated", prompt: "Extra", styleId: "style" } }], scenes: [...scenes, { id: "end", assetId: "g_12", durationFrames: 450 }] })).toThrow();
});
it("counts a reused supplied or generated asset once while preserving scene order", () => {
  const plan = { ...base, assets: [supplied, { id: "style", role: "style", source: { kind: "supplied", url: "https://example.com/style.png" } }, { id: "g", role: "scene", source: { kind: "generated", prompt: "A bridge", styleId: "style" } }], scenes: [
    { id: "a", assetId: "frame_a", durationFrames: 25 }, { id: "b", assetId: "g", durationFrames: 25 },
    { id: "c", assetId: "g", durationFrames: 25 }, { id: "d", assetId: "frame_a", durationFrames: 25 }] };
  expect(quoteFacelessImage(plan)).toMatchObject({ baseGeneratedImages: 1, sceneSources: [
    { sceneId: "a", assetId: "frame_a", sourceKind: "supplied" }, { sceneId: "b", assetId: "g", sourceKind: "generated" },
    { sceneId: "c", assetId: "g", sourceKind: "generated" }, { sceneId: "d", assetId: "frame_a", sourceKind: "supplied" }] });
});
it("rejects VIDEO and unknown fields", () => {
  expect(() => parseFacelessImagePlan({ ...base, assets: [{ ...supplied, source: { kind: "video", url: "https://example.com/a.mp4" } }] })).toThrow();
  expect(() => parseFacelessImagePlan({ ...base, scenes: [{ ...base.scenes[0], videoUrl: "https://example.com/a.mp4" }] })).toThrow();
});
it("rejects duplicate, unknown, and unreferenced IDs", () => {
  expect(() => parseFacelessImagePlan({ ...base, assets: [supplied, supplied] })).toThrow();
  expect(() => parseFacelessImagePlan({ ...base, scenes: [{ ...base.scenes[0], assetId: "missing" }] })).toThrow();
  expect(() => parseFacelessImagePlan({ ...base, assets: [supplied, { ...supplied, id: "unused" }] })).toThrow();
  expect(() => parseFacelessImagePlan({ ...base, scenes: [base.scenes[0], base.scenes[0]] })).toThrow();
});
it("rejects invalid references, policy, motion, frames, and supplied URLs", () => {
  const sceneAsset = { id: "g", role: "scene", source: { kind: "generated", prompt: "Forest", styleId: "frame_a", characterIds: ["frame_a"] } };
  expect(() => parseFacelessImagePlan({ ...base, assets: [supplied, sceneAsset], scenes: [{ id: "s", assetId: "g", durationFrames: 25 }] })).toThrow();
  expect(() => parseFacelessImagePlan({ ...base, assets: [{ ...supplied, role: "style" }] })).toThrow();
  expect(() => parseFacelessImagePlan({ ...base, assets: [{ ...supplied, source: { kind: "supplied", url: "http://example.com/a.png" } }] })).toThrow();
  expect(() => parseFacelessImagePlan({ ...base, scenes: [{ ...base.scenes[0], durationFrames: 0 }] })).toThrow();
  expect(() => parseFacelessImagePlan({ ...base, scenes: [{ ...base.scenes[0], motion: { direction: "left", amount: 0.5 } }] })).toThrow();
});
it("rejects scene-only references on generated style assets", () => {
  const style = { id: "style", role: "style", source: { kind: "generated", prompt: "Sepia", characterIds: ["missing"] } };
  const frame = { id: "frame", role: "scene", source: { kind: "generated", prompt: "Train", styleId: "style" } };
  expect(() => parseFacelessImagePlan({ ...base, assets: [style, frame], scenes: [{ id: "scene_1", assetId: "frame", durationFrames: 250 }] })).toThrow();
});
it("requires generated scenes to share one style anchor", () => {
  const assets = [
    { id: "style_a", role: "style", source: { kind: "supplied", url: "https://example.com/a.png" } },
    { id: "style_b", role: "style", source: { kind: "supplied", url: "https://example.com/b.png" } },
    { id: "frame_a", role: "scene", source: { kind: "generated", prompt: "First scene", styleId: "style_a" } },
    { id: "frame_b", role: "scene", source: { kind: "generated", prompt: "Second scene", styleId: "style_b" } },
  ];
  const scenes = [{ id: "first", assetId: "frame_a", durationFrames: 125 }, { id: "second", assetId: "frame_b", durationFrames: 125 }];
  expect(() => parseFacelessImagePlan({ ...base, assets, scenes })).toThrow();
});
it("enforces duration and generated-image ceilings in the parser", () => {
  expect(parseFacelessImagePlan({ ...base, scenes: [{ id: "s", assetId: "frame_a", durationFrames: 7500 }] }).scenes).toHaveLength(1);
  expect(() => parseFacelessImagePlan({ ...base, scenes: [{ id: "s", assetId: "frame_a", durationFrames: 7525 }] })).toThrow();
  const style = { id: "style", role: "style", source: { kind: "supplied", url: "https://example.com/style.png" } };
  const generated = Array.from({ length: 13 }, (_, i) => ({ id: `g_${i}`, role: "scene", source: { kind: "generated", prompt: `Scene ${i}`, styleId: "style" } }));
  const scenes = generated.map((asset, i) => ({ id: `s_${i}`, assetId: asset.id, durationFrames: i === 12 ? 450 : 25 }));
  expect(parseFacelessImagePlan({ ...base, assets: [style, ...generated.slice(0, 12)], scenes: [...scenes.slice(0, 12), { id: "last", assetId: "g_0", durationFrames: 450 }] }).assets).toHaveLength(13);
  expect(() => parseFacelessImagePlan({ ...base, assets: [style, ...generated], scenes })).toThrow();
});
it("includes the frozen output geometry in the shadow quote", () => {
  expect(quoteFacelessImage(base)).toMatchObject({ aspectRatio: "9:16", resolution: "1080p" });
});
it("returns repeatable JSON and explicit zero paid-operation caps", () => {
  const first = quoteFacelessImage(base);
  expect(JSON.stringify(quoteFacelessImage(base))).toBe(JSON.stringify(first));
  expect(first).toMatchObject({ pricingVersion: "faceless-image-v1-shadow", customerCreditCeiling: 200, maxPaidAttempts: 0, maxUsdSpend: 0 });
});


it.each(["mp4", "mov", "webm", "gif", "webp", "svg"])("refuses supplied %s URLs even with image-like query strings", extension => {
  const url = `https://example.com/clip.${extension}?filename=frame.png`;
  expect(() => quoteFacelessImage({ ...base, assets: [{ ...supplied, source: { kind: "supplied", url } }] })).toThrow();
});
it.each(["png", "jpg", "jpeg", "PNG", "JPEG"])("accepts signed HTTPS %s image paths without fetching remote bytes", extension => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  try {
    const url = `https://example.com/uploads/frame.${extension}?signature=fixture`;
    expect(quoteFacelessImage({ ...base, assets: [{ ...supplied, source: { kind: "supplied", url } }] }).credits).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
});
it("refuses extensionless sources and bounds URL length including signed queries", () => {
  const input = (url: string) => ({ ...base, assets: [{ ...supplied, source: { kind: "supplied", url } }] });
  expect(() => quoteFacelessImage(input("https://example.com/image?filename=a.png"))).toThrow();
});
it("bounds URL length including signed queries", () => {
  const input = (url: string) => ({ ...base, assets: [{ ...supplied, source: { kind: "supplied", url } }] });
  const prefix = "https://example.com/a.png?signature=";
  expect(quoteFacelessImage(input(prefix + "a".repeat(2048 - prefix.length))).credits).toBe(200);
  expect(() => quoteFacelessImage(input(prefix + "a".repeat(2049 - prefix.length)))).toThrow();
});
it("quotes scripts at the renderer's default speech limit and refuses one character over", () => {
  expect(quoteFacelessImage({ ...base, script: "a".repeat(5000) }).credits).toBe(200);
  expect(() => quoteFacelessImage({ ...base, script: "a".repeat(5001) })).toThrow();
});
it("counts normalized Russian stress marks against the speech limit", () => {
  expect(() => quoteFacelessImage({ ...base, script: "a".repeat(4994) + " потОм" })).toThrow();
});
