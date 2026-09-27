import { describe, expect, it } from "vitest";
import { z } from "zod";
import { API_ENDPOINTS } from "./endpoints.js";
import {
  FACELESS_QUOTE_PATH, FACELESS_RUN_PATH, makeFacelessInput, facelessPlannerInput, facelessQuoteResponse,
  offeredFacelessInputShape,
} from "./faceless-public.js";
import { run } from "./runs.js";
import { parseSkill } from "./skills.js";

const script = { input_mode: "script", script: "A clear story with spoken words.", duration_seconds: 30 };
const brief = { input_mode: "brief", brief: "Explain how the product works.", duration_seconds: 90 };

describe("makeFacelessInput", () => {
  it("accepts script and brief modes and defaults captions on", () => {
    expect(makeFacelessInput.parse(script).captions).toBe(true);
    expect(makeFacelessInput.parse(brief).captions).toBe(true);
  });

  it("accepts qualified references and anchored customer scene images", () => {
    const parsed = makeFacelessInput.parse({ ...script,
      style_reference: "https://example.com/style.png",
      character_reference: "https://example.com/character.jpg",
      scene_images: [{ image_url: "https://example.com/scene.png", anchor: { quote: "clear story" } }],
    });
    expect(parsed.scene_images?.[0]?.anchor).toEqual({ quote: "clear story" });
  });

  it.each([
    {}, { ...script, brief: "another input" }, { ...brief, script: "another input" },
    { ...brief, brief: "" }, { ...brief, brief: "   " },
    { ...script, script: "" }, { ...script, script: "   " },
    { ...script, duration_seconds: 29.96 }, { ...script, duration_seconds: 90.04 },
    { ...script, duration_seconds: 30.001 },
    { ...script, style_reference: "http://example.com/style.png" },
    { ...script, scene_images: [{ image_url: "https://localhost/photo.png", anchor: { quote: "clear" } }] },
    { ...script, scene_images: [{ image_url: "https://example.com/scene.png" }] },
    { ...script, unknown_field: true },
  ])("rejects invalid input: %j", (input) => {
    expect(makeFacelessInput.safeParse(input).success).toBe(false);
  });
});

it("the faceless client paths are declared in the endpoint registry", () => {
  const paths = API_ENDPOINTS.map((endpoint) => endpoint.path);
  expect(paths).toContain(FACELESS_QUOTE_PATH);
  expect(paths).toContain(FACELESS_RUN_PATH);
});

describe("offeredFacelessInputShape (flat MCP form)", () => {
  const flat = z.object(offeredFacelessInputShape).strict();
  const viaFlat = (input: unknown) => {
    const offered = flat.safeParse(input);
    return offered.success ? makeFacelessInput.safeParse(offered.data) : offered;
  };

  it("offers exactly the fields of both union branches", () => {
    const branchKeys = makeFacelessInput.options.flatMap((option) => Object.keys(option.shape));
    expect(Object.keys(offeredFacelessInputShape).sort()).toEqual([...new Set(branchKeys)].sort());
  });

  it.each([
    script, brief, { ...script, captions: false }, { ...brief, duration_seconds: 45.04 },
    { ...script,
      style_reference: "https://example.com/style.png",
      character_reference: "https://example.com/character.jpg",
      scene_images: [{ image_url: "https://example.com/scene.png", anchor: { startWord: 0, endWord: 2 } }] },
  ])("passes valid input unchanged into the union: %j", (input) => {
    const result = viaFlat(input);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(makeFacelessInput.parse(input));
  });

  it.each([
    { ...script, brief: "another input" }, { ...brief, script: "another input" },
    { input_mode: "script", brief: "only a brief", duration_seconds: 30 },
    { input_mode: "brief", script: "only a script", duration_seconds: 30 },
    { input_mode: "story", script: "x", duration_seconds: 30 },
    { ...script, duration_seconds: 30.001 }, { ...script, unknown_field: true },
  ])("rejects what the union rejects: %j", (input) => {
    expect(makeFacelessInput.safeParse(input).success).toBe(false);
    expect(viaFlat(input).success).toBe(false);
  });
});

describe("faceless shared contracts", () => {
  it("requires word timing even with captions off", () => {
    const plan = { script: "A clear story", outputFrames: 750, captions: false };
    expect(facelessPlannerInput.safeParse(plan).success).toBe(false);
    expect(facelessPlannerInput.safeParse({ ...plan, words: [
      { word: "A", startSec: 0, endSec: 0.2 },
      { word: "clear", startSec: 0.2, endSec: 0.6 },
      { word: "story", startSec: 0.6, endSec: 1 },
    ] }).success).toBe(true);
  });

  it("recognizes the skill and exposes a quote with warnings and version", () => {
    expect(parseSkill("make_faceless")).toBe("make_faceless");
    expect(facelessQuoteResponse.parse({ skill: "make_faceless", outputFrames: 750,
      baseCredits: 200, openerCredits: 150, totalCredits: 350,
      tariffId: "faceless-image-i2v-v1", captions: false,
      warnings: [], contract_version: "1",
    }).totalCredits).toBe(350);
  });

  it("keeps a faceless billing summary on the shared run", () => {
    const parsed = run.parse({ run_id: "run_abc", skill: "make_faceless", state: "succeeded",
      credits_reserved: 350, credits_charged: 350, error: null,
      final_output: null, created_at: "2026-09-25T10:00:00.000Z", finished_at: "2026-09-25T10:02:00.000Z",
      faceless_billing: { outputFrames: 750, baseCredits: 200, openerCredits: 150,
        totalCredits: 350, tariffId: "faceless-image-i2v-v1", captions: true },
    });
    expect(parsed.faceless_billing?.totalCredits).toBe(350);
  });
});
