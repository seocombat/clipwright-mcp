import { lexicalTokens, quoteOccurrences } from "./semantic-inserts.js";
import type { WordTiming } from "./tts-backend.js";

// Overlays and layout windows of a long-form `make_ugc` run (#778 S2b): drawn over the actor slots, never planned as inserts.

export const OVERLAY_POSITIONS = ["top_left", "top_right", "bottom_left", "bottom_right", "top", "bottom"] as const;
export type OverlayPosition = (typeof OVERLAY_POSITIONS)[number];
export const LAYER_ENTERS = ["cut", "fade", "slide", "tilt_in"] as const;
export type LayerEnter = (typeof LAYER_ENTERS)[number];
export const LAYOUT_WINDOW_KINDS = ["split", "card"] as const;
export type LayoutWindowKind = (typeof LAYOUT_WINDOW_KINDS)[number];
export const INSERT_TRANSITIONS = ["cut", "wipe", "flash", "zoom"] as const;
export type InsertTransition = (typeof INSERT_TRANSITIONS)[number];

export const MAX_OVERLAYS = 10;
export const MAX_LAYOUT_WINDOWS = 5;
export const MAX_OVERLAYS_AT_ONCE = 2;

/** A footprint on the frame, in shares of its width and height (#778 S3 D5). */
export interface LayerRect { left: number; top: number; width: number; height: number }

/** The frame of a `W:H` format in pixels, as the composition's `canvasForRatio` derives it: the short side 1080, both sides even. */
export function frameCanvasOf(aspectRatio: string): { width: number; height: number } {
  const [w, h] = aspectRatio.split(":").map(Number) as [number, number];
  const even = (value: number) => { const rounded = Math.round(value); return rounded % 2 === 0 ? rounded : rounded + 1; };
  return w >= h ? { width: even((1080 * w) / h), height: 1080 } : { width: 1080, height: even((1080 * h) / w) };
}

/** The most an overlay at `position` takes, as `overlayBox` draws it: a corner 42% wide, a band the width less margins, 30% high. */
export function overlayRect(position: OverlayPosition, canvas: { width: number; height: number }): LayerRect {
  const margin = Math.round(0.04 * Math.min(canvas.width, canvas.height));
  const band = position === "top" || position === "bottom";
  const width = band ? canvas.width - 2 * margin : Math.round(0.42 * canvas.width), height = Math.round(0.3 * canvas.height);
  const left = band || position.endsWith("left") ? margin : canvas.width - margin - width;
  const top = position.startsWith("top") ? margin : canvas.height - margin - height;
  return { left: left / canvas.width, top: top / canvas.height, width: width / canvas.width, height: height / canvas.height };
}

/** Two footprints collide when they share an area; touching edges do not. */
export function rectsOverlap(a: LayerRect, b: LayerRect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

/** Where the presenter's face sits: 12–48% of the height and the middle 60% of a 9:16 clip, which other formats fit whole and centre (#778 S3). */
export function faceZone(aspectRatio: string): LayerRect {
  const { width, height } = frameCanvasOf(aspectRatio);
  const share = 0.6 * Math.min(1, (9 / 16) / (width / height));
  return { left: (1 - share) / 2, top: 0.12, width: share, height: 0.36 };
}

type WordAnchor = { startWord: number; endWord: number } | { quote: string; occurrence?: number | undefined };
export interface AnchoredItem { id: string; anchor: WordAnchor; cover_words?: number | undefined }
export interface WordRange { startWord: number; coverWord: number }

/** The words an item covers, `[startWord, coverWord)`, as an insert anchor resolves; a string names why it does not resolve. */
export function layerWordRange(tokens: readonly string[], item: AnchoredItem): WordRange | string {
  let range: { startWord: number; endWord: number };
  if ("startWord" in item.anchor) {
    range = { startWord: item.anchor.startWord, endWord: item.anchor.endWord };
    if (range.endWord > tokens.length) return `anchor ends at word ${range.endWord}, past the script's ${tokens.length} words`;
  } else {
    const matches = quoteOccurrences(tokens, item.anchor.quote);
    if (matches.length === 0) return `anchor quote "${item.anchor.quote}" does not occur in script`;
    if (item.anchor.occurrence === undefined && matches.length > 1) {
      return `anchor quote "${item.anchor.quote}" occurs ${matches.length} times in script: pass occurrence`;
    }
    const picked = matches[item.anchor.occurrence ?? 0];
    if (!picked) return `anchor quote "${item.anchor.quote}" has no occurrence ${item.anchor.occurrence}`;
    range = picked;
  }
  const coverWord = item.cover_words === undefined ? range.endWord : range.startWord + item.cover_words;
  if (coverWord < range.endWord) return `cover_words ${item.cover_words} is fewer than the ${range.endWord - range.startWord} words the anchor names`;
  if (coverWord > tokens.length) return `cover_words runs past the script's ${tokens.length} words`;
  return { startWord: range.startWord, coverWord };
}

const overlaps = (a: WordRange, b: WordRange) => a.startWord < b.coverWord && b.startWord < a.coverWord;
const coveredBy = (range: WordRange, cover: readonly WordRange[]) => Array.from({ length: range.coverWord - range.startWord },
  (_, offset) => range.startWord + offset).every(word => cover.some(other => word >= other.startWord && word < other.coverWord));

export interface LayerRefusal { path: (string | number)[]; message: string }

export interface LayerCheckInput {
  script: string;
  aspect_ratio?: string | undefined;
  inserts?: readonly AnchoredItem[] | undefined;
  overlays?: readonly (AnchoredItem & { position: OverlayPosition })[] | undefined;
  layout_windows?: readonly (AnchoredItem & { layout: LayoutWindowKind })[] | undefined;
}

/** Every refusal of overlays and layout windows against the script, named by path; empty when they render. */
export function layerRefusals(input: LayerCheckInput): LayerRefusal[] {
  const refusals: LayerRefusal[] = [];
  const tokens = lexicalTokens(input.script);
  const canvas = frameCanvasOf(input.aspect_ratio ?? "9:16");
  const seen = new Map<string, string>();
  for (const field of ["inserts", "overlays", "layout_windows"] as const) {
    for (const [index, item] of (input[field] ?? []).entries()) {
      const owner = seen.get(item.id);
      if (owner !== undefined && field !== "inserts") {
        refusals.push({ path: [field, index, "id"], message: `id "${item.id}" is already used in ${owner}: ids are unique across inserts, overlays and layout_windows` });
      }
      seen.set(item.id, owner ?? field);
    }
  }
  const ranged = <T extends AnchoredItem>(field: "overlays" | "layout_windows", items: readonly T[] | undefined) =>
    (items ?? []).flatMap((item, index) => {
      const range = layerWordRange(tokens, item);
      if (typeof range === "string") {
        refusals.push({ path: [field, index, "anchor"], message: `${field === "overlays" ? "overlay" : "layout window"} "${item.id}": ${range}` });
        return [];
      }
      return [{ item, index, range }];
    });
  const overlays = ranged("overlays", input.overlays);
  const windows = ranged("layout_windows", input.layout_windows);
  const inserts = (input.inserts ?? []).flatMap(item => { const range = layerWordRange(tokens, item); return typeof range === "string" ? [] : [{ item, range }]; });
  for (const [at, layout] of windows.entries()) {
    if (layout.item.layout === "split" && input.aspect_ratio !== undefined && input.aspect_ratio !== "9:16") {
      refusals.push({ path: ["layout_windows", layout.index, "layout"], message: `layout window "${layout.item.id}": split works in 9:16 only, and aspect_ratio is ${input.aspect_ratio}` });
    }
    const earlier = windows.slice(0, at).find(other => overlaps(other.range, layout.range));
    if (earlier) {
      refusals.push({ path: ["layout_windows", layout.index], message: `layout window "${layout.item.id}" overlaps layout window "${earlier.item.id}": windows take the frame one at a time` });
    }
    const insert = inserts.find(other => overlaps(other.range, layout.range));
    if (insert) {
      refusals.push({ path: ["layout_windows", layout.index], message: `layout window "${layout.item.id}" overlaps insert "${insert.item.id}": a window reframes the presenter, who is not on screen during a full-frame insert` });
    }
  }
  for (const [at, overlay] of overlays.entries()) {
    const under = inserts.filter(other => overlaps(other.range, overlay.range));
    if (under.length && coveredBy(overlay.range, under.map(other => other.range))) {
      refusals.push({ path: ["overlays", overlay.index], message: `overlay "${overlay.item.id}" lies wholly under insert "${under[0]!.item.id}": an overlay draws over the presenter, who is not on screen during a full-frame insert` });
    }
    const together = overlays.slice(0, at).filter(other => overlaps(other.range, overlay.range));
    const clash = together.find(other => rectsOverlap(overlayRect(other.item.position, canvas), overlayRect(overlay.item.position, canvas)));
    if (clash) {
      refusals.push({ path: ["overlays", overlay.index, "position"], message: `overlay "${overlay.item.id}" (${overlay.item.position}) shares the screen with overlay "${clash.item.id}" (${clash.item.position}) at the same time: overlays on screen together need different positions` });
      continue;
    }
    const crowd = together.flatMap((a, i) => together.slice(i + 1).filter(b =>
      Math.max(a.range.startWord, b.range.startWord, overlay.range.startWord) <
      Math.min(a.range.coverWord, b.range.coverWord, overlay.range.coverWord)).map(b => [a, b] as const))[0];
    if (crowd) {
      refusals.push({ path: ["overlays", overlay.index], message: `overlay "${overlay.item.id}" would be on screen together with "${crowd[0].item.id}" and "${crowd[1].item.id}": at most ${MAX_OVERLAYS_AT_ONCE} overlays show at once` });
    }
  }
  return refusals;
}

export interface LayerFrames { id: string; startFrame: number; endFrame: number }

/** Frames of each word range on the run's narration, by the rule inserts follow: a range ends where its first uncovered word starts. */
export function resolveLayerFrames(input: { tokens: readonly string[]; words: readonly WordTiming[]; totalFrames: number; fps: number;
  layers: readonly (WordRange & { id: string })[] }): LayerFrames[] {
  const lexical = input.words.filter(word => !/^\p{P}+$/u.test(word.word));
  if (lexical.length !== input.tokens.length || lexical.some((word, index) => lexicalTokens(word.word)[0] !== input.tokens[index])) {
    throw new Error("layer word timings do not follow the script's words");
  }
  return input.layers.map(layer => {
    const startFrame = layer.startWord === 0 ? 0 : Math.round(lexical[layer.startWord]!.startSec * input.fps);
    const endFrame = layer.coverWord >= lexical.length ? input.totalFrames : Math.round(lexical[layer.coverWord]!.startSec * input.fps);
    if (!Number.isSafeInteger(startFrame) || endFrame <= startFrame || endFrame > input.totalFrames) {
      throw new Error(`layer ${layer.id} has no frames on the narration`);
    }
    return { id: layer.id, startFrame, endFrame };
  });
}
