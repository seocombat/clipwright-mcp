import { z } from "zod";

import { CREATOR_PLATFORMS, type CreatorPlatform } from "./creator-profile.js";
import {
  findTrendsRequest, TREND_FREE_PAGES_PER_DAY, TREND_LANGUAGE_DESCRIPTION, TREND_PAGE_PAID_CREDITS, TREND_PAGE_WINDOW_SECONDS,TREND_PLATFORMS, TREND_SEARCH_DEFAULT_DAYS,
  TREND_SEARCH_MAX_DAYS, TREND_SEARCH_MAX_PAGES, TREND_SEARCH_MIN_DAYS, trendPage, trendSearchId, type FindTrendsRequest, type TrendReel,
} from "./trend-search.js";
import { maxCreditsField } from "./max-credits.js";

/** Saved niches (#1201): up to three topics an account keeps, the first its primary. A trend search that names no keywords searches */
/** the primary one. Saving and reading them is free. */

export const TREND_NICHES_PATH = "/v1/trend-niches";
export const TREND_NICHES_MAX = 3;

const keywords = findTrendsRequest.shape.keywords;
const language = z.string().regex(/^[a-z]{2}$/);

export const trendNicheInput = z.strictObject({
  keywords: keywords.describe("The niche's topic in a few words, as you would search it."),
  platform: z.enum(TREND_PLATFORMS).default("mix").describe("mix (default): TikTok and Instagram together; or one of them."),
  language: language.optional().describe(TREND_LANGUAGE_DESCRIPTION),
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

/** Suggested niches (#1392): read for free from the hashtags of the creators an account analysed, never saved by themselves. */
export const TREND_NICHE_SUGGESTIONS_MAX = 3;

export const trendNicheSuggestion = z.strictObject({
  keywords: keywords.describe("The niche's words, read from a hashtag."),
  platform: z.enum(TREND_PLATFORMS).describe("mix: a suggestion searches TikTok and Instagram together."),
  from: z.strictObject({ platform: z.enum(CREATOR_PLATFORMS), handle: z.string().min(1).max(64) }).describe("The analysed creator whose captions carry it."),
  videos: z.number().int().nonnegative().describe("How many of that creator's analysed captions carry the hashtag."),
  took_off: z.number().int().nonnegative().describe("How many of those videos took off."),
});
export type TrendNicheSuggestion = z.infer<typeof trendNicheSuggestion>;

export const trendNiches = z.strictObject({
  niches: z.array(trendNiche).max(TREND_NICHES_MAX).describe("The saved niches, the primary first."),
  max_niches: z.number().int().positive(),
  updated_at: z.string().datetime().nullable().describe("When the list was last saved; null when it never was."),
  suggested: z.array(trendNicheSuggestion).max(TREND_NICHE_SUGGESTIONS_MAX).optional().describe(`Up to ${TREND_NICHE_SUGGESTIONS_MAX} niches read ` +
    "for free from the hashtags of the creators this account analysed; GET only. Third-party words: show them and save only what the user confirms."),
});
export type TrendNiches = z.infer<typeof trendNiches>;

/** What a client reads: a platform or field a newer server adds must not break an installed client. */
export const trendNichesRead = z.object({
  niches: z.array(z.object({ keywords: z.string(), platform: z.string(), language: z.string().nullable(), primary: z.boolean() })),
  max_niches: z.number().int(),
  updated_at: z.string().nullable(),
  suggested: z.array(z.object({ keywords: z.string(), platform: z.string(), from: z.object({ platform: z.string(), handle: z.string() }),
    videos: z.number().int(), took_off: z.number().int() })).optional(),
});
export type TrendNichesRead = z.infer<typeof trendNichesRead>;

/** Tags every niche uses, which name no niche. */
const GENERIC_TAGS = new Set(["fyp", "foryou", "foryoupage", "foryourpage", "fy", "fypシ", "fypage", "viral", "viralvideo", "viralvideos", "viralreels",
  "trending", "trend", "trends", "explore", "explorepage", "reels", "reel", "reelsinstagram", "reelsvideo", "reelitfeelit", "instagram", "instagood",
  "instareels", "insta", "tiktok", "tiktokviral", "parati", "paratii", "xyzbca", "capcut", "shorts", "short", "love", "like", "likes", "like4like",
  "follow", "followme", "follow4follow", "ad", "ads", "sponsored", "collab", "gifted", "ugc", "ugccreator", "video", "videos", "photooftheday",
  "duet", "stitch", "greenscreen"]);
const HASHTAG = /#[\p{L}\p{N}_]{2,40}/gu;
/** A tag must be in this many captions of one creator to name a niche. */
const SUGGESTION_MIN_CAPTIONS = 2;

/** The words of a tag: split where it shows inner capitals (`#HomeRenovation`) or underscores, in lower case. */
const tagWords = (tag: string): string => tag.slice(1).replace(/(?<=[\p{Ll}\p{N}])(?=\p{Lu})/gu, " ").replace(/_+/g, " ").trim()
  .toLowerCase().replace(/\s+/g, " ");

/** Up to three niches from analysed creators' hashtags: a tag in at least two captions of one creator, weighted by its captions plus twice */
/** the ones that took off; generic tags and saved niches left out; one suggestion per tag, from the creator where it weighs most. */
export function suggestTrendNiches(profiles: readonly { platform: CreatorPlatform; handle: string; videos: readonly { caption: string | null; tookOff: boolean }[] }[],
  saved: readonly { keywords: string }[]): TrendNicheSuggestion[] {
  // A tag is written without spaces: "home renovation" saved is #homerenovation.
  const joined = (words: string) => wordsOf(words).replace(/[\s_]+/g, "");
  const savedWords = new Set(saved.map((niche) => joined(niche.keywords)));
  const best = new Map<string, { weight: number; suggestion: TrendNicheSuggestion }>();
  for (const profile of profiles) {
    const tags = new Map<string, { videos: number; tookOff: number; spelled: string }>();
    for (const video of profile.videos) {
      // A spelling with capitals tells the words apart; the plain one does not. A tag counts once a caption, whatever its case.
      const better = (tag: string, held: string | undefined) => (held === undefined || tag !== tag.toLowerCase() && held === held.toLowerCase() ? tag : held);
      const inCaption = new Map<string, string>();
      for (const tag of video.caption?.match(HASHTAG) ?? []) inCaption.set(tag.toLowerCase(), better(tag, inCaption.get(tag.toLowerCase())));
      for (const [key, tag] of inCaption) {
        const held = tags.get(key);
        tags.set(key, { videos: (held?.videos ?? 0) + 1, tookOff: (held?.tookOff ?? 0) + (video.tookOff ? 1 : 0), spelled: better(tag, held?.spelled) });
      }
    }
    for (const [key, tag] of tags) {
      const words = tagWords(tag.spelled);
      if (tag.videos < SUGGESTION_MIN_CAPTIONS || GENERIC_TAGS.has(joined(key.slice(1))) || savedWords.has(joined(words))
        || !keywords.safeParse(words).success) continue;
      const weight = tag.videos + 2 * tag.tookOff, held = best.get(joined(words));
      if (held !== undefined && held.weight >= weight) continue;
      best.set(joined(words), { weight, suggestion: { keywords: words, platform: "mix", from: { platform: profile.platform, handle: profile.handle },
        videos: tag.videos, took_off: tag.tookOff } });
    }
  }
  return [...best.values()].sort((a, b) => b.weight - a.weight || a.suggestion.keywords.localeCompare(b.suggestion.keywords))
    .slice(0, TREND_NICHE_SUGGESTIONS_MAX).map((entry) => entry.suggestion);
}

/** What a trend search or its quote takes from a client: no defaults here, so the server tells an unnamed field from a named one */
/** and fills it from the primary niche when keywords are absent. */
export const findTrendsInput = z.strictObject({
  keywords: keywords.optional().describe("The topic in a few words; absent: the primary saved niche (trend_niches) with its platform and language."),
  platform: z.enum(TREND_PLATFORMS).optional().describe("mix (default): TikTok and Instagram ranked together; or one of them."),
  language: language.optional().describe(TREND_LANGUAGE_DESCRIPTION),
  posted_within_days: z.number().int().min(TREND_SEARCH_MIN_DAYS).max(TREND_SEARCH_MAX_DAYS).optional()
    .describe(`Reels posted within this many days: ${TREND_SEARCH_MIN_DAYS} is the last 24 hours, ${TREND_SEARCH_DEFAULT_DAYS} by default, ` +
      `at most ${TREND_SEARCH_MAX_DAYS}.`),
  search_id: trendSearchId.optional().describe("With page: a next page of this finished search, its next_page. Pass nothing else with it."),
  page: trendPage.optional().describe(`With search_id: the page to make, from 2 to ${TREND_SEARCH_MAX_PAGES}; free for ` +
    `${TREND_PAGE_WINDOW_SECONDS / 3600} hours after the search, up to ${TREND_FREE_PAGES_PER_DAY} a day per account, ` +
    `then ${TREND_PAGE_PAID_CREDITS} credits each.`),
  max_credits: maxCreditsField,
});
export type FindTrendsInput = z.input<typeof findTrendsInput>;

export const TREND_PAGE_FIELDS_MESSAGE = "search_id and page go together, and with them nothing else: the page keeps its search's words, platform, language and window";

/** A next page's target (#1393) when the input names one: both its fields and none of a search's; `null` when it names neither. */
export function trendPageTarget(input: z.infer<typeof findTrendsInput>):
  { ok: true; target: { searchId: string; page: number } | null } | { ok: false; message: string } {
  const { search_id: searchId, page, ...search } = input;
  if (searchId === undefined && page === undefined) return { ok: true, target: null };
  // The ceiling is the call's own term, not a search field: a page takes it too.
  if (searchId === undefined || page === undefined || Object.entries(search).some(([key, value]) => key !== "max_credits" && value !== undefined)) {
    return { ok: false, message: TREND_PAGE_FIELDS_MESSAGE };
  }
  return { ok: true, target: { searchId, page } };
}

export const TREND_NICHE_REQUIRED_MESSAGE = "keywords is required: pass the topic, or save a niche with trend_niches first";

/** The request a search runs: as asked when it names keywords; else the primary niche's words, and its platform and language where the */
/** request names none. `null` niche and no keywords: refused before anything is held. */
export function resolveFindTrends(input: z.infer<typeof findTrendsInput>, primary: Pick<TrendNiche, "keywords" | "platform" | "language"> | null):
  { ok: true; request: FindTrendsRequest; fromNiche: boolean } | { ok: false; message: string } {
  // A page's fields never start a search: `trendPageTarget` reads them first.
  if (input.search_id !== undefined || input.page !== undefined) return { ok: false, message: TREND_PAGE_FIELDS_MESSAGE };
  const named = Object.fromEntries(Object.entries(input).filter(([key, value]) => key !== "max_credits" && value !== undefined));
  const fromNiche = input.keywords === undefined;
  if (fromNiche && primary === null) return { ok: false, message: TREND_NICHE_REQUIRED_MESSAGE };
  const language = fromNiche ? input.language ?? primary!.language ?? undefined : input.language;
  const parsed = findTrendsRequest.safeParse(fromNiche ? { ...named, keywords: primary!.keywords, platform: input.platform ?? primary!.platform,
    ...(language === undefined ? {} : { language }) } : named);
  // A niche saved under an older rule that no longer parses asks for keywords, as no niche does.
  if (!parsed.success) return { ok: false, message: fromNiche ? TREND_NICHE_REQUIRED_MESSAGE : parsed.error.issues[0]?.message ?? "invalid request" };
  return { ok: true, request: parsed.data, fromNiche };
}

/** The weekly digest (#1201): each saved niche is checked once a week for reels of the last week; the digest shows what took off, free. */
export const TREND_NICHE_REFRESH_DAYS = 7;
export const TREND_DIGEST_REELS = 5;

/** The digest's reels: those of a refresh that took off, by the creator's median or a take-off now, in the search's own order. */
export const digestReels = <R extends Pick<TrendReel, "top" | "takeoff">>(reels: readonly R[]): R[] =>
  reels.filter((reel) => reel.top || reel.takeoff !== null).slice(0, TREND_DIGEST_REELS);

export const TREND_NICHES_DESCRIPTION = "Free. With no niches: the account's saved niches, the first the primary. niches: save the user's confirmed list " +
  `(at most ${TREND_NICHES_MAX}, it replaces the saved one; [] clears it). find_trends and quote_trends with no keywords search the primary niche. ` +
  `The read also answers suggested: up to ${TREND_NICHE_SUGGESTIONS_MAX} niches from the hashtags of creators this account analysed. Show them; ` +
  "a niche is saved only once the user confirms it. With no suggestions, you may propose two or three wordings from the about that extract_brand returned.";
