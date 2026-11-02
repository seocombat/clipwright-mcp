import { describe, expect, it } from "vitest";

import { HOSTILE_TEXTS, renderedTags } from "./__fixtures__/hostile-markdown.js";
import { quoteThirdParty } from "./markdown-quote.js";

describe("quoteThirdParty", () => {
  // GFM drops a row's surplus cells silently, so a stray pipe never shows up in the rendered tags; pin the text itself.
  it("turns every pipe into a slash, not only the first, so a cell cannot spill into the next column", () => {
    expect(quoteThirdParty("a | b | c | d")).toBe("“a / b / c / d”");
    expect(quoteThirdParty("x|y|z")).not.toContain("|");
  });

  it("renders every hostile text, a backslash before a tag included, as one plain paragraph", () => {
    const plain = renderedTags(quoteThirdParty("plain text"));
    for (const text of HOSTILE_TEXTS) expect([text, renderedTags(quoteThirdParty(text))]).toEqual([text, plain]);
  });
});
