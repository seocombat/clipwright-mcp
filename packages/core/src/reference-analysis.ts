import { z } from "zod";

import { assetId } from "./asset-identity.js";
import { ASSET_VIDEO_MAX_SECONDS } from "./assets.js";
import { MAX_REFERENCE_TRANSCRIPT_WORDS, referenceHook, referenceProfile, referenceWord, type ReferenceProfile } from "./reference-profile.js";

/** Reference analysis (reference-to-video S1c): an MP4 asset read into a `reference_profile`. Its status lives at its own */
/** path, as an asset's processing does; its money (#927) rides a run of skill `analyze_reference` that holds and settles it. */

export const REFERENCE_ANALYSES_PATH = "/v1/reference-analyses";
export const REFERENCE_ANALYSIS_PATH = "/v1/reference-analyses/:id";
export const REFERENCE_ANALYSIS_QUOTE_PATH = "/v1/reference-analyses/quote";
export const ANALYZE_REFERENCE_TASK = "analyze-reference";
/** The run skill that carries an analysis's hold and charge; not a `SKILLS` entry, since no `/v1/skills` route starts it. */
export const ANALYZE_REFERENCE_SKILL = "analyze_reference";

export const referenceAnalysisId = z.string().regex(/^ref_[a-f0-9]{32}$/);

/** The price of a delivered analysis. */
export const REFERENCE_ANALYSIS_CREDITS = 70;
/** The data mode: metrics, transcript and a frame sheet without the vision pass. */
export const REFERENCE_DATA_CREDITS = 10;

/** `full` reads the reference into a profile; `data` hands back its numbers, words and a frame sheet, with no vision call. */
export const REFERENCE_ANALYSIS_MODES = ["full", "data"] as const;
export type ReferenceAnalysisMode = (typeof REFERENCE_ANALYSIS_MODES)[number];
export const REFERENCE_ANALYSIS_MODE_CREDITS: Readonly<Record<ReferenceAnalysisMode, number>> = {
  full: REFERENCE_ANALYSIS_CREDITS, data: REFERENCE_DATA_CREDITS,
};

/** New analyses per account per hour: each costs us vendor money even when it fails, so the cap stays beside the price. */
export const REFERENCE_ANALYSIS_PER_HOUR = 10;
/** The data mode's own cap, scope `reference_data`: cheap enough to run on every candidate reel of a search (#921). */
export const REFERENCE_DATA_PER_HOUR = 60;
export const REFERENCE_DATA_SHEET_COLUMNS = 3;
export const REFERENCE_DATA_SHEET_ROWS = 3;
export const REFERENCE_DATA_SHEET_MAX_WIDTH = 1080;
export const REFERENCE_ANALYSIS_WINDOW_SECONDS = 3600;
/** The analysis stops here and fails; under the task's ceiling. */
export const REFERENCE_ANALYSIS_WORK_SECONDS = 420;
export const REFERENCE_ANALYSIS_TASK_MAX_DURATION_SECONDS = 600;
/** Past this a read calls an unfinished analysis failed: a task killed at its ceiling writes nothing. */
export const REFERENCE_ANALYSIS_DEADLINE_SECONDS = 900;

export const REFERENCE_ANALYSIS_STATES = ["queued", "analyzing", "succeeded", "failed"] as const;
export const REFERENCE_ANALYSIS_ERRORS = ["timed_out", "analysis_failed", "asset_gone", "enqueue_failed"] as const;
export type ReferenceAnalysisError = (typeof REFERENCE_ANALYSIS_ERRORS)[number];

export const REFERENCE_ANALYSIS_ERROR_MESSAGES: Readonly<Record<ReferenceAnalysisError, string>> = {
  timed_out: "the analysis did not finish in time and was stopped; start it again",
  analysis_failed: "the reference could not be analysed; start it again or use another clip",
  asset_gone: "the asset was deleted before the analysis began",
  enqueue_failed: "the analysis could not be started; start it again",
};

/** What starts an analysis: ids only, so no file name or reference text reaches a log. */
export const analyzeReferencePayload = z.strictObject({ analysisId: referenceAnalysisId, accountId: z.string().min(1) });
export type AnalyzeReferencePayload = z.infer<typeof analyzeReferencePayload>;

export const REFERENCE_SOURCE_PLATFORMS = ["instagram", "tiktok"] as const;
export type ReferenceSourcePlatform = (typeof REFERENCE_SOURCE_PLATFORMS)[number];
/** The live analysis a link replays is found by this key; a short TikTok link has none before it is resolved. */
export const referenceSourceKey = z.string().regex(/^(instagram|tiktok):[A-Za-z0-9_-]{1,64}$/);

export const REFERENCE_URL_YOUTUBE_REFUSAL = "YouTube gives no video file through our source; upload the MP4 with create_asset";
export const REFERENCE_URL_ACCEPTED = "an Instagram reel or post link (instagram.com/reel/<code>, /reels/<code>, /p/<code>) or a TikTok " +
  "video link (tiktok.com/@<user>/video/<id>, vm.tiktok.com/<code>)";

export type ReferenceUrl =
  | { ok: true; url: string; platform: ReferenceSourcePlatform; key: string | null }
  | { ok: false; message: string };

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);

/** Which post a link names, read from its text alone: no network, so a refusal costs nothing (#930 S3). */
export function classifyReferenceUrl(raw: string): ReferenceUrl {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, message: `source_url is not a link; pass ${REFERENCE_URL_ACCEPTED}` }; }
  const host = url.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) return { ok: false, message: REFERENCE_URL_YOUTUBE_REFUSAL };
  if (url.protocol === "https:" && url.username === "" && url.password === "" && (url.port === "" || url.port === "443")) {
    const path = url.pathname;
    const instagram = INSTAGRAM_HOSTS.has(host) ? /^\/(?:reel|reels|p)\/([A-Za-z0-9_-]{5,64})\/?$/.exec(path) : null;
    if (instagram) return { ok: true, url: url.href, platform: "instagram", key: `instagram:${instagram[1]}` };
    const tiktok = TIKTOK_HOSTS.has(host) ? /^\/@[A-Za-z0-9_.-]{1,64}\/video\/(\d{5,32})\/?$/.exec(path) : null;
    if (tiktok) return { ok: true, url: url.href, platform: "tiktok", key: `tiktok:${tiktok[1]}` };
    if (host === "vm.tiktok.com" && /^\/[A-Za-z0-9]{4,32}\/?$/.test(path)) return { ok: true, url: url.href, platform: "tiktok", key: null };
  }
  return { ok: false, message: `${host} ${url.pathname} is not a link we read; pass ${REFERENCE_URL_ACCEPTED}` };
}

export const analyzeReferenceRequest = z.strictObject({
  asset_id: assetId.optional().describe(`asset_id of an MP4 asset of this account, at most ${ASSET_VIDEO_MAX_SECONDS} s and 100 MiB`),
  source_url: z.string().url().startsWith("https://").max(2048).optional()
    .describe(`instead of asset_id: ${REFERENCE_URL_ACCEPTED}; YouTube is refused`),
  mode: z.enum(REFERENCE_ANALYSIS_MODES).optional().describe(`full (default, ${REFERENCE_ANALYSIS_CREDITS} credits): the reference_profile. ` +
    `data (${REFERENCE_DATA_CREDITS} credits): duration, size, timed transcript, hook and a 3×3 frame sheet, without the vision pass`),
}).refine((request) => (request.asset_id === undefined) !== (request.source_url === undefined), {
  message: "pass exactly one of asset_id or source_url",
});
export type AnalyzeReferenceRequest = z.infer<typeof analyzeReferenceRequest>;

const count = z.number().int().nonnegative().nullable();
const authorMedian = z.strictObject({ views: z.number().nonnegative().nullable(), ratio: z.number().nonnegative().nullable(),
  reels: z.number().int().nonnegative(), window: z.string().min(1) }).nullable();
/** The post behind a link analysis (#930 S3): `null` is unknown, never 0, and each unknown is also a line in `warnings[]`. */
export const referenceSource = z.strictObject({
  url: z.string().url(),
  platform: z.enum(REFERENCE_SOURCE_PLATFORMS),
  key: referenceSourceKey,
  measured_at: z.string().datetime(),
  published_at: z.string().datetime().nullable(),
  duration_s: z.number().positive().nullable(),
  metrics: z.strictObject({ views: count, likes: count, comments: count, views_per_hour: z.number().nonnegative().nullable() }),
  /** The median of the author's reels within ±30 days of the post, the post excluded. */
  author_median: authorMedian,
  /** The median of the author's 12 latest reels, the post excluded. */
  author_recent: authorMedian,
  top_comments: z.array(z.strictObject({ text: z.string().min(1).max(300), likes: count })).max(10),
  code_words: z.array(z.strictObject({ word: z.string().min(1).max(24), count: z.number().int().min(2) })),
});
export type ReferenceSource = z.infer<typeof referenceSource>;

const frameSheet = z.strictObject({
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
  /** Each frame's second, row by row; every one inside the reel. */
  times_s: z.array(z.number().nonnegative()).min(1),
});
const dataWords = { transcript: z.array(referenceWord).max(MAX_REFERENCE_TRANSCRIPT_WORDS),
  /** `null` when no word starts in the first seconds; no caption, since no vision pass read the screen. */
  hook: referenceHook.nullable() };
const dataProbe = { duration_s: z.number().positive(), width: z.number().int().positive(), height: z.number().int().positive(),
  fps: z.number().positive() };

/** What a succeeded data analysis hands back (#930 S4): the probe, the transcribed words as the profile writes them, and a frame sheet. */
export const referenceData = z.strictObject({
  ...dataProbe,
  ...dataWords,
  /** `url` is signed for 7 days on each read; `null` once the sheet passed the renders' 30 days in storage, said in `warnings[]`. */
  frame_sheet: frameSheet.extend({ url: z.string().url().nullable() }),
});
export type ReferenceData = z.infer<typeof referenceData>;

/** What the data pass answers: the words, the sheet it uploaded and its warnings. */
export const referenceDataPass = z.strictObject({ ...dataWords, frame_sheet: frameSheet, cost_usd: z.number().nonnegative(),
  warnings: z.array(z.string()) });
export type ReferenceDataPass = z.infer<typeof referenceDataPass>;
/** The row's `data`: the answer with the sheet's R2 key in place of its link, and our vendor cost, which no client reads. */
export const referenceDataStored = z.strictObject({ ...dataProbe, ...dataWords, frame_sheet: frameSheet.extend({ key: z.string().min(1) }),
  cost_usd: z.number().nonnegative() });
export type ReferenceDataStored = z.infer<typeof referenceDataStored>;

export const referenceAnalysis = z.strictObject({
  analysis_id: referenceAnalysisId,
  asset_id: assetId,
  /** `full` or `data` (#930 S4); an analysis started before the modes is `full`. */
  mode: z.enum(REFERENCE_ANALYSIS_MODES),
  state: z.enum(REFERENCE_ANALYSIS_STATES),
  /** Set once a full analysis succeeded, `null` before, on failure and for a data analysis. */
  reference_profile: referenceProfile.nullable(),
  /** Set once a data analysis succeeded, `null` before, on failure and for a full analysis. */
  data: referenceData.nullable(),
  /** The post's numbers, comments and code words for an analysis started by `source_url`; `null` for an asset start. */
  source: referenceSource.nullable(),
  warnings: z.array(z.string()),
  error: z.strictObject({ code: z.enum(REFERENCE_ANALYSIS_ERRORS), message: z.string().min(1) }).nullable(),
  /** Held at the start; 0 for an analysis started before it was paid (#927). */
  credits_reserved: z.number().int().nonnegative(),
  /** Set at settlement: the price once succeeded, 0 once failed; `null` while it runs. */
  credits_charged: z.number().int().nonnegative().nullable(),
  /** The account's balance right after the settlement, read in its transaction; `null` until settled. */
  balance_after_credits: z.number().int().nullable(),
  created_at: z.string().datetime(),
  finished_at: z.string().datetime().nullable(),
});
export type ReferenceAnalysis = z.infer<typeof referenceAnalysis>;

export const analysisQuoteResponse = z.strictObject({
  /** The quoted asset; for a `source_url`, the asset of the analysis it replays, else `null` (its asset is made at the start). */
  asset_id: assetId.nullable(),
  /** What starting it now holds and, once it succeeds, charges: 0 when the asset already has a live analysis to answer. */
  credits_estimate: z.number().int().nonnegative(),
  /** The analysis a start would answer for free, or `null` when a start would begin a new, paid one. */
  replays_analysis_id: referenceAnalysisId.nullable(),
  warnings: z.array(z.string()),
});
export type AnalysisQuoteResponse = z.infer<typeof analysisQuoteResponse>;

/** What a client reads: a new state, error code or profile field must not break an installed client. */
export const referenceAnalysisRead = referenceAnalysis.extend({
  state: z.string(),
  reference_profile: z.record(z.string(), z.unknown()).nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  // A server from before #930 S3 sends no source; a later one may add metrics this client does not know.
  source: z.record(z.string(), z.unknown()).nullable().optional(),
  // A server from before #930 S4 sends neither mode nor data.
  mode: z.string().optional(),
  data: z.record(z.string(), z.unknown()).nullable().optional(),
  // A server from before #927 sends no money fields.
  credits_reserved: referenceAnalysis.shape.credits_reserved.optional(),
  credits_charged: referenceAnalysis.shape.credits_charged.optional(),
  balance_after_credits: referenceAnalysis.shape.balance_after_credits.optional(),
});
export type ReferenceAnalysisRead = z.infer<typeof referenceAnalysisRead>;

/** Rule 3: every element we cannot draw is said in `warnings[]` too, not only inside the profile. */
export function referenceAnalysisWarnings(profile: ReferenceProfile): string[] {
  return [...profile.unmapped.map((entry) =>
    `beat ${entry.beat_index}: ${entry.what} is not drawn by our templates; substitute: ${entry.suggested_substitute}`), ...profile.analysis.warnings ?? []];
}

export const ANALYZE_REFERENCE_DESCRIPTION =
  "Read a reference ad into a reference_profile: its beats (role, timing as shares of the clip, whether the presenter " +
  "speaks, listens or is off screen), the graphics in our template vocabulary, captions, pacing, palette and music. " +
  "It keeps the reference's words: transcript (timed words), hook (the words of its first 3 s, through the end of that sentence), each beat's spoken_summary " +
  "and each graphic's label_hint. " +
  "What we cannot draw is in unmapped with a substitute and in warnings. Pass asset_id of an MP4 asset (create_asset " +
  `with kind: "video"), at most ${ASSET_VIDEO_MAX_SECONDS} s and 100 MiB, or source_url: ${REFERENCE_URL_ACCEPTED}. ` +
  "A link becomes an analysis-only asset of this account (asset_id in the answer) and the answer's source carries the " +
  "post's views, likes, comments, views per hour, the author's median views around it and over their 12 latest reels, each with the ratio, the top comments " +
  "and the code words commenters repeat; a number the platform did not give is null and named in warnings. A YouTube " +
  "link is refused: upload its MP4 with create_asset. " +
  `mode: "data" skips the vision pass and answers data instead of a profile: duration, size and fps, the timed ` +
  "transcript, the hook and a 3×3 frame sheet (a signed JPEG link), with source for a link as above; a reel with no " +
  `speech gives an empty transcript and a warning. ${REFERENCE_ANALYSIS_CREDITS} credits for full, ${REFERENCE_DATA_CREDITS} ` +
  "for data, held at the start and charged once it succeeds; a failed analysis costs nothing. " +
  `${REFERENCE_ANALYSIS_PER_HOUR} new full and ${REFERENCE_DATA_PER_HOUR} new data analyses per hour per account. ` +
  "Answers at once with state queued; call get_reference_analysis every 10 seconds until succeeded (about a minute) or " +
  "failed. The same asset, or the same reel by its full link, in the same mode returns the same analysis, free, unless it " +
  "failed; a short vm.tiktok.com link always starts a new one. The asset is not changed. The profile names techniques; it " +
  "copies no face, voice, music or brand of the reference.";

export const GET_REFERENCE_ANALYSIS_DESCRIPTION =
  "Read an analysis started by analyze_reference: state queued or analyzing, succeeded with reference_profile (mode full) " +
  "or data (mode data) and warnings, or failed with error.code and error.message (timed_out, analysis_failed, asset_gone, " +
  "enqueue_failed); source holds the post's metrics for an analysis started by source_url. " +
  "credits_charged is the price once succeeded, 0 once failed. Free.";

export const QUOTE_ANALYSIS_DESCRIPTION =
  "Price analyze_reference for an asset_id or a source_url and a mode before starting it: credits_estimate is what a start " +
  `holds and charges once it succeeds (${REFERENCE_ANALYSIS_CREDITS} full, ${REFERENCE_DATA_CREDITS} data), 0 when the ` +
  "asset or the reel already has an analysis in that mode that a start would answer (replays_analysis_id). A YouTube or " +
  "unknown link is refused here too. Free; starts nothing.";
