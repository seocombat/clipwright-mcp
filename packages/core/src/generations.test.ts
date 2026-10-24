import { describe, expect, it } from "vitest";

import {
  findCapabilityRow,
  GENERATION_CAPABILITIES,
  GENERATION_IMAGE_MODELS,
  GENERATION_VIDEO_MODELS,
  GENERATION_VIDEO_MODES,
  generateImageRequest,
  generateVideoRequest,
  generationModels,
  listGenerationModels,
  priceGeneration,
  type GenerateVideoRequest,
} from "./generations.js";
import * as generationsModule from "./generations.js";
import { runGeneration } from "./generations-output.js";
import { API_ENDPOINTS, endpointLabel } from "./endpoints.js";

const UPLOAD = "upl_" + "a".repeat(32);
const video = (overrides: Partial<GenerateVideoRequest> = {}): GenerateVideoRequest => ({
  prompt: "a lighthouse at dusk", model: "seedance-2.0-mini", mode: "text", aspect_ratio: "9:16", resolution: "720p", duration_s: 4,
  ...overrides,
});

// D1 of #761 (owner 21.10): credits per image and per second; service-core's pricing test derives the same numbers.
const D1_IMAGE = { "seedream-5.0-flash": 5, flare: 6 } as const;
const D1_VIDEO: Record<string, Partial<Record<string, number>>> = {
  "seedance-2.0-mini": { "480p": 5, "720p": 10 },
  "seedance-2.0-fast": { "480p": 14, "720p": 30 },
  "seedance-2.0": { "480p": 18, "720p": 36, "1080p": 91 },
  "seedance-2.5": { "480p": 25, "720p": 56, "1080p": 138 },
  "kling-3.0": { "720p": 17 },
  "gemini-omni-flash-1.1": { "360p": 19, "720p": 19 },
};

describe("capability table", () => {
  it("prices every row by D1, one price per resolution", () => {
    for (const model of GENERATION_IMAGE_MODELS) {
      for (const row of GENERATION_CAPABILITIES[model].rows) expect(row.unit_credits, model).toBe(D1_IMAGE[model]);
    }
    expect(Object.keys(D1_VIDEO).sort()).toEqual([...GENERATION_VIDEO_MODELS].sort());
    for (const model of GENERATION_VIDEO_MODELS) {
      const prices = D1_VIDEO[model]!;
      for (const row of GENERATION_CAPABILITIES[model].rows) expect(row.unit_credits, `${model} ${row.resolution}`).toBe(prices[row.resolution]);
      expect(Object.keys(prices).sort()).toEqual([...new Set(GENERATION_CAPABILITIES[model].rows.map((row) => row.resolution))].sort());
    }
  });

  it("orders the routes by the owner's 21.10 decision and serves every row only from a route it lists", () => {
    const routes = Object.fromEntries(GENERATION_VIDEO_MODELS.map((model) =>
      [model, GENERATION_CAPABILITIES[model].routes.map((route) => `${route.vendor} ${route.vendor_model}`)]));
    expect(routes).toEqual({
      "seedance-2.0": ["byteplus dreamina-seedance-2-0-260128", "kie bytedance/seedance-2"],
      "seedance-2.0-mini": ["kie bytedance/seedance-2-mini", "byteplus dreamina-seedance-2-0-mini-260615"],
      "seedance-2.0-fast": ["byteplus dreamina-seedance-2-0-fast-260128"],
      "seedance-2.5": ["byteplus dreamina-seedance-2-5-260628", "kie bytedance/seedance-2-5"],
      "kling-3.0": ["kie kling-3.0/video"],
      "gemini-omni-flash-1.1": ["kie google/gemini-omni-flash-1-1"],
    });
    // kie serves exactly the rows it made live on 21.10; every other Seedance row is BytePlus only.
    const KIE_ROWS: Record<string, string[]> = {
      "seedance-2.0 9:16 720p": ["byteplus", "kie"],
      "seedance-2.0-mini 9:16 480p": ["kie", "byteplus"],
      "seedance-2.0-mini 16:9 480p": ["kie", "byteplus"],
      "seedance-2.0-mini 9:16 720p": ["kie", "byteplus"],
      "seedance-2.0-mini 16:9 720p": ["kie", "byteplus"],
      "seedance-2.5 9:16 480p": ["byteplus", "kie"],
      "seedance-2.5 16:9 720p": ["byteplus", "kie"],
      "kling-3.0 9:16 720p": ["kie"],
      "kling-3.0 16:9 720p": ["kie"],
      "gemini-omni-flash-1.1 16:9 360p": ["kie"],
      "gemini-omni-flash-1.1 9:16 360p": [],
      "gemini-omni-flash-1.1 9:16 720p": ["kie"],
      "gemini-omni-flash-1.1 16:9 720p": ["kie"],
    };
    for (const model of GENERATION_VIDEO_MODELS) {
      const capability = GENERATION_CAPABILITIES[model];
      for (const row of capability.rows) {
        const name = `${model} ${row.aspect_ratio} ${row.resolution}`;
        for (const vendor of row.vendors) expect(capability.routes.map((route) => route.vendor), model).toContain(vendor);
        expect(row.vendors, name).toEqual(KIE_ROWS[name] ?? ["byteplus"]);
        if (row.measured) expect(row.vendors.length, name).toBeGreaterThan(0);
      }
    }
  });

  it("marks measured exactly the rows measured live on 19.10 and 21.10", () => {
    const measured = Object.entries(GENERATION_CAPABILITIES).flatMap(([model, capability]) =>
      capability.rows.filter((row) => row.measured).map((row) =>
        `${model} ${row.aspect_ratio} ${"resolution" in row ? row.resolution : "-"} ${row.width}x${row.height}`));
    expect(measured.sort()).toEqual([
      "flare 9:16 - 1008x1792",
      "gemini-omni-flash-1.1 16:9 360p 640x360",
      "gemini-omni-flash-1.1 16:9 720p 1280x720",
      "gemini-omni-flash-1.1 9:16 720p 720x1280",
      "kling-3.0 16:9 720p 1280x720",
      "kling-3.0 9:16 720p 720x1280",
      "seedance-2.0 16:9 1080p 1920x1080",
      "seedance-2.0 16:9 480p 864x496",
      "seedance-2.0 16:9 720p 1280x720",
      "seedance-2.0 9:16 1080p 1080x1920",
      "seedance-2.0 9:16 480p 496x864",
      "seedance-2.0 9:16 720p 720x1280",
      "seedance-2.0-fast 16:9 480p 864x496",
      "seedance-2.0-fast 16:9 720p 1280x720",
      "seedance-2.0-fast 9:16 480p 496x864",
      "seedance-2.0-fast 9:16 720p 720x1280",
      "seedance-2.0-mini 16:9 480p 864x496",
      "seedance-2.0-mini 16:9 720p 1280x720",
      "seedance-2.0-mini 9:16 480p 496x864",
      "seedance-2.0-mini 9:16 720p 720x1280",
      "seedance-2.5 16:9 480p 854x480",
      "seedance-2.5 16:9 720p 1280x720",
      "seedance-2.5 9:16 1080p 1080x1920",
      "seedance-2.5 9:16 480p 480x854",
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
        // 2.0's 496x864 draft (Mini, Fast and 2.0) is off its format, told per aspect; 2.5's 480p is a true 480x854.
        const draft = model !== "seedance-2.5" && row.resolution === "480p";
        expect(row.warning !== undefined, `${model} ${row.resolution}`).toBe(tenBit || draft);
        if (draft) expect(row.warning, `${model} ${row.aspect_ratio}`).toContain(`${row.width}x${row.height} (2.`);
        if (draft) expect(row.warning, `${model} ${row.aspect_ratio}`).toContain(`off ${row.aspect_ratio}`);
      }
    }
  });

  it("names the vendor model ids and duration bounds", () => {
    expect(GENERATION_CAPABILITIES["seedance-2.0-fast"].routes).toEqual([{ vendor: "byteplus", vendor_model: "dreamina-seedance-2-0-fast-260128" }]);
    expect(GENERATION_CAPABILITIES["seedance-2.5"].duration_s).toEqual({ min: 4, max: 30 });
    expect(GENERATION_CAPABILITIES["gemini-omni-flash-1.1"].duration_values).toEqual([4, 6, 8, 10]);
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
    expect(priceGeneration(video())).toEqual({ unit_credits: 10, units: 4, credits: 40 });
    expect(priceGeneration(video({ camera: "pan" }))).toEqual({ unit_credits: 10, units: 4, credits: 40 });
    expect(priceGeneration(video({ model: "seedance-2.0", resolution: "1080p", duration_s: 15 }))).toEqual({ unit_credits: 91, units: 15, credits: 1365 });
    expect(priceGeneration({ prompt: "x", model: "flare", aspect_ratio: "9:16" })).toEqual({ unit_credits: 6, units: 1, credits: 6 });
    expect(priceGeneration({ prompt: "x", model: "seedream-5.0-flash", aspect_ratio: "9:16" })).toEqual({ unit_credits: 5, units: 1, credits: 5 });
  });

  it.each([
    ["unmeasured 16:9 video", video({ model: "seedance-2.5", mode: "first_frame", first_frame: { run_id: "run_abc" }, aspect_ratio: "16:9",
      resolution: "1080p" })],
    ["mini at 1080p, a row that does not exist", video({ resolution: "1080p" })],
    ["seedance 2.5 text mode", video({ model: "seedance-2.5" })],
    ["unmeasured reference mode", video({ model: "seedance-2.0", mode: "reference", references: [{ run_id: "run_abc" }] })],
    ["duration past the model's bound", video({ duration_s: 16 })],
    ["kling 3.0 at 1080p, a row that does not exist", video({ model: "kling-3.0", resolution: "1080p" })],
    ["omni flash at 360p 9:16, not measured", video({ model: "gemini-omni-flash-1.1", resolution: "360p" })],
  ])("refuses %s", (_name, request) => {
    expect(findCapabilityRow(request)).toBeNull();
    expect(priceGeneration(request)).toBeNull();
  });

  // Mutant: check only the range in `findCapabilityRow`, and a 5 s Omni clip that skips the schema is priced.
  it("prices Omni only at its listed lengths, past the schema too", () => {
    const omni = (duration_s: number) => video({ model: "gemini-omni-flash-1.1", duration_s });
    expect(priceGeneration(omni(4))).toEqual({ unit_credits: 19, units: 4, credits: 76 });
    expect(priceGeneration(omni(10))).toEqual({ unit_credits: 19, units: 10, credits: 190 });
    expect(findCapabilityRow(omni(5))).toBeNull();
    expect(priceGeneration(video({ model: "kling-3.0", aspect_ratio: "16:9" }))).toEqual({ unit_credits: 17, units: 4, credits: 68 });
  });

  it.each(["16:9", "1:1"] as const)("refuses an unmeasured %s image", (aspect_ratio) => {
    expect(findCapabilityRow({ prompt: "x", model: "flare", aspect_ratio })).toBeNull();
  });

  // Mutant: `Math.max(4, request.duration_s)` in `priceGeneration`, and a 3 s Kling clip is billed four seconds.
  it("prices every allowed length of every video model at one unit a second, on an open row", () => {
    for (const model of GENERATION_VIDEO_MODELS) {
      const capability = GENERATION_CAPABILITIES[model];
      const { min, max } = capability.duration_s;
      const durations = capability.duration_values ?? Array.from({ length: max - min + 1 }, (_, index) => min + index);
      const mode = GENERATION_VIDEO_MODES.find((one) => capability.modes[one])!;
      const row = capability.rows.find((one) => one.measured)!;
      for (const duration_s of durations) {
        const price = priceGeneration({ prompt: "x", model, mode, aspect_ratio: row.aspect_ratio, resolution: row.resolution, duration_s });
        expect(price, `${model} ${duration_s}s`).toEqual({ unit_credits: row.unit_credits, units: duration_s, credits: row.unit_credits * duration_s });
      }
    }
  });
});

describe("module surface", () => {
  // Mutant: export a pricing constant (say a markup) from this published module, and nothing else notices.
  it("exports exactly the known runtime names, so a new public export is a deliberate test change", () => {
    expect(Object.keys(generationsModule).sort()).toEqual([
      "GENERATE_IMAGE_QUOTE_PATH", "GENERATE_IMAGE_RUN_PATH", "GENERATE_VIDEO_QUOTE_PATH", "GENERATE_VIDEO_RUN_PATH", "GENERATION_CAMERAS",
      "GENERATION_CAPABILITIES", "GENERATION_IMAGE_ASPECTS", "GENERATION_IMAGE_MODELS", "GENERATION_MAX_REFERENCES", "GENERATION_MODELS_PATH",
      "GENERATION_PROMPT_MAX_CHARS", "GENERATION_RESOLUTIONS", "GENERATION_VIDEO_ASPECTS", "GENERATION_VIDEO_FPS", "GENERATION_VIDEO_MODELS",
      "GENERATION_VIDEO_MODES", "findCapabilityRow", "generateImageRequest", "generateVideoRequest", "generationModels", "generationQuote",
      "generationReference", "listGenerationModels", "priceGeneration",
    ].sort());
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

  // Mutant: check only the range, and a 5 s Omni clip passes the schema and the quote.
  it("takes only the listed lengths of a model that names them", () => {
    const omni = (duration_s: number) => video({ model: "gemini-omni-flash-1.1", duration_s });
    for (const seconds of [4, 6, 8, 10]) expect(generateVideoRequest.safeParse(omni(seconds)).success, `${seconds}`).toBe(true);
    for (const seconds of [3, 5, 7, 9, 11]) expect(generateVideoRequest.safeParse(omni(seconds)).success, `${seconds}`).toBe(false);
    expect(generateVideoRequest.safeParse(omni(5)).error?.issues[0]?.message).toBe("gemini-omni-flash-1.1 takes 4, 6, 8, 10 seconds");
  });

  it("takes an optional camera of four values, and nothing else", () => {
    for (const camera of ["static", "push_in", "pull_back", "pan"] as const) {
      expect(generateVideoRequest.parse(video({ camera })).camera).toBe(camera);
    }
    expect(generateVideoRequest.parse(video()).camera).toBeUndefined();
    expect(generateVideoRequest.safeParse({ ...video(), camera: "dolly_zoom" }).success).toBe(false);
    expect(generateImageRequest.safeParse({ prompt: "x", model: "flare", aspect_ratio: "9:16", camera: "static" }).success).toBe(false);
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
    expect(listed.map((one) => one.model)).toEqual(["seedream-5.0-flash", "flare", "seedance-2.0", "seedance-2.0-mini", "seedance-2.0-fast", "seedance-2.5",
      "kling-3.0", "gemini-omni-flash-1.1"]);
    expect(listed.find((one) => one.model === "seedance-2.0")).toEqual({
      model: "seedance-2.0", kind: "video", unit: "second", modes: ["text", "first_frame"], duration_s: { min: 4, max: 15 }, max_references: 0,
      rows: [
        { aspect_ratio: "9:16", resolution: "480p", width: 496, height: 864, unit_credits: 18 },
        { aspect_ratio: "16:9", resolution: "480p", width: 864, height: 496, unit_credits: 18 },
        { aspect_ratio: "9:16", resolution: "720p", width: 720, height: 1280, unit_credits: 36 },
        { aspect_ratio: "16:9", resolution: "720p", width: 1280, height: 720, unit_credits: 36 },
        { aspect_ratio: "9:16", resolution: "1080p", width: 1080, height: 1920, unit_credits: 91 },
        { aspect_ratio: "16:9", resolution: "1080p", width: 1920, height: 1080, unit_credits: 91 },
      ],
    });
    expect(listed.find((one) => one.model === "seedance-2.5")?.modes).toEqual(["first_frame"]);
    expect(JSON.stringify(listed)).not.toMatch(/byteplus|fal|kie|dreamina|bytedance|seedream-5-0|gpt-image|routes|vendors/);
    expect(listed.filter((one) => "duration_values" in one).map((one) => one.model)).toEqual(["gemini-omni-flash-1.1"]);
  });

  it("shows Kling and Omni with their measured rows and lengths, naming no vendor", () => {
    const listed = generationModels.parse({ models: listGenerationModels(), contract_version: "test" }).models;
    expect(listed.find((one) => one.model === "kling-3.0")).toEqual({
      model: "kling-3.0", kind: "video", unit: "second", modes: ["text", "first_frame"], duration_s: { min: 3, max: 15 }, max_references: 0,
      rows: [
        { aspect_ratio: "9:16", resolution: "720p", width: 720, height: 1280, unit_credits: 17 },
        { aspect_ratio: "16:9", resolution: "720p", width: 1280, height: 720, unit_credits: 17 },
      ],
    });
    expect(listed.find((one) => one.model === "gemini-omni-flash-1.1")).toEqual({
      model: "gemini-omni-flash-1.1", kind: "video", unit: "second", modes: ["text", "first_frame"], duration_s: { min: 4, max: 10 },
      duration_values: [4, 6, 8, 10], max_references: 0,
      rows: [
        { aspect_ratio: "16:9", resolution: "360p", width: 640, height: 360, unit_credits: 19 },
        { aspect_ratio: "9:16", resolution: "720p", width: 720, height: 1280, unit_credits: 19 },
        { aspect_ratio: "16:9", resolution: "720p", width: 1280, height: 720, unit_credits: 19 },
      ],
    });
    expect(listed.find((one) => one.model === "seedance-2.5")?.rows.map((row) => `${row.aspect_ratio} ${row.resolution}`))
      .toEqual(["9:16 480p", "16:9 480p", "9:16 720p", "16:9 720p", "9:16 1080p"]);
    for (const one of listed) expect(JSON.stringify(one), one.model).not.toMatch(/byteplus|kie|fal\b|google\/|kling-3\.0\/video|bytedance/);
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
