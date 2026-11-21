import { describe, expect, it } from "vitest";

import { ACTOR_UNIT_CREDITS, ACTOR_VIEW_PORTRAIT_CREDITS } from "./account-actors.js";
import { EDIT_RENDER_PRICE, EDIT_UNIT_PRICES, EDIT_ZERO_UNIT_PRICE } from "./edit-billing.js";
import { API_ENDPOINTS, endpointLabel } from "./endpoints.js";
import { FACELESS_MAX_SELECTED_SECONDS, FACELESS_MIN_BASE_CREDITS, FACELESS_MIN_SELECTED_SECONDS, quoteFaceless, SKILL_FILM_TARIFFS } from "./faceless-price.js";
import { listGenerationModels } from "./generations.js";
import { MUSIC_BED_CREDITS } from "./music.js";
import { OPENAPI_ROUTES } from "./openapi.js";
import { PARTS_DURATION_TARIFF, PARTS_FACE_TARIFF } from "./parts-pricing.js";
import { OWN_AGENT_SKILLS, OWN_HERO_MAX_SPRITES, OWN_HERO_POSES, ownAgentTermsNow, ownHeroCredits, type OwnAgentSkill, type OwnAgentTerms, TAKE_PICTURE_SHORT_TIER_SECONDS } from "./own-agent-price.js";
import { FREE_RUN_ROUTES, isPaidEntry, NO_DIY_MODES, PRICE_LIST, priceEntry, priceLine, priceListFor, PRICES_PATH, pricesResponse, priceText, withPriceLine,
  type PriceUnit } from "./prices.js";

const LIVE_SHOTS_ON = { CLIPWRIGHT_LIVE_SHOTS: "1", CLIPWRIGHT_LONG_FORM_QUALIFICATION: "1", CLIPWRIGHT_COMPOSE: "1", CLIPWRIGHT_REMOTE_FETCH: "1" };
const ALL_DIY = { ad: true, faceless: true } as const;
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
    // The own-agent film routes (#1337) and the DIY tools are sold only with their switches on, so the coverage is read on that list.
    const sold = priceListFor({ CLIPWRIGHT_OWN_AGENT: "1" }, ALL_DIY);
    // A billed route that starts a run held at 0 (FREE_RUN_ROUTES) is listed at 0 instead: billed, and no price.
    for (const endpoint of API_ENDPOINTS.filter((row) => row.billed)) {
      const label = endpointLabel(endpoint), free = FREE_RUN_ROUTES.has(label);
      expect(sold.filter((entry) => entry.route === label && (free ? !isPaid(entry) : isPaid(entry))), label).not.toEqual([]);
    }
    expect(PRICE_LIST.filter((entry) => entry.route?.startsWith("POST /v1/film-") || entry.route?.startsWith("POST /v1/take-"))).toEqual([]);
    for (const entry of sold) {
      const endpoint = LABELS.get(entry.route ?? "");
      expect(endpoint, `${entry.action} names ${entry.route}`).toBeDefined();
      expect(endpoint!.billed, entry.action).toBe(isPaid(entry) || FREE_RUN_ROUTES.has(entry.route!));
    }
    for (const route of FREE_RUN_ROUTES) expect(LABELS.get(route)?.billed, route).toBe(true);
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
    const line = `Price: ${text}. Quote first with ${parts.quote_tool}.`;
    expect(priceLine(parts.tool!, [priceEntry.parse(parts)])).toBe(line);
    expect(withPriceLine(parts.tool!, "Starts a run.", [priceEntry.parse(parts)])).toBe(`Starts a run. ${line}`);
  });
});

// #1063 S1b. Mutant: the music line missing from one skill's entry, so the list hides a price the quote carries, or sold with the switch off.
describe("the music line of the price list", () => {
  it.each(["make_ugc", "make_faceless"])("%s sells the track only while the switch is on, at the constant it is charged by", (tool) => {
    const lineOf = (list: readonly { tool: string | null; lines: readonly { unit: string; credits: number | null }[] }[]) =>
      list.filter((item) => item.tool === tool).flatMap((item) => item.lines).filter((line) => line.unit === "track");
    expect(lineOf(PRICE_LIST)).toEqual([]);
    const on = lineOf(priceListFor({ CLIPWRIGHT_MUSIC: "1" }));
    expect(on.length).toBeGreaterThan(0);
    for (const line of on) expect(line.credits).toBe(MUSIC_BED_CREDITS);
  });
});

// #1216, by level since #1291 F4. Mutants: the explainer sold with its switch off; one level left off; a level's film or its second retyped,
// or the levels swapped; the retired scene and object-picture lines still sold; a model or the engine named on the public list.
describe("the explainer lines of the price list", () => {
  it("sells each level's film, its second over 60 s and the hero's pose picture, only while the switch is on", () => {
    const explainer = (list: readonly (typeof PRICE_LIST)[number][]) => list.filter(item => item.tool === "make_faceless" && item.variant?.startsWith("explainer"));
    expect(explainer(PRICE_LIST)).toEqual([]);
    // #1358. Mutants: the lines read from the format flag alone, or the film switch read as a number, so «01» or «1 » sells the film.
    expect(explainer(priceListFor({ CLIPWRIGHT_FACELESS_EXPLAINER: "1" }))).toEqual([]);
    for (const off of ["", "0", "01", "1 ", " 1", "true", "1.0"])
      expect(explainer(priceListFor({ CLIPWRIGHT_FACELESS_EXPLAINER: "1", CLIPWRIGHT_SKILL_AGENT: off })), off).toEqual([]);
    const entries = explainer(priceListFor({ CLIPWRIGHT_FACELESS_EXPLAINER: "1", CLIPWRIGHT_SKILL_AGENT: "1" }));
    expect(entries.map(entry => [entry.variant, entry.lines.map(line => [line.unit, line.credits])])).toEqual([
      ["explainer standard", [["call", SKILL_FILM_TARIFFS["skill-agent-sonnet-v2"].filmCredits], ["second", SKILL_FILM_TARIFFS["skill-agent-sonnet-v2"].perExtraSecond], ["image", 7]]],
      ["explainer pro", [["call", SKILL_FILM_TARIFFS["skill-agent-opus-v1"].filmCredits], ["second", SKILL_FILM_TARIFFS["skill-agent-opus-v1"].perExtraSecond], ["image", 7]]]]);
    expect([SKILL_FILM_TARIFFS["skill-agent-sonnet-v2"].filmCredits, SKILL_FILM_TARIFFS["skill-agent-opus-v1"].filmCredits]).toEqual([700, 1200]);
    expect(entries[0]!.notes).toContain("about half an hour");
    expect(JSON.stringify(entries)).not.toMatch(/sonnet|opus|agent|scene drawn|thing the script names/i);
  });
});

describe("each price is the constant billing charges by", () => {
  /** Mutants: any number below retyped instead of read. */
  it("make_ugc: the parts tariff by presenter engine, with its minimum, short and long alike", () => {
    for (const [variant, engine] of [["HeyGen presenter", "heygen"], ["OmniHuman presenter", "omnihuman"]] as const) {
      const entry = only("make_ugc", variant);
      expect(entry.lines.map((line) => [line.unit, line.credits])).toEqual([["face_second", PARTS_FACE_TARIFF.presenterCreditsPerSecond[engine]],
        ["second", PARTS_FACE_TARIFF.productionCreditsPerSecond], ["still", PARTS_FACE_TARIFF.liveAvatarStillCredits]]);
      expect(entry.notes).not.toContain("live shot");
      // Live shots (#1103), sold only with their switch on: labels say what the actor does, never who draws it; 30 as a literal.
      const on = priceListFor(LIVE_SHOTS_ON).find((item) => item.tool === "make_ugc" && item.variant === variant)!;
      expect(on.lines.slice(1, 3)).toEqual([{ label: "live shot, speaking while acting", unit: "face_second", credits: 30 },
        { label: "live shot, acting under voice-over", unit: "face_second", credits: 30 }]);
      // Mutant (Codex pricing r1): the shot switch alone, and the lines show while long-form, which shots ride on, is off.
      for (const flag of Object.keys(LIVE_SHOTS_ON)) expect(priceListFor({ ...LIVE_SHOTS_ON, [flag]: "0" }), flag).toEqual(PRICE_LIST);
      // #1107. Mutant: the scene line sold without its switch or without long-form, and the list sells what a request is refused.
      const scenesOn = { ...LIVE_SHOTS_ON, CLIPWRIGHT_LIVE_SHOTS: "0", CLIPWRIGHT_SCENES: "1" };
      const withScenes = priceListFor(scenesOn).find((item) => item.tool === "make_ugc" && item.variant === variant)!;
      expect(withScenes.lines.at(-1)).toEqual({ label: "scene made for the video", unit: "scene", credits: 25 });
      expect(withScenes.notes).toContain("charged only when it is drawn in the delivered video");
      for (const flag of Object.keys(scenesOn).filter(name => name !== "CLIPWRIGHT_LIVE_SHOTS")) {
        expect(priceListFor({ ...scenesOn, [flag]: "0" }), flag).toEqual(PRICE_LIST);
      }
      // #1215. Mutant: music sold without its switch, or never on the list a client reads before the quote.
      const withMusic = priceListFor({ ...scenesOn, CLIPWRIGHT_MUSIC: "1" }).find((item) => item.tool === "make_ugc" && item.variant === variant)!;
      expect(withMusic.lines.at(-1)).toEqual({ label: "music under the voice", unit: "track", credits: 60 });
      expect(withMusic.notes).toContain("only when you ask for it");
      expect(priceListFor({ ...scenesOn, CLIPWRIGHT_MUSIC: "0" })).toEqual(priceListFor(scenesOn));
      // Music needs no other switch: it is sold with the music flag alone, on every presenter variant.
      expect(priceListFor({ CLIPWRIGHT_MUSIC: "1" }).find((item) => item.tool === "make_ugc" && item.variant === variant)!.lines.at(-1))
        .toEqual({ label: "music under the voice", unit: "track", credits: 60 });
      expect(priceListFor(scenesOn).find((item) => item.tool === "make_ugc" && item.variant === variant)!.lines.some((l) => l.unit === "track")).toBe(false);
      // #1113. Mutant: make_faceless sells its action shots or scenes while a request for them is refused, or never names their price.
      const faceless = (env: Record<string, string>) => priceListFor(env).find((item) => item.tool === "make_faceless")!.lines.slice(3);
      const facelessOn = { ...scenesOn, CLIPWRIGHT_FACELESS_SHOTS: "1", CLIPWRIGHT_FACELESS_SCENES: "1" };
      expect(faceless(facelessOn)).toEqual([{ label: "action shot", unit: "clip_second", credits: 30 },
        { label: "scene made for the video", unit: "scene", credits: 25 }]);
      expect(faceless({ ...facelessOn, CLIPWRIGHT_SCENES: "0", CLIPWRIGHT_FACELESS_SHOTS: "0" })).toEqual([]);
      expect(faceless({ ...facelessOn, CLIPWRIGHT_FACELESS_SCENES: "0" })).toEqual([{ label: "action shot", unit: "clip_second", credits: 30 }]);
      expect(entry.minimum_credits).toBe(PARTS_FACE_TARIFF.minimumCredits);
      expect(entry.quote_tool).toBe("quote_ugc");
    }
    // The short run's terms are the same constants: the list cannot name one price and the short path charge another.
    // The short tariff adds the Turbo second (#1773), which no long-form unit renders on.
    expect(PARTS_DURATION_TARIFF.presenterCreditsPerSecond).toEqual({ ...PARTS_FACE_TARIFF.presenterCreditsPerSecond, heygen_avatar6_turbo: 12 });
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
        [[`${quality} portrait`, "image", units.portrait], [`${quality} view of an existing actor`, "image",
          ACTOR_VIEW_PORTRAIT_CREDITS[quality as "medium" | "high"]], [`${quality} other format`, "image", units.variant]]));
    expect(ACTOR_VIEW_PORTRAIT_CREDITS).toEqual({ medium: 4, high: 12 });
  });

  /** Mutants: a listed row left out, a price that is no row's, a model under the other tool. */
  it("generations: exactly the listed models' rows, per image or per second of clip", () => {
    // A picture model with prices that differ by format (flare's 21:9 board, #1686) names the format in its variant.
    const split = (rows: readonly { unit_credits: number }[]) => new Set(rows.map((row) => row.unit_credits)).size > 1;
    const listed = listGenerationModels().flatMap((model) => model.rows.map((row) =>
      `${model.kind === "video" ? "generate_video" : "generate_image"}|${model.model}|${row.resolution ?? (split(model.rows) ? row.aspect_ratio : "")}|${row.unit_credits}`));
    const priced = [...entriesOf("generate_image"), ...entriesOf("generate_video")].map((entry) => {
      const [model, size = ""] = entry.variant!.split(" ");
      return `${entry.tool}|${model}|${size}|${part(entry)[1]}`;
    });
    expect([...new Set(priced)].sort()).toEqual([...new Set(listed)].sort());
    expect(entriesOf("generate_video").every((entry) => part(entry)[0] === "clip_second")).toBe(true);
    expect(entriesOf("generate_image").every((entry) => part(entry)[0] === "image")).toBe(true);
  });
});

/** Each own-agent run kind's tool, as the MCP server names it. A new kind without a tool here does not compile. */
const SKILL_TOOLS: Readonly<Record<OwnAgentSkill, string>> = {
  film_stills: "preview_stills", film_voice: "make_voice", film_render: "render_film", film_hero: "make_film_hero", film_edit: "render_edit",
  film_take_frames: "take_frames", film_take_check: "check_take", film_cut: "render_cut", film_cut_preview: "preview_cut",
};
/** The fields of the frozen terms that are not a price: the tariff, lengths and allowances. */
const NOT_A_PRICE: ReadonlySet<keyof OwnAgentTerms> = new Set(["tariff", "included_seconds", "cut_included_seconds", "free_stills",
  "free_stills_window_hours"] as const);
const LONG = `against a picture, a take over ${TAKE_PICTURE_SHORT_TIER_SECONDS} s`;
/** Where each price the admission freezes is shown: the tool, its variant, the line's unit and how its label starts (null: no label). */
const TERM_LINES: Readonly<Record<string, readonly [tool: string, variant: string | null, unit: PriceUnit, label: string | null]>> = {
  still_credits: ["preview_stills", null, "still", null], render_credits: ["render_film", null, "call", "film up to"],
  extra_second_credits: ["render_film", null, "second", "each second over"], voice_credits_per_second: ["make_voice", null, "second", null],
  pose_credits: ["make_film_hero", null, "image", null], sprite_credits: ["make_film_hero", null, "image", "talking sprite"],
  head_credits: ["make_film_hero", "head", "call", null], edit_credits: ["render_edit", null, "call", "the cut"],
  music_credits: ["render_edit", null, "track", "music"], film_music_credits: ["render_film", null, "track", "music"],
  take_check_credits: ["check_take", null, "call", null], picture_check_credits: ["check_take", "against a picture", "call", null],
  picture_check_long_credits: ["check_take", LONG, "call", null], cut_credits: ["render_cut", null, "call", "the cut"],
  cut_extra_second_credits: ["render_cut", null, "second", "each second over"], cut_bed_credits: ["render_cut", null, "call", "a described bed"],
  cut_take_sound_credits_per_second: ["render_cut", null, "second", "a take's own sound"], cut_music_credits: ["render_cut", null, "track", "music"],
};

describe("the DIY and own-agent prices an admission freezes (#1539)", () => {
  const everything = priceListFor({ CLIPWRIGHT_OWN_AGENT: "1", CLIPWRIGHT_MUSIC: "1", CLIPWRIGHT_FILM_HEAD: "1", CLIPWRIGHT_HERO_SPRITES: "1" }, ALL_DIY);
  const entry = (list: readonly (typeof PRICE_LIST)[number][], tool: string, variant: string | null) => {
    const found = list.filter((one) => one.tool === tool && one.variant === variant);
    expect(found, `${tool} (${variant})`).toHaveLength(1);
    return found[0]!;
  };

  /** Mutants: a run kind admitted with no entry on the list; a frozen price retyped on the list or left off it; a new price in the terms
   *  the list does not show. */
  it("shows every run kind's tool and every price its terms freeze, at the frozen number", () => {
    for (const skill of OWN_AGENT_SKILLS) expect(everything.filter((one) => one.tool === SKILL_TOOLS[skill]), skill).not.toEqual([]);
    // The terms a sprite hero freezes: every other kind's terms are these without sprite_credits.
    const terms = ownAgentTermsNow({ sprites: true });
    const priced = Object.keys(terms).filter((key) => !NOT_A_PRICE.has(key as keyof OwnAgentTerms)).sort();
    expect(Object.keys(TERM_LINES).sort()).toEqual(priced);
    // Each price is found by its unit and label, then compared: two lines of one unit cannot swap their numbers unseen.
    for (const [key, [tool, variant, unit, label]] of Object.entries(TERM_LINES)) {
      const lines = entry(everything, tool, variant).lines.filter((line) => line.unit === unit &&
        (label === null ? line.label === null : line.label?.startsWith(label) === true));
      expect(lines.map((line) => line.credits), key).toEqual([terms[key as keyof OwnAgentTerms]]);
    }
    // The cut's preview stills are priced as a draft's stills; take_frames is listed free.
    expect(entry(everything, "preview_cut", null).lines).toEqual([{ label: null, unit: "still", credits: terms.still_credits }]);
    expect(isPaidEntry(entry(everything, "take_frames", null))).toBe(false);
    expect(entry(everything, "render_film", null).lines[0]!.label).toBe(`film up to ${terms.included_seconds} s`);
    expect(entry(everything, "render_cut", null).lines[0]!.label).toBe(`the cut, up to ${terms.cut_included_seconds} s`);
  });

  /** Mutants: a mode's tools sold while it is closed or the own-agent switch is off; take_frames listed twice or dropped with one mode. */
  it("sells each mode's tools only while it is open to everyone and the own-agent mode is on", () => {
    const tools = (list: readonly (typeof PRICE_LIST)[number][]) => list.map((one) => one.tool).filter((tool) =>
      ["render_edit", "check_take", "take_frames", "render_cut", "preview_cut"].includes(tool!));
    const on = { CLIPWRIGHT_OWN_AGENT: "1" };
    expect(tools(priceListFor(on))).toEqual([]);
    expect(tools(priceListFor(on, NO_DIY_MODES))).toEqual([]);
    expect(tools(priceListFor({}, ALL_DIY))).toEqual([]);
    expect(tools(priceListFor(on, { ad: true, faceless: false }))).toEqual(["render_edit", "check_take", "take_frames"]);
    expect(tools(priceListFor(on, { ad: false, faceless: true }))).toEqual(["render_cut", "check_take", "check_take", "preview_cut", "take_frames"]);
    expect(tools(priceListFor(on, ALL_DIY)).filter((tool) => tool === "take_frames")).toHaveLength(1);
    expect(entry(priceListFor(on, { ad: true, faceless: false }), "check_take", null)).toBeDefined();
  });

  /** Mutants: the edit's music line sold while music cannot be ordered, or dropped while it can; the faceless cut's music, which its admission
   *  does not gate on the music switch, dropped with it. */
  it("prices the edit's music only while music can be ordered, and the faceless cut's music always", () => {
    const sold = (env: Record<string, string>, tool: string) => entry(priceListFor({ CLIPWRIGHT_OWN_AGENT: "1", ...env }, ALL_DIY), tool, null);
    expect(sold({}, "render_edit").lines.map((line) => line.unit)).toEqual(["call"]);
    expect(sold({ CLIPWRIGHT_MUSIC: "1" }, "render_edit").lines.at(-1))
      .toEqual({ label: "music made for the cut", unit: "track", credits: MUSIC_BED_CREDITS });
    for (const music of [{}, { CLIPWRIGHT_MUSIC: "1" }])
      expect(sold(music, "render_cut").lines.filter((line) => line.unit === "track")).toEqual([{ label: "music", unit: "track", credits: MUSIC_BED_CREDITS }]);
  });

  /** Mutants: the head or the sprite line sold while admission refuses it, or dropped while admission sells it; each switch gating the other's
   *  line; the whole sprite hero's sum retyped. */
  it("sells the head and the talking sprites only while admission takes them", () => {
    const hero = (env: Record<string, string>) => priceListFor({ CLIPWRIGHT_OWN_AGENT: "1", ...env }).filter((one) => one.tool === "make_film_hero");
    const shape = (env: Record<string, string>) => hero(env).map((one) => [one.variant, one.lines.map((line) => line.label)]);
    expect(shape({})).toEqual([[null, [null]]]);
    expect(shape({ CLIPWRIGHT_HERO_SPRITES: "1" })).toEqual([[null, [null, "talking sprite"]]]);
    expect(shape({ CLIPWRIGHT_FILM_HEAD: "1" })).toEqual([[null, [null]], ["head", [null]]]);
    expect(shape({ CLIPWRIGHT_FILM_HEAD: "1", CLIPWRIGHT_HERO_SPRITES: "1" })).toEqual([[null, [null, "talking sprite"]], ["head", [null]]]);
    expect(priceListFor({ CLIPWRIGHT_FILM_HEAD: "1", CLIPWRIGHT_HERO_SPRITES: "1" }).some((one) => one.tool === "make_film_hero")).toBe(false);
    // The whole hero as admission holds it, so the sentence moves with any of its prices; 177 is the owner's number today.
    const whole = ownHeroCredits(OWN_HERO_POSES, ownAgentTermsNow({ sprites: true }), OWN_HERO_MAX_SPRITES);
    expect(whole).toBe(177);
    expect(hero({ CLIPWRIGHT_HERO_SPRITES: "1" })[0]!.notes).toContain(`a whole hero is ${whole} credits`);
  });

  it("each DIY tool's price line names its quote tool", () => {
    for (const tool of ["render_edit", "check_take", "render_cut", "preview_cut"])
      expect(priceLine(tool, everything), tool).toMatch(/^Price: .+\. Quote first with quote_\w+\.$/);
  });
});

describe("the price line of a tool", () => {
  it("is null for a free tool and names the quote tool for a paid one", () => {
    expect(priceLine("get_account")).toBeNull();
    expect(() => withPriceLine("get_account", "x")).toThrow();
    for (const tool of new Set(PRICE_LIST.filter(isPaid).map((entry) => entry.tool!))) {
      expect(priceLine(tool), tool).toMatch(new RegExp(`^Price: .+\\. Quote first with ${entriesOf(tool)[0]!.quote_tool}\\.$`));
    }
  });

  /** Mutants: the long-form minimum dropped from the line; the range taken over another unit; a part the variants share dropped or said per
   *  variant again (#1122). */
  it("states every fixed price of a short list and the range of a long one", () => {
    const parts = PARTS_FACE_TARIFF, rest = `production (voice and render) ${parts.productionCreditsPerSecond} credits per second of video ` +
      `plus live avatar on a call ${parts.liveAvatarStillCredits} credits per call still in the video, at least ${parts.minimumCredits}`;
    expect(priceLine("make_ugc")).toBe(`Price: HeyGen presenter: presenter, HeyGen Avatar IV ${parts.presenterCreditsPerSecond.heygen} credits per ` +
      `second the presenter is in the video, covered or not; OmniHuman presenter: presenter, OmniHuman 2.0 ` +
      `${parts.presenterCreditsPerSecond.omnihuman} credits per second the presenter is in the video, covered or not; each plus ${rest}. ` +
      "Quote first with quote_ugc.");
    const clips = entriesOf("generate_video").map((entry) => part(entry)[1]);
    expect(priceLine("generate_video")).toContain(`${Math.min(...clips)} to ${Math.max(...clips)} credits per second of clip`);
  });
});
