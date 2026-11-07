import { CAPTION_POSITION_VERTICAL, captionBandBox } from "./caption-geometry.js";
import { captionPlaceAt, fitPlacedRect, placeAnchorOf, placeByCaptions, plannedFace, resolvePlace, sharedArea, usualFace, type CaptionPlace,
  type Place, type PresenterPlace } from "./scene-place.js";
import { lexicalTokens, quoteOccurrences } from "./semantic-inserts.js";
import type { WordTiming } from "./tts-backend.js";

// Overlays and layout windows of a long-form `make_ugc` run (#778 S2b): drawn over the actor slots, never planned as inserts.

export const OVERLAY_POSITIONS = ["top_left", "top_right", "bottom_left", "bottom_right", "top", "bottom"] as const;
export type OverlayPosition = (typeof OVERLAY_POSITIONS)[number];
export const LAYER_ENTERS = ["cut", "fade", "slide", "tilt_in", "pop", "scale_up"] as const;
export type LayerEnter = (typeof LAYER_ENTERS)[number];
/** How an overlay leaves (#973 S3); absent is a cut, as every overlay before it. */
export const LAYER_EXITS = ["cut", "fade", "pop_out", "slide"] as const;
export type LayerExit = (typeof LAYER_EXITS)[number];
/** The most an overlay's appearance moves off its first word, in seconds. */
export const MAX_ENTER_OFFSET_S = 0.5;
export const LAYOUT_WINDOW_KINDS = ["split", "card"] as const;
export type LayoutWindowKind = (typeof LAYOUT_WINDOW_KINDS)[number];
export const FULL_FRAME_TRANSITIONS = ["cut", "wipe", "flash", "zoom"] as const;
/** `glitch` breaks the cut with a colour split and an inverted frame (#1175 S5 C8); `power` closes the screen to a line and a dot and opens it the
 *  same way (C9). */
export const INSERT_TRANSITIONS = [...FULL_FRAME_TRANSITIONS, "light_leak", "glitch", "power"] as const;
export type InsertTransition = (typeof INSERT_TRANSITIONS)[number];
/** A video insert's key moment slowed down and back (`ramp`) or caught in a short repeating loop (`stutter`) (#1175 S5 C6). */
export const INSERT_RETIMES = ["ramp", "stutter"] as const;
export type InsertRetimeMode = (typeof INSERT_RETIMES)[number];
export const INSERT_FITS = ["cover", "contain", "auto"] as const;
export type InsertFit = (typeof INSERT_FITS)[number];
/** `auto` holds a picture still while filling cuts at most this share of it, and past it scrolls or pans it end to end (#1051 S2). */
export const INSERT_STILL_CUT = 0.08;
/** `auto` moves a picture only while this share of it shows at once: a 16:10 screenshot (35% in 9:16) pans; past it, it shows whole over blur. */
export const INSERT_MIN_SHOWN = 0.25;
/** A picture's scroll runs down or up a tall picture, its pan left or right across a wide one (#1051 S2). */
export const INSERT_MOTIONS = { scroll: ["down", "up"], pan: ["left", "right"] } as const;
export type InsertMotion = { kind: "scroll"; direction: "down" | "up" } | { kind: "pan"; direction: "left" | "right" };
export const SPLIT_MEDIA_SIDES = ["top", "bottom"] as const;
export const SPLIT_MEDIA_SHARE = { min: 0.3, max: 0.7, default: 0.5 } as const;

export const MAX_OVERLAYS = 30;
export const MAX_LAYOUT_WINDOWS = 15;
export const MAX_OVERLAYS_AT_ONCE = 3;

/** The first MAX_OVERLAYS_AT_ONCE of `others` on screen together at a word of `range`, or undefined when fewer ever are. */
export function overlayCrowd<T extends { range: WordRange }>(others: readonly T[], range: WordRange): T[] | undefined {
  for (const word of [range.startWord, ...others.map(other => other.range.startWord)]) {
    if (word < range.startWord || word >= range.coverWord) continue;
    const on = others.filter(other => other.range.startWord <= word && word < other.range.coverWord);
    if (on.length >= MAX_OVERLAYS_AT_ONCE) return on.slice(0, MAX_OVERLAYS_AT_ONCE);
  }
  return undefined;
}

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

/** How the presenter is framed: close as every portrait was, wide, lower with room above (#884 S5d), or full, head to feet (#1175 S7). */
/** wide and full are 9:16 views only. */
export const PRESENTER_FRAMINGS = ["close", "wide", "full"] as const;
export type PresenterFraming = (typeof PRESENTER_FRAMINGS)[number];

/** Where the presenter's face sits: 12–48% of the height and the middle 60% of a 9:16 clip, which other formats fit whole and centre (#778 S3). */
/** A wide 9:16 view puts it at 33–58% and the middle half, as measured on a HeyGen render (#884 S5d). */
export function faceZone(aspectRatio: string, framing: PresenterFraming = "close"): LayerRect {
  if (framing === "wide" && aspectRatio === "9:16") return { left: 0.25, top: 0.33, width: 0.5, height: 0.25 };
  // A full-height face is 0.087–0.092 of the height (#1171 live takes), the head at the top: the zone holds the head and the shoulders.
  if (framing === "full" && aspectRatio === "9:16") return { left: 0.3, top: 0.03, width: 0.4, height: 0.2 };
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

/** An overlay at a preset position or at a place: exactly one of the two. */
/** A template drawn over the presenter carries `own`, the rect its kind draws (#973 S4): its box without a place, its shape scaled whole with one. */
export type PlaceableOverlay = AnchoredItem & { position?: OverlayPosition | undefined; place?: Place | undefined; own?: LayerRect | undefined };
/** The templates a scene adds to the overlays for one framing; templates/index.ts gives them, which this module cannot import. */
export type SceneExtras = (framing: PresenterFraming) => readonly PlaceableOverlay[];

export interface LayerCheckInput {
  script: string;
  aspect_ratio?: string | undefined;
  presenter_framing?: PresenterFraming | undefined;
  actor_id?: string | undefined;
  inserts?: readonly AnchoredItem[] | undefined;
  overlays?: readonly PlaceableOverlay[] | undefined;
  layout_windows?: readonly (AnchoredItem & { layout: LayoutWindowKind })[] | undefined;
  captions?: boolean | undefined;
  caption_style?: string | undefined;
  caption_position?: keyof typeof CAPTION_POSITION_VERTICAL | undefined;
  caption_place?: CaptionPlace | undefined;
  presenter_place?: PresenterPlace | undefined;
}

/** What a placed overlay may stand by at admission: the planned face and, with captions, the tallest page's box where they sit (#973 S2). */
export interface AdmissionScene { face: LayerRect; captions?: LayerRect | undefined }
export function admissionScene(input: Pick<LayerCheckInput, "captions" | "caption_style" | "caption_position" | "caption_place" | "presenter_place">,
  aspectRatio: string, framing: PresenterFraming): AdmissionScene {
  const canvas = frameCanvasOf(aspectRatio), face = plannedFace(aspectRatio, canvas, framing, input.presenter_place);
  if (input.captions !== true) return { face };
  const at = input.caption_place ? { ...captionPlaceAt(input.caption_place, face), maxWidth: input.caption_place.max_width }
    : { vertical: input.caption_position ? CAPTION_POSITION_VERTICAL[input.caption_position] : undefined };
  return { face, captions: captionBandBox(input.caption_style, aspectRatio, canvas, at) };
}
/** The sides a place may take next to the captions: a page grows sideways with its words. */
export const CAPTION_SIDES: readonly string[] = ["below", "above"];

/** The framings an admitted run may render: a wider request renders narrower when the actor has no such view (full falls to wide, then close); */
/** wide and full need an actor and 9:16. */
export function admissionFramings(input: { aspect_ratio?: string | undefined; presenter_framing?: unknown; actor_id?: unknown }): PresenterFraming[] {
  if (input.actor_id === undefined || (input.aspect_ratio ?? "9:16") !== "9:16") return ["close"];
  return input.presenter_framing === "full" ? ["close", "wide", "full"] : input.presenter_framing === "wide" ? ["close", "wide"] : ["close"];
}

/** How many layers a place leans on through `{ layer }`, Infinity in a loop or past a missing or preset anchor; a template is an anchor as drawn. */
export function placeDepth(overlays: readonly PlaceableOverlay[], id: string, seen: ReadonlySet<string> = new Set()): number {
  const item = overlays.find(other => other.id === id);
  const anchor = item?.place ? placeAnchorOf(item.place) : undefined;
  if (!item?.place) return item ? 0 : Infinity;
  if (anchor === undefined) return 0;
  const target = overlays.find(other => other.id === anchor);
  return seen.has(anchor) || !(target?.place || target?.own) ? Infinity : 1 + placeDepth(overlays, anchor, new Set([...seen, id]));
}

/** A template's own rect in pixels: the shape its place scales it to. */
export const ownPixels = (own: LayerRect, canvas: { width: number; height: number }) => ({ width: own.width * canvas.width, height: own.height * canvas.height });

/** Each layer's box at admission, by id: a preset's footprint, a template's own rect, a place resolved on the usual face (a template's shape scaled
 *  whole into it); a place on a broken chain has none. */
export function overlayFootprints(overlays: readonly PlaceableOverlay[], aspectRatio: string, framing: PresenterFraming,
  scene?: AdmissionScene): Map<string, LayerRect> {
  const canvas = frameCanvasOf(aspectRatio), face = scene?.face ?? usualFace(aspectRatio, canvas, framing), boxes = new Map<string, LayerRect>();
  const resolve = (item: PlaceableOverlay): LayerRect | undefined => {
    if (boxes.has(item.id)) return boxes.get(item.id);
    if (!item.place) { const box = item.own ?? (item.position && overlayRect(item.position, canvas)); if (box) boxes.set(item.id, box); return box; }
    if (placeDepth(overlays, item.id) > 2) return undefined;
    const anchor = placeAnchorOf(item.place), target = overlays.find(other => other.id === anchor);
    if (anchor !== undefined && (!target || placeByCaptions(target.place) || !resolve(target))) return undefined;
    if (placeByCaptions(item.place) && (!scene?.captions || !CAPTION_SIDES.includes(item.place.side))) return undefined;
    const media = item.own && ownPixels(item.own, canvas), box = resolvePlace(item.place, { canvas, face, layers: boxes, captions: scene?.captions, media });
    boxes.set(item.id, media ? fitPlacedRect(box, media, canvas) : box);
    return boxes.get(item.id);
  };
  for (const item of overlays) resolve(item);
  return boxes;
}

const FRAME: LayerRect = { left: 0, top: 0, width: 1, height: 1 };
/** Over this share of the face's box a placed overlay covers the face; under it, it touches the edge (#973 S1). */
export const FACE_COVER_SHARE = 0.1;
/** Under this share of the frame's short side an overlay would not read. */
export const OVERLAY_MIN_SIDE = 0.03;
/** Over this share of the frame an overlay hides a presenter who is still billed. */
export const OVERLAY_COVERED_PRESENTER = 0.6;

/** Admission warnings for placed overlays and templates: a box at the face's edge, and a box that hides most of a billed presenter. */
export function placeWarnings(input: { overlays?: unknown; aspect_ratio?: unknown; presenter_framing?: unknown; actor_id?: unknown },
  extras?: SceneExtras): string[] {
  const overlays = Array.isArray(input.overlays) ? input.overlays as PlaceableOverlay[] : [];
  const aspect = typeof input.aspect_ratio === "string" ? input.aspect_ratio : "9:16", warnings = new Set<string>();
  for (const framing of admissionFramings({ ...input, aspect_ratio: aspect })) {
    const items = [...overlays, ...extras?.(framing) ?? []];
    if (!items.some(item => item.place)) continue;
    const scene = admissionScene(input as LayerCheckInput, aspect, framing), boxes = overlayFootprints(items, aspect, framing, scene), face = scene.face;
    for (const item of items) {
      const box = boxes.get(item.id), what = `${item.own ? "template" : "overlay"} "${item.id}"`;
      if (!item.place || !box) continue;
      const onFace = sharedArea(box, face) / (face.width * face.height), shown = sharedArea(box, FRAME);
      if (item.place.allow_face !== true && onFace > 0 && onFace <= FACE_COVER_SHARE) {
        warnings.add(`${what} may touch the presenter's face at its edge; it is drawn where it was placed`);
      }
      if (shown > OVERLAY_COVERED_PRESENTER) warnings.add(`${what} covers ${Math.round(shown * 100)}% of the frame while the presenter under it ` +
        "is still billed; an insert replaces the presenter and is not billed as presenter time");
    }
  }
  return [...warnings];
}

/** The refusals a placed overlay or template meets on its anchor and on its box in every framing, at the path `at` names (#973 S1, S4). */
export function placedRefusals(what: "overlay" | "template", item: PlaceableOverlay & { place: Place }, range: WordRange,
  at: (...rest: string[]) => (string | number)[], scene: { items: readonly PlaceableOverlay[]; tokens: readonly string[];
    footprints: readonly { boxes: ReadonlyMap<string, LayerRect>; face: LayerRect }[]; canvas: { width: number; height: number } }): LayerRefusal[] {
  const refusals: LayerRefusal[] = [], { items, canvas } = scene, named = `${what} "${item.id}"`;
  const anchor = placeAnchorOf(item.place), target = anchor === undefined ? undefined : items.find(other => other.id === anchor);
  if (anchor !== undefined) {
    const why = !target ? `"${anchor}", which is not an overlay or template of this run`
      : !target.place && !target.own ? `"${anchor}", which has a position: place it next to an overlay that has place`
        : placeByCaptions(target.place) ? `"${anchor}", which follows the captions: place it relative_to captions too`
          : placeDepth(items, item.id) > 2 ? "a chain of more than 2 overlays or a loop: anchor it to the face, the frame or an overlay placed there" : undefined;
    const span = target && layerWordRange(scene.tokens, target);
    if (why) refusals.push({ path: at("relative_to"), message: `${named} is placed next to ${why}` });
    else if (typeof span === "object" && (span.startWord > range.startWord || span.coverWord < range.coverWord)) {
      refusals.push({ path: at("relative_to"), message: `"${anchor}" is not on screen for all of ${what} "${item.id}"'s words` });
    }
  }
  const messages = new Map<string, (string | number)[]>();
  for (const { boxes, face } of scene.footprints) {
    const box = boxes.get(item.id);
    if (!box) continue;
    if (sharedArea(box, FRAME) < box.width * box.height / 2) messages.set(`less than half of ${named} is inside the frame`, at(...("rect" in item.place ? ["rect"] : [])));
    if (Math.min(box.width * canvas.width, box.height * canvas.height) < OVERLAY_MIN_SIDE * Math.min(canvas.width, canvas.height)) {
      messages.set(`${named} is smaller than 3% of the frame's short side: it would not read`, at());
    }
    if (item.place.allow_face !== true && sharedArea(box, face) > FACE_COVER_SHARE * face.width * face.height) {
      messages.set(`${named} covers the presenter's face; move it, or pass allow_face: true to cover it on purpose`, at());
    }
  }
  for (const [message, path] of messages) refusals.push({ path, message });
  return refusals;
}

/** Every refusal of overlays and layout windows against the script, named by path; empty when they render. `extras` adds the run's templates. */
export function layerRefusals(input: LayerCheckInput, extras?: SceneExtras): LayerRefusal[] {
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
  const aspect = input.aspect_ratio ?? "9:16", all = input.overlays ?? [];
  const footprints = admissionFramings(input).map(framing => {
    const scene = admissionScene(input, aspect, framing), items = [...all, ...extras?.(framing) ?? []];
    return { items, boxes: overlayFootprints(items, aspect, framing, scene), face: scene.face, captions: scene.captions };
  });
  for (const overlay of overlays) {
    const { item, index } = overlay, at = (...rest: string[]) => ["overlays", index, "place", ...rest];
    // Captions placed by caption_place never move, so an overlay that meets them is refused unless it stands by them (#973 S2).
    if (input.caption_place && !placeByCaptions(item.place) && footprints.some(({ boxes, captions }) => {
      const box = boxes.get(item.id);
      return box !== undefined && captions !== undefined && rectsOverlap(box, captions);
    })) refusals.push({ path: ["overlays", index, item.place ? "place" : "position"], message: `overlay "${item.id}" meets the captions placed by ` +
      "caption_place while both show; captions placed this way do not move — place it relative_to captions, or move it" });
    if (!item.place) continue;
    if (placeByCaptions(item.place)) {
      if (input.captions !== true) refusals.push({ path: at("relative_to"), message: `overlay "${item.id}" is placed next to the captions: pass captions: true` });
      else if (!CAPTION_SIDES.includes(item.place.side)) refusals.push({ path: at("side"), message: `overlay "${item.id}" takes side ${item.place.side} ` +
        "of the captions, whose width follows their words: next to the captions, use side below or above" });
    }
    refusals.push(...placedRefusals("overlay", { ...item, place: item.place }, overlay.range, at, { items: footprints[0]!.items, tokens, footprints, canvas }));
  }
  for (const [at, overlay] of overlays.entries()) {
    const under = inserts.filter(other => overlaps(other.range, overlay.range));
    if (under.length && coveredBy(overlay.range, under.map(other => other.range))) {
      refusals.push({ path: ["overlays", overlay.index], message: `overlay "${overlay.item.id}" lies wholly under insert "${under[0]!.item.id}": an overlay draws over the presenter, who is not on screen during a full-frame insert` });
    }
    const together = overlays.slice(0, at).filter(other => overlaps(other.range, overlay.range));
    const preset = (item: PlaceableOverlay): item is PlaceableOverlay & { position: OverlayPosition } => item.place === undefined && item.position !== undefined;
    // A place over its anchor is drawn on it by asking, so the pair is no clash.
    const over = (a: PlaceableOverlay, b: PlaceableOverlay) => a.place !== undefined && "side" in a.place && a.place.side === "over" && placeAnchorOf(a.place) === b.id;
    const clash = together.find(other => preset(other.item) && preset(overlay.item)
      ? rectsOverlap(overlayRect(other.item.position, canvas), overlayRect(overlay.item.position, canvas))
      : !over(other.item, overlay.item) && !over(overlay.item, other.item) && footprints.some(({ boxes }) => {
        const a = boxes.get(other.item.id), b = boxes.get(overlay.item.id);
        return a !== undefined && b !== undefined && rectsOverlap(a, b);
      }));
    if (clash && preset(clash.item) && preset(overlay.item)) {
      refusals.push({ path: ["overlays", overlay.index, "position"], message: `overlay "${overlay.item.id}" (${overlay.item.position}) shares the screen with overlay "${clash.item.id}" (${clash.item.position}) at the same time: overlays on screen together need different positions` });
      continue;
    }
    if (clash) {
      refusals.push({ path: ["overlays", overlay.index, overlay.item.place ? "place" : "position"],
        message: `overlay "${overlay.item.id}" and overlay "${clash.item.id}" share the screen on overlapping boxes at the same time` });
      continue;
    }
    const crowd = overlayCrowd(together, overlay.range);
    if (crowd) {
      refusals.push({ path: ["overlays", overlay.index], message: `overlay "${overlay.item.id}" would be on screen together with ` +
        `${crowd.map(other => `"${other.item.id}"`).join(", ")}: at most ${MAX_OVERLAYS_AT_ONCE} overlays show at once` });
    }
  }
  return refusals;
}

export interface LayerFrames { id: string; startFrame: number; endFrame: number }

/** Each overlay's first frame moved by its enter_offset_s (#973 S3), inside its own frames and the video. Overlays that left on or before its first */
/** word and still show then leave as it enters, so no more overlays share the screen than their words allow. */
export function offsetOverlayFrames(frames: readonly LayerFrames[], overlays: readonly { id: string; enter_offset_s?: number | undefined }[],
  fps: number, warnings: string[]): LayerFrames[] {
  const out = frames.map(entry => ({ ...entry })), byId = new Map(out.map(entry => [entry.id, entry]));
  const word = new Map(out.map(entry => [entry.id, entry.startFrame])), ids = new Set(overlays.map(item => item.id));
  for (const item of [...overlays].sort((a, b) => (word.get(a.id) ?? 0) - (word.get(b.id) ?? 0))) {
    const entry = byId.get(item.id), offset = item.enter_offset_s;
    if (!entry || !offset) continue;
    const asked = Math.round(word.get(item.id)! + offset * fps), at = Math.min(entry.endFrame - 1, Math.max(0, asked));
    if (at !== asked) warnings.push(`overlay "${item.id}" appears ${((at - word.get(item.id)!) / fps).toFixed(2)} s from its first word, not ` +
      `${offset} s: ${asked < 0 ? "the video starts" : "its words end"} there`);
    entry.startFrame = at;
    for (const other of out) {
      if (other === entry || !ids.has(other.id) || other.endFrame > word.get(item.id)! || other.endFrame <= at) continue;
      const end = Math.max(other.startFrame + 1, at);
      warnings.push(`overlay "${other.id}" leaves ${((other.endFrame - end) / fps).toFixed(2)} s early: overlay "${item.id}" enters before its word`);
      other.endFrame = end;
    }
  }
  return out;
}

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
