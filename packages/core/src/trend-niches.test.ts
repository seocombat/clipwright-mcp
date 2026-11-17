import { describe, expect, it } from "vitest";

import {
  findTrendsInput, resolveFindTrends, suggestTrendNiches, TREND_NICHE_REQUIRED_MESSAGE, TREND_NICHE_SUGGESTIONS_MAX, TREND_PAGE_FIELDS_MESSAGE,
  trendNicheSuggestion, trendNichesInput, trendPageTarget,
} from "./trend-niches.js";
import { TREND_SEARCH_DEFAULT_DAYS, trendQueryKey } from "./trend-search.js";

/** Saved niches (#1201): the list a save accepts, and the request a search with no keywords runs. */

const PRIMARY = { keywords: "bathroom renovation", platform: "tiktok" as const, language: "de" };

describe("saved niches", () => {
  it("takes up to three, the first the primary, and refuses a fourth and a repeat of the same query", () => {
    expect(trendNichesInput.parse({ niches: [{ keywords: "tile shop" }] }).niches[0]).toEqual({ keywords: "tile shop", platform: "mix" });
    expect(trendNichesInput.safeParse({ niches: ["a1", "b2", "c3", "d4"].map((keywords) => ({ keywords })) }).success).toBe(false);
    // Case and spacing do not make two niches; another platform or language does.
    expect(trendNichesInput.safeParse({ niches: [{ keywords: "Tile  Shop" }, { keywords: "tile shop" }] }).success).toBe(false);
    expect(trendNichesInput.safeParse({ niches: [{ keywords: "tile shop" }, { keywords: "tile shop", platform: "tiktok" }] }).success).toBe(true);
    expect(trendNichesInput.safeParse({ niches: [{ keywords: "tile shop", language: "en" }, { keywords: "tile shop" }] }).success).toBe(true);
    expect(trendNichesInput.parse({ niches: [] }).niches).toEqual([]);
  });

  // Mutant: let a page's fields reach a search, and a page asked with words starts a whole paid search on them (#1393).
  it("takes a next page as its search and number alone, and never as a search", () => {
    const id = `trs_${"c".repeat(32)}`;
    expect(trendPageTarget(findTrendsInput.parse({ search_id: id, page: 2 }))).toEqual({ ok: true, target: { searchId: id, page: 2 } });
    expect(trendPageTarget(findTrendsInput.parse({ keywords: "tile shop" }))).toEqual({ ok: true, target: null });
    for (const input of [{ search_id: id }, { page: 2 }, { search_id: id, page: 2, keywords: "tile shop" }, { search_id: id, page: 2, posted_within_days: 7 }]) {
      expect(trendPageTarget(findTrendsInput.parse(input))).toEqual({ ok: false, message: TREND_PAGE_FIELDS_MESSAGE });
      expect(resolveFindTrends(findTrendsInput.parse(input), PRIMARY)).toEqual({ ok: false, message: TREND_PAGE_FIELDS_MESSAGE });
    }
    expect([1, 6].map((page) => findTrendsInput.safeParse({ search_id: id, page }).success)).toEqual([false, false]);
  });

  /** Mutant: give findTrendsInput the request's defaults, and the server cannot tell an unnamed platform from mix. */
  it("leaves an unnamed field unnamed, so the niche fills it", () => {
    expect(findTrendsInput.parse({})).toEqual({});
  });

  it("searches as asked when keywords are named, the niche aside", () => {
    const asked = resolveFindTrends(findTrendsInput.parse({ keywords: "tile shop" }), PRIMARY);
    expect(asked).toEqual({ ok: true, fromNiche: false, request: { keywords: "tile shop", platform: "mix", posted_within_days: TREND_SEARCH_DEFAULT_DAYS } });
  });

  it("searches the primary niche with its platform and language when keywords are absent, the request's own fields first", () => {
    const plain = resolveFindTrends(findTrendsInput.parse({}), PRIMARY);
    expect(plain).toEqual({ ok: true, fromNiche: true, request: { ...PRIMARY, posted_within_days: TREND_SEARCH_DEFAULT_DAYS } });
    const named = resolveFindTrends(findTrendsInput.parse({ platform: "instagram", language: "en", posted_within_days: 7 }), PRIMARY);
    expect(named.ok && named.request).toEqual({ keywords: PRIMARY.keywords, platform: "instagram", language: "en", posted_within_days: 7 });
    // The same niche searched twice is the same query, so a repeat inside the hour replays it free.
    expect(plain.ok && trendQueryKey(plain.request)).toBe(`tiktok:de:${TREND_SEARCH_DEFAULT_DAYS}:bathroom renovation`);
    expect(resolveFindTrends({}, { ...PRIMARY, language: null })).toMatchObject({ ok: true, request: { keywords: PRIMARY.keywords, platform: "tiktok" } });
  });

  it("refuses a search with neither keywords nor a niche, and a niche that no longer parses", () => {
    expect(resolveFindTrends({}, null)).toEqual({ ok: false, message: TREND_NICHE_REQUIRED_MESSAGE });
    expect(resolveFindTrends({}, { keywords: " ", platform: "mix", language: null })).toEqual({ ok: false, message: TREND_NICHE_REQUIRED_MESSAGE });
  });
});

/** Suggested niches (#1392): read from analysed creators' hashtags, no source call and no model. */
describe("suggestTrendNiches", () => {
  const video = (caption: string | null, tookOff = false) => ({ caption, tookOff });
  const profile = (handle: string, videos: { caption: string | null; tookOff: boolean }[], platform: "instagram" | "tiktok" = "instagram") =>
    ({ platform, handle, videos });

  // Mutants: drop the stop list, the two-caption floor, the took-off weight or the camel split, and each shows in the list below.
  it("keeps tags in two captions of one creator, weighs the ones that took off, splits capitals and leaves generic tags out", () => {
    const tile = profile("tile_maker", [
      video("New floor #HomeRenovation #fyp #viral", true), video("Grout day #homerenovation #tiles #fyp"),
      video("#tiles again #tiles #FYP #bathroomdesign"), video("#bathroomdesign once"), video(null), video("#oneoff"),
    ]);
    expect(suggestTrendNiches([tile], [])).toEqual([
      { keywords: "home renovation", platform: "mix", from: { platform: "instagram", handle: "tile_maker" }, videos: 2, took_off: 1 },
      { keywords: "bathroomdesign", platform: "mix", from: { platform: "instagram", handle: "tile_maker" }, videos: 2, took_off: 0 },
      { keywords: "tiles", platform: "mix", from: { platform: "instagram", handle: "tile_maker" }, videos: 2, took_off: 0 },
    ]);
    for (const suggestion of suggestTrendNiches([tile], [])) expect(trendNicheSuggestion.parse(suggestion)).toEqual(suggestion);
  });

  // Codex r1 mutants: lower the two-caption floor, or count a tag twice when one caption spells it in two cases.
  it("suggests nothing from one caption, even when it repeats a tag in another case", () => {
    expect(suggestTrendNiches([profile("solo", [video("#Coffee #coffee #COFFEE", true), video("#tea")])], [])).toEqual([]);
  });

  // Mutants: compare saved niches by their raw text or with their spaces, and a niche the user saved as "Latte ART" comes back as
  // #latteart; check the stop list on the tag with its underscores, and #viral_video and #for_you come back as niches.
  it("leaves out a saved niche's words, keeps one suggestion per tag from the creator where it weighs most, and stops at three", () => {
    const one = profile("one", [video("#coffee #latteart #barista #espresso #viral_video #for_you"),
      video("#coffee #latteart #barista #espresso #viral_video #for_you")]);
    const two = profile("two", [video("#coffee", true), video("#coffee"), video("#Barista #espresso"), video("#barista #espresso")], "tiktok");
    const suggested = suggestTrendNiches([one, two], [{ keywords: "  Latte  ART " }]);
    expect(suggested).toHaveLength(TREND_NICHE_SUGGESTIONS_MAX);
    expect(suggested.map((s) => [s.keywords, s.from.handle, s.videos, s.took_off])).toEqual([
      ["coffee", "two", 2, 1], ["barista", "one", 2, 0], ["espresso", "one", 2, 0],
    ]);
    expect(suggestTrendNiches([], [])).toEqual([]);
  });
});
