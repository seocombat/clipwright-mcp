import { describe, expect, it } from "vitest";

import { ACTOR_UNIT_CREDITS } from "./account-actors.js";
import { EDIT_RENDER_PRICE, EDIT_UNIT_PRICES, EDIT_ZERO_UNIT_PRICE } from "./edit-billing.js";
import { API_ENDPOINTS, endpointLabel } from "./endpoints.js";
import { FACELESS_MAX_SELECTED_SECONDS, FACELESS_MIN_BASE_CREDITS, FACELESS_MIN_SELECTED_SECONDS, quoteFaceless } from "./faceless-price.js";
import { listGenerationModels } from "./generations.js";
import { OPENAPI_ROUTES } from "./openapi.js";
import { PARTS_DURATION_TARIFF, PARTS_FACE_TARIFF } from "./parts-pricing.js";
import { isPaidEntry, PRICE_LIST, priceEntry, priceLine, PRICES_PATH, pricesResponse, priceText, withPriceLine } from "./prices.js";
import { REFERENCE_ANALYSIS_CREDITS } from "./reference-analysis.js";

const LABELS = new Map(API_ENDPOINTS.map((endpoint) => [endpointLabel(endpoint), endpoint]));
const isPaid = isPaidEntry;
/** The one line of a one-part price, as [unit, credits]. */
const part = (entry: (typeof PRICE_LIST)[number]) => {
  expect(entry.lines, entry.action).toHaveLength(1);
  return [entry.lines[0]!.unit, entry.lines[0]!.credits] as const;
};
const entriesOf = (tool: string) => PRICE_LIST.filter((entry) => entry.tool === tool);
const only = (tool: string, variant: string | null = null) => {
  const found = entriesOf(tool).filter((entry) => entry.variant === variant);
  expect(found).toHaveLength(1);
  return found[0]!;
};

describe("the price list covers the registry", () => {
  /** Mutants: a billed route left without a price; a paid entry on a free route; an entry naming no route. */
  it("every billed route has a paid entry, and every entry's route is a registry row of the same billedness", () => {
    for (const endpoint of API_ENDPOINTS.filter((row) => row.billed)) {
      expect(PRICE_LIST.filter((entry) => entry.route === endpointLabel(endpoint) && isPaid(entry)), endpointLabel(endpoint)).not.toEqual([]);
    }
    for (const entry of PRICE_LIST) {
      const endpoint = LABELS.get(entry.route ?? "");
      expect(endpoint, `${entry.action} names ${entry.route}`).toBeDefined();
      expect(endpoint!.billed, entry.action).toBe(isPaid(entry));
    }
  });

  it("is served keyless at its own registry row, with the response schema in the document", () => {
    expect(LABELS.get(`GET ${PRICES_PATH}`)).toMatchObject({ billed: false, mcp: false });
    expect(OPENAPI_ROUTES[`GET ${PRICES_PATH}`]).toMatchObject({ exposure: "public", anonymous: true });
    expect(pricesResponse.parse({ prices: PRICE_LIST }).prices).toEqual(PRICE_LIST);
  });

  /** Mutants: today's entry given both lines and a formula; a tool priced twice without a variant; the schema's refine dropped. */
  it("states each price today once, as lines or as a formula, and refuses an entry with neither", () => {
    for (const entry of PRICE_LIST) expect([entry.lines.length === 0, entry.formula === null].sort(), entry.action).toEqual([false, true]);
    const keys = PRICE_LIST.map((entry) => `${entry.tool}|${entry.variant}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(priceEntry.safeParse({ ...PRICE_LIST[0], lines: [], formula: null }).success).toBe(false);
  });

  /** Mutants: a part of a several-part price dropped from the sentence, or the minimum left out (the shape S3 fills). */
  it("takes a price of several lines plus a minimum without a schema change", () => {
    const parts = { ...PRICE_LIST[0]!, variant: null, formula: null, minimum_credits: 50, lines: [{ label: "presenter", unit: "face_second", credits: 12 },
      { label: "production", unit: "second", credits: 1 }] };
    expect(priceEntry.parse(parts)).toEqual(parts);
    const text = "presenter 12 credits per second the presenter is in the video, covered or not plus production 1 credits per " +
      "second of video, at least 50";
    expect(priceText(priceEntry.parse(parts))).toBe(text);
    // Through the line and the description a tool is registered with, which read the list, not one entry.
    const line = `Price: ${text}. Quote first with ${parts.quote_tool}; list_prices names every price.`;
    expect(priceLine(parts.tool!, [priceEntry.parse(parts)])).toBe(line);
    expect(withPriceLine(parts.tool!, "Starts a run.", [priceEntry.parse(parts)])).toBe(`Starts a run. ${line}`);
  });
});

describe("each price is the constant billing charges by", () => {
  /** Mutants: any number below retyped instead of read. */
  it("make_ugc: the parts tariff by presenter engine, with its minimum, short and long alike", () => {
    for (const [variant, engine] of [["HeyGen presenter", "heygen"], ["OmniHuman presenter", "omnihuman"]] as const) {
      const entry = only("make_ugc", variant);
      expect(entry.lines.map((line) => [line.unit, line.credits])).toEqual([["face_second", PARTS_FACE_TARIFF.presenterCreditsPerSecond[engine]],
        ["second", PARTS_FACE_TARIFF.productionCreditsPerSecond], ["still", PARTS_FACE_TARIFF.liveAvatarStillCredits]]);
      expect(entry.minimum_credits).toBe(PARTS_FACE_TARIFF.minimumCredits);
      expect(entry.quote_tool).toBe("quote_ugc");
    }
    // The short run's terms are the same constants: the list cannot name one price and the short path charge another.
    expect(PARTS_DURATION_TARIFF.presenterCreditsPerSecond).toBe(PARTS_FACE_TARIFF.presenterCreditsPerSecond);
    expect([PARTS_DURATION_TARIFF.productionCreditsPerSecond, PARTS_DURATION_TARIFF.minimumCredits])
      .toEqual([PARTS_FACE_TARIFF.productionCreditsPerSecond, PARTS_FACE_TARIFF.minimumCredits]);
  });

  it("analyze_reference: the analysis price per call, quoted by quote_analysis", () => {
    expect(part(only("analyze_reference"))).toEqual(["call", REFERENCE_ANALYSIS_CREDITS]);
    expect(only("analyze_reference").quote_tool).toBe("quote_analysis");
    expect(part(only("quote_analysis"))).toEqual(["call", 0]);
    // The data mode (#930 S4): its own row at 10 a call, as a literal so that a changed price turns this red.
    expect(part(only("analyze_reference", "data mode"))).toEqual(["call", 10]);
    expect(only("analyze_reference", "data mode").quote_tool).toBe("quote_analysis");
  });

  it("make_faceless: the quote at the shortest and longest selection", () => {
    const at = (seconds: number) => quoteFaceless({ outputFrames: seconds * 25, captions: true }).totalCredits;
    const entry = only("make_faceless");
    expect(entry.minimum_credits).toBe(FACELESS_MIN_BASE_CREDITS);
    expect(entry.notes).toContain(`${at(FACELESS_MIN_SELECTED_SECONDS)} for ${FACELESS_MIN_SELECTED_SECONDS} s`);
    expect(entry.notes).toContain(`${at(FACELESS_MAX_SELECTED_SECONDS)} for ${FACELESS_MAX_SELECTED_SECONDS} s`);
    const longest = quoteFaceless({ outputFrames: 2250, captions: false });
    expect(entry.lines).toEqual([{ label: "generated picture", unit: "image", credits: longest.imageCredits },
      { label: "opening clip", unit: "clip", credits: longest.openerCredits },
      { label: "production (story, voice and render)", unit: "second", credits: (longest.baseCredits - 31 * longest.imageCredits!) / 90 }]);
  });

  it("revise_run and create_candidate: the edit unit prices and the render fee", () => {
    expect(only("revise_run").formula).toBe(`each shot generated anew: picture ${EDIT_UNIT_PRICES.picture}, clip ${EDIT_UNIT_PRICES.clip}, ` +
      `clip with a new picture ${EDIT_UNIT_PRICES.clip_with_new_picture}; plus ${EDIT_RENDER_PRICE} to render. A revision that generates ` +
      `nothing: ${EDIT_ZERO_UNIT_PRICE}. A kept candidate adds nothing`);
    expect([EDIT_UNIT_PRICES.kept_picture, EDIT_UNIT_PRICES.kept_clip]).toEqual([0, 0]);
    expect(entriesOf("create_candidate").map((entry) => [entry.variant, ...part(entry)])).toEqual([["picture", "image", EDIT_UNIT_PRICES.picture],
      ["clip", "clip", EDIT_UNIT_PRICES.clip], ["clip with a new picture", "clip", EDIT_UNIT_PRICES.clip_with_new_picture]]);
  });

  it("create_actor: a portrait and each other format at every accepted quality", () => {
    expect(entriesOf("create_actor").map((entry) => [entry.variant, ...part(entry)])).toEqual(
      Object.entries(ACTOR_UNIT_CREDITS).flatMap(([quality, units]) =>
        [[`${quality} portrait`, "image", units.portrait], [`${quality} other format`, "image", units.variant]]));
  });

  /** Mutants: a listed row left out, a price that is no row's, a model under the other tool. */
  it("generations: exactly the listed models' rows, per image or per second of clip", () => {
    const listed = listGenerationModels().flatMap((model) => model.rows.map((row) =>
      `${model.kind === "video" ? "generate_video" : "generate_image"}|${model.model}|${row.resolution ?? ""}|${row.unit_credits}`));
    const priced = [...entriesOf("generate_image"), ...entriesOf("generate_video")].map((entry) => {
      const [model, size = ""] = entry.variant!.split(" ");
      return `${entry.tool}|${model}|${size}|${part(entry)[1]}`;
    });
    expect([...new Set(priced)].sort()).toEqual([...new Set(listed)].sort());
    expect(entriesOf("generate_video").every((entry) => part(entry)[0] === "clip_second")).toBe(true);
    expect(entriesOf("generate_image").every((entry) => part(entry)[0] === "image")).toBe(true);
  });
});

describe("the price line of a tool", () => {
  it("is null for a free tool and names the quote tool for a paid one", () => {
    expect(priceLine("get_account")).toBeNull();
    expect(() => withPriceLine("get_account", "x")).toThrow();
    for (const tool of new Set(PRICE_LIST.filter(isPaid).map((entry) => entry.tool!))) {
      expect(priceLine(tool), tool).toMatch(new RegExp(`^Price: .+\\. Quote first with ${entriesOf(tool)[0]!.quote_tool}; list_prices names every price\\.$`));
    }
  });

  /** Mutants: the long-form minimum dropped from the line; the range taken over another unit. */
  it("states every fixed price of a short list and the range of a long one", () => {
    const parts = PARTS_FACE_TARIFF, rest = `plus production (voice and render) ${parts.productionCreditsPerSecond} credits per second of video ` +
      `plus live avatar on a call ${parts.liveAvatarStillCredits} credits per call still in the video, at least ${parts.minimumCredits}`;
    expect(priceLine("make_ugc")).toBe(`Price: HeyGen presenter: presenter, HeyGen Avatar IV ${parts.presenterCreditsPerSecond.heygen} credits per ` +
      `second the presenter is in the video, covered or not ${rest}; OmniHuman presenter: presenter, OmniHuman 2.0 ` +
      `${parts.presenterCreditsPerSecond.omnihuman} credits per second the presenter is in the video, covered or not ${rest}. Quote first with ` +
      "quote_ugc; list_prices names every price.");
    const clips = entriesOf("generate_video").map((entry) => part(entry)[1]);
    expect(priceLine("generate_video")).toContain(`${Math.min(...clips)} to ${Math.max(...clips)} credits per second of clip`);
  });
});
