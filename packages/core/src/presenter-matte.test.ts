import { describe, expect, it, vi } from "vitest";

import { rejectedFields } from "./contract-dispositions.js";
import { makeFacelessInput } from "./faceless-public.js";
import { compactTemplateCatalogText } from "./mcp-ugc-descriptions.js";
import { partsLineSchema } from "./parts-pricing.js";
import { cutoutTemplateLines, needsPresenterCutout, PRESENTER_MATTE_DISABLED_MESSAGE, presenterCutoutMissingWarning } from "./presenter-matte.js";
import { makeUgcInput, ugcTemplate } from "./skills.js";
import { offeredTemplateKinds, TEMPLATE_KINDS, templateCatalogText, templateRefusals } from "./templates/index.js";

// The cover_story template (#1428): its contract, its switch, its free quote line and its public words.

const cover = { id: "cover", kind: "cover_story", anchor: { quote: "the cover" },
  data: { masthead: "FOCUS", issue: "ISSUE 17", number: "17", cover_line: "ONE HABIT" } };
/** The contract table as a server with templates open reads it, with or without the cover's own switch. */
async function serverRejects(input: Record<string, unknown>, matte: boolean) {
  vi.resetModules();
  for (const [name, value] of Object.entries({ CLIPWRIGHT_LONG_FORM_QUALIFICATION: "1", CLIPWRIGHT_COMPOSE: "1", CLIPWRIGHT_REMOTE_FETCH: "1",
    CLIPWRIGHT_PRESENTER_MATTE: matte ? "1" : "" })) vi.stubEnv(name, value);
  try { return (await import("./contract-dispositions.js")).rejectedFields(input); } finally { vi.unstubAllEnvs(); }
}
/** Words that show our kitchen and a client never needs (rule 8): vendors, routes, costs and the pipeline. */
const KITCHEN = /fal\b|birefnet|bria|vendor|\$|cost|matte|webm|vp9|alpha|worker|lambda|r2\b/i;

describe("cover_story", () => {
  /** Mutant: drop the kind from the strict union, or loosen the masthead to many words, and a cover parses as asked or a sentence fills it. */
  it("parses its sample and refuses a masthead of two words", () => {
    expect(ugcTemplate.safeParse(cover).success).toBe(true);
    expect(ugcTemplate.safeParse({ ...cover, data: { ...cover.data, masthead: "TWO WORDS" } }).success).toBe(false);
    expect(ugcTemplate.safeParse({ ...cover, placement: "over" }).success).toBe(true);
    expect(templateRefusals({ script: "Here is the cover of my story.", templates: [{ ...cover, placement: "over" }] }).map(r => r.message))
      .toContain("cover_story takes placement full, not over");
    expect(templateRefusals({ script: "Here is the cover of my story.", templates: [cover] })).toEqual([]);
  });

  /** Mutant: accept the cover on a run of many pieces, which the cut-out does not reach, and it draws without its presenter in silence. */
  it("takes a plain script run only", () => {
    const script = "Here is the cover of my story.";
    expect(templateRefusals({ script, templates: [cover], inserts: [{ id: "i", anchor: { quote: "my story" } }], end_hold_s: 1 }))
      .toEqual([{ path: ["templates", 0, "kind"], message: "cover_story takes a plain script run, without inserts, end_hold_s" }]);
  });

  /** Mutant (Codex r2): drop any one field from the list, and a cover on that kind of run is admitted and drawn without its presenter. */
  it.each(["inserts", "overlays", "layout_windows", "framing", "call", "interview", "presenter_gaze", "end_hold_s", "shots"])(
    "refuses a cover on a run with %s", field => {
      const refusals = templateRefusals({ script: "Here is the cover of my story.", templates: [cover], [field]: field === "end_hold_s" ? 1 : [] });
      expect(refusals).toContainEqual({ path: ["templates", 0, "kind"], message: `cover_story takes a plain script run, without ${field}` });
    });

  /** The request schema runs the same refusal before any money. */
  it("refuses it through the make_ugc request schema", () => {
    const parsed = makeUgcInput.safeParse({ script: "Here is the cover of my story.", templates: [cover], end_hold_s: 1 });
    expect(parsed.error?.issues.map(issue => issue.message)).toContain("cover_story takes a plain script run, without end_hold_s");
    expect(makeUgcInput.safeParse({ script: "Here is the cover of my story.", templates: [cover] }).success).toBe(true);
  });

  /** Mutants: let the kind through with the switch off, or refuse it with the switch on, and a run either pays for a cut-out the server
   *  cannot make or a working cover is refused. */
  it("is refused before any money with the switch off and accepted with it on", async () => {
    expect(await serverRejects({ templates: [cover] }, false)).toEqual([{ field: "templates", message: PRESENTER_MATTE_DISABLED_MESSAGE }]);
    expect(await serverRejects({ templates: [cover] }, true)).toEqual([]);
    expect(await serverRejects({ templates: [{ ...cover, kind: "word_title" }] }, false)).toEqual([]);
    // With templates closed altogether the field's own refusal speaks, once.
    expect(rejectedFields({ templates: [cover] }, {}).filter(hit => hit.field === "templates")).toHaveLength(1);
    expect(needsPresenterCutout([{ kind: "cover_story" }])).toBe(true);
    expect(needsPresenterCutout([{ kind: "word_fill" }, "x", null])).toBe(false);
  });

  /** Mutant: list the kind with the switch off, and agents ask for a template the server refuses. */
  it("is offered in the catalogue only with the switch on", () => {
    expect(offeredTemplateKinds({}).map(kind => kind.kind)).not.toContain("cover_story");
    expect(offeredTemplateKinds({ CLIPWRIGHT_PRESENTER_MATTE: "1" }).map(kind => kind.kind)).toContain("cover_story");
    expect(templateCatalogText(offeredTemplateKinds({}))).not.toContain("cover_story");
    expect(templateCatalogText(offeredTemplateKinds({ CLIPWRIGHT_PRESENTER_MATTE: "1" }))).toContain("cover_story (full)");
    expect(compactTemplateCatalogText(offeredTemplateKinds({ CLIPWRIGHT_PRESENTER_MATTE: "1" }))).toContain("cover_story (full)");
  });

  /** Mutant: a description or warning that names the route, a price or the pipeline, and the public contract shows our kitchen (rule 8). */
  it("says what the client gets, with no kitchen", () => {
    const kind = TEMPLATE_KINDS.find(entry => entry.kind === "cover_story")!;
    for (const text of [kind.description, presenterCutoutMissingWarning("cover"), presenterCutoutMissingWarning("cover", false),
      PRESENTER_MATTE_DISABLED_MESSAGE, compactTemplateCatalogText(offeredTemplateKinds({ CLIPWRIGHT_PRESENTER_MATTE: "1" }))]) {
      expect(text).not.toMatch(KITCHEN);
    }
    expect(kind.description).toMatch(/free/);
  });

  /** Mutants: charge the cover, or leave it off the quote, and the free template costs credits or the user never sees it listed. */
  it("is listed on the quote at 0 credits", () => {
    const lines = cutoutTemplateLines([cover, { ...cover, id: "two" }, { ...cover, kind: "tag" }]);
    expect(lines).toEqual([{ label: "cover story, presenter in front", unit: "template", quantity: 2, unit_credits: 0, credits: 0 }]);
    expect(lines.every(line => partsLineSchema.safeParse(line).success)).toBe(true);
    expect(cutoutTemplateLines([{ ...cover, kind: "tag" }])).toEqual([]);
  });

  /** Mutant: accept the cover on a faceless video, which has no presenter to stand in front of it. */
  it("is refused on make_faceless", () => {
    const script = "The cover of my story is here and the rest of the words follow it for long enough to be a faceless script that reads well.";
    const parsed = makeFacelessInput.safeParse({ input_mode: "script", script, duration_seconds: 30, templates: [cover] });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map(issue => issue.message).join("\n")).toContain("cover_story stands the presenter in front of it");
  });
});
