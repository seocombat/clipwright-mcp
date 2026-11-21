import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FACELESS_REJECTED_FIELDS } from "./contract-dispositions.js";
import { API_ENDPOINTS } from "./endpoints.js";
import {
  FACELESS_QUOTE_PATH, FACELESS_RUN_PATH, makeFacelessInput, facelessPlannerInput, facelessQuoteResponse,
  offeredFacelessInput, offeredFacelessInputShape,
} from "./faceless-public.js";
import { buildOpenApiDocument } from "./openapi.js";
import { run } from "./runs.js";
import { parseSkill } from "./skills.js";
import * as facelessContracts from "./faceless-public.js";

const script = { input_mode: "script", script: "A clear story with spoken words.", duration_seconds: 30 };
const brief = { input_mode: "brief", brief: "Explain how the product works.", duration_seconds: 90 };

it("validates accepted and stored generation input without rewriting its raw script", () => {
  expect(facelessContracts).toHaveProperty("parseFacelessInputPreservingScript", expect.any(Function));
  expect(facelessContracts).toHaveProperty("parseFacelessStoredInputPreservingScript", expect.any(Function));
  const raw = { ...script, script: ` \n${script.script}\n ` };
  expect(facelessContracts.parseFacelessInputPreservingScript(raw)).toEqual({ ...raw, captions: true });
  expect(facelessContracts.parseFacelessStoredInputPreservingScript(raw)).toEqual({ ...raw, captions: true });
  // Admission freezes a brief's default flash (#1067).
  expect(facelessContracts.parseFacelessInputPreservingScript(brief)).toEqual({ ...makeFacelessInput.parse(brief),
    transitions: { look: "flash", at: "scene_changes" } });
  for (const parse of [facelessContracts.parseFacelessInputPreservingScript, facelessContracts.parseFacelessStoredInputPreservingScript]) {
    expect(() => parse({ ...raw, script: "   " })).toThrow();
    expect(() => parse({ ...raw, unexpected: true })).toThrow();
  }
});

describe("makeFacelessInput", () => {
  // The faceless director (#1573) is withdrawn: its stored runs still parse with their mark, level and placement; a public body is refused.
  // Mutants: keep_anchors or directed dropped from the stored schema (a stored run no longer reads), or kept public (a body is silently taken).
  it("reads a stored directed run with tier, directed and keep_anchors, and refuses keep_anchors on a public body", () => {
    const stored = { ...script, scene_images: [{ image_url: "https://example.com/a.png", anchor: { quote: "spoken words" } }], tier: "pro",
      keep_anchors: true, directed: { version: 1, tier: "pro", pairing: "keep" } };
    expect(facelessContracts.facelessStoredInput.parse(stored)).toMatchObject({ tier: "pro", keep_anchors: true,
      directed: { version: 1, tier: "pro", pairing: "keep" } });
    expect(facelessContracts.facelessStoredInput.parse({ ...brief, directed: { version: 1, tier: "standard", pairing: "none" } }))
      .toMatchObject({ directed: { tier: "standard" } });
    for (const body of [{ ...script, keep_anchors: true }, { ...brief, keep_anchors: true }, { ...script, directed: stored.directed }]) {
      const refused = makeFacelessInput.safeParse(body);
      expect(refused.success).toBe(false);
      expect(refused.error!.issues.map(issue => issue.code)).toContain("unrecognized_keys");
    }
    expect(offeredFacelessInputShape).not.toHaveProperty("keep_anchors");
    expect(offeredFacelessInput.safeParse({ ...script, keep_anchors: true }).success).toBe(false);
    expect(facelessQuoteResponse.shape).not.toHaveProperty("tiers");
  });

  it("accepts script and brief modes and defaults captions on", () => {
    expect(makeFacelessInput.parse(script).captions).toBe(true);
    expect(makeFacelessInput.parse(brief).captions).toBe(true);
  });

  /** A faceless frame has no presenter to keep a scene off, and its scenes are drawn where their author sets them (#1327). */
  it("refuses a scene's place", () => {
    const scene = { id: "s", anchor: { quote: "spoken words" }, brief: "an arrow", place: { rect: { left: 0.1, top: 0.6, width: 0.8, height: 0.1 } } };
    expect(makeFacelessInput.safeParse({ ...script, scenes: [scene] }).error?.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`))
      .toEqual(['scenes.0.place: scene "s": make_faceless draws its scenes where their author sets them; omit place']);
  });

  it("accepts qualified references and anchored customer scene images", () => {
    const parsed = makeFacelessInput.parse({ ...script,
      style_reference: "https://example.com/style.png",
      character_reference: "https://example.com/character.jpg",
      character_details: "Mira: no glasses, a black bob haircut, and a red scarf.",
      scene_images: [{ image_url: "https://example.com/scene.png", anchor: { quote: "clear story" } }],
    });
    expect(parsed.scene_images?.[0]?.anchor).toEqual({ quote: "clear story" });
    expect(parsed.character_details).toContain("no glasses");
  });

  it.each([
    {}, { ...script, brief: "another input" }, { ...brief, script: "another input" },
    { ...brief, brief: "" }, { ...brief, brief: "   " },
    { ...script, script: "" }, { ...script, script: "   " },
    { ...script, duration_seconds: 29.96 }, { ...script, duration_seconds: 90.04 },
    { ...script, duration_seconds: 30.001 },
    { ...script, style_reference: "http://example.com/style.png" },
    { ...script, character_details: "x".repeat(2001) },
    { ...script, scene_images: [{ image_url: "https://localhost/photo.png", anchor: { quote: "clear" } }] },
    { ...script, scene_images: [{ image_url: "https://example.com/scene.png" }] },
    { ...script, unknown_field: true },
  ])("rejects invalid input: %j", (input) => {
    expect(makeFacelessInput.safeParse(input).success).toBe(false);
  });
});

it("the faceless client paths are declared in the endpoint registry", () => {
  const paths = API_ENDPOINTS.map((endpoint) => endpoint.path);
  expect(paths).toContain(FACELESS_QUOTE_PATH);
  expect(paths).toContain(FACELESS_RUN_PATH);
});

describe("offeredFacelessInputShape (flat MCP form)", () => {
  const flat = offeredFacelessInput;
  const viaFlat = (input: unknown) => {
    const offered = flat.safeParse(input);
    return offered.success ? makeFacelessInput.safeParse(offered.data) : offered;
  };

  it("offers exactly the fields of both union branches, less the ones refused by name", () => {
    const branchKeys = makeFacelessInput.options.flatMap((option) => Object.keys(option.shape));
    const refused = Object.keys(FACELESS_REJECTED_FIELDS);
    expect(refused).toEqual(["voice_id"]);
    expect(branchKeys).toEqual(expect.arrayContaining(refused));
    expect(Object.keys(offeredFacelessInputShape).sort()).toEqual(
      [...new Set(branchKeys)].filter((key) => !refused.includes(key)).sort(),
    );
  });

  it.each([
    script, brief, { ...script, captions: false }, { ...brief, duration_seconds: 45.04 },
    { ...script, voice: "narrator_en_wise_lady" },
    { ...script,
      style_reference: "https://example.com/style.png",
      character_reference: "https://example.com/character.jpg",
      character_details: "Mira: no glasses, black bob, red scarf",
      scene_images: [{ image_url: "https://example.com/scene.png", anchor: { startWord: 0, endWord: 2 } }] },
  ])("passes valid input unchanged into the union: %j", (input) => {
    const result = viaFlat(input);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(makeFacelessInput.parse(input));
  });

  it.each([
    { ...script, brief: "another input" }, { ...brief, script: "another input" },
    { input_mode: "script", brief: "only a brief", duration_seconds: 30 },
    { input_mode: "brief", script: "only a script", duration_seconds: 30 },
    { input_mode: "story", script: "x", duration_seconds: 30 },
    { ...script, duration_seconds: 30.001 }, { ...script, unknown_field: true },
    { ...script, voice_id: "JBFqnCBsd6RMkjVDRZzb" }, { ...script, voice: "two words" },
  ])("rejects what the union rejects: %j", (input) => {
    expect(makeFacelessInput.safeParse(input).success).toBe(false);
    expect(viaFlat(input).success).toBe(false);
  });

  // Mutant: a plain object strips an undeclared key, and the union after it never sees `voice_id`.
  it("the tool form refuses an undeclared key itself: a field refused by name with its reason, another by name", () => {
    const messages = (input: unknown) => flat.safeParse(input).error?.issues.map((issue) => issue.message);
    expect(messages({ ...script, voice_id: "JBFqnCBsd6RMkjVDRZzb" })).toEqual([FACELESS_REJECTED_FIELDS.voice_id.message]);
    expect(messages({ ...brief, aspectRatio: "16:9" })).toEqual(['"aspectRatio" is not a field of this tool']);
    expect(messages({ ...script, aspectRatio: "16:9", voice_id: 1 })).toEqual([
      `"aspectRatio" is not a field of this tool; ${FACELESS_REJECTED_FIELDS.voice_id.message}`,
    ]);
    const extended = flat.extend({ attempt: z.number().optional() });
    expect(extended.safeParse({ ...script, attempt: 2 }).success).toBe(true);
    expect(extended.safeParse({ ...script, voice_id: "x" }).error?.issues[0]?.message).toBe(FACELESS_REJECTED_FIELDS.voice_id.message);
    expect(z.toJSONSchema(flat, { io: "input" }).additionalProperties).toBe(false);
  });
});

describe("faceless shared contracts", () => {
  it("requires word timing even with captions off", () => {
    const plan = { script: "A clear story", outputFrames: 750, captions: false };
    expect(facelessPlannerInput.safeParse(plan).success).toBe(false);
    expect(facelessPlannerInput.safeParse({ ...plan, words: [
      { word: "A", startSec: 0, endSec: 0.2 },
      { word: "clear", startSec: 0.2, endSec: 0.6 },
      { word: "story", startSec: 0.6, endSec: 1 },
    ] }).success).toBe(true);
  });

  it("recognizes the skill and exposes a quote with warnings and version", () => {
    expect(parseSkill("make_faceless")).toBe("make_faceless");
    expect(facelessQuoteResponse.parse({ skill: "make_faceless", outputFrames: 750,
      baseCredits: 200, openerCredits: 150, totalCredits: 350,
      tariffId: "faceless-image-i2v-v1", captions: false,
      warnings: [], contract_version: "1",
    }).totalCredits).toBe(350);
  });

  it("keeps a faceless billing summary on the shared run", () => {
    const parsed = run.parse({ run_id: "run_abc", skill: "make_faceless", state: "succeeded",
      credits_reserved: 350, credits_charged: 350, error: null,
      final_output: null, created_at: "2026-09-25T10:00:00.000Z", finished_at: "2026-09-25T10:02:00.000Z",
      faceless_billing: { outputFrames: 750, baseCredits: 200, openerCredits: 150,
        totalCredits: 350, tariffId: "faceless-image-i2v-v1", captions: true },
    });
    expect(parsed.faceless_billing?.totalCredits).toBe(350);
  });
});

// #1359 C1: the field says what each format does with the character, so a standard run's use of it is never a guess.
// #1358: the explainer is no longer made here, so the field names the one format that uses it.
it("describes character_reference in customer terms", () => {
  const text = offeredFacelessInputShape.character_reference.description ?? "";
  expect(text).toContain("The figure is in every picture we generate and in the opening clip; your own scene_images are shown as they are.");
  expect(text).not.toMatch(/explainer/i);
  expect(text).toContain("a public https image, or a picture you uploaded or saved in your assets.");
  expect(text).not.toMatch(/flare|fal|seedance|kie|CLIPWRIGHT|reference role/i);
  // OpenAPI reads the same schema: both branches of MakeFacelessInput carry the very text MCP offers.
  const schemas = (buildOpenApiDocument() as { components: { schemas: Record<string, { oneOf: { properties: Record<string, { description?: string }> }[] }> } })
    .components.schemas;
  const branches = schemas.MakeFacelessInput!.oneOf;
  expect(branches.length).toBeGreaterThan(1);
  for (const branch of branches) expect(branch.properties.character_reference?.description).toBe(text);
});

// #1291 F4 C1/C5. Mutants: tier taken on a picture video; a level the schema does not name; the description's prices retyped instead of read,
// or naming a model, an engine or a switch.
describe("the explainer's tier", () => {
  const explainer = { input_mode: "script", script: "Open the app and tap save.", duration_seconds: 30, format: "explainer" };
  // The schema keeps tier on every format for stored runs (#1573); admission refuses it off an explainer for every account.
  it("is standard or pro on an explainer, and refused on any other run", () => {
    expect(makeFacelessInput.parse({ ...explainer, tier: "pro" }).tier).toBe("pro");
    expect(makeFacelessInput.parse(explainer).tier).toBeUndefined();
    expect(makeFacelessInput.safeParse({ ...explainer, tier: "max" }).success).toBe(false);
    const { format: _format, ...video } = explainer;
    for (const tier of ["standard", "pro"]) expect(facelessContracts.facelessTierRefusal(makeFacelessInput.parse({ ...video, tier })))
      .toBe(facelessContracts.EXPLAINER_TIER_REFUSAL);
    expect(facelessContracts.facelessTierRefusal(makeFacelessInput.parse({ ...explainer, tier: "pro" }))).toBeNull();
    expect(facelessContracts.facelessTierRefusal(makeFacelessInput.parse(video))).toBeNull();
  });
  // #1358. Mutants: the retired film still offered with its levels and prices, or the field leading nowhere.
  it("sends an explainer to the film the user writes, and offers no level", () => {
    const tier = offeredFacelessInputShape.tier.description ?? "", format = offeredFacelessInputShape.format.description ?? "";
    expect(format).toContain("not offered here");
    expect(format).toContain("get_film_guide");
    expect(tier).toBe("Format explainer only, which is not offered here.");
    expect(`${tier} ${format} ${offeredFacelessInputShape.mascot_id.description}`).not.toMatch(/standard|\bpro\b|half an hour|credits/);
    expect(`${tier} ${format}`).not.toMatch(/sonnet|opus|claude|anthropic|agent|CLIPWRIGHT|tariff/i);
  });
  // #1358 (Codex r2). Mutant: any word added to the public refusal, a vendor's name among them, passes a check by containment.
  it("refuses the format in customer words that lead to the film the user writes", () => {
    expect(facelessContracts.FACELESS_EXPLAINER_DISABLED_MESSAGE).toBe("format explainer is not offered on make_faceless: write the explainer " +
      "film yourself, starting with get_film_guide, each part quoted before it is made; omit format for a narrated video over pictures");
  });
});
