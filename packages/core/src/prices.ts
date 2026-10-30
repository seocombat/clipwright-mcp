import { z } from "zod";
import { ACTOR_PORTRAIT_ASPECT, ACTOR_UNIT_CREDITS } from "./account-actors.js";
import { CANDIDATE_CHARGE_TEXT } from "./edit-candidate.js";
import { EDIT_RENDER_PRICE, EDIT_UNIT_PRICES, EDIT_ZERO_UNIT_PRICE } from "./edit-billing.js";
import { REVISION_CHARGE_TEXT } from "./edit-revision.js";
import {
  FACELESS_CREDITS_PER_1500_FRAMES, FACELESS_IMAGE_CREDITS, FACELESS_MAX_SELECTED_SECONDS, FACELESS_MIN_BASE_CREDITS,
  FACELESS_MIN_SELECTED_SECONDS, FACELESS_OPENER_CREDITS, quoteFaceless,
} from "./faceless-price.js";
import { PRESENTER_ENGINES } from "./face-billing.js";
import { listGenerationModels } from "./generations.js";
import { PARTS_FACE_TARIFF, PRESENTER_ENGINE_LABELS } from "./parts-pricing.js";
import { REFERENCE_ANALYSIS_CREDITS } from "./reference-analysis.js";

/** The public price list (#927): every number is read from the constant billing charges by, never typed here. */
export const PRICES_PATH = "/v1/public/prices";

export const PRICE_UNITS = ["call", "second", "face_second", "image", "clip", "clip_second", "still"] as const;
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
  list_voices: "GET /v1/voices",
  list_template_sounds: "GET /v1/template-sounds",
  list_generation_models: "GET /v1/generations/models",
  list_actors: "GET /v1/actors",
  delete_actor: "DELETE /v1/actors/{id}",
  get_actor_defaults: "GET /v1/actors/{id}/defaults",
  set_actor_defaults: "POST /v1/actors/{id}/defaults",
  upload_image: "POST /v1/uploads/import",
  create_upload: "POST /v1/uploads/intents",
  get_upload: "GET /v1/uploads/{id}",
  create_asset: "POST /v1/assets",
  list_assets: "GET /v1/assets",
  get_asset: "GET /v1/assets/{id}",
  update_asset: "POST /v1/assets/{id}",
  delete_asset: "DELETE /v1/assets/{id}",
  get_reference_analysis: "GET /v1/reference-analyses/{id}",
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

function buildPriceList(): PriceEntry[] {
  const unit = EDIT_UNIT_PRICES;
  const parts = PARTS_FACE_TARIFF;
  return [
    ...PRESENTER_ENGINES.map((engine) => paid({ tool: "make_ugc", route: "POST /v1/skills/make_ugc/run",
      variant: engine === "heygen" ? "HeyGen presenter" : "OmniHuman presenter", quote_tool: "quote_ugc", minimum_credits: parts.minimumCredits,
      lines: [{ label: PRESENTER_ENGINE_LABELS[engine], unit: "face_second", credits: parts.presenterCreditsPerSecond[engine] },
        { label: "production (voice and render)", unit: "second", credits: parts.productionCreditsPerSecond },
        { label: "live avatar on a call", unit: "still", credits: parts.liveAvatarStillCredits }],
      notes: "Short and long videos alike. Presenter seconds are the seconds a presenter take fills, covered by an insert, overlay, " +
        "window or template or not, counted once over the video and rounded up; the engine that renders each take sets its rate " +
        (engine === "heygen" ? "(today every take renders on HeyGen). " : "(no take renders on OmniHuman today). ") +
        "Production seconds are every second of the finished video. A live avatar is charged per call still in the video." })),
    paid({ tool: "analyze_reference", route: "POST /v1/reference-analyses", unit: "call", credits: REFERENCE_ANALYSIS_CREDITS,
      quote_tool: "quote_analysis", notes: "Held at the start and charged once the analysis succeeds; a failed one costs nothing. " +
        "Starting it again on the same asset answers the same analysis for free." }),
    paid({ tool: "make_faceless", route: "POST /v1/skills/make_faceless/run", quote_tool: "quote_faceless",
      lines: [{ label: "generated picture", unit: "image", credits: FACELESS_IMAGE_CREDITS },
        { label: "opening clip", unit: "clip", credits: FACELESS_OPENER_CREDITS },
        { label: "production (story, voice and render)", unit: "second", credits: FACELESS_CREDITS_PER_1500_FRAMES / 60 }],
      minimum_credits: FACELESS_MIN_BASE_CREDITS,
      notes: `Pictures we generated for the delivered video and its seconds, never above the selected length. The quote is the most a ` +
        `selection is charged, every picture it may generate: ${facelessAt(FACELESS_MIN_SELECTED_SECONDS)} for ` +
        `${FACELESS_MIN_SELECTED_SECONDS} s, ${facelessAt(FACELESS_MAX_SELECTED_SECONDS)} for ${FACELESS_MAX_SELECTED_SECONDS} s. ` +
        "Captions do not change the price." }),
    paid({ tool: "revise_run", route: "POST /v1/runs/{id}/revisions", quote_tool: "quote_revision",
      formula: `each shot generated anew: picture ${unit.picture}, clip ${unit.clip}, clip with a new picture ${unit.clip_with_new_picture}; ` +
        `plus ${EDIT_RENDER_PRICE} to render. A revision that generates nothing: ${EDIT_ZERO_UNIT_PRICE}. A kept candidate adds nothing`,
      notes: REVISION_CHARGE_TEXT }),
    ...([["picture", "image", unit.picture], ["clip", "clip", unit.clip], ["clip with a new picture", "clip", unit.clip_with_new_picture]] as const)
      .map(([variant, priceUnit, credits]) => paid({ tool: "create_candidate", route: "POST /v1/runs/{id}/candidates", variant,
        unit: priceUnit, credits, quote_tool: "quote_candidate", notes: CANDIDATE_CHARGE_TEXT })),
    ...Object.entries(ACTOR_UNIT_CREDITS).flatMap(([quality, credits]) => [
      paid({ tool: "create_actor", route: "POST /v1/skills/create_actor/run", variant: `${quality} portrait`, unit: "image",
        credits: credits.portrait, quote_tool: "quote_actor", notes: "Each published image; a refused description or an unusable portrait costs nothing." }),
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

export const PRICE_LIST: readonly PriceEntry[] = Object.freeze(pricesResponse.parse({ prices: buildPriceList() }).prices);

const UNIT_TEXT: Readonly<Record<PriceUnit, string>> = {
  call: "call", second: "second of video", face_second: "second the presenter is in the video, covered or not", image: "image", clip: "clip",
  clip_second: "second of clip", still: "call still in the video",
};
/** Past this many one-line prices of one unit, the sentence names their range and list_prices names each. */
const LISTED_PRICES = 4;

/** One entry's price in words: its lines added up and its minimum, or its formula. */
export const priceText = (entry: PriceEntry): string => entry.lines.length === 0 ? entry.formula ?? "" :
  entry.lines.map((line) => `${line.label === null ? "" : `${line.label} `}${line.credits} credits per ${UNIT_TEXT[line.unit]}`).join(" plus ") +
  (entry.minimum_credits === null ? "" : `, at least ${entry.minimum_credits}`);

/** The price sentence a billed tool's description ends with; `null` for a free tool. */
export function priceLine(tool: string, list: readonly PriceEntry[] = PRICE_LIST): string | null {
  const entries = list.filter((entry) => entry.tool === tool && isPaidEntry(entry));
  const [first] = entries;
  if (first === undefined) return null;
  const unit = first.lines[0]?.unit;
  const single = entries.flatMap((entry) => (entry.formula === null && entry.lines.length === 1 && entry.lines[0]!.unit === unit
    ? [entry.lines[0]!.credits] : []));
  const text = unit !== undefined && single.length === entries.length && single.length > LISTED_PRICES
    ? `${Math.min(...single)} to ${Math.max(...single)} credits per ${UNIT_TEXT[unit]}, by model and size`
    : entries.map((entry) => `${entry.variant === null ? "" : `${entry.variant}: `}${priceText(entry)}`)
      .join("; ");
  return `Price: ${text}. Quote first with ${first.quote_tool}; list_prices names every price.`;
}

/** A billed tool's description with its price line at the end. */
export const withPriceLine = (tool: string, description: string, list: readonly PriceEntry[] = PRICE_LIST): string => {
  const line = priceLine(tool, list);
  if (line === null) throw new Error(`${tool} has no price in PRICE_LIST`);
  return `${description} ${line}`;
};
