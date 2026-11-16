import { describe, expect, it } from "vitest";

import { FILM_EDIT_MAX_CAPTIONS, filmEditInput } from "./own-agent-runs.js";

const clip = { run_id: "run_0123456789abcdef0123456789abcdef", from: 0, to: 4 };
const parse = (captions: unknown[]) => filmEditInput.safeParse({ clips: [clip], captions });

describe("render_edit caption styles", () => {
  // Mutants: the defaults changed (an old request no longer a centred outline), a style or a colour taken that the composition cannot draw,
  // a boxed word past the caption's words or on a banner, or the cap too low for one caption per spoken word of a 30 s ad.
  it("takes outline, banner and badge with a hex fill, a boxed word of an outline caption, and left align", () => {
    const ok = parse([{ text: "NO STING AFTER SHAVING", start: 0, end: 1, highlight: 3, color: "#F4EBD9" },
      { text: "ONE STEP", start: 0, end: 4, position: "top", style: "banner", color: "#ffffff" },
      { text: "4% PEPTIDE", start: 1, end: 2, style: "badge", align: "left" }]);
    expect(ok.success).toBe(true);
    expect(ok.data?.captions[0]).toMatchObject({ position: "bottom", align: "center", style: "outline", highlight: 3 });
    for (const bad of [{ style: "karaoke" }, { color: "cream" }, { color: "#FFF" }, { highlight: 4 }, { highlight: 0, style: "banner" },
      { align: "right" }, { highlight: -1 }, { color: "#F4EBD9" }]) {
      expect(parse([{ text: "NO STING AFTER SHAVING", start: 0, end: 1, ...bad }]).success, JSON.stringify(bad)).toBe(false);
    }
    const word = (i: number) => ({ text: "NO STING", start: i * 0.1, end: i * 0.1 + 0.1, highlight: i % 2 });
    expect([FILM_EDIT_MAX_CAPTIONS, parse(Array.from({ length: 160 }, (_, i) => word(i))).success,
      parse(Array.from({ length: 161 }, (_, i) => word(i))).success]).toEqual([160, true, false]);
  });
});
