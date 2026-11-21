import { describe, expect, it } from "vitest";
import { z } from "zod";

import { FILM_KIT_FILES, filmGuide, filmKit, filmKitQuery, RECENT_LOOKS_MAX } from "./film-guide.js";

// A kit file added after a client was built: the answers still parse, and the query still refuses any path the kit does not have.
// Mutants: the answers' path back to the enum of today's files (an older SDK throws on a newer kit); the query's check dropped.
describe("kit paths", () => {
  it("parse an answer naming a kit file this build does not know", () => {
    expect(filmKit.safeParse({ kit_version: "0123456789ab", files: [{ path: "src/lib/later.tsx", text: "x" }] }).success).toBe(true);
    expect(filmGuide.safeParse({ guide: "g", method: "m", kit_version: "0123456789ab", kit_files: [{ path: "src/lib/later.tsx", bytes: 1 }],
      kept_sounds: [] }).success).toBe(true);
  });
  it("take only a listed file as the query's path", () => {
    expect(filmKitQuery.safeParse({ path: FILM_KIT_FILES[1] }).success).toBe(true);
    expect(filmKitQuery.safeParse({}).success).toBe(true);
    for (const path of ["../../.env", "src/lib/later.tsx", ""]) expect(filmKitQuery.safeParse({ path }).success).toBe(false);
  });
  it("refuse an empty path in an answer", () => {
    expect(filmKit.safeParse({ kit_version: "0123456789ab", files: [{ path: "", text: "x" }] }).success).toBe(false);
    expect(filmGuide.safeParse({ guide: "g", method: "m", kit_version: "0123456789ab", kit_files: [{ path: "", bytes: 1 }], kept_sounds: [] }).success)
      .toBe(false);
  });
  it("leave the kit's paths out of the query's published schema", () => {
    const published = JSON.stringify(z.toJSONSchema(filmKitQuery, { unrepresentable: "any", io: "input" }));
    expect(published).not.toContain(FILM_KIT_FILES[0]);
    expect(published).not.toContain('"enum"');
  });
});

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
