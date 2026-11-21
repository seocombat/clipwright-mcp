import { describe, expect, it } from "vitest";

import {
  findUpscaleVideoRow, listUpscale, UPSCALE_CAPABILITIES, upscaledFromWarning, upscaleImageRefusal, upscaleRequest, upscaleVideoUnits,
} from "./upscale.js";

/** The upscale table (#1774): measured shapes only, the source's own aspect kept, a take's extra frame never a paid second. */

describe("upscale table", () => {
  // Mutant: ceil(frames / fps), and takes of 313 and 289 frames pay 14 and 13 seconds for 13 and 12.
  it.each([[313, 13], [289, 12], [118, 5], [1, 1], [721, 30]])("counts %i frames at 24 fps as %i seconds", (frames, seconds) => {
    expect(upscaleVideoUnits(frames, 24)).toBe(seconds);
  });

  it("takes exactly the measured clip sizes, each keeping its source's shape within 2%", () => {
    expect(UPSCALE_CAPABILITIES.video.rows.map((row) => `${row.source.width}x${row.source.height}>${row.width}x${row.height}`))
      .toEqual(["480x854>720x1280", "854x480>1280x720", "496x864>736x1280", "360x640>720x1280"]);
    for (const row of UPSCALE_CAPABILITIES.video.rows) {
      expect(Math.abs(row.width / row.height - row.source.width / row.source.height) / (row.source.width / row.source.height)).toBeLessThan(0.02);
    }
    expect([findUpscaleVideoRow(864, 496), findUpscaleVideoRow(720, 1280)]).toEqual([null, null]);
  });

  it.each([
    [650, 1156, null], [384, 384, null], [2048, 1953, null],
    [383, 1000, "its short side is under 384 px"], [1300, 2312, "its long side is over 2048 px"], [2048, 2000, "doubled it would be over 16 MP"],
  ])("judges a %ix%i picture: %s", (width, height, refusal) => {
    expect(upscaleImageRefusal(width, height)).toBe(refusal);
  });

  it("lists only measured rows and names no route", () => {
    const listed = listUpscale();
    expect(listed.video.rows).toHaveLength(UPSCALE_CAPABILITIES.video.rows.filter((row) => row.measured).length);
    expect(JSON.stringify(listed)).not.toMatch(/ratio|usd|fal|bytedance|seedvr/i);
  });

  it("says what an upscale does not fix, and refuses a body with anything but its source", () => {
    expect(upscaledFromWarning("video", 480, 854)).toBe("upscaled from 480x854; the same take, larger — lettering the draft drew wrong stays wrong");
    expect(upscaleRequest.safeParse({ source: { asset_id: `ast_${"a".repeat(32)}` }, resolution: "1080p" }).success).toBe(false);
    expect(upscaleRequest.safeParse({ source: { upload_id: `upl_${"a".repeat(32)}` } }).success).toBe(false);
  });
});
