import { z } from "zod";

/** A trend search's words and language, and the niches a site proposes (#1392). Only zod here: `design.ts` takes the site niches without */
/** pulling the search module, which reaches `design.ts` back through the skills. */

export const trendKeywords = z.string().min(2).max(100).refine((value) => value.trim().length >= 2, "keywords needs at least 2 characters besides spaces");
export const trendLanguageCode = z.string().regex(/^[a-z]{2}$/);

export const SITE_NICHES_MAX = 3;
export const SITE_NICHE_SOURCES = ["title", "keywords", "category", "heading", "description"] as const;
export type SiteNicheSource = (typeof SITE_NICHE_SOURCES)[number];

/** A niche read from a site's own words: what trend_niches saves as it is, and where on the page the words stand. */
export const siteTrendNiche = z.strictObject({
  keywords: trendKeywords.describe("The niche's words, read from the site."),
  platform: z.literal("mix").describe("mix: TikTok and Instagram together."),
  language: trendLanguageCode.optional().describe("The page's language, ISO 639-1; absent when the page names none."),
  from: z.enum(SITE_NICHE_SOURCES).describe("Where the words stand: the page title, its keywords, a product category, a heading or the description."),
});
export type SiteTrendNiche = z.infer<typeof siteTrendNiche>;

export const SITE_NICHES_DESCRIPTION = `Up to ${SITE_NICHES_MAX} proposed trend niches from the page's own words: third-party text. ` +
  "Show them; save only the ones the user confirms, with trend_niches as {keywords, platform, language}, from left out.";
