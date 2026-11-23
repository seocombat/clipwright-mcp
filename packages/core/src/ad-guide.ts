import { z } from "zod";
import { brandGuideBlock } from "./design.js";
import { guideCatalog } from "./film-guide.js";


export const AD_GUIDE_PATH = "/v1/ad-guide";

export const AD_GUIDE_SECTION_IDS = ["ugc", "order", "script", "product_sheet", "photo_edit", "hero", "location", "props", "states", "board", "models",
  "motion_test", "shot_list", "devices", "takes", "audit", "repair", "edit", "final_check", "spend"] as const;
export type AdGuideSectionId = (typeof AD_GUIDE_SECTION_IDS)[number];

export const adGuideQuery = z.strictObject({
  section: z.enum(AD_GUIDE_SECTION_IDS).optional()
    .describe("One part of the guide, whole: ugc (the make_ugc rules) or one step of making the ad yourself. Without it you get ugc " +
      "and a list of the other sections"),
});
export type AdGuideQuery = z.infer<typeof adGuideQuery>;

export const adGuide = z.strictObject({
  brand: brandGuideBlock.optional(),
  guide: z.string().min(1).describe("The ad guide, Markdown. Without section: the make_ugc rules (section ugc), then every other " +
    "section's id and title. With section: that part"),
  version: z.string().regex(/^[a-f0-9]{12}$/).optional().describe("The guide's version: it changes whenever any part of the guide does"),
  guides: guideCatalog.optional(),
});
export type AdGuide = z.infer<typeof adGuide>;
