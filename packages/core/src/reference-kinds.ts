import { TEMPLATE_KIND_IDS } from "./templates/index.js";

export const REFERENCE_GRAPHIC_KINDS = [...TEMPLATE_KIND_IDS, "overlay_media", "insert_media", "layout_split", "scene", "particles", "unmapped"] as const;
export type ReferenceGraphicKind = (typeof REFERENCE_GRAPHIC_KINDS)[number];
export const REFERENCE_DESCRIBED_KINDS = ["banner", "logo_card", "comment_box", "price_card", "concept_card"] as const;
export const REFERENCE_SOURCE_KINDS = ["toggle_checklist", "phone_call", "notification", "before_after_split", "split_screen", "stat", "product_ui",
  "screenshot", "title_card", "end_card", "particles", ...REFERENCE_DESCRIBED_KINDS, ...REFERENCE_GRAPHIC_KINDS, "other"] as const;
export type ReferenceSourceKind = (typeof REFERENCE_SOURCE_KINDS)[number];
