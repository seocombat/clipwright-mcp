import { describe, expect, it, vi } from "vitest";

import { makeFacelessInput } from "../faceless-public.js";
import { compactTemplateCatalogText } from "../mcp-ugc-descriptions.js";
import { partsLineSchema } from "../parts-pricing.js";
import { cutoutTemplateLines, needsPresenterCutout, PRESENTER_MATTE_DISABLED_MESSAGE } from "../presenter-matte.js";
import { makeUgcInput, ugcTemplate } from "../skills.js";
import { BACKDROP_STYLES, offeredTemplateKinds, TEMPLATE_KINDS, templateCatalogText, templateMediaOf, templateRefusals } from "./index.js";

// The backdrop template (#1428 S2): one kind, eight styles on the presenter cut-out; its contract, refusals, switch and free quote line.

const script = "Here is the backdrop of my story.";
const picture = { asset_id: `ast_${"7".repeat(32)}` };
const item = (data: Record<string, unknown>) => ({ id: "back", kind: "backdrop", anchor: { quote: "the backdrop" }, data });
/** Words that show our kitchen and a client never needs (rule 8): vendors, routes, costs and the pipeline. */
const KITCHEN = /fal\b|birefnet|bria|vendor|\$|cost|matte|webm|vp9|alpha|worker|lambda|r2\b/i;

describe("backdrop", () => {
  /** Mutant: drop a style from the enum or the kind from the strict union, and a style the composition draws is refused, or any value passes. */
  it("parses every style with a title and refuses an unknown style, an empty or long title", () => {
    for (const style of BACKDROP_STYLES) expect({ style, ok: ugcTemplate.safeParse(item({ style, title: "NO EDITOR" })).success }).toEqual({ style, ok: true });
    expect(BACKDROP_STYLES).toEqual(["swap", "wall", "gallery", "sticker", "doodle", "glass", "pop_out", "vertigo"]);
    expect(ugcTemplate.safeParse(item({ style: "orbit", title: "NO EDITOR" })).success).toBe(false);
    expect(ugcTemplate.safeParse(item({ style: "wall", title: "" })).success).toBe(false);
    expect(ugcTemplate.safeParse(item({ style: "wall", title: "W".repeat(17) })).success).toBe(false);
    expect(ugcTemplate.safeParse(item({ style: "wall", title: "W".repeat(16) })).success).toBe(true);
  });

  /** Mutants: let notes or a picture through on a style that does not draw them, and the client's words or picture vanish without a word. */
  it("takes notes on wall only and a picture on swap and gallery only", () => {
    expect(ugcTemplate.safeParse(item({ style: "wall", title: "NO EDITOR", notes: ["ONE", "TWO", "THREE"] })).success).toBe(true);
    expect(ugcTemplate.safeParse(item({ style: "wall", title: "NO EDITOR", notes: ["1", "2", "3", "4"] })).success).toBe(false);
    expect(ugcTemplate.safeParse(item({ style: "wall", title: "NO EDITOR", notes: ["W".repeat(25)] })).success).toBe(false);
    const refused = (data: Record<string, unknown>) => ugcTemplate.safeParse(item(data)).error?.issues.map(issue => issue.message);
    for (const style of BACKDROP_STYLES.filter(style => style !== "wall")) {
      expect(refused({ style, title: "CLEAR", notes: ["ONE"] })).toEqual([`notes show on style wall, not ${style}`]);
    }
    for (const style of ["swap", "gallery"]) expect(ugcTemplate.safeParse(item({ style, title: "NEW", picture })).success).toBe(true);
    for (const style of BACKDROP_STYLES.filter(style => style !== "swap" && style !== "gallery")) {
      expect(refused({ style, title: "NEW", picture })).toEqual([`picture shows on style swap or gallery, not ${style}`]);
    }
    expect(templateMediaOf([{ id: "back", kind: "backdrop", data: { style: "swap", title: "NEW", picture } }]))
      .toEqual([{ index: 0, id: "back", slot: "picture", asset_id: picture.asset_id, media_type: "image", cover: undefined }]);
  });

  /** Mutant: drop the cut-out mark, and a backdrop is drawn as a full frame hiding the presenter, on any run. */
  it("stands the presenter in front: a cut-out kind on a plain script run only, full placement", () => {
    const kind = TEMPLATE_KINDS.find(entry => entry.kind === "backdrop")!;
    expect({ cutout: kind.cutout, placements: kind.placements, fills: kind.fillsFrame }).toEqual({ cutout: true, placements: ["full"], fills: true });
    expect(needsPresenterCutout([item({ style: "glass", title: "CLEAR" })])).toBe(true);
    expect(templateRefusals({ script, templates: [item({ style: "glass", title: "CLEAR" })] })).toEqual([]);
    expect(templateRefusals({ script, templates: [item({ style: "glass", title: "CLEAR" })], inserts: [{ id: "i", anchor: { quote: "my story" } }] }))
      .toEqual([{ path: ["templates", 0, "kind"], message: "backdrop takes a plain script run, without inserts" }]);
    expect(makeUgcInput.safeParse({ script, templates: [item({ style: "doodle", title: "WOW" })], end_hold_s: 1 }).error?.issues.map(issue => issue.message))
      .toContain("backdrop takes a plain script run, without end_hold_s");
    // A faceless video has no presenter to stand in front.
    const faceless = makeFacelessInput.safeParse({ input_mode: "script", duration_seconds: 30,
      script: `${script} The rest of the words follow it for long enough to be a faceless script that reads well.`,
      templates: [item({ style: "glass", title: "CLEAR" })] });
    expect(faceless.error?.issues.map(issue => issue.message).join("\n")).toContain("backdrop stands the presenter in front of it and needs make_ugc");
  });

  /** Mutants: let the kind through with the switch off, or hide it with the switch on. */
  it("is refused before any money with the switch off, and listed only with it on", async () => {
    vi.resetModules();
    for (const [name, value] of Object.entries({ CLIPWRIGHT_LONG_FORM_QUALIFICATION: "1", CLIPWRIGHT_COMPOSE: "1", CLIPWRIGHT_REMOTE_FETCH: "1",
      CLIPWRIGHT_PRESENTER_MATTE: "" })) vi.stubEnv(name, value);
    try {
      expect((await import("../contract-dispositions.js")).rejectedFields({ templates: [item({ style: "swap", title: "NEW" })] }))
        .toEqual([{ field: "templates", message: PRESENTER_MATTE_DISABLED_MESSAGE }]);
    } finally { vi.unstubAllEnvs(); }
    expect(offeredTemplateKinds({}).map(kind => kind.kind)).not.toContain("backdrop");
    expect(offeredTemplateKinds({ CLIPWRIGHT_PRESENTER_MATTE: "1" }).map(kind => kind.kind)).toContain("backdrop");
  });

  /** Mutant: count backdrops into the cover's line, or charge them, and the quote names or bills what the run does not. */
  it("quotes one free line per cut-out kind", () => {
    const lines = cutoutTemplateLines([item({ style: "wall", title: "A" }), { ...item({ style: "glass", title: "B" }), id: "two" },
      { id: "c", kind: "cover_story", data: {} }, { id: "t", kind: "tag", data: {} }]);
    expect(lines).toEqual([{ label: "cover story, presenter in front", unit: "template", quantity: 1, unit_credits: 0, credits: 0 },
      { label: "backdrop, presenter in front", unit: "template", quantity: 2, unit_credits: 0, credits: 0 }]);
    for (const line of lines) expect(partsLineSchema.safeParse(line).success).toBe(true);
  });

  it("describes itself without internal words", () => {
    const kind = TEMPLATE_KINDS.find(entry => entry.kind === "backdrop")!;
    for (const text of [kind.description, PRESENTER_MATTE_DISABLED_MESSAGE, templateCatalogText(offeredTemplateKinds({ CLIPWRIGHT_PRESENTER_MATTE: "1" })),
      compactTemplateCatalogText(offeredTemplateKinds({ CLIPWRIGHT_PRESENTER_MATTE: "1" }))]) expect(text).not.toMatch(KITCHEN);
  });
});
