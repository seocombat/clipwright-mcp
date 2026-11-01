import type { LayerRect } from "./ugc-layers.js";

// The caption page's geometry as the composition draws it, for the layout rails before money (#973 S2). The numbers repeat
// the composition's presets; a parity test holds the two equal.

/** Where captions sit, as a percentage of the height: above the middle the top edge, below it the bottom edge (#884). */
export const CAPTION_POSITION_VERTICAL = { top: 20, middle: 50, lower: 70, bottom: 80 } as const;
export const CAPTION_EDGES = ["top", "center", "bottom"] as const;
export type CaptionEdge = (typeof CAPTION_EDGES)[number];

interface PresetGeometry { size: number; vertical: number; wordsPerLine: number; padding: number; background: boolean }
const row = (size: number, vertical: number, wordsPerLine: number, padding = 0): PresetGeometry =>
  ({ size, vertical, wordsPerLine, padding, background: padding > 0 });
/** Font size at a 1080 short side, default height, words per page and background padding of each preset. */
export const CAPTION_GEOMETRY: Record<string, PresetGeometry> = {
  hormozi: row(100, 65, 3), accent: row(88, 66, 3), tiktok: row(64, 75, 1), youtube: row(48, 85, 5, 12), instagram: row(56, 70, 2),
  minimalist: row(40, 80, 5, 8), neon: row(56, 70, 2), genz: row(72, 65, 1), campfire: row(60, 72, 3), midnight: row(66, 62, 2),
  plottwist: row(58, 70, 3), headline: row(84, 76, 3, 10), promo: row(50, 78, 3, 12), lecture: row(46, 82, 6, 10), highlighter: row(54, 74, 4),
  studio: row(44, 84, 7, 12), broadcast: row(44, 88, 8), arcade: row(54, 70, 2), clutch: row(66, 66, 1), bubblegum: row(60, 72, 2),
  crayon: row(58, 72, 2), lyrics: row(68, 76, 5), bassdrop: row(62, 66, 1), punch: row(116, 62, 3),
};
/** Style names kept valid for an earlier preset name, as the skill's aliases. */
export const CAPTION_GEOMETRY_ALIASES: Record<string, string> = { minimal: "minimalist" };
const TIKTOK_WORDS_PER_LINE: Record<string, number> = { "9:16": 2, "16:9": 4, "1:1": 1 };
const LINE_HEIGHT = 1.3, SIDE_PADDING = 20, EDGE_MARGIN = 0.04, PUNCH_LEAD_SCALE = 0.4;

/** A caption style's sizes in px on a canvas: the drawn font size, words per page and vertical padding, as the composition lays a page out. */
export function captionGeometryOf(style: string | undefined, aspectRatio: string, canvas: { width: number; height: number }) {
  const id = CAPTION_GEOMETRY_ALIASES[style ?? ""] ?? style ?? "hormozi", preset = CAPTION_GEOMETRY[id] ?? CAPTION_GEOMETRY.hormozi!;
  const scale = Math.min(canvas.width, canvas.height) / 1080;
  const keyword = Math.round((id === "youtube" && aspectRatio === "16:9" ? 90 : preset.size) * scale);
  const padding = Math.round(preset.padding * scale);
  return { vertical: preset.vertical, fontSize: id === "punch" ? Math.round(keyword * PUNCH_LEAD_SCALE) : keyword,
    wordsPerLine: id === "tiktok" ? TIKTOK_WORDS_PER_LINE[aspectRatio] ?? preset.wordsPerLine : preset.wordsPerLine,
    paddingV: preset.background ? Math.round(padding * 1.5) : 0 };
}

/** The edge a page anchors by at a height: the one asked for, else the top edge up to the middle and the bottom edge below it. */
export const captionEdgeAt = (vertical: number, edge?: CaptionEdge): CaptionEdge => edge ?? (vertical <= 50 ? "top" : "bottom");

/** The tallest page's box at a height, in shares of the frame: as many lines as words per page, no more than fit; the width the block may take. */
export function captionBandBox(style: string | undefined, aspectRatio: string, canvas: { width: number; height: number },
  at: { vertical?: number | undefined; edge?: CaptionEdge | undefined; maxWidth?: number | undefined } = {}): LayerRect {
  const { fontSize, wordsPerLine, paddingV, vertical: preset } = captionGeometryOf(style, aspectRatio, canvas);
  const vertical = at.vertical ?? preset, edge = captionEdgeAt(vertical, at.edge), anchor = (vertical / 100) * canvas.height;
  const span = edge === "top" ? canvas.height - anchor : edge === "bottom" ? anchor : 2 * Math.min(anchor, canvas.height - anchor);
  const lines = Math.min(wordsPerLine, Math.max(1, Math.floor((span - 2 * paddingV - EDGE_MARGIN * canvas.height) / (fontSize * LINE_HEIGHT))));
  const height = (lines * fontSize * LINE_HEIGHT + 2 * paddingV) / canvas.height, y = vertical / 100;
  const width = at.maxWidth ?? (0.9 * (canvas.width - 2 * SIDE_PADDING)) / canvas.width;
  return { left: (1 - width) / 2, top: edge === "top" ? y : edge === "bottom" ? y - height : y - height / 2, width, height };
}
