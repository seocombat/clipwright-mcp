import { describe, expect, it } from "vitest";

import {
  findCapabilityRow,
  GENERATION_CAMERAS,
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
import { templateMedia } from "./templates/slot.js";
import { API_ENDPOINTS, endpointLabel } from "./endpoints.js";

const UPLOAD = "upl_" + "a".repeat(32);
const video = (overrides: Partial<GenerateVideoRequest> = {}): GenerateVideoRequest => ({
  prompt: "a lighthouse at dusk", model: "seedance-2.0-mini", mode: "text", aspect_ratio: "9:16", resolution: "720p", duration_s: 4,
  ...overrides,
});

// D1 of #761 (owner 21.10): credits per image and per second; service-core's pricing test derives the same numbers. ×2.5 since 29.10
// (#800); ×1.3 since 30.10 (#935); on the Business credit from #938; 16.11 prices, Flare 18.11 (#1700), Seedream 5.5 from #1686.
const D1_IMAGE = { "seedream-5.0-flash": 5, "seedream-5.5": 17, flare: 7, "gemini-3-pro-image": 38, "gemini-nano-banana-2.1": 21 } as const;
const D1_VIDEO: Record<string, Partial<Record<string, number>>> = {
  "seedance-2.0-mini": { "480p": 5, "720p": 11 },
  "seedance-2.0-fast": { "480p": 15, "720p": 31 },
  "seedance-2.0": { "480p": 18, "720p": 38, "1080p": 94 },
  "seedance-2.5": { "480p": 26, "720p": 59, "1080p": 143 },
  "seedance-2.5-flash": { "480p": 17, "720p": 38 },
  "kling-3.0": { "720p": 19 },
  "kling-4.0": { "720p": 36, "1080p": 53 },
  "kling-4.0-flash": { "720p": 22 },
  "gemini-omni-flash-1.1": { "360p": 20, "720p": 20 },
  "gemini-omni-flash-1.2": { "360p": 5, "720p": 12 },
};

describe("capability table", () => {
  it("prices every row by D1, one price per resolution", () => {
    for (const model of GENERATION_IMAGE_MODELS) {
      // Flare's 21:9 board (#1686) costs its own measured $0.0597, so it has its own price; every other image row is the model's.
      for (const row of GENERATION_CAPABILITIES[model].rows) {
        expect(row.unit_credits, `${model} ${row.aspect_ratio}`).toBe(model === "flare" && row.aspect_ratio === "21:9" ? 16 : D1_IMAGE[model]);
      }
    }
    expect(Object.keys(D1_VIDEO).sort()).toEqual([...GENERATION_VIDEO_MODELS].sort());
    for (const model of GENERATION_VIDEO_MODELS) {
      const prices = D1_VIDEO[model]!;
      for (const row of GENERATION_CAPABILITIES[model].rows) expect(row.unit_credits, `${model} ${row.resolution}`).toBe(prices[row.resolution]);
      expect(Object.keys(prices).sort()).toEqual([...new Set(GENERATION_CAPABILITIES[model].rows.map((row) => row.resolution))].sort());
    }
  });

  it("marks measured exactly the rows measured live on 19.10 and 21.10", () => {
    const measured = Object.entries(GENERATION_CAPABILITIES).flatMap(([model, capability]) =>
      capability.rows.filter((row) => row.measured).map((row) =>
        `${model} ${row.aspect_ratio} ${"resolution" in row ? row.resolution : "-"} ${row.width}x${row.height}`));
    expect(measured.sort()).toEqual([
      "flare 21:9 - 2352x1008",
      "flare 9:16 - 1008x1792",
      "gemini-3-pro-image 16:9 - 2752x1536",
      "gemini-3-pro-image 1:1 - 2048x2048",
      "gemini-3-pro-image 9:16 - 1536x2752",
      "gemini-nano-banana-2.1 16:9 - 1376x768",
      "gemini-nano-banana-2.1 1:1 - 1024x1024",
      "gemini-nano-banana-2.1 9:16 - 768x1376",
      "gemini-omni-flash-1.1 16:9 360p 640x360",
      "gemini-omni-flash-1.1 16:9 720p 1280x720",
      "gemini-omni-flash-1.1 9:16 720p 720x1280",
      "gemini-omni-flash-1.2 16:9 720p 1280x720",
      "gemini-omni-flash-1.2 9:16 360p 360x640",
      "gemini-omni-flash-1.2 9:16 720p 720x1280",
      "kling-3.0 16:9 720p 1280x720",
      "kling-3.0 9:16 720p 720x1280",
      "kling-4.0 16:9 1080p 1920x1080",
      "kling-4.0 16:9 720p 1280x720",
      "kling-4.0 9:16 1080p 1080x1920",
      "kling-4.0 9:16 720p 720x1280",
      "kling-4.0-flash 16:9 720p 1280x720",
      "kling-4.0-flash 9:16 720p 720x1280",
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
      "seedance-2.5-flash 16:9 480p 854x480",
      "seedance-2.5-flash 16:9 720p 1280x720",
      "seedance-2.5-flash 9:16 480p 480x854",
      "seedance-2.5-flash 9:16 720p 720x1280",
      "seedream-5.0-flash 16:9 - 2560x1440",
      "seedream-5.0-flash 1:1 - 2048x2048",
      "seedream-5.0-flash 9:16 - 1440x2560",
      "seedream-5.5 21:9 - 3024x1296",
      "seedream-5.5 9:16 - 1440x2560",
    ]);
  });

  it("states the probed codec of every measured video row and 24 fps", () => {
    for (const model of GENERATION_VIDEO_MODELS) {
      const capability = GENERATION_CAPABILITIES[model];
      expect(capability.fps).toBe(24);
      for (const row of capability.rows.filter((one) => one.measured)) {
        const tenBit = model === "seedance-2.5" && row.resolution === "1080p";
        expect([row.codec, row.pix_fmt]).toEqual(tenBit ? ["hevc", "yuv420p10le"] : ["h264", "yuv420p"]);
        // 2.0's 496x864 draft (Mini, Fast and 2.0) is off its format, told per aspect; 2.5's and Flash's 480p is a true 480x854.
        const draft = model !== "seedance-2.5" && model !== "seedance-2.5-flash" && row.resolution === "480p";
        // Omni 1.2's 360p is a draft tier: the customer is told what it is for, never a vendor or a cost (rule 8).
        const omniDraft = model === "gemini-omni-flash-1.2" && row.resolution === "360p";
        expect(row.warning !== undefined, `${model} ${row.resolution}`).toBe(tenBit || draft || omniDraft);
        if (omniDraft) expect(row.warning).toBe("360p is a draft: softer than 720p, for trying a move cheaply; make the final take at 720p");
        if (draft) expect(row.warning, `${model} ${row.aspect_ratio}`).toContain(`${row.width}x${row.height} (2.`);
        if (draft) expect(row.warning, `${model} ${row.aspect_ratio}`).toContain(`off ${row.aspect_ratio}`);
      }
    }
  });

  it("names the duration bounds", () => {
    expect(GENERATION_CAPABILITIES["seedance-2.5"].duration_s).toEqual({ min: 4, max: 30 });
    expect(GENERATION_CAPABILITIES["gemini-omni-flash-1.1"].duration_values).toEqual([4, 6, 8, 10]);
    expect(GENERATION_CAPABILITIES["seedance-2.0"].duration_s).toEqual({ min: 4, max: 15 });
    expect(GENERATION_CAPABILITIES["gemini-omni-flash-1.2"]).toMatchObject({ duration_s: { min: 3, max: 15 }, last_frame_max_s: 10 });
    expect(GENERATION_CAPABILITIES["gemini-omni-flash-1.2"].duration_values).toBeUndefined();
  });

  it("is frozen to the rows", () => {
    expect(Object.isFrozen(GENERATION_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(GENERATION_CAPABILITIES["seedance-2.0"].rows[0])).toBe(true);
  });
});

describe("findCapabilityRow and priceGeneration", () => {
  it("prices measured rows from the table", () => {
    expect(priceGeneration(video())).toEqual({ unit_credits: 11, units: 4, credits: 44 });
    expect(priceGeneration(video({ camera: "pan" }))).toEqual({ unit_credits: 11, units: 4, credits: 44 });
    expect(priceGeneration(video({ model: "seedance-2.0", resolution: "1080p", duration_s: 15 }))).toEqual({ unit_credits: 94, units: 15, credits: 1410 });
    expect(priceGeneration({ prompt: "x", model: "flare", aspect_ratio: "9:16" })).toEqual({ unit_credits: 7, units: 1, credits: 7 });
    expect(priceGeneration({ prompt: "x", model: "flare", aspect_ratio: "21:9" })).toEqual({ unit_credits: 16, units: 1, credits: 16 });
    expect(priceGeneration({ prompt: "x", model: "seedream-5.0-flash", aspect_ratio: "9:16" })).toEqual({ unit_credits: 5, units: 1, credits: 5 });
    // 21:9 is measured on Flare and on Seedream 5.5's cleanup (#1686): every other image model refuses it before money.
    for (const model of ["seedream-5.0-flash", "gemini-3-pro-image", "gemini-nano-banana-2.1"] as const) {
      expect(priceGeneration({ prompt: "x", model, aspect_ratio: "21:9" }), model).toBeNull();
    }
    const board = [{ run_id: "run_board" }];
    expect(priceGeneration({ prompt: "x", model: "seedream-5.5", aspect_ratio: "21:9", references: board }))
      .toEqual({ unit_credits: 17, units: 1, credits: 17 });
    expect(priceGeneration({ prompt: "x", model: "seedream-5.5", aspect_ratio: "9:16", references: board }))
      .toEqual({ unit_credits: 17, units: 1, credits: 17 });
    // Unmeasured formats of 5.5 are not sold.
    for (const aspect_ratio of ["16:9", "1:1"] as const) {
      expect(priceGeneration({ prompt: "x", model: "seedream-5.5", aspect_ratio, references: board }), aspect_ratio).toBeNull();
    }
  });

  // Mutant (#1186 r2): price one camera differently, and the quote no longer says what the clip costs.
  it("prices every camera as the clip without one", () => {
    for (const camera of GENERATION_CAMERAS) {
      expect(priceGeneration(video({ camera })), camera).toEqual(priceGeneration(video()));
      expect(priceGeneration(video({ model: "seedance-2.0", resolution: "1080p", duration_s: 15, camera })), camera)
        .toEqual({ unit_credits: 94, units: 15, credits: 1410 });
    }
  });

  it.each([
    ["unmeasured 16:9 video", video({ model: "seedance-2.5", mode: "first_frame", first_frame: { run_id: "run_abc" }, aspect_ratio: "16:9",
      resolution: "1080p" })],
    ["mini at 1080p, a row that does not exist", video({ resolution: "1080p" })],
    ["seedance 2.5 text mode", video({ model: "seedance-2.5" })],
    ["duration past the model's bound", video({ duration_s: 16 })],
    ["kling 3.0 at 1080p, a row that does not exist", video({ model: "kling-3.0", resolution: "1080p" })],
    ["omni flash at 360p 9:16, not measured", video({ model: "gemini-omni-flash-1.1", resolution: "360p" })],
    ["omni flash 1.2 at 360p 16:9, not measured", video({ model: "gemini-omni-flash-1.2", aspect_ratio: "16:9", resolution: "360p" })],
    ["kling 4.0 at 480p, a row that does not exist", video({ model: "kling-4.0", resolution: "480p" })],
    ["kling 4.0 flash at 1080p, a row that does not exist", video({ model: "kling-4.0-flash", resolution: "1080p" })],
    ["kling 4.0 flash past 20 seconds", video({ model: "kling-4.0-flash", duration_s: 21 })],
    ["kling 4.0 flash with a last frame", video({ model: "kling-4.0-flash", mode: "first_frame", first_frame: { run_id: "run_abc" },
      last_frame: { run_id: "run_def" } })],
  ])("refuses %s", (_name, request) => {
    expect(findCapabilityRow(request)).toBeNull();
    expect(priceGeneration(request)).toBeNull();
  });

  // Mutant: check only the range in `findCapabilityRow`, and a 5 s Omni clip that skips the schema is priced.
  it("prices Omni only at its listed lengths, past the schema too", () => {
    const omni = (duration_s: number) => video({ model: "gemini-omni-flash-1.1", duration_s });
    expect(priceGeneration(omni(4))).toEqual({ unit_credits: 20, units: 4, credits: 80 });
    expect(priceGeneration(omni(10))).toEqual({ unit_credits: 20, units: 10, credits: 200 });
    expect(findCapabilityRow(omni(5))).toBeNull();
    expect(priceGeneration(video({ model: "kling-3.0", aspect_ratio: "16:9" }))).toEqual({ unit_credits: 19, units: 4, credits: 76 });
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
      "GENERATION_NO_TEXT_CLAUSE", "withNoTextClause",
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

  it("reads an omitted resolution as 720p, a measured row of every model in both aspects (#911)", () => {
    const { resolution: _omitted, ...rest } = video();
    expect(generateVideoRequest.parse(rest).resolution).toBe("720p");
    expect(generateVideoRequest.safeParse({ ...rest, resolution: "4k" }).success).toBe(false);
    for (const model of GENERATION_VIDEO_MODELS) {
      for (const aspect_ratio of ["9:16", "16:9"] as const) {
        const { min } = GENERATION_CAPABILITIES[model].duration_s, values = GENERATION_CAPABILITIES[model].duration_values;
        const mode = GENERATION_CAPABILITIES[model].modes.text ? { mode: "text" }
          : { mode: "first_frame", first_frame: { upload_id: UPLOAD, rights_confirmed: true } };
        const request = generateVideoRequest.parse({ prompt: "a lighthouse", model, ...mode, aspect_ratio, duration_s: values?.[0] ?? min });
        const match = findCapabilityRow(request);
        expect({ model, aspect_ratio, row: match?.kind === "video" ? match.row.resolution : null }).toEqual({ model, aspect_ratio, row: "720p" });
      }
    }
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

  it("takes an optional camera of five values, and nothing else", () => {
    for (const camera of ["static", "push_in", "pull_back", "pan", "turntable"] as const) {
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

  // Mutant: drop the last-frame check, and a Flash clip with a last frame is quoted and reserved, then refused by the model.
  it("refuses a last frame on Kling 4.0 Flash before any quote, and takes one on Kling 4.0", () => {
    const frames = { mode: "first_frame" as const, first_frame: { run_id: "run_abc" }, last_frame: { run_id: "run_def" } };
    expect(generateVideoRequest.safeParse(video({ model: "kling-4.0", ...frames })).success).toBe(true);
    expect(generateVideoRequest.safeParse(video({ model: "kling-4.0-flash", ...frames })).error?.issues)
      .toMatchObject([{ path: ["last_frame"], message: "kling-4.0-flash takes no last_frame" }]);
    expect(generateVideoRequest.safeParse(video({ model: "kling-4.0-flash", ...frames, last_frame: undefined })).success).toBe(true);
  });

  // Mutant: drop the last-frame bound, and an 11 s Omni 1.2 clip with a last frame is quoted and reserved, then refused by the model.
  it("takes every whole second of Omni 1.2 from 3 to 15, and a last frame only up to 10", () => {
    const omni = (duration_s: number, extra: Partial<GenerateVideoRequest> = {}) =>
      video({ model: "gemini-omni-flash-1.2", duration_s, ...extra });
    for (let seconds = 3; seconds <= 15; seconds++) expect(generateVideoRequest.safeParse(omni(seconds)).success, `${seconds}`).toBe(true);
    for (const seconds of [2, 16]) expect(generateVideoRequest.safeParse(omni(seconds)).success, `${seconds}`).toBe(false);
    const frames = { mode: "first_frame" as const, first_frame: { run_id: "run_abc" }, last_frame: { run_id: "run_def" } };
    expect(generateVideoRequest.safeParse(omni(10, frames)).success).toBe(true);
    expect(generateVideoRequest.safeParse(omni(11, frames)).error?.issues)
      .toMatchObject([{ path: ["last_frame"], message: "gemini-omni-flash-1.2 takes a last_frame up to 10 seconds" }]);
    expect(generateVideoRequest.safeParse(omni(15, { ...frames, last_frame: undefined })).success).toBe(true);
    expect(findCapabilityRow(omni(11, frames))).toBeNull();
    expect(findCapabilityRow(omni(10, frames))?.row).toMatchObject({ resolution: "720p", aspect_ratio: "9:16" });
  });

  it("bounds Kling 4.0 at 3 to 30 seconds and Flash at 3 to 20", () => {
    for (const [model, max] of [["kling-4.0", 30], ["kling-4.0-flash", 20]] as const) {
      expect(generateVideoRequest.safeParse(video({ model, duration_s: 2 })).success, model).toBe(false);
      expect(generateVideoRequest.safeParse(video({ model, duration_s: 3 })).success, model).toBe(true);
      expect(generateVideoRequest.safeParse(video({ model, duration_s: max })).success, model).toBe(true);
      expect(generateVideoRequest.safeParse(video({ model, duration_s: max + 1 })).success, model).toBe(false);
    }
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

  // Mutant: hold every image model at the default 4, or let Seedream and Flare take Gemini's 14, and an editor loses its sheet
  // or a model gets more pictures than it was measured with.
  it("takes up to each image model's own measured reference ceiling, naming it when refused", () => {
    const refs = (count: number) => Array(count).fill({ run_id: "run_x" });
    for (const [model, most] of [["seedream-5.0-flash", 4], ["seedream-5.5", 4], ["flare", 4], ["gemini-3-pro-image", 14],
      ["gemini-nano-banana-2.1", 14]] as const) {
      const base = { prompt: "x", model, aspect_ratio: "9:16" };
      expect(generateImageRequest.safeParse({ ...base, references: refs(most) }).success, model).toBe(true);
      const over = generateImageRequest.safeParse({ ...base, references: refs(most + 1) });
      expect(over.success, model).toBe(false);
      expect(over.error?.issues.map((issue) => issue.message), model).toContain(
        most === 14 ? "Too big: expected array to have <=14 items" : `${model} takes up to ${most} references`);
      expect(listGenerationModels().find((one) => one.model === model)?.max_references, model).toBe(most);
    }
  });

  // Mutant: drop the floor, and a 5.5 call without a picture is sold as a plain text picture, which is no cleanup (#1686).
  it("refuses seedream-5.5 without a picture to clean up, before any price", () => {
    const base = { prompt: "x", model: "seedream-5.5", aspect_ratio: "21:9" } as const;
    expect(generateImageRequest.safeParse(base).error?.issues).toMatchObject([{ path: ["references"],
      message: "seedream-5.5 cleans up a picture: pass the picture, and any product photos, as references" }]);
    expect(generateImageRequest.safeParse({ ...base, references: [] }).success).toBe(false);
    expect(generateImageRequest.safeParse({ ...base, references: [{ run_id: "run_board" }] }).success).toBe(true);
    expect(findCapabilityRow(base)).toBeNull();
    expect(findCapabilityRow({ ...base, references: [] })).toBeNull();
    // Every other image model still draws from the prompt alone.
    for (const model of GENERATION_IMAGE_MODELS.filter((one) => one !== "seedream-5.5")) {
      expect(generateImageRequest.safeParse({ prompt: "x", model, aspect_ratio: "9:16" }).success, model).toBe(true);
    }
    const listed = listGenerationModels();
    expect(listed.filter((one) => "min_references" in one).map((one) => [one.model, one.min_references])).toEqual([["seedream-5.5", 1]]);
    expect(listed.find((one) => one.model === "seedream-5.5")?.rows).toEqual([
      { aspect_ratio: "9:16", resolution: null, width: 1440, height: 2560, unit_credits: 17 },
      { aspect_ratio: "21:9", resolution: null, width: 3024, height: 1296, unit_credits: 17 },
    ]);
  });
});

describe("models list", () => {
  it("shows only measured rows and modes, without vendors", () => {
    const listed = generationModels.parse({ models: listGenerationModels(), contract_version: "test" }).models;
    expect(listed.map((one) => one.model)).toEqual(["seedream-5.0-flash", "seedream-5.5", "flare", "gemini-3-pro-image", "gemini-nano-banana-2.1", "seedance-2.0", "seedance-2.0-mini", "seedance-2.0-fast", "seedance-2.5",
      "seedance-2.5-flash", "kling-3.0", "kling-4.0", "kling-4.0-flash", "gemini-omni-flash-1.1", "gemini-omni-flash-1.2"]);
    expect(listed.find((one) => one.model === "seedance-2.0")).toEqual({
      model: "seedance-2.0", kind: "video", unit: "second", modes: ["text", "first_frame", "reference"], duration_s: { min: 4, max: 15 },
      max_references: 4,
      rows: [
        { aspect_ratio: "9:16", resolution: "480p", width: 496, height: 864, unit_credits: 18, reference: true },
        { aspect_ratio: "16:9", resolution: "480p", width: 864, height: 496, unit_credits: 18 },
        { aspect_ratio: "9:16", resolution: "720p", width: 720, height: 1280, unit_credits: 38, reference: true },
        { aspect_ratio: "16:9", resolution: "720p", width: 1280, height: 720, unit_credits: 38 },
        { aspect_ratio: "9:16", resolution: "1080p", width: 1080, height: 1920, unit_credits: 94 },
        { aspect_ratio: "16:9", resolution: "1080p", width: 1920, height: 1080, unit_credits: 94 },
      ],
    });
    expect(listed.find((one) => one.model === "seedance-2.5")?.modes).toEqual(["first_frame", "reference"]);
    expect(JSON.stringify(listed)).not.toMatch(/byteplus|fal|kie|dreamina|bytedance|seedream-5-0|gpt-image|routes|vendors/);
    expect(listed.filter((one) => "duration_values" in one).map((one) => one.model)).toEqual(["gemini-omni-flash-1.1"]);
  });

  it("shows Kling and Omni with their measured rows and lengths, naming no vendor", () => {
    const listed = generationModels.parse({ models: listGenerationModels(), contract_version: "test" }).models;
    expect(listed.find((one) => one.model === "kling-3.0")).toEqual({
      model: "kling-3.0", kind: "video", unit: "second", modes: ["text", "first_frame", "reference"], duration_s: { min: 3, max: 15 },
      max_references: 4,
      rows: [
        { aspect_ratio: "9:16", resolution: "720p", width: 720, height: 1280, unit_credits: 19, reference: true },
        { aspect_ratio: "16:9", resolution: "720p", width: 1280, height: 720, unit_credits: 19 },
      ],
    });
    expect(listed.find((one) => one.model === "kling-4.0")).toEqual({
      model: "kling-4.0", kind: "video", unit: "second", modes: ["text", "first_frame", "reference"], duration_s: { min: 3, max: 30 },
      max_references: 4,
      rows: [
        { aspect_ratio: "9:16", resolution: "720p", width: 720, height: 1280, unit_credits: 36, reference: true },
        { aspect_ratio: "16:9", resolution: "720p", width: 1280, height: 720, unit_credits: 36 },
        { aspect_ratio: "9:16", resolution: "1080p", width: 1080, height: 1920, unit_credits: 53 },
        { aspect_ratio: "16:9", resolution: "1080p", width: 1920, height: 1080, unit_credits: 53 },
      ],
    });
    expect(listed.find((one) => one.model === "kling-4.0-flash")).toEqual({
      model: "kling-4.0-flash", kind: "video", unit: "second", modes: ["text", "first_frame", "reference"], duration_s: { min: 3, max: 20 },
      max_references: 4,
      rows: [
        { aspect_ratio: "9:16", resolution: "720p", width: 720, height: 1280, unit_credits: 22, reference: true },
        { aspect_ratio: "16:9", resolution: "720p", width: 1280, height: 720, unit_credits: 22 },
      ],
    });
    expect(priceGeneration(video({ model: "kling-4.0", resolution: "1080p", duration_s: 3 }))).toEqual({ unit_credits: 53, units: 3, credits: 159 });
    // Mutant: drop the per-row check, and a reference clip on a row no take was made on is priced and charged (rule 4).
    const referenceClip = (overrides: Parameters<typeof video>[0]) =>
      video({ model: "kling-4.0", mode: "reference", duration_s: 3, references: [{ run_id: "run_x" }], ...overrides });
    expect(priceGeneration(referenceClip({}))).toEqual({ unit_credits: 36, units: 3, credits: 108 });
    expect(priceGeneration(referenceClip({ resolution: "1080p" }))).toBeNull();
    expect(priceGeneration(referenceClip({ aspect_ratio: "16:9" }))).toBeNull();
    expect(priceGeneration(video({ model: "kling-4.0-flash", aspect_ratio: "16:9", duration_s: 20 })))
      .toEqual({ unit_credits: 22, units: 20, credits: 440 });
    expect(listed.find((one) => one.model === "gemini-omni-flash-1.1")).toEqual({
      model: "gemini-omni-flash-1.1", kind: "video", unit: "second", modes: ["text", "first_frame", "reference"],
      duration_s: { min: 4, max: 10 }, duration_values: [4, 6, 8, 10], max_references: 4,
      rows: [
        { aspect_ratio: "16:9", resolution: "360p", width: 640, height: 360, unit_credits: 20 },
        { aspect_ratio: "9:16", resolution: "720p", width: 720, height: 1280, unit_credits: 20, reference: true },
        { aspect_ratio: "16:9", resolution: "720p", width: 1280, height: 720, unit_credits: 20 },
      ],
    });
    // Measured live 17.11 (omni-360p): 9:16 360p in all three modes, at 5 a second; no 16:9 360p.
    expect(listed.find((one) => one.model === "gemini-omni-flash-1.2")?.rows).toEqual([
      { aspect_ratio: "9:16", resolution: "360p", width: 360, height: 640, unit_credits: 5, reference: true },
      { aspect_ratio: "9:16", resolution: "720p", width: 720, height: 1280, unit_credits: 12, reference: true },
      { aspect_ratio: "16:9", resolution: "720p", width: 1280, height: 720, unit_credits: 12 },
    ]);
    for (const extra of [{}, { mode: "reference" as const, references: [{ run_id: "run_x" }] }]) {
      expect(priceGeneration(video({ model: "gemini-omni-flash-1.2", resolution: "360p", duration_s: 10, ...extra })))
        .toEqual({ unit_credits: 5, units: 10, credits: 50 });
    }
    expect(listed.find((one) => one.model === "seedance-2.5")?.rows.map((row) => `${row.aspect_ratio} ${row.resolution}`))
      .toEqual(["9:16 480p", "16:9 480p", "9:16 720p", "16:9 720p", "9:16 1080p"]);
    // Measured live 17.11 (#1670): first_frame on all four rows, reference on 9:16, no text mode and no 1080p.
    expect(listed.find((one) => one.model === "seedance-2.5-flash")).toEqual({
      model: "seedance-2.5-flash", kind: "video", unit: "second", modes: ["first_frame", "reference"], duration_s: { min: 4, max: 30 },
      max_references: 4,
      rows: [
        { aspect_ratio: "9:16", resolution: "480p", width: 480, height: 854, unit_credits: 17, reference: true },
        { aspect_ratio: "16:9", resolution: "480p", width: 854, height: 480, unit_credits: 17 },
        { aspect_ratio: "9:16", resolution: "720p", width: 720, height: 1280, unit_credits: 38, reference: true },
        { aspect_ratio: "16:9", resolution: "720p", width: 1280, height: 720, unit_credits: 38 },
      ],
    });
    const flash = (overrides: Parameters<typeof video>[0]) =>
      video({ model: "seedance-2.5-flash", mode: "first_frame", first_frame: { run_id: "run_abc" }, resolution: "480p", ...overrides });
    expect(priceGeneration(flash({}))).toEqual({ unit_credits: 17, units: 4, credits: 68 });
    expect(priceGeneration(flash({ aspect_ratio: "16:9", resolution: "720p", duration_s: 30 }))).toEqual({ unit_credits: 38, units: 30, credits: 1140 });
    expect(priceGeneration(flash({ resolution: "1080p" }))).toBeNull();
    expect(priceGeneration(video({ model: "seedance-2.5-flash", resolution: "480p" }))).toBeNull();
    expect(priceGeneration(flash({ mode: "reference", first_frame: undefined, references: [{ run_id: "run_x" }], aspect_ratio: "16:9" }))).toBeNull();
    expect(generateVideoRequest.safeParse(flash({ duration_s: 3 })).success).toBe(false);
    expect(generateVideoRequest.safeParse(flash({ duration_s: 31 })).success).toBe(false);
    for (const one of listed) expect(JSON.stringify(one), one.model).not.toMatch(/byteplus|kie|fal\b|google\/|kling-3\.0\/video|keyframe-to-video|bytedance/);
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

describe("the clip's own sound, on request (#1686)", () => {
  const SOUND_MODELS = ["seedance-2.5", "seedance-2.5-flash", "gemini-omni-flash-1.2"];
  const asked = (model: string) => {
    const capability = GENERATION_CAPABILITIES[model as keyof typeof GENERATION_CAPABILITIES] as { modes: { text: boolean }; duration_s: { min: number };
      duration_values?: readonly number[] };
    const mode = capability.modes.text ? { mode: "text" } : { mode: "first_frame", first_frame: { upload_id: UPLOAD, rights_confirmed: true } };
    return { prompt: "she says: hello", model, ...mode, aspect_ratio: "9:16", duration_s: capability.duration_values?.[0] ?? capability.duration_s.min,
      audio: true };
  };

  it("is taken by the measured models only; any other is refused on the audio path", () => {
    expect(GENERATION_VIDEO_MODELS.filter((model) => GENERATION_CAPABILITIES[model].audio === true)).toEqual(SOUND_MODELS);
    for (const model of GENERATION_VIDEO_MODELS) {
      const parsed = generateVideoRequest.safeParse(asked(model));
      if (SOUND_MODELS.includes(model)) {
        expect(parsed.success, model).toBe(true);
      } else {
        expect(parsed.error?.issues.map((issue) => [issue.path.join("."), issue.message]), model).toEqual([["audio", `${model} makes no sound`]]);
      }
    }
    expect(generateVideoRequest.safeParse({ ...asked("kling-3.0"), audio: false }).success).toBe(true);
  });

  it("keeps the price of the row", () => {
    for (const model of SOUND_MODELS) {
      const request = generateVideoRequest.parse(asked(model));
      expect(priceGeneration(request), model).toEqual(priceGeneration({ ...request, audio: undefined }));
    }
  });

  // Mutant: findCapabilityRow ignores audio, and a request built past the schema prices a sound the model cannot make.
  it("finds no row for sound on a model without it", () => {
    expect(findCapabilityRow({ ...video(), audio: true } as GenerateVideoRequest)).toBeNull();
    expect(findCapabilityRow({ ...video(), audio: false } as GenerateVideoRequest)).not.toBeNull();
  });

  it("is listed on the sound models only while it is offered", () => {
    const off = generationModels.parse({ models: listGenerationModels(), contract_version: "test" }).models;
    expect(off.filter((one) => "audio" in one)).toEqual([]);
    const on = generationModels.parse({ models: listGenerationModels({ audio: true }), contract_version: "test" }).models;
    expect(on.filter((one) => one.audio === true).map((one) => one.model)).toEqual(SOUND_MODELS);
  });
});

describe("generation results name create_asset for templates and inserts (#1157)", () => {
  /** Mutant: the hint leaves a schema description, so OpenAPI and tools/list stop telling agents the next step. */
  it("says so on reusable_until, the template slot", () => {
    expect(runGeneration.shape.reusable_until.description).toContain("create_asset with source.run_id");
    expect(templateMedia.shape.asset_id.description).toContain("create_asset from a generate_* run");
  });
});
