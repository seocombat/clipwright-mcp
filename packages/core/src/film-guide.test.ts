import { describe, expect, it } from "vitest";

import { filmGuide, RECENT_LOOKS_MAX } from "./film-guide.js";

// G3 look memory. Mutant: the schema's cap on recent_looks dropped, which the reader's own limit would hide.
describe("filmGuide recent_looks", () => {
  const answer = (count: number) => ({ guide: "g", method: "m", kit_version: "0123456789ab", kit_files: [], kept_sounds: [],
    recent_looks: Array.from({ length: count }, (_, at) => ({ look: `look_${at}`, format: "cartoon", made_on: "2026-11-17" })) });
  it(`takes up to ${RECENT_LOOKS_MAX} looks and refuses more`, () => {
    expect(RECENT_LOOKS_MAX).toBe(5);
    expect(filmGuide.safeParse(answer(RECENT_LOOKS_MAX)).success).toBe(true);
    expect(filmGuide.safeParse(answer(RECENT_LOOKS_MAX + 1)).success).toBe(false);
  });
});
