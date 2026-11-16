import { describe, expect, it } from "vitest";

import { referenceBringItem, referenceBringList } from "./reference-bring.js";

const beat = (start_s: number, end_s: number, graphics: { source_kind: string; device?: string }[] = []) => ({ start_s, end_s, graphics });
const shot = (start_s: number, end_s: number, kind?: string) => ({ start_s, end_s, ...(kind ? { source: { kind } } : {}) });

describe("what a remake needs brought (#1602)", () => {
  /** Mutants: count a generated clip or drawn graphics as material to bring, or drop the seconds, and the agent asks the user for what we make ourselves. */
  it("asks for a screen recording and live clips by their shots' seconds, screenshots and product photos by their beats', one line per kind", () => {
    const bring = referenceBringList({
      shots: [shot(0, 2, "ai_video"), shot(2, 4.5, "screen_capture"), shot(4.5, 6, "real_footage"), shot(6, 8, "code_render"), shot(8, 9.25, "screen_capture")],
      beats: [beat(0, 3, [{ source_kind: "screenshot" }]), beat(3, 6, [{ source_kind: "title_card" }, { source_kind: "other", device: "photo" }]),
        beat(6, 9.25, [{ source_kind: "product_ui" }])],
    });
    expect(bring).toEqual([
      { kind: "screen_recording", seconds: 3.75, at_s: [2, 8] },
      { kind: "screenshot", seconds: 6.25, at_s: [0, 6] },
      { kind: "product_photo", seconds: 3, at_s: [3] },
      { kind: "live_clip", seconds: 1.5, at_s: [4.5] },
    ]);
  });

  /** Mutant (Codex r1): drop the cap on starts, and a reel of many screen shots writes a list the profile refuses. */
  it("names at most 40 starts per kind while the seconds count every moment, and the profile item accepts it", () => {
    const shots = Array.from({ length: 41 }, (_, at) => shot(at, at + 1, "screen_capture"));
    const [item] = referenceBringList({ shots, beats: [beat(0, 41)] });
    expect(item!.at_s).toHaveLength(40);
    expect(item!.seconds).toBe(41);
    expect(referenceBringItem.safeParse(item).success).toBe(true);
  });

  it("asks for nothing when every shot is generated and no beat shows a screenshot or a photo, and reads graphics without shots", () => {
    expect(referenceBringList({ shots: [shot(0, 5, "ai_video"), shot(5, 9, "live")], beats: [beat(0, 9)] })).toEqual([]);
    expect(referenceBringList({ beats: [beat(0, 4, [{ source_kind: "screenshot" }])] })).toEqual([{ kind: "screenshot", seconds: 4, at_s: [0] }]);
  });
});
