import { describe, expect, it } from "vitest";

import { findTrendsRequest, siteTrendNiche, trendNicheInput } from "./index.js";

// The search words and language a site niche shares with a trend search (#1392): one schema, so the two cannot drift apart.

describe("trend keywords and language", () => {
  /** Mutant (Codex r2): narrow or widen the shared limits, and a search or a saved niche starts refusing words it took before. */
  it("takes 2 to 100 characters with at least 2 besides spaces, and a two-letter language, in a search, a niche and a site niche", () => {
    const parse = (keywords: string, language?: string) => [
      findTrendsRequest.safeParse({ keywords, ...(language ? { language } : {}) }).success,
      trendNicheInput.safeParse({ keywords, ...(language ? { language } : {}) }).success,
      siteTrendNiche.safeParse({ keywords, platform: "mix", from: "title", ...(language ? { language } : {}) }).success,
    ];
    expect(parse("a".repeat(100))).toEqual([true, true, true]);
    expect(parse("a".repeat(101))).toEqual([false, false, false]);
    expect(parse("ab")).toEqual([true, true, true]);
    expect(parse("a")).toEqual([false, false, false]);
    expect(parse(" a ")).toEqual([false, false, false]);
    expect(parse("dog food", "pl")).toEqual([true, true, true]);
    expect(parse("dog food", "pol")).toEqual([false, false, false]);
    expect(parse("dog food", "PL")).toEqual([false, false, false]);
  });

  it("names a site niche's platform mix only, and its source among five", () => {
    expect(siteTrendNiche.safeParse({ keywords: "dog food", platform: "tiktok", from: "title" }).success).toBe(false);
    expect(siteTrendNiche.safeParse({ keywords: "dog food", platform: "mix", from: "footer" }).success).toBe(false);
  });
});
