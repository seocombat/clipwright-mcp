import { describe, expect, it } from "vitest";

import { LONG_FORM_RUN_ID, scriptInsertsTimelineFixture } from "./__fixtures__/long-form-timeline.fixture.js";
import { freezeResolvedTimeline, readResolvedTimeline } from "./resolved-timeline.js";
import { derivedRunWarnings } from "./run-static-warnings.js";
import { parseRunPreflight } from "./run-preflight.js";
import { makeUgcInput, type PinnedInsertAsset } from "./skills.js";
import { videoHoldWarnings, videoMediaRefusal } from "./ugc-video-media.js";

// Video media in inserts, overlays and layout windows (#778 S2c): what is refused, and the quote's hold warning.

const SCRIPT = "one two three four five six seven eight nine ten eleven twelve";
const ASSET = `ast_${"a".repeat(32)}`;
const pin = (insert_id: string, frames: number, fps = 25): PinnedInsertAsset => ({ insert_id, asset_id: ASSET, key: `assets/acc/${ASSET}/${"b".repeat(64)}.mp4`,
  sha256: "b".repeat(64), bytes: 4096, kind: "video", media_type: "video/mp4", width: 1080, height: 1920, duration_frames: frames, fps, codec: "h264",
  pix_fmt: "yuv420p" });

describe("videoMediaRefusal", () => {
  it.each([
    ["8-bit H.264", { codec: "h264", pixFmt: "yuv420p", colorTransfer: "bt709" }],
    ["8-bit HEVC", { codec: "hevc", pixFmt: "yuv420p", colorTransfer: null }],
    ["full-range 8-bit", { codec: "h264", pixFmt: "yuvj420p" }],
    ["nothing known yet", {}],
  ])("accepts %s", (_label, facts) => {
    expect(videoMediaRefusal(facts)).toBeNull();
  });

  it.each([
    ["VP9", { codec: "vp9", pixFmt: "yuv420p" }, "is vp9 video: video media takes H.264 or HEVC; re-encode it as H.264"],
    ["10-bit HEVC", { codec: "hevc", pixFmt: "yuv420p10le" },
      "is 10-bit video (yuv420p10le): video media takes 8-bit video; re-encode it as 8-bit H.264 (yuv420p)"],
    ["12-bit 4:4:4", { codec: "h264", pixFmt: "yuv444p12le" },
      "is 12-bit video (yuv444p12le): video media takes 8-bit video; re-encode it as 8-bit H.264 (yuv420p)"],
    ["PQ HDR", { codec: "hevc", pixFmt: "yuv420p", colorTransfer: "smpte2084" },
      "is HDR video (PQ, transfer smpte2084): video media takes SDR video; re-encode it as SDR BT.709"],
    ["HLG HDR", { codec: "h264", pixFmt: "yuv420p", colorTransfer: "arib-std-b67" },
      "is HDR video (HLG, transfer arib-std-b67): video media takes SDR video; re-encode it as SDR BT.709"],
  ])("refuses %s by name", (_label, facts, message) => {
    expect(videoMediaRefusal(facts)).toBe(message);
  });
});

describe("videoHoldWarnings", () => {
  const input = makeUgcInput.parse({ script: SCRIPT, broll_policy: "anyone",
    inserts: [{ id: "clip", asset_id: ASSET, media_type: "video", anchor: { startWord: 0, endWord: 1 }, cover_words: 8 }],
    overlays: [{ id: "phone", asset_id: ASSET, media_type: "video", anchor: { quote: "ten" }, position: "top_right" }] });

  it("names a pinned clip the slow speech edge outlasts, by list, index and id", () => {
    // Eight words take up to 4 s at two words a second; a 2 s clip may hold. One word takes up to 0.5 s; a 2 s overlay cannot.
    expect(videoHoldWarnings(input, [pin("clip", 50), pin("phone", 50)])).toEqual([
      "inserts[0] insert clip: its video asset runs 2.0 s, and the 8 words it covers can take up to 4.0 s; " +
        "if the narration outlasts the clip, its last frame holds to the end",
    ]);
  });

  /** Mutant: list only inserts, and a short clip in an overlay or a layout window holds its last frame with no word in the quote. */
  it("names a short clip in an overlay and in a layout window, by list, index and id", () => {
    const layered = makeUgcInput.parse({ script: SCRIPT, broll_policy: "anyone",
      overlays: [{ id: "phone", asset_id: ASSET, media_type: "video", anchor: { startWord: 0, endWord: 1 }, position: "top_right" }],
      layout_windows: [{ id: "card", asset_id: ASSET, media_type: "video", anchor: { startWord: 4, endWord: 5 }, layout: "card" }] });
    const [overlay, window] = videoHoldWarnings(layered, [pin("phone", 5), pin("card", 5)]);
    expect(overlay).toMatch(/^overlays\[0\] overlay phone: its video asset runs 0\.2 s, and the 1 words it covers can take up to 0\.5 s;/);
    expect(window).toMatch(/^layout_windows\[0\] layout window card: its video asset runs 0\.2 s, and the 1 words it covers/);
  });

  it("says nothing for a clip long enough,an image, or a media_url video whose length is measured by the worker", () => {
    expect(videoHoldWarnings(input, [pin("clip", 100), pin("phone", 50)])).toEqual([]);
    expect(videoHoldWarnings(input, [])).toEqual([]);
    const byUrl = makeUgcInput.parse({ script: SCRIPT, broll_policy: "anyone",
      inserts: [{ id: "clip", media_url: "https://media.example/a.mp4", media_type: "video", anchor: { startWord: 0, endWord: 8 } }] });
    expect(videoHoldWarnings(byUrl, undefined)).toEqual([]);
  });

  it("is derived on the run from the stored pins, so the run repeats the quote's line", () => {
    const warnings = derivedRunWarnings({ ...input, insert_assets: [pin("clip", 50)], composition_version: 2 },
      parseRunPreflight(undefined), "make_ugc", () => undefined);
    expect(warnings).toContain(videoHoldWarnings(input, [pin("clip", 50)])[0]);
  });
});

describe("video layers in the frozen timeline", () => {
  const layer = { id: "phone", kind: "overlay", position: "top_right", startFrame: 100, endFrame: 300, enter: "cut",
    key: `runs/${LONG_FORM_RUN_ID}/layers/phone.mp4`, sha256: "e".repeat(64), bytes: 1000, width: 1080, height: 1920 };
  const withLayers = (layers: unknown[]) => { const { hash: _hash, ...content } = scriptInsertsTimelineFixture(); return { ...content, layers }; };

  it("round-trips a video layer", () => {
    const frozen = freezeResolvedTimeline(withLayers([{ ...layer, mediaType: "video", contentType: "video/mp4" }]));
    expect(readResolvedTimeline(JSON.parse(JSON.stringify(frozen)))).toEqual(frozen);
  });

  it.each([["image", "video/mp4"], ["video", "image/png"]])("refuses mediaType %s with content type %s", (mediaType, contentType) => {
    expect(() => freezeResolvedTimeline(withLayers([{ ...layer, mediaType, contentType }]))).toThrow("invalid layer");
  });
});
