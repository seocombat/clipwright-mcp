import { lexicalTokens } from "./semantic-inserts.js";
import { layerWordRange, type AnchoredItem, type WordRange } from "./ugc-layers.js";

// Motion styles (#1123): how the graphics of a video are drawn and move: their lines, their material and their timing. A style is part of the
// design DNA; its colours stay the palette's. It dresses captions, templates and scenes, never the presenter or the pictures.

export const MOTION_STYLE_IDS = ["line_boil", "sketchbook", "paper_cutout", "fabric", "pixel", "comic", "zine", "film", "glass", "clay", "engraving"] as const;
export type MotionStyleId = (typeof MOTION_STYLE_IDS)[number];
/** A style, or `plain`: a span drawn plain inside a styled video. */
export const MOTION_STYLE_CHOICES = [...MOTION_STYLE_IDS, "plain"] as const;
export type MotionStyleChoice = (typeof MOTION_STYLE_CHOICES)[number];
export const MAX_MOTION_STYLE_SPANS = 20;

/** When each style fits, for an agent choosing one by topic; keyed by id so a new style cannot ship without its line. */
export const MOTION_STYLE_GUIDANCE: Readonly<Record<MotionStyleId, string>> = {
  line_boil: "a hand-drawn line that redraws itself; sits on any look and topic",
  sketchbook: "pencil on paper; tutorials, ideas, plans and personal stories",
  paper_cutout: "card cutouts moved as stop motion; playful explainers, kids, crafts",
  fabric: "felt and stitching; cosy, handmade, home and baby brands",
  pixel: "a retro game grid with square corners; games, tech, nostalgia",
  comic: "halftone, heavy ink and outlined letters; bold claims, reveals, humour",
  zine: "a photocopied collage of leaning scraps; music, fashion, street culture",
  film: "moving grain and a flickering lamp; stories, history, a cinematic mood",
  glass: "frosted panes and soft light; tech, finance, premium products",
  clay: "modelled clay as stop motion; friendly, light-hearted topics",
  engraving: "fine hatching and a double rule; heritage, craft, food and drink, serious topics",
};

export const MOTION_STYLE_DESCRIPTION = "How captions, templates and scenes are drawn: style for the whole video, spans for words drawn in another " +
  "style, entered and left through that style's own cut. Colours stay the design's; small text stays crisp. Spans need script. Free. Styles: " +
  `${MOTION_STYLE_IDS.map(id => `${id}, ${MOTION_STYLE_GUIDANCE[id]}`).join("; ")}; plain, no style. One style carries the video; a span in a ` +
  "second style marks one moment, such as a twist, a number or the call to action.";

export interface MotionStyleRequest {
  style?: MotionStyleChoice | undefined;
  spans?: readonly { style: MotionStyleChoice; anchor: AnchoredItem["anchor"]; cover_words?: number | undefined }[] | undefined;
}

/** The style a video is drawn in: the run's own, else its design's, else plain. */
export function baseMotionStyle(input: { motion_style?: MotionStyleRequest | undefined; design?: { style?: MotionStyleId | undefined } | undefined }):
  MotionStyleChoice {
  return input.motion_style?.style ?? input.design?.style ?? "plain";
}

/** The words each span covers, in order of the request; a string names why a span does not resolve. */
export function motionStyleSpanRanges(script: string, spans: NonNullable<MotionStyleRequest["spans"]>): (WordRange | string)[] {
  const tokens = lexicalTokens(script);
  return spans.map((span, index) => layerWordRange(tokens, { id: `span${index}`, anchor: span.anchor, cover_words: span.cover_words }));
}

/** Why a request's spans cannot be drawn: no script to sit on, an anchor that names no words, two spans on one word, or a span in the video's own
 *  style. */
export function motionStyleRefusals(input: { script?: string | undefined; segments?: unknown; motion_style?: MotionStyleRequest | undefined;
  design?: { style?: MotionStyleId | undefined } | undefined }): { path: (string | number)[]; message: string }[] {
  const spans = input.motion_style?.spans;
  if (!spans?.length) return [];
  if (input.script === undefined || input.segments !== undefined) {
    return [{ path: ["motion_style", "spans"], message: "motion_style spans sit on the script's words: pass script, without segments" }];
  }
  const base = baseMotionStyle(input), refusals: { path: (string | number)[]; message: string }[] = [], taken: WordRange[] = [];
  for (const [index, range] of motionStyleSpanRanges(input.script, spans).entries()) {
    const span = spans[index]!;
    if (typeof range === "string") {
      refusals.push({ path: ["motion_style", "spans", index, "anchor"], message: range });
      continue;
    }
    if (span.style === base) {
      refusals.push({ path: ["motion_style", "spans", index, "style"], message: `the span is in the video's own style ${base}: name another style or drop the span` });
    }
    if (taken.some(other => range.startWord < other.coverWord && other.startWord < range.coverWord)) {
      refusals.push({ path: ["motion_style", "spans", index, "anchor"], message: "spans may not share words" });
    }
    taken.push(range);
  }
  return refusals;
}

/** Whether the video draws anything a style dresses: captions, templates or scenes. */
export const motionStyleHasCanvas = (input: { captions?: boolean | undefined; templates?: readonly unknown[] | undefined; scenes?: readonly unknown[] | undefined }):
  boolean => input.captions === true || Boolean(input.templates?.length) || Boolean(input.scenes?.length);

/** Whether the request names a style other than plain anywhere. */
export const motionStyleAsked = (input: { motion_style?: MotionStyleRequest | undefined; design?: { style?: MotionStyleId | undefined } | undefined }): boolean =>
  baseMotionStyle(input) !== "plain" || Boolean(input.motion_style?.spans?.some(span => span.style !== "plain"));

export const MOTION_STYLE_UNUSED_WARNING = "motion_style was not drawn: a style dresses captions, templates and scenes, and this video has none";
