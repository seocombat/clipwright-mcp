import { z } from "zod";

import { findTrendsRequest, TREND_PLATFORMS, TREND_SEARCH_DEFAULT_DAYS, TREND_SEARCH_MAX_DAYS, TREND_SEARCH_MIN_DAYS, type FindTrendsRequest } from "./trend-search.js";

/** Saved niches (#1201): up to three topics an account keeps, the first its primary. A trend search that names no keywords searches */
/** the primary one. Saving and reading them is free. */

export const TREND_NICHES_PATH = "/v1/trend-niches";
export const TREND_NICHES_MAX = 3;

const keywords = findTrendsRequest.shape.keywords;
const language = z.string().regex(/^[a-z]{2}$/);

export const trendNicheInput = z.strictObject({
  keywords: keywords.describe("The niche's topic in a few words, as you would search it."),
  platform: z.enum(TREND_PLATFORMS).default("mix").describe("mix (default): TikTok and Instagram together; or one of them."),
  language: language.optional().describe("ISO 639-1; filters TikTok only."),
});
export type TrendNicheInput = z.input<typeof trendNicheInput>;

/** The words as a search compares them: lower case, single spaces. */
const wordsOf = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
/** Two niches are the same when a search of either would be the same query, the window aside. */
export const trendNicheKey = (niche: { keywords: string; platform: string; language?: string | null | undefined }): string =>
  `${niche.platform}:${niche.language ?? "*"}:${wordsOf(niche.keywords)}`;

export const TREND_NICHE_REPEATED_MESSAGE = "the same niche is in the list twice: the words, platform and language of each must differ";
export const trendNichesInput = z.strictObject({
  niches: z.array(trendNicheInput).max(TREND_NICHES_MAX)
    .describe(`The whole list, at most ${TREND_NICHES_MAX}, the first the primary; it replaces the saved one, and [] clears it.`),
}).refine((value) => new Set(value.niches.map(trendNicheKey)).size === value.niches.length,
  { path: ["niches"], message: TREND_NICHE_REPEATED_MESSAGE });
export type TrendNichesInput = z.input<typeof trendNichesInput>;

export const trendNiche = z.strictObject({
  keywords: z.string(),
  platform: z.enum(TREND_PLATFORMS),
  language: z.string().nullable(),
  primary: z.boolean().describe("True for the first: a trend search with no keywords searches it."),
});
export type TrendNiche = z.infer<typeof trendNiche>;

export const trendNiches = z.strictObject({
  niches: z.array(trendNiche).max(TREND_NICHES_MAX).describe("The saved niches, the primary first."),
  max_niches: z.number().int().positive(),
  updated_at: z.string().datetime().nullable().describe("When the list was last saved; null when it never was."),
});
export type TrendNiches = z.infer<typeof trendNiches>;

/** What a client reads: a platform or field a newer server adds must not break an installed client. */
export const trendNichesRead = z.object({
  niches: z.array(z.object({ keywords: z.string(), platform: z.string(), language: z.string().nullable(), primary: z.boolean() })),
  max_niches: z.number().int(),
  updated_at: z.string().nullable(),
});
export type TrendNichesRead = z.infer<typeof trendNichesRead>;

/** What a trend search or its quote takes from a client: no defaults here, so the server tells an unnamed field from a named one */
/** and fills it from the primary niche when keywords are absent. */
export const findTrendsInput = z.strictObject({
  keywords: keywords.optional().describe("The topic in a few words; absent: the primary saved niche (trend_niches) with its platform and language."),
  platform: z.enum(TREND_PLATFORMS).optional().describe("mix (default): TikTok and Instagram ranked together; or one of them."),
  language: language.optional().describe("ISO 639-1; filters TikTok only."),
  posted_within_days: z.number().int().min(TREND_SEARCH_MIN_DAYS).max(TREND_SEARCH_MAX_DAYS).optional()
    .describe(`Reels posted within this many days: ${TREND_SEARCH_MIN_DAYS} is the last 24 hours, ${TREND_SEARCH_DEFAULT_DAYS} by default, ` +
      `at most ${TREND_SEARCH_MAX_DAYS}.`),
});
export type FindTrendsInput = z.input<typeof findTrendsInput>;

export const TREND_NICHE_REQUIRED_MESSAGE = "keywords is required: pass the topic, or save a niche with trend_niches first";

/** The request a search runs: as asked when it names keywords; else the primary niche's words, and its platform and language where the */
/** request names none. `null` niche and no keywords: refused before anything is held. */
export function resolveFindTrends(input: z.infer<typeof findTrendsInput>, primary: Pick<TrendNiche, "keywords" | "platform" | "language"> | null):
  { ok: true; request: FindTrendsRequest; fromNiche: boolean } | { ok: false; message: string } {
  const named = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const fromNiche = input.keywords === undefined;
  if (fromNiche && primary === null) return { ok: false, message: TREND_NICHE_REQUIRED_MESSAGE };
  const language = fromNiche ? input.language ?? primary!.language ?? undefined : input.language;
  const parsed = findTrendsRequest.safeParse(fromNiche ? { ...named, keywords: primary!.keywords, platform: input.platform ?? primary!.platform,
    ...(language === undefined ? {} : { language }) } : named);
  // A niche saved under an older rule that no longer parses asks for keywords, as no niche does.
  if (!parsed.success) return { ok: false, message: fromNiche ? TREND_NICHE_REQUIRED_MESSAGE : parsed.error.issues[0]?.message ?? "invalid request" };
  return { ok: true, request: parsed.data, fromNiche };
}

export const TREND_NICHES_DESCRIPTION = "Free. With no niches: the account's saved niches, the first the primary. niches: save the user's confirmed list " +
  `(at most ${TREND_NICHES_MAX}, it replaces the saved one; [] clears it). find_trends and quote_trends with no keywords search the primary niche.`;
