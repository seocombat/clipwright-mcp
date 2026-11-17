import { describe, expect, it } from "vitest";
import { FILM_CUT_BED_RULE, filmCutBed, filmCutInput } from "./film-cut.js";

/** The cut sheet's bed: a recipe or a description, never a kept sound (judge R-D9). */

describe("the cut sheet's bed", () => {
  // Mutants: a kept sound taken as a bed (the mixer would play a recipe guessed from its name), or refused with zod's generic union text.
  it("refuses a kept sound as the bed, saying what a bed is, and takes a recipe, a description or none", () => {
    const refused = filmCutBed.safeParse({ kept: "door_creak" });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues.map(issue => issue.message)).toEqual([`${FILM_CUT_BED_RULE}: send { recipe } or { describe }`]);
    expect(FILM_CUT_BED_RULE).toBe("a bed is a recipe or a description; kept sounds are short effects");
    for (const bed of [{ recipe: "drone_low" }, { describe: "a looping night wind through dry grass" }]) expect(filmCutBed.safeParse(bed).success).toBe(true);
    expect(filmCutInput.shape.sound.shape.bed.description).toContain(FILM_CUT_BED_RULE);
  });
});
