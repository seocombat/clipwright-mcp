import { lexicalTokens } from "./semantic-inserts.js";
import { TEMPLATE_KINDS } from "./templates/index.js";
import { type AnchoredItem, type LayerRefusal, layerWordRange, type LayoutWindowKind, type WordRange } from "./ugc-layers.js";

// Framing (reference-elements S2): word-anchored presenter sizes, cut or flashed in, drawn by the composition over the actor slots.

/** full (#1175 S7) shows the take as rendered, like medium: it is full height only on a full view, and a narrower take is named, never widened. */
export const FRAMING_SIZES = ["close", "medium", "full"] as const;
export type FramingSize = (typeof FRAMING_SIZES)[number];
export const FRAMING_TRANSITIONS = ["cut", "flash"] as const;
export type FramingTransition = (typeof FRAMING_TRANSITIONS)[number];
export const MAX_FRAMING = 60;
/** The presenter's scale about the face: close clears a scene detector's 10% with margin and stays under the ×1.25 a 720p take stands. */
export const FRAMING_SCALE: Readonly<Record<FramingSize, number>> = Object.freeze({ close: 1.18, medium: 1, full: 1 });

const overlaps = (a: WordRange, b: WordRange) => a.startWord < b.coverWord && b.startWord < a.coverWord;
const coveredBy = (range: WordRange, cover: readonly WordRange[]) => Array.from({ length: range.coverWord - range.startWord },
  (_, offset) => range.startWord + offset).every(word => cover.some(other => word >= other.startWord && word < other.coverWord));
const ID_FIELDS = ["inserts", "overlays", "layout_windows", "templates"] as const;

export interface FramingCheckInput {
  script: string;
  inserts?: readonly AnchoredItem[] | undefined;
  overlays?: readonly AnchoredItem[] | undefined;
  layout_windows?: readonly (AnchoredItem & { layout: LayoutWindowKind })[] | undefined;
  templates?: readonly AnchoredItem[] | undefined;
  framing?: readonly AnchoredItem[] | undefined;
}

/** Every refusal of `framing` against the script and the run's other parts, named by path; empty when it renders. */
export function framingRefusals(input: FramingCheckInput): LayerRefusal[] {
  const refusals: LayerRefusal[] = [];
  const tokens = lexicalTokens(input.script);
  const used = new Map<string, string>(ID_FIELDS.flatMap(field => (input[field] ?? []).map(item => [item.id, field] as const)));
  const ranged = <T extends AnchoredItem>(items: readonly T[] | undefined) =>
    (items ?? []).flatMap(item => { const range = layerWordRange(tokens, item); return typeof range === "string" ? [] : [{ item, range }]; });
  const inserts = ranged(input.inserts), windows = ranged(input.layout_windows);
  const placed: { id: string; range: WordRange }[] = [];
  for (const [index, item] of (input.framing ?? []).entries()) {
    const owner = used.get(item.id);
    if (owner !== undefined) {
      refusals.push({ path: ["framing", index, "id"], message: `id "${item.id}" is already used in ${owner}: ids are unique across inserts, overlays, layout_windows, templates and framing` });
    }
    used.set(item.id, "framing");
    const range = layerWordRange(tokens, item);
    if (typeof range === "string") { refusals.push({ path: ["framing", index, "anchor"], message: `framing "${item.id}": ${range}` }); continue; }
    const refuse = (message: string) => refusals.push({ path: ["framing", index], message: `framing "${item.id}" ${message}` });
    const insert = inserts.find(other => overlaps(other.range, range));
    if (insert) refuse(`overlaps insert "${insert.item.id}": it reframes the presenter, who is not on screen during a full-frame insert`);
    const window = windows.find(other => overlaps(other.range, range));
    if (window) {
      refuse(`overlaps ${window.item.layout} window "${window.item.id}": ${window.item.layout === "split"
        ? "a split crops the presenter to the top half and cannot scale it as well" : "a window reframes the presenter, and framing does not share the frame with it"}`);
    }
    const earlier = placed.find(other => overlaps(other.range, range));
    if (earlier) refuse(`overlaps framing "${earlier.id}": one framing holds the presenter at a time`);
    placed.push({ id: item.id, range });
  }
  return refusals;
}

/** A framing that never shows, named for the quote and the run (rule 3): it lies wholly under full-frame templates. */
export function framingWarnings(input: { script?: unknown; framing?: unknown; templates?: unknown }): string[] {
  if (typeof input.script !== "string" || !Array.isArray(input.framing) || !Array.isArray(input.templates)) return [];
  const tokens = lexicalTokens(input.script);
  const fulls = (input.templates as (AnchoredItem & { kind?: unknown; placement?: unknown })[]).flatMap(item => {
    const placement = item.placement ?? TEMPLATE_KINDS.find(entry => entry.kind === item.kind)?.placements[0];
    const range = placement === "full" ? layerWordRange(tokens, item) : "over";
    return typeof range === "string" ? [] : [range];
  });
  return (input.framing as AnchoredItem[]).flatMap(item => {
    const range = layerWordRange(tokens, item);
    return typeof range !== "string" && coveredBy(range, fulls)
      ? [`framing "${item.id}" is not drawn: it lies wholly under full-frame templates, where the presenter is not on screen`] : [];
  });
}
