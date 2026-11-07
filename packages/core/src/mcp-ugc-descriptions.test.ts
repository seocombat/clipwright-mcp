import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { fieldText, mcpUgcInputShape, offeredUgcInputShape } from "./contract-dispositions.js";
import { compactTemplateCatalogText, MCP_UGC_DESCRIPTIONS } from "./mcp-ugc-descriptions.js";
import { CAPTION_STYLES } from "./skills.js";
import { TEMPLATE_KINDS, templateDataText } from "./templates/index.js";

/** The full text each shorter MCP text was written from (#1045): a change to it fails here until its MCP text says the same. */
const WRITTEN_FROM: Record<keyof typeof MCP_UGC_DESCRIPTIONS, string> = {
  script: "88b8571a4dfdb711", tts_model: "d219950201eba850", caption_style: "7e5ac74a91d2f231", templates: "4a31eb78b8a26dbc",
  caption_emphasis: "bfa2c9ec4722ca2f", voice: "73b578402af2880d", actor_id: "ecf5a12b89539b24", voice_id: "1c0134d77b71bb6a",
  broll_policy: "65c93e6540eb6296", overlays: "4b5ac21d7b17f1a4", image: "b97912c680ba6699", framing: "604e412f563f4d38",
  actor_gender: "779a80e8a5de8d2a", aspect_ratio: "23f56f8973a4a61e", caption_mode: "a43a7d15ec6ca984", visible_ai_label: "588db58fe25ab7c3",
  layout_windows: "aa2c4128ace9e9c3", end_hold_s: "6205bf9c125980e9", edit_sounds: "a38d00d12782b585", inserts: "850f94ad8dfae1f0",
  segments: "9c9e4a016e7268f6", captions: "27f01afb9b1e5469", caption_position: "026b79d879181fd8", person: "0184780e3a758f03",
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
    for (const kind of TEMPLATE_KINDS) {
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
