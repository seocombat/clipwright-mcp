import { z } from "zod";
import { ACTOR_PORTRAIT_ASPECT, ACTOR_UNIT_CREDITS, ACTOR_VIEW_PORTRAIT_CREDITS, type ActorQualityAccepted } from "./account-actors.js";
import { CANDIDATE_CHARGE_TEXT } from "./edit-candidate.js";
import { EDIT_RENDER_PRICE, EDIT_UNIT_PRICES, EDIT_ZERO_UNIT_PRICE } from "./edit-billing.js";
import { REVISION_CHARGE_TEXT } from "./edit-revision.js";
import {
  FACELESS_CREDITS_PER_1500_FRAMES, FACELESS_IMAGE_CREDITS, FACELESS_MAX_SELECTED_SECONDS, FACELESS_MIN_BASE_CREDITS,
  FACELESS_MIN_SELECTED_SECONDS, FACELESS_OPENER_CREDITS, FACELESS_SHOT_CREDITS_PER_SECOND, quoteFaceless,
  EXPLAINER_FILM_INCLUDED_SECONDS, EXPLAINER_TIER_TARIFFS, EXPLAINER_TIERS, FACELESS_EXPLAINER_POSE_PICTURES, SKILL_FILM_TARIFFS,
} from "./faceless-price.js";
import { PRESENTER_ENGINES, SHOT_ENGINES } from "./face-billing.js";
import { listGenerationModels } from "./generations.js";
import { PARTS_DURATION_TARIFF, PARTS_FACE_TARIFF, PRESENTER_CREDITS_PER_SECOND, PRESENTER_ENGINE_LABELS, SCENE_CREDITS, SHOT_CREDITS_PER_SECOND,
  SHOT_ENGINE_LABELS } from "./parts-pricing.js";
import type { ServiceOffer } from "./service-offer.js";
import { UPSCALE_CAPABILITIES, UPSCALE_QUOTE_PATH, UPSCALE_RUN_PATH } from "./upscale.js";
import { REFERENCE_ANALYSIS_TARIFFS, REFERENCE_DATA_CREDITS, referenceAnalysisPriceRange, referenceAnalysisPriceTable,
  referenceAnalysisSince, type ReferenceAnalysisTariff } from "./reference-analysis.js";
import { CREATOR_PROFILE_CREDITS, CREATOR_PROFILE_VIDEOS } from "./creator-profile.js";
import {
  TREND_FREE_PAGES_PER_DAY, TREND_FREE_SEARCHES_PER_MONTH, TREND_PAGE_PAID_CREDITS, TREND_PAGE_WINDOW_SECONDS,TREND_SEARCH_CREDITS, TREND_SEARCH_MAX_PAGES, TREND_SEARCH_REELS, TREND_SEARCH_REPLAY_SECONDS,
} from "./trend-search.js";
import { FILM_MUSIC_BED_CREDITS, MUSIC_BED_CREDITS } from "./music.js";
import { HERO_RUNS_PER_HOUR, OWN_FILM_EXTRA_SECOND_CREDITS, OWN_FILM_INCLUDED_SECONDS, OWN_FILM_RENDER_CREDITS, OWN_HERO_POSE_CREDITS, OWN_HERO_POSES,
  OWN_HERO_FREE_POSES_PER_DAY, OWN_HERO_FREE_POSES_WINDOW_HOURS, OWN_FREE_STILLS, OWN_FREE_STILLS_WINDOW_HOURS, OWN_STILL_CREDITS, OWN_STILLS_MAX_PER_CALL, OWN_VOICE_CREDITS_PER_SECOND, OWN_VOICE_FLOOR_CHARS_PER_SECOND, OWN_EDIT_CREDITS,
  OWN_EDIT_MAX_SECONDS, OWN_TAKE_CHECK_CREDITS, OWN_CUT_BED_CREDITS, OWN_CUT_CREDITS, OWN_CUT_EXTRA_SECOND_CREDITS,
  OWN_CUT_INCLUDED_SECONDS, OWN_CUT_MAX_NEW_SOUNDS, OWN_CUT_MAX_SECONDS, OWN_CUT_MIN_SECONDS, OWN_CUT_TAKE_SOUND_CREDITS_PER_SECOND,
  OWN_TAKE_CHECK_PICTURE_CREDITS, OWN_TAKE_CHECK_PICTURE_LONG_CREDITS, OWN_TAKE_FRAMES_MAX, TAKE_PICTURE_SHORT_TIER_SECONDS, OWN_HERO_HEAD_CREDITS,
  OWN_HERO_MAX_SPRITES, OWN_HERO_SPRITE_CREDITS, OWN_HERO_TALKING_POSES, ownAgentTermsNow,
  ownHeroCredits } from "./own-agent-price.js";
import { CUT_PREVIEW_MAX_STILLS } from "./film-cut.js";

export const PRICES_PATH = "/v1/public/prices";

const referenceAnalysisTableText = (tariff: ReferenceAnalysisTariff, index: number): string =>
  `${index === 0 ? "By the reel's length, " : `${referenceAnalysisSince(tariff)}, `}` +
  referenceAnalysisPriceTable(tariff).map((row, at) => `${row.credits}${at === 0 ? " credits" : ""} up to ${row.up_to_s} s`).join(", ");

export const PRICE_UNITS = ["call", "second", "face_second", "image", "clip", "clip_second", "still", "scene", "track"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const priceEntryLine = z.strictObject({
  label: z.string().min(1).nullable(),
  unit: z.enum(PRICE_UNITS),
  credits: z.number().int().nonnegative(),
});
export type PriceEntryLine = z.infer<typeof priceEntryLine>;

export const priceEntry = z.strictObject({
  action: z.string().min(1),
  tool: z.string().min(1).nullable(),
  route: z.string().min(1).nullable(),
  variant: z.string().min(1).nullable(),
  lines: z.array(priceEntryLine),
  formula: z.string().min(1).nullable(),
  minimum_credits: z.number().int().positive().nullable(),
  quote_tool: z.string().min(1).nullable(),
  notes: z.string().min(1).nullable(),
}).refine((entry) => entry.lines.length > 0 || entry.formula !== null, "an entry states lines or a formula");
export type PriceEntry = z.infer<typeof priceEntry>;

export const pricesResponse = z.strictObject({ prices: z.array(priceEntry).min(1) });
export type PricesResponse = z.infer<typeof pricesResponse>;
export const pricesResponseRead = z.looseObject({ prices: z.array(z.looseObject({
  action: z.string().min(1), tool: z.string().nullable(), route: z.string().nullable(), variant: z.string().nullable(),
  lines: z.array(z.looseObject({ label: z.string().nullable(), unit: z.string().min(1), credits: z.number().int().nonnegative() })),
  formula: z.string().nullable(), minimum_credits: z.number().int().positive().nullable(), quote_tool: z.string().nullable(),
  notes: z.string().nullable(),
})) });
export type PricesResponseRead = z.infer<typeof pricesResponseRead>;

export const isPaidEntry = (entry: PriceEntry): boolean => entry.formula !== null || entry.lines.some((line) => line.credits > 0);

type Paid = { tool: string; route: string; variant?: string; quote_tool: string; notes?: string; minimum_credits?: number } &
  ({ unit: PriceUnit; credits: number } | { formula: string } | { lines: PriceEntryLine[] });

const paid = (entry: Paid): PriceEntry => ({
  action: entry.variant === undefined ? entry.tool : `${entry.tool} (${entry.variant})`,
  tool: entry.tool, route: entry.route, variant: entry.variant ?? null,
  lines: "credits" in entry ? [{ label: null, unit: entry.unit, credits: entry.credits }] : "lines" in entry ? entry.lines : [],
  formula: "formula" in entry ? entry.formula : null,
  minimum_credits: entry.minimum_credits ?? null, quote_tool: entry.quote_tool, notes: entry.notes ?? null,
});

export const FREE_RUN_ROUTES: ReadonlySet<string> = new Set(["POST /v1/take-frames"]);

const FREE_TOOLS: Readonly<Record<string, string>> = {
  list_prices: `GET ${PRICES_PATH}`,
  get_account: "GET /v1/account",
  send_feedback: "POST /v1/feedback",
  quote_ugc: "POST /v1/skills/make_ugc/quote",
  quote_analysis: "POST /v1/reference-analyses/quote",
  quote_faceless: "POST /v1/skills/make_faceless/quote",
  quote_actor: "POST /v1/skills/create_actor/quote",
  quote_image: "POST /v1/skills/generate_image/quote",
  quote_video: "POST /v1/skills/generate_video/quote",
  quote_upscale: `POST ${UPSCALE_QUOTE_PATH}`,
  quote_revision: "POST /v1/runs/{id}/revisions/quote",
  quote_candidate: "POST /v1/runs/{id}/candidates/quote",
  quote_workflow_plan: "POST /v1/workflow-plans/{id}/quote",
  get_run: "GET /v1/runs/{id}",
  get_run_shots: "GET /v1/runs/{id}/shots",
  delete_run_media: "DELETE /v1/runs/{id}/media",
  list_voices: "GET /v1/voices",
  list_template_sounds: "GET /v1/template-sounds",
  list_moves: "GET /v1/moves",
  list_generation_models: "GET /v1/generations/models",
  list_actors: "GET /v1/actors",
  delete_actor: "DELETE /v1/actors/{id}",
  get_actor_defaults: "GET /v1/actors/{id}/defaults",
  set_actor_defaults: "POST /v1/actors/{id}/defaults",
  brand_kit: "POST /v1/brand-kit",
  extract_brand: "POST /v1/brand/extract",
  upload_image: "POST /v1/uploads/import",
  create_upload: "POST /v1/uploads/intents",
  get_upload: "GET /v1/uploads/{id}",
  delete_upload: "DELETE /v1/uploads/{id}",
  create_asset: "POST /v1/assets",
  list_assets: "GET /v1/assets",
  get_asset: "GET /v1/assets/{id}",
  update_asset: "POST /v1/assets/{id}",
  delete_asset: "DELETE /v1/assets/{id}",
  get_reference_analysis: "GET /v1/reference-analyses/{id}",
  quote_creator_profile: "POST /v1/creator-profiles/quote",
  get_creator_profile: "GET /v1/creator-profiles/{id}",
  delete_creator_profile: "DELETE /v1/creator-profiles/{id}",
  quote_trends: "POST /v1/trend-searches/quote",
  get_trend_search: "GET /v1/trend-searches/{id}",
  trend_niches: "POST /v1/trend-niches",
  list_workflows: "GET /v1/public/workflows",
  get_workflow: "GET /v1/public/workflows/{id}",
  prepare_workflow_plan: "POST /v1/workflow-plans",
  plan_reference_remake: "POST /v1/workflow-plans/reference-remake",
  get_workflow_plan: "GET /v1/workflow-plans/{id}",
  approve_workflow_plan: "POST /v1/workflow-plans/{id}/approve",
};

const facelessAt = (seconds: number) => quoteFaceless({ outputFrames: seconds * 25, captions: true }).totalCredits;

function generationEntries(): PriceEntry[] {
  return listGenerationModels().flatMap((model) => {
    const video = model.kind === "video";
    const groups = new Map<string, { size: string | null; credits: number; aspects: string[] }>();
    for (const row of model.rows) {
      const key = `${row.resolution}|${row.unit_credits}`;
      const group = groups.get(key) ?? { size: row.resolution, credits: row.unit_credits, aspects: [] };
      group.aspects.push(row.aspect_ratio);
      groups.set(key, group);
    }
    const priced = [...groups.values()];
    return priced.map((group) => {
      const split = priced.filter((other) => other.size === group.size).length > 1;
      const variant = [model.model, group.size, split ? group.aspects.join(", ") : null].filter((part) => part !== null).join(" ");
      return paid(video
        ? { tool: "generate_video", route: "POST /v1/skills/generate_video/run", variant, unit: "clip_second", credits: group.credits,
          quote_tool: "quote_video", notes: "Per second of the requested duration, charged once the clip is delivered." }
        : { tool: "generate_image", route: "POST /v1/skills/generate_image/run", variant, unit: "image", credits: group.credits,
          quote_tool: "quote_image", notes: "Charged once the image is delivered." });
    });
  });
}

function upscaleEntries(): PriceEntry[] {
  const { video, image } = UPSCALE_CAPABILITIES;
  const clipCredits = [...new Set(video.rows.filter((row) => row.measured).map((row) => row.unit_credits))];
  return [
    ...clipCredits.map((credits) => paid({ tool: "upscale", route: `POST ${UPSCALE_RUN_PATH}`, variant: "clip", unit: "clip_second", credits,
      quote_tool: "quote_upscale", notes: "Per second of the source clip, charged once the larger clip is delivered; a failed upscale costs nothing." })),
    ...(image.measured ? [paid({ tool: "upscale", route: `POST ${UPSCALE_RUN_PATH}`, variant: "picture", unit: "image",
      credits: image.unit_credits, quote_tool: "quote_upscale",
      notes: "The picture doubled on each side, charged once it is delivered; a failed upscale costs nothing." })] : []),
  ];
}

export interface DiyModesSold { readonly ad: boolean; readonly faceless: boolean }
export const NO_DIY_MODES: DiyModesSold = Object.freeze({ ad: false, faceless: false });

const adDiyPrices = (): PriceEntry[] => [
  paid({ tool: "render_edit", route: "POST /v1/film-edits", quote_tool: "quote_edit",
    lines: [{ label: `the cut, up to ${OWN_EDIT_MAX_SECONDS} s`, unit: "call", credits: OWN_EDIT_CREDITS },
      { label: "music made for the cut", unit: "track", credits: MUSIC_BED_CREDITS }],
    notes: `One cut of your own clips with your voice and captions, up to ${OWN_EDIT_MAX_SECONDS} s, vertical 720p. Charged only for a ` +
      "delivered cut; an edit that fails costs nothing." +
      " A library music bed is free; music made for the cut is charged only when the delivered cut carries it." }),
  paid({ tool: "check_take", route: "POST /v1/take-checks", quote_tool: "quote_take_check", unit: "call", credits: OWN_TAKE_CHECK_CREDITS,
    notes: "One of your clips judged frame by frame against the prompt it was made with: each defect with its seconds and how to repair " +
      "it, and the clean windows. Charged only for a delivered verdict; a check that delivers no verdict costs nothing." }),
];

const TAKE_FRAMES_PRICE: PriceEntry = { action: "take_frames", tool: "take_frames", route: "POST /v1/take-frames", variant: null,
  lines: [{ label: null, unit: "call", credits: 0 }], formula: null, minimum_credits: null, quote_tool: null,
  notes: `Free: one of your clips as contact sheets, each frame labelled with its second, up to ${OWN_TAKE_FRAMES_MAX} frames a call.` };

const facelessDiyPrices = (): PriceEntry[] => [
  paid({ tool: "render_cut", route: "POST /v1/film-cuts", quote_tool: "quote_cut", lines: [
    { label: `the cut, up to ${OWN_CUT_INCLUDED_SECONDS} s`, unit: "call", credits: OWN_CUT_CREDITS },
    { label: `each second over ${OWN_CUT_INCLUDED_SECONDS}`, unit: "second", credits: OWN_CUT_EXTRA_SECOND_CREDITS },
    { label: "a described bed, once per cut", unit: "call", credits: OWN_CUT_BED_CREDITS },
    { label: "a take's own sound, each second of the whole take", unit: "second", credits: OWN_CUT_TAKE_SOUND_CREDITS_PER_SECOND },
    { label: "music", unit: "track", credits: MUSIC_BED_CREDITS }],
  notes: `One faceless video of ${OWN_CUT_MIN_SECONDS} to ${OWN_CUT_MAX_SECONDS} s from your checked cut sheet, vertical 720p in stereo, with up ` +
    `to ${OWN_CUT_MAX_NEW_SOUNDS} described sounds made. Charged only for a delivered video and only for the parts it carries; a cut that ` +
    "fails costs nothing." }),
  paid({ tool: "check_take", variant: "against a picture", route: "POST /v1/take-checks", quote_tool: "quote_take_check", unit: "call",
    credits: OWN_TAKE_CHECK_PICTURE_CREDITS,
    notes: `One take of your cut record, up to ${TAKE_PICTURE_SHORT_TIER_SECONDS} s long, judged against the picture it was made from: each ` +
      "defect with its seconds, the clean windows, the second its action shows and where its subject stands. Charged only for a delivered " +
      "verdict; a check that delivers no verdict costs nothing." }),
  paid({ tool: "check_take", variant: `against a picture, a take over ${TAKE_PICTURE_SHORT_TIER_SECONDS} s`, route: "POST /v1/take-checks",
    quote_tool: "quote_take_check", unit: "call", credits: OWN_TAKE_CHECK_PICTURE_LONG_CREDITS,
    notes: `The same check of a take longer than ${TAKE_PICTURE_SHORT_TIER_SECONDS} s. Charged only for a delivered verdict; a check that ` +
      "delivers no verdict costs nothing." }),
  paid({ tool: "preview_cut", route: "POST /v1/cut-previews", quote_tool: "quote_cut_preview", unit: "still", credits: OWN_STILL_CREDITS,
    notes: `Up to ${CUT_PREVIEW_MAX_STILLS} frames of your checked cut sheet as the video draws them, on the words you name. The first ` +
      `${OWN_FREE_STILLS} preview stills of an account in any ${OWN_FREE_STILLS_WINDOW_HOURS} h are free; a preview that fails costs nothing.` }),
];

export const diyPriceEntries = (diy: DiyModesSold): PriceEntry[] => [
  ...(diy.ad ? adDiyPrices() : []),
  ...(diy.faceless ? facelessDiyPrices() : []),
  ...(diy.ad || diy.faceless ? [TAKE_FRAMES_PRICE] : []),
];

function buildPriceList(offer: ServiceOffer, diy: DiyModesSold): PriceEntry[] {
  const liveShots = offer.longForm, scenes = offer.longForm;
  const { explainerFilm: explainer, ownAgent, heygenAvatar6: avatar6, heroSprites, filmHead } = offer;
  const unit = EDIT_UNIT_PRICES;
  const parts = PARTS_FACE_TARIFF;
  const shotRates = parts.shotCreditsPerSecond ?? SHOT_CREDITS_PER_SECOND;
  const shotLines: PriceEntryLine[] = liveShots ? SHOT_ENGINES.flatMap((shot): PriceEntryLine[] => shotRates[shot] === undefined ? []
    : [{ label: SHOT_ENGINE_LABELS[shot], unit: "face_second", credits: shotRates[shot] }]) : [];
  const sceneLines: PriceEntryLine[] = scenes ? [{ label: "scene made for the video", unit: "scene", credits: SCENE_CREDITS }] : [];
  const musicLine: PriceEntryLine = { label: "music under the voice", unit: "track", credits: MUSIC_BED_CREDITS };
  return [
    ...PRESENTER_ENGINES.map((engine) => paid({ tool: "make_ugc", route: "POST /v1/skills/make_ugc/run",
      variant: engine === "heygen" ? "HeyGen presenter" : "OmniHuman presenter", quote_tool: "quote_ugc", minimum_credits: parts.minimumCredits,
      lines: [{ label: PRESENTER_ENGINE_LABELS[engine], unit: "face_second", credits: parts.presenterCreditsPerSecond[engine] },
        ...shotLines,
        { label: "production (voice and render)", unit: "second", credits: parts.productionCreditsPerSecond },
        { label: "live avatar on a call", unit: "still", credits: parts.liveAvatarStillCredits },
        ...sceneLines, musicLine],
      notes: "Short and long videos alike. Presenter seconds are the seconds a presenter take fills, covered by an insert, overlay, " +
        "window or template or not, counted once over the video and rounded up; the engine that renders each take sets its rate " +
        (engine === "heygen" ? "(today every take renders on HeyGen). " : "(no take renders on OmniHuman today). ") +
        "Production seconds are every second of the finished video. A live avatar is charged per call still in the video." +
        (liveShots ? " A live shot's seconds take its own line in place of the presenter's; talking shots stay on the presenter line." : "") +
        (scenes ? " A scene made for the video is charged only when it is drawn in the delivered video." : "") +
        " Music is added only when you ask for it and charged only when the delivered video carries it." })),
    ...(avatar6 ? [paid({ tool: "make_ugc", route: "POST /v1/skills/make_ugc/run", variant: "HeyGen Avatar 6 Turbo presenter",
      quote_tool: "quote_ugc", minimum_credits: PARTS_DURATION_TARIFF.minimumCredits,
      lines: [{ label: PRESENTER_ENGINE_LABELS.heygen_avatar6_turbo, unit: "face_second", credits: PRESENTER_CREDITS_PER_SECOND.heygen_avatar6_turbo },
        ...shotLines,
        { label: "production (voice and render)", unit: "second", credits: PARTS_DURATION_TARIFF.productionCreditsPerSecond },
        ...sceneLines, musicLine],
      notes: "presenter_engine avatar6_turbo, the default of a 9:16 video, short or long, whose presenter picture is within 2% of 9:16, " +
        "with no call, interview, presenter_gaze or talking shot and no presenter part longer than about 36 s; any other video renders " +
        "on HeyGen Avatar IV. Presenter seconds are the seconds a presenter take fills, counted once over the video and rounded up; " +
        "production seconds are every second of the finished video." })] : []),
    paid({ tool: "analyze_reference", route: "POST /v1/reference-analyses", formula: referenceAnalysisPriceRange(),
      quote_tool: "quote_analysis", notes: `${REFERENCE_ANALYSIS_TARIFFS.map(referenceAnalysisTableText).join("; ")}. ` +
        "A link of unknown length holds the most and is charged by the length. " +
        "Held at the start and charged once the analysis succeeds; a failed one costs nothing. " +
        "Starting it again on the same asset answers the same analysis for free." }),
    paid({ tool: "analyze_reference", route: "POST /v1/reference-analyses", variant: "data mode", unit: "call", credits: REFERENCE_DATA_CREDITS,
      quote_tool: "quote_analysis", notes: "mode: \"data\": duration, size, timed transcript, hook and a frame sheet, without the vision pass. " +
        "Held at the start and charged once it succeeds; a failed one costs nothing." }),
    paid({ tool: "analyze_creator", route: "POST /v1/creator-profiles", unit: "call", credits: CREATOR_PROFILE_CREDITS,
      quote_tool: "quote_creator_profile", notes: `A creator's latest ${CREATOR_PROFILE_VIDEOS} videos with each one's x to their median views. ` +
        "Held at the start and charged once it succeeds; a private or empty account, or a failed profile, costs nothing. " +
        "The same creator again within an hour answers the same profile for free." }),
    paid({ tool: "find_trends", route: "POST /v1/trend-searches", unit: "call", credits: TREND_SEARCH_CREDITS,
      quote_tool: "quote_trends", notes: `Up to ${TREND_SEARCH_REELS} reels per platform on a topic, TikTok and Instagram together by ` +
        "default, each with its x to its creator's median views. The same price for one platform or both. " +
        "Held at the start and charged once it succeeds, a mix that reaches only one platform included; no reel found, or a failed search, costs nothing. " +
        `The same query again within ${TREND_SEARCH_REPLAY_SECONDS / 3600} hours answers the same search for free. ` +
        `Every account gets ${TREND_FREE_SEARCHES_PER_MONTH} free searches each calendar month; a failed one does not count. ` +
        `A finished search's next pages are free for ${TREND_PAGE_WINDOW_SECONDS / 3600} hours after the search: up to ` +
        `${TREND_SEARCH_REELS} more creators per platform each, up to ${TREND_SEARCH_MAX_PAGES} pages with the first, ` +
        `${TREND_FREE_PAGES_PER_DAY} free pages a day per account; past them a page costs ${TREND_PAGE_PAID_CREDITS} credits, ` +
        "charged once it finds new reels." }),
    paid({ tool: "make_faceless", route: "POST /v1/skills/make_faceless/run", quote_tool: "quote_faceless",
      lines: [{ label: "generated picture", unit: "image", credits: FACELESS_IMAGE_CREDITS },
        { label: "opening clip", unit: "clip", credits: FACELESS_OPENER_CREDITS },
        { label: "production (story, voice and render)", unit: "second", credits: FACELESS_CREDITS_PER_1500_FRAMES / 60 },
        { label: "action shot", unit: "clip_second", credits: FACELESS_SHOT_CREDITS_PER_SECOND },
        ...(scenes ? [{ label: "scene made for the video", unit: "scene", credits: SCENE_CREDITS } satisfies PriceEntryLine] : []),
        { label: "music under the voice", unit: "track", credits: MUSIC_BED_CREDITS }],
      minimum_credits: FACELESS_MIN_BASE_CREDITS,
      notes: `Pictures we generated for the delivered video and its seconds, never above the selected length. The quote is the most a ` +
        `selection is charged, every picture it may generate: ${facelessAt(FACELESS_MIN_SELECTED_SECONDS)} for ` +
        `${FACELESS_MIN_SELECTED_SECONDS} s, ${facelessAt(FACELESS_MAX_SELECTED_SECONDS)} for ${FACELESS_MAX_SELECTED_SECONDS} s. ` +
        "Captions do not change the price." +
        " Music is added only when you ask for it and charged only when the delivered video carries it." }),
    ...(explainer ? EXPLAINER_TIERS.map(tier => paid({ tool: "make_faceless", route: "POST /v1/skills/make_faceless/run", quote_tool: "quote_faceless",
      variant: `explainer ${tier}`,
      lines: [{ label: `film up to ${EXPLAINER_FILM_INCLUDED_SECONDS} s`, unit: "call", credits: SKILL_FILM_TARIFFS[EXPLAINER_TIER_TARIFFS[tier]].filmCredits },
        { label: `each second over ${EXPLAINER_FILM_INCLUDED_SECONDS} s`, unit: "second", credits: SKILL_FILM_TARIFFS[EXPLAINER_TIER_TARIFFS[tier]].perExtraSecond },
        { label: "hero pose picture", unit: "image", credits: FACELESS_IMAGE_CREDITS }],
      notes: `tier ${tier}${tier === "standard" ? " (the default)" : ""}. A drawn explainer film, made in about half an hour and charged only when ` +
        "delivered, by its length. A mascot is the hero for free; a character you name, or one we draw to fit the script, adds its " +
        `${FACELESS_EXPLAINER_POSE_PICTURES} pose pictures, ${FACELESS_IMAGE_CREDITS} credits each for the pictures made, charged only with a ` +
        "delivered video; a drawn pose whose mouth cannot move with the voice is shown with a warning and not charged." })) : []),
    ...(ownAgent ? [
      paid({ tool: "preview_stills", route: "POST /v1/film-stills", quote_tool: "quote_stills", unit: "still", credits: OWN_STILL_CREDITS,
        notes: `Up to ${OWN_STILLS_MAX_PER_CALL} stills of a film draft per call. The first ${OWN_FREE_STILLS} stills drawn of each draft in any ` +
          `${OWN_FREE_STILLS_WINDOW_HOURS} hours are free; each still past them is charged once it is drawn. quote_stills says how many of yours ` +
          "are free. A draft its check refuses costs nothing and uses none of the free stills." }),
      paid({ tool: "make_voice", route: "POST /v1/film-voices", quote_tool: "quote_voice", unit: "second", credits: OWN_VOICE_CREDITS_PER_SECOND,
        notes: "A narrated take with each word's timing, charged by its delivered seconds and at least one credit for every " +
          `${OWN_VOICE_FLOOR_CHARS_PER_SECOND} characters of its script, however short it plays; a take that fails costs nothing.` }),
      paid({ tool: "render_film", route: "POST /v1/film-renders", quote_tool: "quote_render",
        lines: [{ label: `film up to ${OWN_FILM_INCLUDED_SECONDS} s`, unit: "call", credits: OWN_FILM_RENDER_CREDITS },
          { label: `each second over ${OWN_FILM_INCLUDED_SECONDS} s`, unit: "second", credits: OWN_FILM_EXTRA_SECOND_CREDITS },
          { label: "music made for the film", unit: "track", credits: FILM_MUSIC_BED_CREDITS }],
        notes: "Charged only for a delivered film, by its length; a render that fails costs nothing." +
          " A library music bed is free; music made for the film is charged only when the delivered film carries it." }),
      paid({ tool: "make_film_hero", route: "POST /v1/film-heroes", quote_tool: "quote_film_hero",
        lines: [{ label: null, unit: "image", credits: OWN_HERO_POSE_CREDITS },
          ...(heroSprites ? [{ label: "talking sprite", unit: "image", credits: OWN_HERO_SPRITE_CREDITS } satisfies PriceEntryLine] : [])],
        notes: (heroSprites ? `A new drawn hero's ${OWN_HERO_TALKING_POSES.length} talking poses also get ${OWN_HERO_MAX_SPRITES} sprites ` +
          `(mouth half open, mouth open and a blink for each), each charged once it is published: a whole hero is ` +
          `${ownHeroCredits(OWN_HERO_POSES, ownAgentTermsNow({ sprites: true }), OWN_HERO_MAX_SPRITES)} credits. A photoreal hero gets no ` +
          "sprites. " : "") +
          `A hero in up to ${OWN_HERO_POSES} pose pictures, saved as a mascot of your assets; each pose is charged once it is published, except ` +
          "a drawn pose whose face shows but whose mouth cannot move with the voice, or whose face could not be read, which is published " +
          `with a warning and not charged (a pose with no face to animate is charged); at most ${HERO_RUNS_PER_HOUR} heroes an hour, and ` +
          `none while the account has received ${OWN_HERO_FREE_POSES_PER_DAY} such uncharged poses in the last ${OWN_HERO_FREE_POSES_WINDOW_HOURS} hours; a ` +
          "film that uses the mascot makes and charges none again. Completing a saved mascot charges only the poses it adds. A hero that " +
          "publishes no pose costs nothing." }),
      ...(filmHead ? [paid({ tool: "make_film_hero", route: "POST /v1/film-heroes", quote_tool: "quote_film_hero", variant: "head",
        unit: "call", credits: OWN_HERO_HEAD_CREDITS,
        notes: "head true with your photo or your actor's picture: the head drawn as a cartoon that talks, blinks and changes its look, saved " +
          "as a mascot a film's actor wears. One price per head, charged only when the head is saved with all its pictures; a head that " +
          "fails costs nothing." })] : []),
      ...diyPriceEntries(diy),
    ] : []),
    paid({ tool: "revise_run", route: "POST /v1/runs/{id}/revisions", quote_tool: "quote_revision",
      formula: `each shot generated anew: picture ${unit.picture}, clip ${unit.clip}, clip with a new picture ${unit.clip_with_new_picture}; ` +
        `plus ${EDIT_RENDER_PRICE} to render. A revision that generates nothing: ${EDIT_ZERO_UNIT_PRICE}. A kept candidate adds nothing`,
      notes: REVISION_CHARGE_TEXT }),
    ...([["picture", "image", unit.picture], ["clip", "clip", unit.clip], ["clip with a new picture", "clip", unit.clip_with_new_picture]] as const)
      .map(([variant, priceUnit, credits]) => paid({ tool: "create_candidate", route: "POST /v1/runs/{id}/candidates", variant,
        unit: priceUnit, credits, quote_tool: "quote_candidate", notes: CANDIDATE_CHARGE_TEXT })),
    ...Object.entries(ACTOR_UNIT_CREDITS).flatMap(([quality, credits]) => [
      paid({ tool: "create_actor", route: "POST /v1/skills/create_actor/run", variant: `${quality} portrait`, unit: "image",
        credits: credits.portrait, quote_tool: "quote_actor",
        notes: "Each published image; a refused description or an unusable portrait costs nothing, and so does your own image passed in portrait." }),
      paid({ tool: "create_actor", route: "POST /v1/skills/create_actor/run", variant: `${quality} view of an existing actor`, unit: "image",
        credits: ACTOR_VIEW_PORTRAIT_CREDITS[quality as ActorQualityAccepted], quote_tool: "quote_actor",
        notes: "The portrait of a view made with from_actor_id, once published; a face that does not match costs nothing." }),
      paid({ tool: "create_actor", route: "POST /v1/skills/create_actor/run", variant: `${quality} other format`, unit: "image",
        credits: credits.variant, quote_tool: "quote_actor", notes: `Each requested format besides the ${ACTOR_PORTRAIT_ASPECT} portrait, once published.` }),
    ]),
    ...generationEntries(),
    ...upscaleEntries(),
    paid({ tool: "run_workflow_plan", route: "POST /v1/workflow-plans/{id}/run", quote_tool: "quote_workflow_plan",
      formula: "the price of the native run it starts, make_ugc or make_faceless, as its quote states it" }),
    ...Object.entries(FREE_TOOLS).map(([tool, route]): PriceEntry => ({ action: tool, tool, route, variant: null,
      lines: [{ label: null, unit: "call", credits: 0 }], formula: null, minimum_credits: null, quote_tool: null, notes: null })),
  ];
}

export function priceListFor(offer: ServiceOffer, diy: DiyModesSold = NO_DIY_MODES): readonly PriceEntry[] {
  return Object.freeze(pricesResponse.parse({ prices: buildPriceList(offer, diy) }).prices);
}

const UNIT_TEXT: Readonly<Record<PriceUnit, string>> = {
  call: "call", second: "second of video", face_second: "second the presenter is in the video, covered or not", image: "image", clip: "clip",
  clip_second: "second of clip", still: "call still in the video", scene: "scene drawn in the video", track: "music track in the video",
};
const LISTED_PRICES = 4;
const RANGE_BASIS: Readonly<Record<string, string>> = { create_actor: "by quality and image kind" };
const ENGINE_PRICED: ReadonlySet<string> = new Set(["make_ugc"]);

export const priceText = (entry: PriceEntry): string => entry.lines.length === 0 ? entry.formula ?? "" :
  entry.lines.map(lineText).join(" plus ") + (entry.minimum_credits === null ? "" : `, at least ${entry.minimum_credits}`);
const lineText = (line: PriceEntry["lines"][number]): string => `${line.label === null ? "" : `${line.label} `}${line.credits} credits per ${UNIT_TEXT[line.unit]}`;

export function priceLine(tool: string, list: readonly PriceEntry[]): string | null {
  const entries = list.filter((entry) => entry.tool === tool && isPaidEntry(entry));
  const [first] = entries;
  if (first === undefined) return null;
  const unit = first.lines[0]?.unit;
  const single = entries.flatMap((entry) => (entry.formula === null && entry.lines.length === 1 && entry.lines[0]!.unit === unit
    ? [entry.lines[0]!.credits] : []));
  const rest = (entry: PriceEntry) => JSON.stringify([entry.lines.slice(1), entry.minimum_credits]);
  const shared = entries.length > 1 && entries.every((entry) => entry.formula === null && entry.lines.length > 1 && rest(entry) === rest(first));
  const production = (entry: PriceEntry) => entry.lines.find((line) => line.unit === "second");
  const base = (entry: PriceEntry) => JSON.stringify([entry.lines[0]?.unit, production(entry), entry.minimum_credits]);
  const engines = ENGINE_PRICED.has(tool) && entries.length > 1 &&
    entries.every((entry) => entry.formula === null && production(entry) !== undefined && base(entry) === base(first));
  const text = unit !== undefined && single.length === entries.length && single.length > LISTED_PRICES
    ? `${Math.min(...single)} to ${Math.max(...single)} credits per ${UNIT_TEXT[unit]}, ${RANGE_BASIS[tool] ?? "by model and size"}`
    : engines
      ? `starting at ${Math.min(...entries.map((entry) => entry.lines[0]!.credits))} credits per ${UNIT_TEXT[unit!]}, by presenter engine, plus ` +
        `${lineText(production(first)!)}${first.minimum_credits === null ? "" : `, at least ${first.minimum_credits}`}; ` +
        "list_prices names each engine and add-on"
      : shared
      ? `${entries.map((entry) => `${entry.variant === null ? "" : `${entry.variant}: `}${lineText(entry.lines[0]!)}`).join("; ")}; each plus ` +
        `${first.lines.slice(1).map(lineText).join(" plus ")}${first.minimum_credits === null ? "" : `, at least ${first.minimum_credits}`}`
      : entries.map((entry) => `${entry.variant === null ? "" : `${entry.variant}: `}${priceText(entry)}`).join("; ");
  return `Price: ${text}. Quote first with ${first.quote_tool}.`;
}

export const withPriceLine = (tool: string, description: string, list: readonly PriceEntry[]): string => {
  const line = priceLine(tool, list);
  if (line === null) throw new Error(`${tool} has no price in the list`);
  return `${description} ${line}`;
};
