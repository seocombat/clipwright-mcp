import { describe, expect, it } from "vitest";

import { makeUgcInput } from "./skills.js";
import { generateImageRequest } from "./generations.js";
import { maxCreditsField } from "./max-credits.js";

/** The ceiling (#942) is a whole number of credits, 0 included: anything else is refused by the schema before admission. */
describe("max_credits", () => {
  it.each([0, 1, 5000])("takes %s", (value) => expect(maxCreditsField.safeParse(value).success).toBe(true));
  it.each([-1, 1.5, "7", null])("refuses %s", (value) => expect(maxCreditsField.safeParse(value).success).toBe(false));
  it("refuses a negative ceiling on the paid bodies themselves", () => {
    expect(makeUgcInput.safeParse({ script: "Hello", max_credits: -1 }).success).toBe(false);
    expect(generateImageRequest.safeParse({ prompt: "a lighthouse", model: "seedream-5.0-flash", aspect_ratio: "9:16", max_credits: -1 }).success)
      .toBe(false);
  });
});
