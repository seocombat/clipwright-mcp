import { z } from "zod";
import { FACELESS_ROUTE_IDS, FACELESS_ROUTES, type FacelessRoute } from "./faceless-routes.js";
import { priceGeneration } from "./generations.js";
import { OWN_CUT_MAX_SECONDS, OWN_CUT_MIN_SECONDS, OWN_FILM_MAX_SECONDS, OWN_HERO_POSES, ownAgentTermsNow } from "./own-agent-price.js";

export const FACELESS_ROUTE_ESTIMATE_TEXT = "an estimate, not a quote: each part is quoted and approved before it is made";
export const FACELESS_CARTOON_TRIAL_REASON = "pictures and clips need a gift code or a purchase";

export const CARTOON_ESTIMATE = {
  pictureRestS: 1.5,
  poseEveryS: 1,
  takeShare: { low: 2 / 11, high: 7 / 8 },
  take: { model: "seedance-2.0-mini", resolution: "480p", duration_s: 4 },
  pictureModel: "seedream-5.0-flash",
} as const;

const routePart = z.strictObject({
  part: z.string().min(1),
  count: z.number().int().nonnegative().describe("How many units the starting price carries."),
  credits_each: z.number().int().nonnegative(),
  quote_tool: z.string().min(1),
});
export type FacelessRoutePart = z.infer<typeof routePart>;

const routeAddOn = z.strictObject({
  part: z.string().min(1),
  credits_each: z.number().int().nonnegative().describe("What each extra unit adds on top of the starting price."),
  quote_tool: z.string().min(1),
});
export type FacelessRouteAddOn = z.infer<typeof routeAddOn>;

export const facelessRouteLook = z.strictObject({ id: z.string().min(1), name: z.string().min(1), sample: z.url() });
export type FacelessRouteLook = z.infer<typeof facelessRouteLook>;

export const facelessAlternative = z.strictObject({
  route: z.enum(FACELESS_ROUTE_IDS),
  available: z.boolean(),
  reason: z.string().min(1).optional().describe("Why the route is not available on this account."),
  from: z.number().int().nonnegative().describe("What the way starts from at this length: the sum of its parts."),
  parts: z.array(routePart).min(1).describe("What the starting price is made of."),
  add_ons: z.array(routeAddOn).describe("What can raise the way above its start, each at its price per unit."),
  looks: z.array(facelessRouteLook).optional().describe("The cartoon's drawing styles, each with a sample picture."),
  note: z.string().min(1),
});
export type FacelessAlternative = z.infer<typeof facelessAlternative>;

const wholeSeconds = (seconds: number, min: number, max: number): number => {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`${seconds} s is not a length`);
  return Math.min(max, Math.max(min, Math.ceil(seconds - 1e-9)));
};
interface Row { part: string; low: number; high: number; each: number; tool: string; addOn?: { part: string; each: number } }
const row = (part: string, low: number, high: number, each: number, tool: string, addOn?: Row["addOn"]): Row =>
  ({ part, low, high, each, tool, ...addOn ? { addOn } : {} });
const priced = (rows: Row[]): Pick<FacelessAlternative, "from" | "parts" | "add_ons"> => ({
  from: rows.reduce((total, one) => total + one.low * one.each, 0),
  parts: rows.filter(one => one.low > 0).map(one => ({ part: one.part, count: one.low, credits_each: one.each, quote_tool: one.tool })),
  add_ons: rows.filter(one => one.high > one.low)
    .map(one => ({ part: one.addOn?.part ?? one.part, credits_each: one.addOn?.each ?? one.each, quote_tool: one.tool })),
});

export function cartoonRouteEstimate(seconds: number): Pick<FacelessAlternative, "from" | "parts" | "add_ons"> | undefined {
  const s = wholeSeconds(seconds, OWN_CUT_MIN_SECONDS, OWN_CUT_MAX_SECONDS), terms = ownAgentTermsNow(), plan = CARTOON_ESTIMATE;
  const picture = priceGeneration({ model: plan.pictureModel, prompt: "-", aspect_ratio: "9:16" })?.unit_credits;
  const takeSecond = priceGeneration({ model: plan.take.model, prompt: "-", mode: "first_frame", aspect_ratio: "9:16", resolution: plan.take.resolution,
    duration_s: plan.take.duration_s })?.unit_credits;
  if (picture === undefined || takeSecond === undefined) return undefined;
  const beats = { low: Math.ceil(s / plan.pictureRestS), high: Math.ceil(s / plan.poseEveryS) };
  const takes = { low: Math.ceil(beats.low * plan.takeShare.low), high: Math.ceil(beats.low * plan.takeShare.high) };
  const over = Math.max(0, s - terms.cut_included_seconds!);
  return priced([
    row("voice, seconds", s, s, terms.voice_credits_per_second, "quote_voice"),
    row("character sheet", 1, 1, picture, "quote_image"),
    row("pictures, one a beat", beats.low, beats.high, picture, "quote_image", { part: "an extra picture", each: picture }),
    row(`clip seconds, ${plan.take.duration_s} s a clip`, takes.low * plan.take.duration_s, takes.high * plan.take.duration_s, takeSecond,
      "quote_video", { part: "an extra moving shot", each: takeSecond * plan.take.duration_s }),
    row("the cut", 1, 1, terms.cut_credits!, "quote_cut"),
    ...over > 0 ? [row(`cut seconds over ${terms.cut_included_seconds}`, over, over, terms.cut_extra_second_credits!, "quote_cut")] : [],
    row("described sound bed", 0, 1, terms.cut_bed_credits!, "quote_cut", { part: "a described sound bed", each: terms.cut_bed_credits! }),
  ]);
}

export function explainerRouteEstimate(seconds: number): Pick<FacelessAlternative, "from" | "parts" | "add_ons"> {
  const s = wholeSeconds(seconds, 1, OWN_FILM_MAX_SECONDS), terms = ownAgentTermsNow();
  const over = Math.max(0, s - terms.included_seconds);
  return priced([
    row("the film", 1, 1, terms.render_credits, "quote_render"),
    ...over > 0 ? [row(`film seconds over ${terms.included_seconds}`, over, over, terms.extra_second_credits, "quote_render")] : [],
    row("voice, seconds", s, s, terms.voice_credits_per_second, "quote_voice"),
    row("hero poses", 0, OWN_HERO_POSES, terms.pose_credits!, "quote_film_hero",
      { part: "a new hero (a saved mascot costs nothing)", each: OWN_HERO_POSES * terms.pose_credits! }),
  ]);
}

const routeName = (route: FacelessRoute) => FACELESS_ROUTES.find(one => one.route === route)!.name;

export interface FacelessAlternativesInput {
  seconds: number;
  totalCredits: number;
  cartoon: { available: boolean; looks: readonly FacelessRouteLook[] } | null;
  explainer: { fit?: { fits: boolean; reason: string } } | null;
}

export function facelessAlternatives(input: FacelessAlternativesInput): FacelessAlternative[] | undefined {
  if (input.cartoon === null && input.explainer === null) return undefined;
  const pictures: FacelessAlternative = { route: "pictures", available: true,
    ...priced([row("the whole video: this make_faceless quote", 1, 1, input.totalCredits, "quote_faceless")]),
    note: `${routeName("pictures")}: this quote. make_faceless makes the whole video in one run.` };
  const cartoonParts = input.cartoon === null ? undefined : cartoonRouteEstimate(input.seconds);
  const cartoon: FacelessAlternative[] = input.cartoon === null || cartoonParts === undefined ? [] : [{ route: "cartoon",
    available: input.cartoon.available, ...input.cartoon.available ? {} : { reason: FACELESS_CARTOON_TRIAL_REASON }, ...cartoonParts,
    looks: [...input.cartoon.looks],
    note: `${routeName("cartoon")}: your agent makes it part by part from get_film_guide format cartoon: a voice, a character sheet, a ` +
      "picture a beat, short clips where the hero moves, and the cut. It starts at a picture every 1.5 s and few clips; extra " +
      "pictures, moving shots and a described sound bed are add_ons, each at its price. Other picture and clip models: quote_image and quote_video. " +
      `This is ${FACELESS_ROUTE_ESTIMATE_TEXT}.` }];
  const fit = input.explainer?.fit;
  const explainer: FacelessAlternative[] = input.explainer === null ? [] : [{ route: "explainer", available: true,
    ...explainerRouteEstimate(input.seconds),
    note: `${routeName("explainer")}: your agent writes the film from get_film_guide format explainer and renders it with render_film, ` +
      "about half an hour of your own model time. A saved mascot as the hero costs nothing; a new hero is an add_on. " +
      "Stills inside the free daily allowance cost nothing, and music only when asked." +
      (fit ? ` ${fit.fits ? "This script fits an explainer" : "This script fits an explainer poorly"}: ${fit.reason}` : "") +
      ` This is ${FACELESS_ROUTE_ESTIMATE_TEXT}.` }];
  return cartoon.length + explainer.length > 0 ? [pictures, ...cartoon, ...explainer] : undefined;
}
