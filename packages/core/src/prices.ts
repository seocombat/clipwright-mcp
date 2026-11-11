import { z } from "zod";
import { ACTOR_PORTRAIT_ASPECT, ACTOR_UNIT_CREDITS, ACTOR_VIEW_PORTRAIT_CREDITS, type ActorQualityAccepted } from "./account-actors.js";
import { CANDIDATE_CHARGE_TEXT } from "./edit-candidate.js";
import { EDIT_RENDER_PRICE, EDIT_UNIT_PRICES, EDIT_ZERO_UNIT_PRICE } from "./edit-billing.js";
import { REVISION_CHARGE_TEXT } from "./edit-revision.js";
import {
  FACELESS_CREDITS_PER_1500_FRAMES, FACELESS_IMAGE_CREDITS, FACELESS_MAX_SELECTED_SECONDS, FACELESS_MIN_BASE_CREDITS,
  FACELESS_MIN_SELECTED_SECONDS, FACELESS_OPENER_CREDITS, FACELESS_SHOT_CREDITS_PER_SECOND, facelessScenesEnabled, quoteFaceless,
  EXPLAINER_FILM_INCLUDED_SECONDS, EXPLAINER_TIER_TARIFFS, EXPLAINER_TIERS, FACELESS_EXPLAINER_POSE_PICTURES, facelessExplainerEnabled,
  SKILL_FILM_TARIFFS,
} from "./faceless-price.js";
import { PRESENTER_ENGINES, SHOT_ENGINES } from "./face-billing.js";
import { listGenerationModels } from "./generations.js";
import { PARTS_FACE_TARIFF, PRESENTER_ENGINE_LABELS, SCENE_CREDITS, SHOT_CREDITS_PER_SECOND, SHOT_ENGINE_LABELS } from "./parts-pricing.js";
import { REFERENCE_ANALYSIS_CREDITS, REFERENCE_DATA_CREDITS } from "./reference-analysis.js";
import { CREATOR_PROFILE_CREDITS, CREATOR_PROFILE_VIDEOS } from "./creator-profile.js";
import { TREND_SEARCH_CREDITS, TREND_SEARCH_REELS } from "./trend-search.js";
import { isMusicEnabled, MUSIC_BED_CREDITS } from "./music.js";
import { isOwnAgentEnabled, OWN_FILM_EXTRA_SECOND_CREDITS, OWN_FILM_INCLUDED_SECONDS, OWN_FILM_RENDER_CREDITS, OWN_HERO_POSE_CREDITS, OWN_HERO_POSES,
  OWN_FREE_STILLS, OWN_FREE_STILLS_WINDOW_HOURS, OWN_STILL_CREDITS, OWN_STILLS_MAX_PER_CALL, OWN_VOICE_CREDITS_PER_SECOND } from "./own-agent-price.js";

/** The public price list (#927): every number is read from the constant billing charges by, never typed here. */
export const PRICES_PATH = "/v1/public/prices";

export const PRICE_UNITS = ["call", "second", "face_second", "image", "clip", "clip_second", "still", "scene", "track"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

/** One part of a price: credits per unit. A price of several parts adds them, then applies the entry's minimum. */
export const priceEntryLine = z.strictObject({
  label: z.string().min(1).nullable(),
  unit: z.enum(PRICE_UNITS),
  credits: z.number().int().nonnegative(),
});
export type PriceEntryLine = z.infer<typeof priceEntryLine>;

export const priceEntry = z.strictObject({
  action: z.string().min(1),
  tool: z.string().min(1).nullable(),
  /** The REST route as `endpointLabel` writes it. */
  route: z.string().min(1).nullable(),
  variant: z.string().min(1).nullable(),
  /** Empty when the price is a formula the parts cannot state. */
  lines: z.array(priceEntryLine),
  formula: z.string().min(1).nullable(),
  minimum_credits: z.number().int().positive().nullable(),
  quote_tool: z.string().min(1).nullable(),
  notes: z.string().min(1).nullable(),
}).refine((entry) => entry.lines.length > 0 || entry.formula !== null, "an entry states lines or a formula");
export type PriceEntry = z.infer<typeof priceEntry>;

export const pricesResponse = z.strictObject({ prices: z.array(priceEntry).min(1) });
export type PricesResponse = z.infer<typeof pricesResponse>;
/** What a client reads: a unit or a field it does not know yet must not break it. */
export const pricesResponseRead = z.looseObject({ prices: z.array(z.looseObject({
  action: z.string().min(1), tool: z.string().nullable(), route: z.string().nullable(), variant: z.string().nullable(),
  lines: z.array(z.looseObject({ label: z.string().nullable(), unit: z.string().min(1), credits: z.number().int().nonnegative() })),
  formula: z.string().nullable(), minimum_credits: z.number().int().positive().nullable(), quote_tool: z.string().nullable(),
  notes: z.string().nullable(),
})) });
export type PricesResponseRead = z.infer<typeof pricesResponseRead>;

/** Whether calling the entry's action may cost credits. */
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

/** Every free MCP tool and the route it calls. */
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

function buildPriceList(liveShots: boolean, scenes: boolean, facelessShots = false, facelessScenes = false, music = false, explainer = false,
  ownAgent = false): PriceEntry[] {
  const unit = EDIT_UNIT_PRICES;
  const parts = PARTS_FACE_TARIFF;
  const shotRates = parts.shotCreditsPerSecond ?? SHOT_CREDITS_PER_SECOND;
  return [
    ...PRESENTER_ENGINES.map((engine) => paid({ tool: "make_ugc", route: "POST /v1/skills/make_ugc/run",
      variant: engine === "heygen" ? "HeyGen presenter" : "OmniHuman presenter", quote_tool: "quote_ugc", minimum_credits: parts.minimumCredits,
      lines: [{ label: PRESENTER_ENGINE_LABELS[engine], unit: "face_second", credits: parts.presenterCreditsPerSecond[engine] },
        // Live shots are sold only while they can be ordered (#1103).
        ...(liveShots ? SHOT_ENGINES.map((shot): PriceEntryLine => ({ label: SHOT_ENGINE_LABELS[shot], unit: "face_second", credits: shotRates[shot] }))
          : []),
        { label: "production (voice and render)", unit: "second", credits: parts.productionCreditsPerSecond },
        { label: "live avatar on a call", unit: "still", credits: parts.liveAvatarStillCredits },
        // Scenes are sold only while they can be ordered (#1107).
        ...(scenes ? [{ label: "scene made for the video", unit: "scene", credits: SCENE_CREDITS } satisfies PriceEntryLine] : []),
        // Music is sold only while it can be ordered (#1063, #1215).
        ...(music ? [{ label: "music under the voice", unit: "track", credits: MUSIC_BED_CREDITS } satisfies PriceEntryLine] : [])],
      notes: "Short and long videos alike. Presenter seconds are the seconds a presenter take fills, covered by an insert, overlay, " +
        "window or template or not, counted once over the video and rounded up; the engine that renders each take sets its rate " +
        (engine === "heygen" ? "(today every take renders on HeyGen). " : "(no take renders on OmniHuman today). ") +
        "Production seconds are every second of the finished video. A live avatar is charged per call still in the video." +
        (liveShots ? " A live shot's seconds take its own line in place of the presenter's; talking shots stay on the presenter line." : "") +
        (scenes ? " A scene made for the video is charged only when it is drawn in the delivered video." : "") +
        (music ? " Music is added only when you ask for it and charged only when the delivered video carries it." : "") })),
    paid({ tool: "analyze_reference", route: "POST /v1/reference-analyses", unit: "call", credits: REFERENCE_ANALYSIS_CREDITS,
      quote_tool: "quote_analysis", notes: "Held at the start and charged once the analysis succeeds; a failed one costs nothing. " +
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
        "The same query again within an hour answers the same search for free." }),
    paid({ tool: "make_faceless", route: "POST /v1/skills/make_faceless/run", quote_tool: "quote_faceless",
      lines: [{ label: "generated picture", unit: "image", credits: FACELESS_IMAGE_CREDITS },
        { label: "opening clip", unit: "clip", credits: FACELESS_OPENER_CREDITS },
        { label: "production (story, voice and render)", unit: "second", credits: FACELESS_CREDITS_PER_1500_FRAMES / 60 },
        // Action shots and scenes are sold only while they can be ordered (#1113).
        ...(facelessShots ? [{ label: "action shot", unit: "clip_second", credits: FACELESS_SHOT_CREDITS_PER_SECOND } satisfies PriceEntryLine] : []),
        ...(facelessScenes ? [{ label: "scene made for the video", unit: "scene", credits: SCENE_CREDITS } satisfies PriceEntryLine] : []),
        // Music is sold only while it can be ordered (#1063).
        ...(music ? [{ label: "music under the voice", unit: "track", credits: MUSIC_BED_CREDITS } satisfies PriceEntryLine] : [])],
      minimum_credits: FACELESS_MIN_BASE_CREDITS,
      notes: `Pictures we generated for the delivered video and its seconds, never above the selected length. The quote is the most a ` +
        `selection is charged, every picture it may generate: ${facelessAt(FACELESS_MIN_SELECTED_SECONDS)} for ` +
        `${FACELESS_MIN_SELECTED_SECONDS} s, ${facelessAt(FACELESS_MAX_SELECTED_SECONDS)} for ${FACELESS_MAX_SELECTED_SECONDS} s. ` +
        "Captions do not change the price." +
        (music ? " Music is added only when you ask for it and charged only when the delivered video carries it." : "") }),
    // The explainer format (#1216) is sold only while it can be ordered, one entry a level (#1291 F4).
    ...(explainer ? EXPLAINER_TIERS.map(tier => paid({ tool: "make_faceless", route: "POST /v1/skills/make_faceless/run", quote_tool: "quote_faceless",
      variant: `explainer ${tier}`,
      lines: [{ label: `film up to ${EXPLAINER_FILM_INCLUDED_SECONDS} s`, unit: "call", credits: SKILL_FILM_TARIFFS[EXPLAINER_TIER_TARIFFS[tier]].filmCredits },
        { label: `each second over ${EXPLAINER_FILM_INCLUDED_SECONDS} s`, unit: "second", credits: SKILL_FILM_TARIFFS[EXPLAINER_TIER_TARIFFS[tier]].perExtraSecond },
        { label: "hero pose picture", unit: "image", credits: FACELESS_IMAGE_CREDITS }],
      notes: `tier ${tier}${tier === "standard" ? " (the default)" : ""}. A drawn explainer film, made in about half an hour and charged only when ` +
        "delivered, by its length. A mascot is the hero for free; a character you name, or one we draw to fit the script, adds its " +
        `${FACELESS_EXPLAINER_POSE_PICTURES} pose pictures, ${FACELESS_IMAGE_CREDITS} credits each for the pictures made, charged only with a ` +
        "delivered video." })) : []),
    // The «own agent» film runs (#1337) are sold only while the mode is offered.
    ...(ownAgent ? [
      paid({ tool: "preview_stills", route: "POST /v1/film-stills", quote_tool: "quote_stills", unit: "still", credits: OWN_STILL_CREDITS,
        notes: `Up to ${OWN_STILLS_MAX_PER_CALL} stills of a film draft per call. The first ${OWN_FREE_STILLS} stills drawn of each draft in any ` +
          `${OWN_FREE_STILLS_WINDOW_HOURS} hours are free; each still past them is charged once it is drawn. quote_stills says how many of yours ` +
          "are free. A draft its check refuses costs nothing and uses none of the free stills." }),
      paid({ tool: "make_voice", route: "POST /v1/film-voices", quote_tool: "quote_voice", unit: "second", credits: OWN_VOICE_CREDITS_PER_SECOND,
        notes: "A narrated take with each word's timing, charged by its delivered seconds; a take that fails costs nothing." }),
      paid({ tool: "render_film", route: "POST /v1/film-renders", quote_tool: "quote_render",
        lines: [{ label: `film up to ${OWN_FILM_INCLUDED_SECONDS} s`, unit: "call", credits: OWN_FILM_RENDER_CREDITS },
          { label: `each second over ${OWN_FILM_INCLUDED_SECONDS} s`, unit: "second", credits: OWN_FILM_EXTRA_SECOND_CREDITS }],
        notes: "Charged only for a delivered film, by its length; a render that fails costs nothing." }),
      paid({ tool: "make_film_hero", route: "POST /v1/film-heroes", quote_tool: "quote_film_hero", unit: "image", credits: OWN_HERO_POSE_CREDITS,
        notes: `A hero in up to ${OWN_HERO_POSES} pose pictures, saved as a mascot of your assets; each pose is charged once it is published, and a ` +
          "film that uses the mascot makes and charges none again. Completing a saved mascot charges only the poses it adds. A hero that " +
          "publishes no pose costs nothing." }),
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
    paid({ tool: "run_workflow_plan", route: "POST /v1/workflow-plans/{id}/run", quote_tool: "quote_workflow_plan",
      formula: "the price of the native run it starts, make_ugc or make_faceless, as its quote states it" }),
    ...Object.entries(FREE_TOOLS).map(([tool, route]): PriceEntry => ({ action: tool, tool, route, variant: null,
      lines: [{ label: null, unit: "call", credits: 0 }], formula: null, minimum_credits: null, quote_tool: null, notes: null })),
  ];
}

/** The price list as the given environment sells it: live-shot and scene lines only while their switches are on. */
export function priceListFor(env: Record<string, string | undefined>): readonly PriceEntry[] {
  const longForm = env.CLIPWRIGHT_LONG_FORM_QUALIFICATION === "1" && env.CLIPWRIGHT_COMPOSE === "1" && env.CLIPWRIGHT_REMOTE_FETCH === "1";
  const liveShots = env.CLIPWRIGHT_LIVE_SHOTS === "1" && longForm, scenes = env.CLIPWRIGHT_SCENES === "1" && longForm;
  return Object.freeze(pricesResponse.parse({ prices: buildPriceList(liveShots, scenes, env.CLIPWRIGHT_FACELESS_SHOTS === "1",
    scenes && facelessScenesEnabled(env), isMusicEnabled(env), facelessExplainerEnabled(env), isOwnAgentEnabled(env)) }).prices);
}

export const PRICE_LIST: readonly PriceEntry[] = priceListFor(typeof process === "undefined" ? {} : process.env);

const UNIT_TEXT: Readonly<Record<PriceUnit, string>> = {
  call: "call", second: "second of video", face_second: "second the presenter is in the video, covered or not", image: "image", clip: "clip",
  clip_second: "second of clip", still: "call still in the video", scene: "scene drawn in the video", track: "music track in the video",
};
/** Past this many one-line prices of one unit, the sentence names their range and list_prices names each. */
const LISTED_PRICES = 4;

/** One entry's price in words: its lines added up and its minimum, or its formula. */
export const priceText = (entry: PriceEntry): string => entry.lines.length === 0 ? entry.formula ?? "" :
  entry.lines.map(lineText).join(" plus ") + (entry.minimum_credits === null ? "" : `, at least ${entry.minimum_credits}`);
const lineText = (line: PriceEntry["lines"][number]): string => `${line.label === null ? "" : `${line.label} `}${line.credits} credits per ${UNIT_TEXT[line.unit]}`;

/** The price sentence a billed tool's description ends with; `null` for a free tool. */
export function priceLine(tool: string, list: readonly PriceEntry[] = PRICE_LIST): string | null {
  const entries = list.filter((entry) => entry.tool === tool && isPaidEntry(entry));
  const [first] = entries;
  if (first === undefined) return null;
  const unit = first.lines[0]?.unit;
  const single = entries.flatMap((entry) => (entry.formula === null && entry.lines.length === 1 && entry.lines[0]!.unit === unit
    ? [entry.lines[0]!.credits] : []));
  // Variants that differ only in their first line say the shared rest once (tools/list has a byte ceiling, #1122).
  const rest = (entry: PriceEntry) => JSON.stringify([entry.lines.slice(1), entry.minimum_credits]);
  const shared = entries.length > 1 && entries.every((entry) => entry.formula === null && entry.lines.length > 1 && rest(entry) === rest(first));
  const text = unit !== undefined && single.length === entries.length && single.length > LISTED_PRICES
    ? `${Math.min(...single)} to ${Math.max(...single)} credits per ${UNIT_TEXT[unit]}, by model and size`
    : shared
      ? `${entries.map((entry) => `${entry.variant === null ? "" : `${entry.variant}: `}${lineText(entry.lines[0]!)}`).join("; ")}; each plus ` +
        `${first.lines.slice(1).map(lineText).join(" plus ")}${first.minimum_credits === null ? "" : `, at least ${first.minimum_credits}`}`
      : entries.map((entry) => `${entry.variant === null ? "" : `${entry.variant}: `}${priceText(entry)}`).join("; ");
  return `Price: ${text}. Quote first with ${first.quote_tool}.`;
}

/** A billed tool's description with its price line at the end. */
export const withPriceLine = (tool: string, description: string, list: readonly PriceEntry[] = PRICE_LIST): string => {
  const line = priceLine(tool, list);
  if (line === null) throw new Error(`${tool} has no price in PRICE_LIST`);
  return `${description} ${line}`;
};
