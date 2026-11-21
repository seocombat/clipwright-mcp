import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { fieldText, mcpUgcInputShape, offeredUgcInputShape } from "./contract-dispositions.js";
import { compactTemplateCatalogText, MCP_UGC_DESCRIPTIONS } from "./mcp-ugc-descriptions.js";
import { CAPTION_STYLES } from "./skills.js";
import { TEMPLATE_KINDS, templateDataText } from "./templates/index.js";

/** The full text each shorter MCP text was written from (#1045): a change to it fails here until its MCP text says the same. */
const WRITTEN_FROM: Record<keyof typeof MCP_UGC_DESCRIPTIONS, string> = {
  script: "88b8571a4dfdb711", tts_model: "d219950201eba850", caption_style: "7e5ac74a91d2f231", templates: "d769223a46f3e7ff",
  caption_emphasis: "bfa2c9ec4722ca2f", voice: "20b2c74a3dd259ec", actor_id: "ecf5a12b89539b24", voice_id: "1c0134d77b71bb6a",
  broll_policy: "65c93e6540eb6296", overlays: "b3edaef679b505b4", image: "b97912c680ba6699", framing: "604e412f563f4d38",
  actor_gender: "16457d6f9dfb05b4", aspect_ratio: "23f56f8973a4a61e", caption_mode: "a43a7d15ec6ca984", visible_ai_label: "1ae7bb7f08d84932",
  layout_windows: "aa2c4128ace9e9c3", end_hold_s: "9aab3cf2685950db", edit_sounds: "a38d00d12782b585", inserts: "c1ba8938b921f270",
  segments: "25aef00c5f961d6c", captions: "27f01afb9b1e5469", caption_position: "026b79d879181fd8", person: "0184780e3a758f03",
  name: "1e4a75614df3d9f4", look: "c351607e2609d76e",
};
const digest = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 16);
const fields = Object.keys(MCP_UGC_DESCRIPTIONS) as (keyof typeof MCP_UGC_DESCRIPTIONS)[];

describe("quote_ugc's shorter MCP texts", () => {
  it.each(fields)("%s: says in fewer words the full text it was written from", (field) => {
    const full = fieldText(offeredUgcInputShape[field])!;
    expect(digest(full), `${field}'s full text changed: say the change in MCP_UGC_DESCRIPTIONS.${field}, then pin the new digest`)
      .toBe(WRITTEN_FROM[field]);
    expect(MCP_UGC_DESCRIPTIONS[field].length).toBeLessThan(full.length);
    expect(fieldText(mcpUgcInputShape[field])).toBe(MCP_UGC_DESCRIPTIONS[field]);
  });

  it.each(fields.filter((field) => field !== "templates" && field !== "overlays"))("%s: the MCP field accepts what the REST field accepts", (field) => {
    const shape = (schema: z.ZodType) => JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any", io: "input" }),
      (key, value: unknown) => (key === "description" ? undefined : value));
    expect(shape(mcpUgcInputShape[field])).toBe(shape(offeredUgcInputShape[field]));
  });

  it("names every kind's data fields as the full catalog does, and the size every kind takes", () => {
    const compact = compactTemplateCatalogText();
    expect(compact).not.toContain("series_frame");
    expect(compact).not.toContain("cover_story (");
    expect(compact).not.toContain("comment_cta");
    expect(compact).not.toContain("backdrop (");
    // Kinds behind a switch that is off here (#1425, #1428, #1437) join the text with their switch.
    const switched = new Set(["series_frame", "cover_story", "comment_cta", "backdrop"]);
    for (const kind of TEMPLATE_KINDS) {
      if (switched.has(kind.kind)) continue;
      expect(templateDataText(kind)).toContain(", size? small|medium|large");
      expect(compact, kind.kind).toContain(`${kind.kind} (${kind.placements.join("|")})`);
      expect(compact, kind.kind).toContain(templateDataText(kind).replace(", size? small|medium|large", ""));
    }
    expect(compact).toContain("Every kind's data also takes size? small|medium|large (absent: medium).");
    expect(compact).toContain("lower_third (over); data name");
    expect(compact).not.toMatch(/: (null|undefined);/);
  });

  it("points at the page of every caption style and names the default and the alias", () => {
    expect(MCP_UGC_DESCRIPTIONS.caption_style).toContain("https://clipwright.io/captions");
    expect(MCP_UGC_DESCRIPTIONS.caption_style).toContain("hormozi is the default");
    expect(CAPTION_STYLES).toContain("minimal");
    expect(MCP_UGC_DESCRIPTIONS.caption_style).toContain("minimal draws minimalist");
  });
});
