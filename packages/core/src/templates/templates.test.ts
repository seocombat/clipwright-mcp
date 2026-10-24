import { describe, expect, it } from "vitest";
import { z } from "zod";
import { isNarratedUgcInput, makeUgcInput, mcpUgcTemplate, pinnedInsertAssetOf, storedUgcInput } from "../skills.js";
import { mcpUgcInputShape, offeredUgcInputShape } from "../contract-dispositions.js";
import { faceBillingUnitsOf, freezeResolvedTimeline } from "../resolved-timeline.js";
import { scriptInsertsTimelineFixture } from "../__fixtures__/long-form-timeline.fixture.js";
import { ASPECT_RATIOS } from "../skills.js";
import { calloutParts, contrastRatio, TEMPLATE_KIND_IDS, TEMPLATE_KINDS, TEMPLATE_PRESETS, TEMPLATE_SIZES, templateCatalogText, templateFaceWarnings, templateFootprint,
  templateFieldValues, templateKindAt, templateMediaOf, templateMoments, templateRefusals, templateTheme, textUnits, withTemplateField,
  type TemplateKind } from "./index.js";
import { callout } from "./callout.js";
import { faceZone, rectsOverlap } from "../ugc-layers.js";
import { dispositionWarnings } from "../contract-dispositions.js";
import { tag } from "./tag.js";

const script = "One two three four five six seven eight nine ten eleven twelve";
const url = "https://example.com/shot.png";
const insert = (id: string, startWord: number, endWord: number, transition?: string) =>
  ({ id, media_url: url, media_type: "image", anchor: { startWord, endWord }, ...(transition ? { transition } : {}) });
const overlay = (id: string, startWord: number, endWord: number, position: string) => ({ id, media_url: url, media_type: "image", anchor: { startWord, endWord }, position });
const tagAt = (id: string, startWord: number, endWord: number, position = "top", text = "sounds natural") =>
  ({ id, kind: "tag", anchor: { startWord, endWord }, data: { text, position } });
const card = (id: string, startWord: number, endWord: number) => ({ id, kind: "end_card", anchor: { startWord, endWord }, data: { site: "clipwright.io" } });
const longForm = { broll_policy: "anyone", inserts: [insert("shot", 10, 11)] };

/** The refusals of a body as `path: message`; an accepted body gives none. */
function refusals(body: Record<string, unknown>): string[] {
  const parsed = makeUgcInput.safeParse({ script, ...body });
  return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
}

/** Every zod node of a schema, so a default or transform anywhere in a kind's data is found. */
function nodes(schema: z.ZodType): string[] {
  const def = schema._zod.def as { type: string; innerType?: z.ZodType; shape?: Record<string, z.ZodType>; in?: z.ZodType; out?: z.ZodType; element?: z.ZodType };
  const children = [def.innerType, def.in, def.out, def.element, ...Object.values(def.shape ?? {})].filter((child): child is z.ZodType => child !== undefined);
  return [def.type, ...children.flatMap(nodes)];
}

describe("the catalog registry (#778 S3 D2, conformance)", () => {
  it.each(TEMPLATE_KINDS.map(kind => [kind.kind, kind] as const))("%s: strict data with a valid sample, no defaults or transforms", (_, kind) => {
    expect(kind.data.safeParse(kind.sample).success).toBe(true);
    expect(kind.data.safeParse({ ...kind.sample, extra: 1 }).success).toBe(false);
    expect(nodes(kind.data).filter(type => ["default", "prefault", "transform", "pipe", "catch"].includes(type))).toEqual([]);
    // Every text field has a unit limit, every limit names a text field, and every `{ asset_id }` field is a declared slot.
    const media = Object.entries(kind.data.shape).filter(([, schema]) => (schema as z.ZodType).safeParse({ asset_id: `ast_${"a".repeat(32)}` }).success)
      .map(([key]) => key);
    const strings = Object.entries(kind.data.shape).filter(([key, schema]) => !media.includes(key) && nodes(schema as z.ZodType).includes("string")).map(([key]) => key);
    // A string field is text with a limit or an inner quote, at any depth (#778 S3b(i)).
    expect([...new Set([...Object.keys(kind.text), ...(kind.quotes ?? [])].map(key => key.split(".")[0]!))].sort()).toEqual(strings.sort());
    expect(Object.keys(kind.text).filter(key => (kind.quotes ?? []).includes(key))).toEqual([]);
    expect(Object.keys(kind.slots).sort()).toEqual(media.sort());
    // The sample fills every text field and every inner quote, so the media test can show each one drawn.
    expect([...Object.keys(kind.text), ...(kind.quotes ?? [])].filter(key => {
      const values = templateFieldValues(kind.sample, key);
      return !values.length || values.some(({ value }) => typeof value !== "string");
    })).toEqual([]);
    expect(kind.placements.length).toBeGreaterThan(0);
    expect(Number.isSafeInteger(kind.kindVersion) && kind.kindVersion > 0).toBe(true);
  });

  it("lists every kind once, in the order of the enum the MCP item offers", () => {
    expect(TEMPLATE_KINDS.map(kind => kind.kind)).toEqual([...TEMPLATE_KIND_IDS]);
  });

  it("keeps every footprint inside the frame, in every format and enum value", () => {
    for (const kind of TEMPLATE_KINDS) {
      const variants = Object.entries(kind.data.shape).flatMap(([key, schema]) => {
        const inner = (schema as unknown as { unwrap?: () => unknown }).unwrap?.() ?? schema;
        const options = (inner as { options?: string[] }).options;
        return options ? options.map(option => ({ ...kind.sample, [key]: option })) : [];
      });
      for (const data of [kind.sample, ...variants]) for (const aspect of ASPECT_RATIOS) for (const placement of kind.placements) {
        const rect = kind.rect(data, aspect, placement);
        expect({ kind: kind.kind, aspect, inside: rect.left >= 0 && rect.top >= 0 && rect.left + rect.width <= 1 && rect.top + rect.height <= 1 &&
          rect.width > 0 && rect.height > 0 }).toEqual({ kind: kind.kind, aspect, inside: true });
      }
    }
  });
});

describe("over-presenter templates keep off the face (#778 S3)", () => {
  /** A kind's default place: only its required fields, every value of a required enum, at every size and format. */
  it("places every over-presenter kind off the face by default, at every size and format", () => {
    for (const kind of TEMPLATE_KINDS.filter(entry => entry.placements.includes("over"))) {
      const shape = Object.entries(kind.data.shape) as [string, z.ZodType][];
      const required = Object.fromEntries(shape.filter(([, schema]) => !schema.safeParse(undefined).success)
        .map(([key]) => [key, (kind.sample as Record<string, unknown>)[key]]));
      const variants = shape.filter(([key, schema]) => key in required && (schema as unknown as { options?: string[] }).options)
        .flatMap(([key, schema]) => (schema as unknown as { options: string[] }).options.map(option => ({ ...required, [key]: option })));
      for (const data of variants.length ? variants : [required]) for (const size of [...TEMPLATE_SIZES, undefined]) for (const aspect of ASPECT_RATIOS) {
        const rect = kind.rect({ ...data, ...(size ? { size } : {}) }, aspect, "over");
        expect({ kind: kind.kind, data, size, aspect, onFace: rectsOverlap(rect, faceZone(aspect)) }).toEqual({ kind: kind.kind, data, size, aspect, onFace: false });
      }
    }
  });

  it("draws an explicit place on the face as asked and names it in warnings[]", () => {
    const face = (templates: unknown[], aspect_ratio?: string) => templateFaceWarnings({ templates, aspect_ratio });
    expect(face([tagAt("t", 0, 2, "top")])).toEqual([expect.stringContaining("template \"t\" is drawn over the presenter's face")]);
    expect(refusals({ ...longForm, templates: [tagAt("t", 0, 2, "top")] })).toEqual([]);
    expect(face([{ ...tagAt("t", 0, 2), data: { text: "x" } }, tagAt("b", 0, 2, "bottom"), { id: "s", kind: "stat", placement: "over", data: { value: 1 } },
      { id: "h", kind: "title_card", data: { title: "x" } }], "16:9")).toEqual([]);
    expect(dispositionWarnings({ templates: [tagAt("t", 0, 2, "center")] })).toEqual([expect.stringContaining("template \"t\" is drawn over the presenter's face")]);
  });
});

describe("one registry, two schemas (D3)", () => {
  it("REST checks data by kind and names the field; MCP takes any object and the server refuses it", () => {
    expect(refusals({ ...longForm, templates: [tagAt("t", 0, 2, "middle")] })).toEqual([expect.stringMatching(/^templates\.0\.data\.position: /)]);
    expect(refusals({ ...longForm, templates: [{ ...card("c", 0, 2), data: { site: "a", cta: "b", logo: "x" } }] }))
      .toEqual([expect.stringMatching(/^templates\.0\.data: /)]);
    expect(mcpUgcTemplate.safeParse({ ...tagAt("t", 0, 2, "middle") }).success).toBe(true);
    expect(z.object(mcpUgcInputShape).shape.templates).not.toBe(offeredUgcInputShape.templates);
  });

  it("describes every kind with its fields and limits from the registry", () => {
    const text = templateCatalogText();
    for (const kind of TEMPLATE_KINDS) expect(text).toContain(`${kind.kind} (${kind.placements.join("|")}): ${kind.description}`);
    expect(text).toContain("data text ≤ 32, position? top|center|bottom, size? small|medium|large");
    expect(text).toContain("data name ≤ 28, role? ≤ 36, side left|right, size? small|medium|large");
    expect(text).toContain("data title ≤ 48, chip? ≤ 32, logo? {asset_id} image, size? small|medium|large");
    expect(text).toContain("data text ≤ 120, author? ≤ 32, photo? {asset_id} image (cut to fill), size? small|medium|large");
    expect(text).toContain("stat (full|over): ");
    expect(text).toContain("data value number, prefix? ≤ 6, suffix? ≤ 6, label? ≤ 32, size? small|medium|large");
    expect(text).toContain("callout (over): ");
    expect(text).toContain("data target {x,y}, style arrow|ring, text? ≤ 24, size? small|medium|large");
  });

  /** Mutant: keep «Long form only», and an agent adds an insert to a plain run to use a tag and pays long-form-v1 for it (#840 C7). */
  it("tells an agent templates take any script run and never change its tariff", () => {
    const text = templateCatalogText();
    expect(text).not.toContain("Long form only");
    expect(text).toContain("On any script run. Templates never change the price: a plain run is billed per second of finished video (30/s); " +
      "a run with inserts, overlays or layout_windows is billed long-form-v1, and a covered presenter there is still face time.");
  });
});

describe("sizes and the reference tag (owner 2026-10-22)", () => {
  const rect = (kind: TemplateKind, data: Record<string, unknown>, aspect = "9:16") => kind.rect(data, aspect);
  it("draws a medium tag at the reference scale, two thirds down in the caption spot, and scales each kind by its size", () => {
    const pill = rect(tag as unknown as TemplateKind, { text: "personal assistant" });
    // The footprint holds a 92 px pill font on a 1080 short side: about 3.5% cap height of a 9:16 frame, as reference frame 17.
    expect([Math.round(pill.height * 1920), Math.round((pill.top + pill.height / 2) * 1920), Math.round(pill.width * 1080)]).toEqual([147, 1268, 972]);
    expect([tag.hidesCaptions({ text: "x" }), tag.hidesCaptions({ text: "x", position: "top" })]).toEqual([true, false]);
    for (const kind of TEMPLATE_KINDS) {
      const heights = (["small", undefined, "medium", "large"] as const).map(size => rect(kind, { ...kind.sample, size }).height);
      expect({ kind: kind.kind, small: heights[0]! / heights[1]!, medium: heights[2] === heights[1], large: heights[3]! / heights[1]! })
        .toEqual({ kind: kind.kind, small: expect.closeTo(0.75, 2), medium: true, large: expect.closeTo(1.3, 2) });
    }
  });
  it("refuses by the footprint of the size drawn: two tags clear at medium overlap at large", () => {
    const tags = (size?: string) => ({ ...longForm, aspect_ratio: "16:9", templates: [{ ...tagAt("a", 0, 3, "center"), data: { text: "one", position: "center", ...(size ? { size } : {}) } },
      { ...tagAt("b", 1, 2), data: { text: "two", ...(size ? { size } : {}) } }] });
    expect(refusals(tags())).toEqual([]);
    expect(refusals(tags("large"))).toEqual([expect.stringContaining("template \"b\" shares the screen with \"a\"")]);
  });
});

describe("templates on any script run (#840, owner 2026-10-23)", () => {
  /** Mutant: restore the long-form gate, and a plain script with a tag is refused before it can run at 30 credits a second. */
  it("admits templates, a theme and sounds on a plain script, on a long-form one, and still refuses them without script", () => {
    expect(refusals({ templates: [tagAt("t", 0, 2)] })).toEqual([]);
    expect(refusals({ templates: [tagAt("t", 0, 2), card("c", 4, 6)], template_theme: { preset: "neon", accent: "#0F766E" },
      template_sounds: { notify: "bong" } })).toEqual([]);
    expect(refusals({ ...longForm, templates: [tagAt("t", 0, 2)] })).toEqual([]);
    expect(refusals({ broll_policy: "anyone", overlays: [overlay("o", 4, 6, "top_left")], templates: [card("c", 0, 2)] })).toEqual([]);
    expect(refusals({ segments: [{ kind: "actor", script }], templates: [tagAt("t", 0, 2)], script: undefined }))
      .toContain("templates: templates require script and cannot be combined with segments");
  });
  /** Mutant: let templates make a run narrated, and a plain run with a tag takes the long-form tariff, the face bill and the segmented path. */
  it("never makes a run narrated, on the admitted input or the stored one the worker resumes from", () => {
    const admitted = makeUgcInput.parse({ script, templates: [tagAt("t", 0, 2), card("c", 4, 6)], template_theme: { preset: "neon" }, template_sounds: false });
    expect([isNarratedUgcInput(admitted), isNarratedUgcInput(storedUgcInput.parse({ ...admitted, composition_version: 2 }))]).toEqual([false, false]);
    expect(isNarratedUgcInput(makeUgcInput.parse({ script, ...longForm, templates: [tagAt("t", 0, 2)] }))).toBe(true);
  });
});

describe("text the renderer can draw (D10, A5)", () => {
  const text = (value: string, scriptText = script) => {
    const parsed = makeUgcInput.safeParse({ ...longForm, script: scriptText, templates: [tagAt("t", 0, 2, "top", value)] });
    return parsed.success ? [] : parsed.error.issues.map(issue => issue.message);
  };
  it("counts a wide CJK character as two units", () => {
    expect([textUnits("abc"), textUnits("価格"), textUnits("가격"), textUnits("　")]).toEqual([3, 4, 4, 2]);
    const japanese = "価格 は とても 安い です 今日 から 始め ます 一 二 三";
    expect(text("価".repeat(16), japanese)).toEqual([]);
    expect(text("価".repeat(17), japanese)).toEqual(["tag text is 34 units long, over the 32 it takes (a wide character counts 2)"]);
  });
  it("refuses blank text, line breaks, emoji and pictographs", () => {
    expect(text("   ")).toEqual(["tag text is blank"]);
    expect(text("two\nlines")).toEqual(["tag text has a line break: template text is one line"]);
    for (const emoji of ["🔥", "❤", "©", "™"]) expect(text(`hot ${emoji}`)[0]).toMatch(/no emoji or pictographs/);
  });
  it("draws Latin and the run script's own letters, and refuses letters of another script", () => {
    expect(text("Цена: 10 €")).toEqual(["tag text has \"Ц\", which the run's fonts cannot draw: use Latin letters, digits and common punctuation"]);
    expect(text("Цена: 10 € — Clipwright", "Раз два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать")).toEqual([]);
    expect(text("Crème brûlée, «déjà vu»")).toEqual([]);
    expect(text("ok ⇒ go")).toEqual(["tag text has \"⇒\", which the run's fonts cannot draw: use Latin letters, digits and common punctuation"]);
  });
});

describe("footprints and frames (D5, D6, A6)", () => {
  it("collides by rectangle over overlapping words, with overlays and with other templates", () => {
    expect(refusals({ ...longForm, overlays: [overlay("band", 0, 4, "bottom")], templates: [tagAt("t", 2, 3, "bottom")] }))
      .toEqual([expect.stringContaining("templates.0: template \"t\" shares the screen with \"band\"")]);
    expect(refusals({ ...longForm, overlays: [overlay("band", 0, 4, "bottom")], templates: [tagAt("t", 2, 3, "top")] })).toEqual([]);
    expect(refusals({ ...longForm, templates: [{ id: "lt", kind: "lower_third", anchor: { startWord: 0, endWord: 3 }, data: { name: "Maya", side: "left" } },
      card("c", 2, 4)] })).toEqual([expect.stringContaining("templates.1: template \"c\" shares the screen with \"lt\"")]);
    expect(refusals({ ...longForm, overlays: [overlay("a", 0, 4, "top_left"), overlay("b", 0, 4, "top_right")], templates: [tagAt("t", 1, 2, "center")] }))
      .toEqual([expect.stringContaining("at most 2 overlays and templates show at once")]);
  });
  it("draws a tag on insert frames, refuses another kind wholly under an insert, and any template on a layout window", () => {
    expect(refusals({ ...longForm, templates: [tagAt("t", 10, 11)] })).toEqual([]);
    expect(refusals({ ...longForm, templates: [card("c", 10, 11)] })).toEqual([expect.stringContaining("lies wholly under full-frame inserts")]);
    expect(refusals({ ...longForm, layout_windows: [{ id: "w", media_url: url, media_type: "image", anchor: { startWord: 0, endWord: 3 }, layout: "card" }],
      templates: [tagAt("t", 2, 4)] })).toEqual([expect.stringContaining("overlaps layout window \"w\"")]);
    expect(refusals({ ...longForm, templates: [tagAt("shot", 0, 2)] })).toEqual([expect.stringContaining("templates.0.id: id \"shot\" is already used in inserts")]);
    expect(refusals({ ...longForm, templates: [{ ...tagAt("t", 0, 2), placement: "full" }] })).toEqual(["templates.0.placement: tag takes placement over, not full"]);
    expect(refusals({ ...longForm, templates: [{ ...tagAt("t", 0, 2), transition: "wipe" }] }))
      .toEqual(["templates.0.transition: transition works on a full-frame template only"]);
  });

  // A full-frame kind ships in S3a(ii); the rules for it are generic over the placement, so a fixture kind proves them now.
  const poster: TemplateKind = { ...tag, kind: "poster", placements: ["full", "over"] } as unknown as TemplateKind;
  const full = (id: string, startWord: number, endWord: number, transition?: string) =>
    ({ id, kind: "poster", placement: "full" as const, anchor: { startWord, endWord }, data: { text: "Hook", position: "top" }, ...(transition ? { transition } : {}) });
  const fullRefusals = (body: Record<string, unknown>) =>
    templateRefusals({ script, ...longForm, ...body } as Parameters<typeof templateRefusals>[0], [...TEMPLATE_KINDS, poster]).map(refusal => refusal.message);
  it("refuses a wipe or zoom boundary next to a full-frame template, in both directions", () => {
    expect(fullRefusals({ inserts: [insert("shot", 10, 11, "wipe")], templates: [full("p", 8, 10)] }))
      .toEqual([expect.stringContaining("meets insert \"shot\", whose wipe would show a hidden presenter frame")]);
    // The insert right before the template, as well as right after it (Codex r1).
    expect(fullRefusals({ inserts: [insert("shot", 6, 8, "zoom")], templates: [full("p", 8, 10)] }))
      .toEqual([expect.stringContaining("meets insert \"shot\", whose zoom would show a hidden presenter frame")]);
    expect(fullRefusals({ inserts: [insert("shot", 6, 8)], templates: [full("p", 8, 10, "wipe")] }))
      .toEqual([expect.stringContaining("has a wipe and meets \"shot\"")]);
    expect(fullRefusals({ inserts: [insert("shot", 10, 11)], templates: [full("p", 8, 10, "zoom")] }))
      .toEqual([expect.stringContaining("has a zoom and meets \"shot\"")]);
    expect(fullRefusals({ templates: [full("a", 0, 2, "wipe"), full("b", 2, 4)] })).toEqual([expect.stringContaining("template \"a\" has a wipe and meets \"b\"")]);
    expect(fullRefusals({ inserts: [insert("shot", 10, 11, "flash")], templates: [full("p", 8, 10, "cut")] })).toEqual([]);
  });
  it("keeps full-frame templates off inserts and one another, and refuses an overlay or template wholly under them", () => {
    expect(fullRefusals({ templates: [full("p", 9, 11)] })).toEqual([expect.stringContaining("overlaps insert \"shot\"")]);
    expect(fullRefusals({ templates: [full("a", 0, 3), full("b", 2, 4)] })).toEqual([expect.stringContaining("overlaps full-frame template \"a\"")]);
    expect(fullRefusals({ templates: [full("p", 0, 4), card("c", 1, 3)] })).toEqual([expect.stringContaining("template \"c\" lies wholly under")]);
    expect(fullRefusals({ overlays: [overlay("o", 1, 3, "top_left")], templates: [full("p", 0, 4)] }))
      .toEqual([expect.stringContaining("overlay \"o\" lies wholly under full-frame inserts or templates")]);
  });
});

describe("pins, timeline and face seconds (A1, D9, D11)", () => {
  it("finds a template slot's pin by slot, apart from an item's own pin", () => {
    const pin = (insert_id: string, slot?: string) => ({ insert_id, ...(slot ? { slot } : {}), asset_id: `ast_${"a".repeat(32)}`, key: `assets/${insert_id}${slot ?? ""}`,
      sha256: "b".repeat(64), bytes: 1, kind: "image", media_type: "image/png", width: 1, height: 1 });
    const stored = storedUgcInput.parse({ script, insert_assets: [pin("intro-logo"), pin("intro", "logo")] });
    expect(pinnedInsertAssetOf(stored, "intro", "logo")?.key).toBe("assets/intrologo");
    expect(pinnedInsertAssetOf(stored, "intro-logo")?.key).toBe("assets/intro-logo");
    expect(pinnedInsertAssetOf(stored, "intro")).toBeUndefined();
  });

  it("bills the presenter under a full-frame template as face time: the meter reads slots, and templates are none", () => {
    const { hash: _hash, ...content } = scriptInsertsTimelineFixture();
    const actor = content.slots.find(slot => slot.kind === "actor")!;
    const covered = freezeResolvedTimeline({ ...content, templates: [{ id: "poster", kind: "poster", kindVersion: 1, placement: "full", preset: "clean_light",
      startFrame: actor.startFrame, endFrame: actor.endFrame, data: { text: "Hook" } }] });
    expect(faceBillingUnitsOf(covered)).toEqual(faceBillingUnitsOf(freezeResolvedTimeline(content)));
    expect(covered.hash).not.toBe(freezeResolvedTimeline(content).hash);
    expect(freezeResolvedTimeline({ ...content, templates: undefined }).hash).toBe(scriptInsertsTimelineFixture().hash);
    expect(() => freezeResolvedTimeline({ ...content, templates: [{ id: "x", kind: "tag", kindVersion: 1, placement: "over", preset: "clean_light",
      startFrame: 0, endFrame: content.outputFrames + 1, data: {} }] })).toThrow("invalid template interval or identity");
  });
});

describe("the first full-frame kinds and media slots (#778 S3a(ii))", () => {
  const logo = { asset_id: `ast_${"1".repeat(32)}` };
  const hook = (id: string, startWord: number, endWord: number, extra: Record<string, unknown> = {}) =>
    ({ id, kind: "title_card", anchor: { startWord, endWord }, data: { title: "fonio.ai", chip: "raised $17 million", logo }, ...extra });
  it("takes title_card and quote on a full frame only, and stat on both", () => {
    expect(refusals({ ...longForm, templates: [hook("h", 0, 3), { id: "q", kind: "quote", anchor: { startWord: 4, endWord: 6 }, data: { text: "So good." } },
      { id: "s", kind: "stat", anchor: { startWord: 6, endWord: 8 }, placement: "over", data: { value: 17.5, prefix: "$", suffix: "M" } }] })).toEqual([]);
    expect(refusals({ ...longForm, templates: [hook("h", 0, 3, { placement: "over" })] })).toEqual(["templates.0.placement: title_card takes placement full, not over"]);
    expect(refusals({ ...longForm, templates: [{ id: "s", kind: "stat", anchor: { startWord: 0, endWord: 2 }, data: { value: 1.234 } }] }))
      .toContain("templates.0.data.value: Invalid number: must be a multiple of 0.01");
    expect(refusals({ ...longForm, templates: [hook("h", 0, 3, { data: { title: "x", logo: { asset_id: "ast_nope" } } })] }))
      .toContain("templates.0.data.logo.asset_id: Invalid string: must match pattern /^ast_[a-f0-9]{32}$/");
  });

  it("applies the full-frame boundary rules to a real kind (A6)", () => {
    expect(refusals({ ...longForm, inserts: [insert("shot", 10, 11, "wipe")], templates: [hook("h", 8, 10)] }))
      .toEqual([expect.stringContaining("meets insert \"shot\", whose wipe would show a hidden presenter frame")]);
    expect(refusals({ ...longForm, templates: [hook("h", 8, 10, { transition: "zoom" })] })).toEqual([expect.stringContaining("has a zoom and meets \"shot\"")]);
    expect(refusals({ ...longForm, templates: [hook("h", 9, 11)] })).toEqual([expect.stringContaining("overlaps insert \"shot\"")]);
    expect(refusals({ ...longForm, templates: [hook("h", 0, 4), card("c", 1, 3)] })).toEqual([expect.stringContaining("template \"c\" lies wholly under")]);
    expect(refusals({ ...longForm, overlays: [overlay("o", 1, 3, "top_left")], templates: [hook("h", 0, 4)] }))
      .toEqual([expect.stringContaining("overlay \"o\" lies wholly under full-frame inserts or templates")]);
    expect(refusals({ ...longForm, templates: [hook("h", 0, 4, { transition: "wipe" })] })).toEqual([]);
  });

  it("lists every slot the templates fill, in order, with the type it takes", () => {
    const quote = { id: "q", kind: "quote", data: { text: "x", photo: { asset_id: `ast_${"2".repeat(32)}` } } };
    expect(templateMediaOf([{ id: "t", kind: "tag", data: { text: "x" } }, { id: "h", kind: "title_card", data: { title: "x" } }, hook("h2", 0, 1), quote]))
      .toEqual([{ index: 2, id: "h2", slot: "logo", asset_id: logo.asset_id, media_type: "image", cover: undefined },
        { index: 3, id: "q", slot: "photo", asset_id: `ast_${"2".repeat(32)}`, media_type: "image", cover: 1 }]);
  });

  it("bills the presenter under a real full-frame kind as face time, and the slot's bytes enter the hash", () => {
    const { hash: _hash, ...content } = scriptInsertsTimelineFixture();
    const actor = content.slots.find(slot => slot.kind === "actor")!;
    const media = { slot: "logo", key: `runs/${content.runId}/layers/h.logo.image`, sha256: "c".repeat(64), bytes: 9, width: 4, height: 4, contentType: "image/png" as const };
    const hookOf = (sha256: string) => freezeResolvedTimeline({ ...content, templates: [{ id: "h", kind: "title_card", kindVersion: 1, placement: "full",
      preset: "clean_light", startFrame: actor.startFrame, endFrame: actor.endFrame, data: { title: "fonio.ai", logo }, media: [{ ...media, sha256 }] }] });
    expect(faceBillingUnitsOf(hookOf("c".repeat(64)))).toEqual(faceBillingUnitsOf(freezeResolvedTimeline(content)));
    expect(hookOf("c".repeat(64)).hash).not.toBe(hookOf("d".repeat(64)).hash);
    expect(() => freezeResolvedTimeline({ ...content, templates: [{ id: "h", kind: "title_card", kindVersion: 1, placement: "full", preset: "clean_light",
      startFrame: 0, endFrame: 1, data: {}, media: [{ ...media, key: "runs/other/layers/h.logo.image" }] }] })).toThrow("invalid template interval or identity");
  });

  it("draws a full-frame kind's content inside the frame, and fills the whole frame for collisions", () => {
    for (const aspect of ASPECT_RATIOS) {
      const footprint = templateFootprint({ kind: "title_card", placement: "full", data: { title: "x" } }, aspect);
      expect({ rect: footprint.rect, hides: footprint.hidesCaptions, content: footprint.content!.width < 1 && footprint.content!.height < 1 })
        .toEqual({ rect: { left: 0, top: 0, width: 1, height: 1 }, hides: true, content: true });
    }
  });
});

describe("callout: a pointer on a point of the frame (#778 S3a(iii), D5)", () => {
  const point = (x: number, y: number, extra: Record<string, unknown> = {}) => ({ target: { x, y }, style: "ring" as const, text: "tap here", ...extra });
  const inFrame = (r: { left: number; top: number; width: number; height: number }) =>
    r.left >= 0 && r.top >= 0 && r.left + r.width <= 1 + 1e-9 && r.top + r.height <= 1 + 1e-9 && r.width > 0 && r.height > 0;
  const item = (data: Record<string, unknown>) => ({ id: "c", kind: "callout", anchor: { startWord: 0, endWord: 2 }, data });

  it("centres the pointer on the target and crops the footprint to the frame, at the corners too, in every format and size", () => {
    for (const aspect of ASPECT_RATIOS) for (const size of [...TEMPLATE_SIZES, undefined]) for (const [x, y] of [[0, 0], [100, 0], [0, 100], [100, 100], [50, 50], [3, 97]] as const) {
      for (const text of ["tap here", undefined]) {
        const data = { target: { x, y }, style: "arrow" as const, ...(text ? { text } : {}), ...(size ? { size } : {}) };
        const { pointer, label } = calloutParts(data, aspect), rect = callout.rect(data, aspect);
        const { width, height } = { width: aspect === "16:9" ? 1920 : 1080, height: aspect === "9:16" ? 1920 : 1080 };
        const centre = [(pointer.left + pointer.width / 2) * width - (x / 100) * width, (pointer.top + pointer.height / 2) * height - (y / 100) * height];
        const holdsLabel = !text || (rect.top <= label.top + 1e-9 && rect.top + rect.height >= label.top + label.height - 1e-9);
        expect({ aspect, size, x, y, text, centred: centre.every(offset => Math.abs(offset) <= 1), inside: inFrame(rect), label: inFrame(label), holdsLabel })
          .toEqual({ aspect, size, x, y, text, centred: true, inside: true, label: true, holdsLabel: true });
      }
    }
  });

  it("puts the label below the target, above it when there is no room or the face is below, and on the face only when neither side clears it", () => {
    const at = (x: number, y: number) => calloutParts(point(x, y), "9:16").label;
    expect([at(50, 70).top > 0.7, at(50, 97).top + at(50, 97).height < 0.97, at(50, 15).top + at(50, 15).height < 0.12]).toEqual([true, true, true]);
    const face = (data: Record<string, unknown>) => templateFaceWarnings({ templates: [item(data)] });
    expect([face(point(50, 70)), face(point(50, 15))]).toEqual([[], []]);
    expect(face(point(50, 30))).toEqual([expect.stringContaining("template \"c\" is drawn over the presenter's face: its callout label sits there")]);
    // The target itself may point anywhere: a ring on the face without a label is no warning.
    expect(face({ target: { x: 50, y: 30 }, style: "ring" })).toEqual([]);
    for (const aspect of ASPECT_RATIOS) for (const size of [...TEMPLATE_SIZES, undefined]) {
      expect({ aspect, size, onFace: rectsOverlap(callout.faceRect!({ ...callout.sample, ...(size ? { size } : {}) }, aspect)!, faceZone(aspect)) })
        .toEqual({ aspect, size, onFace: false });
    }
  });

  it("refuses a target outside the frame and a style it lacks by path, and may sit on an insert", () => {
    // A range issue does not stop the refinement, so the field is named by the schema and again by the registry's own parse.
    const outside = refusals({ ...longForm, templates: [item(point(101, 50))] });
    expect({ some: outside.length > 0, all: outside.every(why => why.startsWith("templates.0.data.target.x: ")) }).toEqual({ some: true, all: true });
    expect(refusals({ ...longForm, templates: [item(point(50, 50, { style: "star" }))] })).toEqual([expect.stringMatching(/^templates\.0\.data\.style: /)]);
    expect(refusals({ ...longForm, templates: [{ ...item(point(50, 70)), anchor: { startWord: 10, endWord: 11 } }] })).toEqual([]);
  });
});

describe("the run's look: presets and a customer accent (#778 S3a(iii), D8)", () => {
  const themed = (template_theme: unknown) => refusals({ ...longForm, template_theme, templates: [tagAt("t", 0, 2)] });
  it("takes a preset and an accent only with templates, with no default in the schema (A8)", () => {
    expect([themed({ preset: "bold_dark" }), themed({})]).toEqual([[], []]);
    expect(refusals({ ...longForm, template_theme: { preset: "bold_dark" } })).toEqual(["template_theme: template_theme styles templates: add templates or drop it"]);
    // A name no registry holds, so a preset added later cannot turn this into an admitted one.
    const missing = "no_such_preset";
    expect((TEMPLATE_PRESETS as readonly string[]).includes(missing)).toBe(false);
    expect(themed({ preset: missing })).toEqual([expect.stringMatching(/^template_theme\.preset: /)]);
    for (const accent of ["yellow", "#FFF", "#4F46E5 "]) expect(themed({ accent })).toEqual(["template_theme.accent: must be a #RRGGBB hex colour"]);
    expect(makeUgcInput.parse({ script, ...longForm, templates: [tagAt("t", 0, 2)] }).template_theme).toBeUndefined();
  });

  it("measures contrast as WCAG does", () => {
    expect([contrastRatio("#FFFFFF", "#000000"), contrastRatio("#777777", "#FFFFFF")].map(ratio => Number(ratio.toFixed(2)))).toEqual([21, 4.48]);
  });

  it("refuses an accent under 3:1 against the text or any ground it meets in the preset, and admits one that clears them", () => {
    expect([themed({ accent: "#4F46E5" }), themed({ preset: "bold_dark", accent: "#FACC15" })]).toEqual([[], []]);
    expect(themed({ accent: "#FFE066" })).toEqual([expect.stringMatching(/^template_theme\.accent: template_theme accent #FFE066 reaches 1\.\d\d:1 against .* in clean_light, under the 3:1 large text needs: pick a darker accent or another preset$/)]);
    // Clears the white text but not the pale blue ground of a full frame.
    expect(themed({ accent: "#8F8F8F" })).toEqual([expect.stringContaining("reaches 2.58:1 against the #D9E7FB card or ground it is drawn on in clean_light")]);
    expect(themed({ preset: "bold_dark", accent: "#4F46E5" })).toEqual([expect.stringContaining("pick a lighter accent")]);
  });
});

describe("no template schema writes what the request did not send (A8, Codex r2 on S3a(iii))", () => {
  /** Every template schema with the least object it takes: each kind's required fields from its sample, and the empty theme. */
  const schemas: [string, z.ZodType, Record<string, unknown>, Record<string, unknown>][] = [
    ...TEMPLATE_KINDS.map(kind => [kind.kind, kind.data, Object.fromEntries(Object.entries(kind.data.shape)
      .filter(([, schema]) => !(schema as z.ZodType).safeParse(undefined).success).map(([key]) => [key, (kind.sample as Record<string, unknown>)[key]])),
      kind.sample as Record<string, unknown>] as [string, z.ZodType, Record<string, unknown>, Record<string, unknown>]),
    ["template_theme", templateTheme, {}, { preset: "bold_dark", accent: "#38BDF8" }]];
  it.each(schemas)("%s: parses its least and its fullest object back exactly as sent, with no default or transform anywhere", (_, schema, least, full) => {
    expect([schema.parse(least), schema.parse(full)]).toEqual([least, full]);
    expect(nodes(schema).filter(type => ["default", "prefault", "transform", "pipe", "catch"].includes(type))).toEqual([]);
  });
  it("keeps an empty template_theme empty in the parsed request", () => {
    expect(makeUgcInput.parse({ script, ...longForm, template_theme: {}, templates: [tagAt("t", 0, 2)] }).template_theme).toEqual({});
  });
});

describe("checklist, phone call and compare, with inner quotes (#778 S3b(i), D6, D10, D11)", () => {
  const rows = [{ label: "answers calls", on: true }, { label: "works 24/7", on: false }];
  const list = (startWord: number, endWord: number, clicks: unknown[]) => ({ id: "list", kind: "checklist", anchor: { startWord, endWord }, data: { items: rows, clicks } });
  const shots = { before: { asset_id: `ast_${"1".repeat(32)}` }, after: { asset_id: `ast_${"2".repeat(32)}` } };
  const versus = (startWord: number, endWord: number, reveal_at: string) => ({ id: "vs", kind: "compare", anchor: { startWord, endWord }, data: { ...shots, reveal_at } });
  const call = (data: Record<string, unknown>) => ({ id: "call", kind: "phone_call", anchor: { startWord: 0, endWord: 6 }, data: { caller: "Maya", ...data } });

  it("describes each kind's fields, lists and inner quotes from the registry", () => {
    const text = templateCatalogText();
    expect(text).toContain("data items 2–4 of {label ≤ 24, on true|false, icon? phone|briefcase|user|clock|chat|star}, clicks? 0–6 of {item number, " +
      "quote? inner quote}, style? switch|check, size? small|medium|large");
    expect(text).toContain("data caller ≤ 24, subtitle? ≤ 32, avatar? {asset_id} image (cut to fill), answer_at inner quote, side? left|right, size?");
    expect(text).toContain("data before {asset_id} image (cut to fill), after {asset_id} image (cut to fill), labels? {before? ≤ 20, after? ≤ 20}, " +
      "reveal_at inner quote, size?");
  });

  /** Mutant: skip the order check, or search the whole script, and a beat lands before the one ahead of it or outside its own item. */
  it("lands each inner quote inside the item's words after the beat before it, and refuses one that cannot land by path", () => {
    expect(refusals({ ...longForm, templates: [list(0, 6, [{ item: 0, quote: "two" }, { item: 1, quote: "four five" }, { item: 0 }])] })).toEqual([]);
    expect(refusals({ ...longForm, templates: [list(0, 6, [{ item: 0, quote: "thirteen" }])] }))
      .toEqual(["templates.0.data.clicks.0.quote: template \"list\" clicks.0.quote \"thirteen\" does not occur in the script"]);
    expect(refusals({ ...longForm, templates: [list(0, 6, [{ item: 0, quote: "eight" }])] }))
      .toEqual(["templates.0.data.clicks.0.quote: template \"list\" clicks.0.quote \"eight\" lies outside the template's own words: an inner quote sits inside them"]);
    expect(refusals({ ...longForm, templates: [list(0, 6, [{ item: 0, quote: "four" }, { item: 1, quote: "two" }])] }))
      .toEqual(["templates.0.data.clicks.1.quote: template \"list\" clicks.1.quote \"two\" comes before the beat ahead of it: inner quotes follow the script's word order"]);
    expect(refusals({ ...longForm, templates: [call({ answer_at: "seven" })] })).toEqual([expect.stringMatching(/^templates\.0\.data\.answer_at: .*outside/)]);
    expect(refusals({ ...longForm, templates: [call({})] })).toEqual([expect.stringMatching(/^templates\.0\.data\.answer_at: /)]);
    // The REST union and the registry's own parse both name it, as for a callout target.
    expect([...new Set(refusals({ ...longForm, templates: [list(0, 6, [{ item: 2 }])] }).map(why => why.replace("checklist: ", "")))])
      .toEqual(["templates.0.data.clicks.0.item: item 2 is past the 2 items"]);
    expect(refusals({ ...longForm, templates: [{ ...list(0, 6, []), data: { items: [rows[0], { label: "hot 🔥", on: true }] } }] }))
      .toEqual([expect.stringMatching(/^templates\.0\.data\.items\.1\.label: checklist items\.1\.label has "🔥"/)]);
  });

  /** Mutant: drop the cover check, and a click plays under an insert where nobody sees it. */
  it("refuses a beat on words an insert or another full-frame template covers, and takes one beside them", () => {
    expect(refusals({ ...longForm, templates: [list(8, 12, [{ item: 0, quote: "eleven" }])] }))
      .toEqual([expect.stringContaining("templates.0.data.clicks.0.quote: template \"list\" clicks.0.quote lands on words \"shot\" covers with a full frame")]);
    expect(refusals({ ...longForm, templates: [list(8, 12, [{ item: 0, quote: "nine" }, { item: 1, quote: "twelve" }])] })).toEqual([]);
    expect(refusals({ ...longForm, templates: [versus(0, 4, "two"), list(2, 8, [{ item: 0, quote: "three" }])] }))
      .toEqual([expect.stringContaining("templates.1.data.clicks.0.quote: template \"list\" clicks.0.quote lands on words \"vs\" covers")]);
  });

  /** Mutant: read the frame from the quote's last word, or spread by another share, and the beat moves off the word it names. */
  it("resolves each beat to the frame of its first word from the template's start, and spreads a beat without a quote evenly", () => {
    const tokens = script.toLowerCase().split(" "), words = tokens.map((word, index) => ({ word, startSec: index * 0.5 }));
    const kind = TEMPLATE_KINDS.find(entry => entry.kind === "checklist")!;
    const data = { items: rows, clicks: [{ item: 0, quote: "two three" }, { item: 1 }, { item: 0, quote: "six" }] };
    // Words start every 15 frames; the span covers words 1–6, frames 15–105: 0 (moved to 12, after the enter), then 8 + (72 − 8) · 2/3, then 75 − 15.
    expect(templateMoments(kind, data, tokens, { startWord: 1, coverWord: 7 }, words, 30, { startFrame: 15, endFrame: 105 }).moments).toEqual([12, 51, 60]);
  });

  it("lists both pictures of a compare under their own slots, and freezes the beats into the hash", () => {
    expect(templateMediaOf([versus(0, 4, "two")])).toEqual([{ index: 0, id: "vs", slot: "before", asset_id: shots.before.asset_id, media_type: "image", cover: 0.6 },
      { index: 0, id: "vs", slot: "after", asset_id: shots.after.asset_id, media_type: "image", cover: 0.6 }]);
    const { hash: _hash, ...content } = scriptInsertsTimelineFixture();
    const actor = content.slots.find(slot => slot.kind === "actor")!;
    const frozen = (moments?: number[]) => freezeResolvedTimeline({ ...content, templates: [{ id: "vs", kind: "compare", kindVersion: 1, placement: "full",
      preset: "clean_light", startFrame: actor.startFrame, endFrame: actor.endFrame, data: versus(0, 4, "two").data, ...(moments ? { moments } : {}) }] });
    expect(faceBillingUnitsOf(frozen([3]))).toEqual(faceBillingUnitsOf(freezeResolvedTimeline(content)));
    expect(new Set([frozen().hash, frozen([3]).hash, frozen([4]).hash]).size).toBe(3);
    expect(() => frozen([actor.endFrame - actor.startFrame])).toThrow("invalid template interval or identity");
  });

  it("reads and writes a dotted field through lists and objects", () => {
    const data = { items: rows, labels: { before: "a" } };
    expect(templateFieldValues(data, "items.label")).toEqual([{ path: ["items", 0, "label"], value: "answers calls" }, { path: ["items", 1, "label"], value: "works 24/7" }]);
    expect([templateFieldValues(data, "clicks.quote"), templateFieldValues(data, "labels.after")]).toEqual([[], [{ path: ["labels", "after"], value: undefined }]]);
    expect(withTemplateField(withTemplateField(data, "items.label", ""), "labels.after", "b"))
      .toEqual({ items: rows.map(row => ({ ...row, label: "" })), labels: { before: "a", after: "b" } });
  });
});

describe("footprints of the frozen kind version (#819)", () => {
  const v1 = tag as unknown as TemplateKind;
  const v2 = { ...v1, kindVersion: 2, rect: () => ({ left: 0.1, top: 0.1, width: 0.2, height: 0.05 }) } as TemplateKind;
  const kinds = TEMPLATE_KINDS.map(kind => (kind.kind === "tag" ? v2 : kind));
  const data = { text: "hi", position: "top" };
  it("reads a frozen version's geometry from the history, today's for today's, and none for a version neither holds", () => {
    const at = (kindVersion: number | undefined, history: TemplateKind[]) => templateFootprint({ kind: "tag", kindVersion, placement: "over", data }, "9:16", kinds, history).rect;
    expect([at(1, [v1]), at(2, [v1]), at(undefined, [v1])]).toEqual([v1.rect(data, "9:16"), v2.rect(data, "9:16"), v2.rect(data, "9:16")]);
    expect(() => at(1, [])).toThrow("template kind tag@1 has no footprint");
    expect([templateKindAt("tag", 1), templateKindAt("callout", undefined)]).toEqual([v1, callout]);
  });
});

describe("notification, progress and rating, and the neon, paper and mono looks (#778 S3b(ii-a))", () => {
  const steps = (startWord: number, endWord: number, extra: Record<string, unknown> = {}) =>
    ({ id: "steps", kind: "progress", anchor: { startWord, endWord }, data: { steps: ["call answered", "slot found", "visit booked"], ...extra } });
  const note = (data: Record<string, unknown>) => ({ id: "note", kind: "notification", anchor: { startWord: 0, endWord: 3 },
    data: { app: "Front Desk", title: "New booking", body: "Tomorrow at 10:30", ...data } });
  const stars = (data: Record<string, unknown>) => ({ id: "stars", kind: "rating", anchor: { startWord: 0, endWord: 3 }, data: { stars: 4.5, ...data } });
  const unique = (body: Record<string, unknown>) => [...new Set(refusals(body).map(why => why.replace(/: (progress|rating|notification): /, ": ")))];

  it("describes each kind's fields from the registry", () => {
    const text = templateCatalogText();
    expect(text).toContain("data app ≤ 20, title ≤ 32, body ≤ 80, icon? phone|briefcase|user|clock|chat|star, size? small|medium|large");
    expect(text).toContain("data steps 2–5 of ≤ 20, advance_at? 2–5 of inner quote, size? small|medium|large");
    expect(text).toContain("data stars number, label? ≤ 32, size? small|medium|large");
  });

  /** Mutant: skip the length check, or walk a list of strings as one value, and a quote or step text slips past its refusal. */
  it("refuses an advance_at of the wrong length, each quote that cannot land, and step text it cannot draw, by path", () => {
    expect(refusals({ ...longForm, templates: [steps(0, 6, { advance_at: ["two", "four", "six"] })] })).toEqual([]);
    expect(unique({ ...longForm, templates: [steps(0, 6, { advance_at: ["two", "four"] })] }))
      .toEqual(["templates.0.data.advance_at: gives 2 quotes for 3 steps: one per step"]);
    expect(refusals({ ...longForm, templates: [steps(0, 6, { advance_at: ["two", "thirteen", "six"] })] }))
      .toEqual(["templates.0.data.advance_at.1: template \"steps\" advance_at.1 \"thirteen\" does not occur in the script"]);
    expect(refusals({ ...longForm, templates: [steps(0, 6, { advance_at: ["two", "four", "eight"] })] }))
      .toEqual([expect.stringMatching(/^templates\.0\.data\.advance_at\.2: .*lies outside the template's own words/)]);
    expect(refusals({ ...longForm, templates: [steps(0, 6, { advance_at: ["four", "two", "six"] })] }))
      .toEqual([expect.stringMatching(/^templates\.0\.data\.advance_at\.1: .*comes before the beat ahead of it/)]);
    expect(refusals({ ...longForm, templates: [steps(8, 12, { advance_at: ["nine", "eleven", "twelve"] })] }))
      .toEqual([expect.stringContaining("templates.0.data.advance_at.1: template \"steps\" advance_at.1 lands on words \"shot\" covers with a full frame")]);
    expect(refusals({ ...longForm, templates: [steps(0, 6, { steps: ["call answered", "hot 🔥"] })] }))
      .toEqual([expect.stringMatching(/^templates\.0\.data\.steps\.1: progress steps\.1 has "🔥"/)]);
    expect(unique({ ...longForm, templates: [steps(0, 6, { steps: ["one"] })] })).toEqual([expect.stringMatching(/^templates\.0\.data\.steps: /)]);
  });

  /** Mutant: spread one beat for an absent advance_at, or read it from the last word, and the steps complete off their frames. */
  it("lands each step on its quote's first word, and spreads one beat per step evenly without advance_at", () => {
    const tokens = script.toLowerCase().split(" "), words = tokens.map((word, index) => ({ word, startSec: index * 0.5 }));
    const kind = TEMPLATE_KINDS.find(entry => entry.kind === "progress")!, span = { startFrame: 15, endFrame: 105 };
    const data = steps(1, 7).data;
    // Words start every 15 frames from the span's start at frame 15 (the first moved to 9, after the enter); spread: 8 + (72 − 8) · i/3.
    expect(templateMoments(kind, { ...data, advance_at: ["two three", "four", "six"] }, tokens, { startWord: 1, coverWord: 7 }, words, 30, span).moments)
      .toEqual([9, 30, 60]);
    expect(templateMoments(kind, data, tokens, { startWord: 1, coverWord: 7 }, words, 30, span)).toEqual({ moments: [29, 51, 72], warnings: [] });
    expect(templateFieldValues(data, "steps")).toEqual(data.steps.map((value, index) => ({ path: ["steps", index], value })));
    expect(withTemplateField(data, "steps", "")).toEqual({ steps: ["", "", ""] });
  });

  it("refuses a rating off the half-star scale and a notification past its limits or icons, by path", () => {
    for (const value of [4.25, 0.5, 5.5]) expect(unique({ ...longForm, templates: [stars({ stars: value })] })).toEqual([expect.stringMatching(/^templates\.0\.data\.stars: /)]);
    expect([refusals({ ...longForm, templates: [stars({ stars: 3, label: "rated by 312 patients" })] }), refusals({ ...longForm, templates: [note({ icon: "star" })] })])
      .toEqual([[], []]);
    expect(unique({ ...longForm, templates: [note({ body: "x".repeat(81) })] })).toEqual([expect.stringMatching(/^templates\.0\.data\.body: /)]);
    expect(unique({ ...longForm, templates: [note({ icon: "bell" })] })).toEqual([expect.stringMatching(/^templates\.0\.data\.icon: /)]);
  });

  it("draws the notification in the band above the face in every format and size", () => {
    for (const aspect of ASPECT_RATIOS) for (const size of [...TEMPLATE_SIZES, undefined]) {
      const kind = TEMPLATE_KINDS.find(entry => entry.kind === "notification")!, rect = kind.rect({ ...kind.sample, ...(size ? { size } : {}) }, aspect);
      expect({ aspect, size, above: rect.top + rect.height <= faceZone(aspect).top && rect.top > 0 }).toEqual({ aspect, size, above: true });
    }
  });

  /** Mutant: check an accent against clean_light's colours in every look, and an accent the dark neon ground swallows is admitted. */
  it("takes neon, paper and mono, and checks a customer accent against each look's own colours, pointing away from the one it fails", () => {
    for (const preset of ["neon", "paper", "mono"]) expect(refusals({ ...longForm, template_theme: { preset, accent: "#0F766E" }, templates: [tagAt("t", 0, 2)] })).toEqual([]);
    const themed = (preset: string, accent: string) => refusals({ ...longForm, template_theme: { preset, accent }, templates: [tagAt("t", 0, 2)] });
    expect(themed("neon", "#1E1B4B")).toEqual([expect.stringMatching(/against the #[0-9A-F]{6} card or ground .* in neon, .*pick a lighter accent/)]);
    expect(themed("neon", "#FFE066")).toEqual([expect.stringMatching(/against the #FFFFFF text drawn on it in neon, .*pick a darker accent/)]);
    expect(themed("paper", "#E8A07A")).toEqual([expect.stringContaining("in paper")]);
    expect(themed("mono", "#9CA3AF")).toEqual([expect.stringContaining("in mono")]);
    expect(themed("clean_light", "#1E1B4B")).toEqual([]);
  });
});
