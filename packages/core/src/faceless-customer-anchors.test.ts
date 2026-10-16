import { describe, expect, it } from "vitest";
import * as core from "./index.js";
import type { FacelessCustomerSceneImage } from "./faceless-public.js";

function resolve(script: string, anchors: FacelessCustomerSceneImage["anchor"][]) {
  return core.resolveFacelessCustomerAnchors(script, anchors.map(anchor => ({ image_url: "https://source.example/reused.png", anchor })));
}

describe("faceless lexical customer anchors", () => {
  it("resolves punctuation, hyphens, decimals, apostrophes and accents on the speech clock", () => {
    expect(resolve("Start. Café's hand-made item costs 12.50 today.", [{ quote: "cafe’s hand made" }, { quote: "12.50" }]))
      .toEqual([{ first: 1, end: 4, url: "https://source.example/reused.png" }, { first: 6, end: 8, url: "https://source.example/reused.png" }]);
  });
  it("keeps distinct instances and original order while allowing adjacent ranges and repeated sources", () => {
    expect(resolve("One two three four", [{ startWord: 2, endWord: 4 }, { startWord: 0, endWord: 2 }]))
      .toEqual([{ first: 2, end: 4, url: "https://source.example/reused.png" }, { first: 0, end: 2, url: "https://source.example/reused.png" }]);
  });
  it("resolves an explicit occurrence without making an ambiguous quote implicit", () => {
    expect(resolve("one two one two", [{ quote: "one two", occurrence: 1 }])).toMatchObject([{ first: 2, end: 4 }]);
    expect(() => resolve("one two one two", [{ quote: "one two" }])).toThrow("ambiguous_customer_anchor");
  });
  it.each([
    [{ quote: "absent" }], [{ quote: "one", occurrence: 2 }], [{ quote: "..." }],
    [{ startWord: 0, endWord: 5 }], [{ startWord: 2, endWord: 2 }],
    [{ startWord: -1, endWord: 1 }], [{ startWord: 0.5, endWord: 2 }],
    [{ startWord: 0, endWord: 2 }, { startWord: 1, endWord: 3 }],
  ])("refuses invalid lexical bindings %j", (...anchors) => {
    expect(() => resolve("one two three four", anchors)).toThrow();
  });
  it("shares the speech clock's refusal of normalization that changes word boundaries", () => {
    expect(() => resolve("A ½ cup", [{ startWord: 1, endWord: 2 }])).toThrow();
  });
});
