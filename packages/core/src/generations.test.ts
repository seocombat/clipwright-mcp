import { describe, expect, it } from "vitest";

import {
  findCapabilityRow,
  GENERATION_CAPABILITIES,
  GENERATION_IMAGE_MODELS,
  GENERATION_VIDEO_MODELS,
  generateImageRequest,
  generateVideoRequest,
  generationModels,
  listGenerationModels,
  priceGeneration,
  type GenerateVideoRequest,
} from "./generations.js";
import { runGeneration } from "./generations-output.js";
import { API_ENDPOINTS, endpointLabel } from "./endpoints.js";

const UPLOAD = "upl_" + "a".repeat(32);
const video = (overrides: Partial<GenerateVideoRequest> = {}): GenerateVideoRequest => ({
  prompt: "a lighthouse at dusk", model: "seedance-2.0-mini", mode: "text", aspect_ratio: "9:16", resolution: "720p", duration_s: 4,
  ...overrides,
});

// D0, owner 19.10: per image, and per second of video.
const D0_IMAGE = { "seedream-5.0-flash": 12, flare: 18 } as const;
const D0_VIDEO: Record<string, Partial<Record<string, number>>> = {
  "seedance-2.0-mini": { "480p": 25, "720p": 50 },
  "seedance-2.0-fast": { "480p": 35, "720p": 80 },
  "seedance-2.0": { "480p": 45, "720p": 100, "1080p": 250 },
  "seedance-2.5": { "480p": 70, "720p": 150, "1080p": 380 },
};

describe("capability table", () => {
  it("prices every row by D0", () => {
    for (const model of GENERATION_IMAGE_MODELS) {
      for (const row of GENERATION_CAPABILITIES[model].rows) expect(row.unit_credits, model).toBe(D0_IMAGE[model]);
    }
    for (const model of GENERATION_VIDEO_MODELS) {
      for (const row of GENERATION_CAPABILITIES[model].rows) expect(row.unit_credits, `${model} ${row.resolution}`).toBe(D0_VIDEO[model]![row.resolution]);
      expect(Object.keys(D0_VIDEO[model]!).sort()).toEqual([...new Set(GENERATION_CAPABILITIES[model].rows.map((row) => row.resolution))].sort());
    }
  });

  it("marks measured exactly the rows measured live on 19.10", () => {
    const measured = Object.entries(GENERATION_CAPABILITIES).flatMap(([model, capability]) =>
      capability.rows.filter((row) => row.measured).map((row) =>
        `${model} ${row.aspect_ratio} ${"resolution" in row ? row.resolution : "-"} ${row.width}x${row.height}`));
    expect(measured.sort()).toEqual([
      "flare 9:16 - 1008x1792",
      "seedance-2.0 16:9 1080p 1920x1080",
      "seedance-2.0 9:16 1080p 1080x1920",
      "seedance-2.0 9:16 720p 720x1280",
      "seedance-2.0-fast 9:16 720p 720x1280",
      "seedance-2.0-mini 16:9 720p 1280x720",
      "seedance-2.0-mini 9:16 480p 496x864",
      "seedance-2.0-mini 9:16 720p 720x1280",
      "seedance-2.5 9:16 1080p 1080x1920",
      "seedance-2.5 9:16 720p 720x1280",
      "seedream-5.0-flash 16:9 - 2560x1440",
      "seedream-5.0-flash 1:1 - 2048x2048",
      "seedream-5.0-flash 9:16 - 1440x2560",
    ]);
  });

  it("states the probed codec of every measured video row and 24 fps", () => {
    for (const model of GENERATION_VIDEO_MODELS) {
      const capability = GENERATION_CAPABILITIES[model];
      expect(capability.fps).toBe(24);
      for (const row of capability.rows.filter((one) => one.measured)) {
        const tenBit = model === "seedance-2.5" && row.resolution === "1080p";
        expect([row.codec, row.pix_fmt]).toEqual(tenBit ? ["hevc", "yuv420p10le"] : ["h264", "yuv420p"]);
        expect(row.warning !== undefined).toBe(tenBit || row.resolution === "480p");
      }
    }
  });

  it("names the vendor model ids and duration bounds", () => {
    expect(GENERATION_CAPABILITIES["seedance-2.0-fast"].vendor_model).toBe("dreamina-seedance-2-0-fast-260128");
    expect(GENERATION_CAPABILITIES["seedance-2.5"].duration_s).toEqual({ min: 4, max: 30 });
    expect(GENERATION_CAPABILITIES["seedance-2.0"].duration_s).toEqual({ min: 4, max: 15 });
    expect(GENERATION_CAPABILITIES.flare.vendor_model.reference).toBe("openai/gpt-image-2.5/flare/edit");
  });

  it("is frozen to the rows", () => {
    expect(Object.isFrozen(GENERATION_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(GENERATION_CAPABILITIES["seedance-2.0"].rows[0])).toBe(true);
  });
});

describe("findCapabilityRow and priceGeneration", () => {
  it("prices measured rows from the table", () => {
    expect(priceGeneration(video())).toEqual({ unit_credits: 50, units: 4, credits: 200 });
    expect(priceGeneration(video({ model: "seedance-2.0", resolution: "1080p", duration_s: 15 }))).toEqual({ unit_credits: 250, units: 15, credits: 3750 });
    expect(priceGeneration({ prompt: "x", model: "flare", aspect_ratio: "9:16" })).toEqual({ unit_credits: 18, units: 1, credits: 18 });
    expect(priceGeneration({ prompt: "x", model: "seedream-5.0-flash", aspect_ratio: "9:16" })).toEqual({ unit_credits: 12, units: 1, credits: 12 });
  });

  it.each([
    ["unmeasured 16:9 video", video({ model: "seedance-2.0-fast", aspect_ratio: "16:9" })],
    ["unmeasured 480p draft", video({ model: "seedance-2.0-fast", resolution: "480p" })],
    ["mini at 1080p, a row that does not exist", video({ resolution: "1080p" })],
    ["seedance 2.5 text mode", video({ model: "seedance-2.5" })],
    ["unmeasured reference mode", video({ model: "seedance-2.0", mode: "reference", references: [{ run_id: "run_abc" }] })],
    ["duration past the model's bound", video({ duration_s: 16 })],
  ])("refuses %s", (_name, request) => {
    expect(findCapabilityRow(request)).toBeNull();
    expect(priceGeneration(request)).toBeNull();
  });

  it.each(["16:9", "1:1"] as const)("refuses an unmeasured %s image", (aspect_ratio) => {
    expect(findCapabilityRow({ prompt: "x", model: "flare", aspect_ratio })).toBeNull();
  });
});

describe("request schemas", () => {
  it("are strict: visible_ai_label and an audio switch are refused", () => {
    expect(generateVideoRequest.safeParse({ ...video(), visible_ai_label: false }).success).toBe(false);
    expect(generateVideoRequest.safeParse({ ...video(), generate_audio: true }).success).toBe(false);
    expect(generateImageRequest.safeParse({ prompt: "x", model: "flare", aspect_ratio: "9:16", visible_ai_label: true }).success).toBe(false);
  });

  it("requires a resolution", () => {
    const { resolution: _omitted, ...rest } = video();
    expect(generateVideoRequest.safeParse(rest).success).toBe(false);
    expect(generateVideoRequest.safeParse(video()).success).toBe(true);
  });

  it("bounds the duration per model", () => {
    expect(generateVideoRequest.safeParse(video({ duration_s: 3 })).success).toBe(false);
    expect(generateVideoRequest.safeParse(video({ duration_s: 15 })).success).toBe(true);
    expect(generateVideoRequest.safeParse(video({ duration_s: 16 })).success).toBe(false);
    expect(generateVideoRequest.safeParse(video({ model: "seedance-2.5", duration_s: 30 })).success).toBe(true);
    expect(generateVideoRequest.safeParse(video({ model: "seedance-2.5", duration_s: 31 })).success).toBe(false);
    expect(generateVideoRequest.safeParse(video({ duration_s: 4.5 })).success).toBe(false);
  });

  it("ties frames and references to their mode", () => {
    const frame = { run_id: "run_abc" };
    expect(generateVideoRequest.safeParse(video({ mode: "first_frame", first_frame: frame, last_frame: frame })).success).toBe(true);
    expect(generateVideoRequest.safeParse(video({ mode: "first_frame" })).success).toBe(false);
    expect(generateVideoRequest.safeParse(video({ first_frame: frame })).success).toBe(false);
    expect(generateVideoRequest.safeParse(video({ mode: "reference", references: [frame, frame] })).success).toBe(true);
    expect(generateVideoRequest.safeParse(video({ mode: "reference" })).success).toBe(false);
    expect(generateVideoRequest.safeParse(video({ mode: "reference", references: [] })).success).toBe(false);
    expect(generateVideoRequest.safeParse(video({ references: [frame] })).success).toBe(false);
  });

  it("takes 0 to 4 image references, an upload only with rights confirmed", () => {
    const base = { prompt: "x", model: "flare", aspect_ratio: "9:16" };
    const upload = { upload_id: UPLOAD, rights_confirmed: true };
    expect(generateImageRequest.safeParse(base).success).toBe(true);
    expect(generateImageRequest.safeParse({ ...base, references: [upload, upload, upload, { run_id: "run_x" }] }).success).toBe(true);
    expect(generateImageRequest.safeParse({ ...base, references: Array(5).fill(upload) }).success).toBe(false);
    expect(generateImageRequest.safeParse({ ...base, references: [{ upload_id: UPLOAD }] }).success).toBe(false);
    expect(generateImageRequest.safeParse({ ...base, references: [{ upload_id: UPLOAD, rights_confirmed: false }] }).success).toBe(false);
  });
});

describe("models list", () => {
  it("shows only measured rows and modes, without vendors", () => {
    const listed = generationModels.parse({ models: listGenerationModels(), contract_version: "test" }).models;
    expect(listed.map((one) => one.model)).toEqual(["seedream-5.0-flash", "flare", "seedance-2.0", "seedance-2.0-mini", "seedance-2.0-fast", "seedance-2.5"]);
    expect(listed.find((one) => one.model === "seedance-2.0")).toEqual({
      model: "seedance-2.0", kind: "video", unit: "second", modes: ["text", "first_frame"], duration_s: { min: 4, max: 15 }, max_references: 0,
      rows: [
        { aspect_ratio: "9:16", resolution: "720p", width: 720, height: 1280, unit_credits: 100 },
        { aspect_ratio: "9:16", resolution: "1080p", width: 1080, height: 1920, unit_credits: 250 },
        { aspect_ratio: "16:9", resolution: "1080p", width: 1920, height: 1080, unit_credits: 250 },
      ],
    });
    expect(listed.find((one) => one.model === "seedance-2.5")?.modes).toEqual(["first_frame"]);
    expect(JSON.stringify(listed)).not.toMatch(/byteplus|fal|dreamina|seedream-5-0|gpt-image/);
  });
});

describe("registry rows", () => {
  it("declares the models list, both quotes free and both runs billed, all reachable over MCP", () => {
    const rows = API_ENDPOINTS.filter((row) => row.path.includes("generat"));
    expect(rows.map((row) => [endpointLabel(row), row.billed, row.mcp, row.cabinet, row.onQuickstart])).toEqual([
      ["GET /v1/generations/models", false, true, false, false],
      ["POST /v1/skills/generate_image/quote", false, true, false, false],
      ["POST /v1/skills/generate_image/run", true, true, false, false],
      ["POST /v1/skills/generate_video/quote", false, true, false, false],
      ["POST /v1/skills/generate_video/run", true, true, false, false],
    ]);
  });
});

describe("run generation block", () => {
  it("parses an image and a clip", () => {
    const base = { url: "https://r2.example/x", mime: "image/png", width: 1440, height: 2560, reusable_until: "2026-11-18T00:00:00.000Z" };
    expect(runGeneration.safeParse({ ...base, kind: "image", model: "seedream-5.0-flash", duration_s: null }).success).toBe(true);
    expect(runGeneration.safeParse({ ...base, kind: "video", model: "seedance-2.0", mime: "video/mp4", duration_s: 4.04 }).success).toBe(true);
    expect(runGeneration.safeParse({ ...base, kind: "audio", model: "x", duration_s: null }).success).toBe(false);
  });
});
