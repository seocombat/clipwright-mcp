export const EDIT_STYLE_NAMES = ["house-v1", "calm-v1", "bold-v1", "bare"] as const;
export type EditStyleName = (typeof EDIT_STYLE_NAMES)[number];
export const DEFAULT_EDIT_STYLE: EditStyleName = "house-v1";
export const EDIT_STYLE_SOURCES = ["asked", "default"] as const;
export type EditStyleSource = (typeof EDIT_STYLE_SOURCES)[number];
export const STYLE_FIELD_DEFAULTS = { captions: false, caption_style: "hormozi" } as const;
