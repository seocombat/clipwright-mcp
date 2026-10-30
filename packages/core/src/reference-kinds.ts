import { TEMPLATE_KIND_IDS } from "./templates/index.js";

// A reference graphic's kinds, shared by the profile's beats and its staging (#914): their own module, so neither imports the other.

/** Our template kinds, media laid over or instead of the presenter, a split layout, and what we cannot draw yet. */
export const REFERENCE_GRAPHIC_KINDS = [...TEMPLATE_KIND_IDS, "overlay_media", "insert_media", "layout_split", "particles", "unmapped"] as const;
export type ReferenceGraphicKind = (typeof REFERENCE_GRAPHIC_KINDS)[number];
/** The analyser's names for a graphic: its prompt's own list, plus ours. */
export const REFERENCE_SOURCE_KINDS = ["toggle_checklist", "phone_call", "notification", "before_after_split", "split_screen", "stat", "product_ui",
  "screenshot", "title_card", "end_card", "particles", ...REFERENCE_GRAPHIC_KINDS, "other"] as const;
export type ReferenceSourceKind = (typeof REFERENCE_SOURCE_KINDS)[number];
