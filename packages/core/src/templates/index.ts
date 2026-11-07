import { z } from "zod";
import { captionLanguageOf } from "../caption-language.js";
import { lexicalTokens, quoteOccurrences } from "../semantic-inserts.js";
import { admissionFramings, admissionScene, type AnchoredItem, faceZone, frameCanvasOf, type LayerCheckInput, type LayerRect, type LayerRefusal, layerWordRange,
  MAX_OVERLAYS_AT_ONCE, overlayCrowd, overlayFootprints, placedRefusals, type PlaceableOverlay, type PresenterFraming, rectsOverlap, type WordRange } from "../ugc-layers.js";
import { placeAnchorOf, placeByCaptions, type Place } from "../scene-place.js";
import { callout } from "./callout.js";
import { chatWindow, chatWindowV1 } from "./chat-window.js";
import { checklist } from "./checklist.js";
import { compare, compareV1 } from "./compare.js";
import { endCard } from "./end-card.js";
import { lowerThird, lowerThirdV1 } from "./lower-third.js";
import { notification, notificationV1 } from "./notification.js";
import { phoneCall } from "./phone-call.js";
import { phoneScreen } from "./phone-screen.js";
import { pointerChips } from "./pointer-chips.js";
import { chart } from "./chart.js";
import { handTitle } from "./hand-title.js";
import { race } from "./race.js";
import { progress } from "./progress.js";
import { quote } from "./quote.js";
import { rating } from "./rating.js";
import type { TemplateSlot } from "./slot.js";
import { stat } from "./stat.js";
import { tag } from "./tag.js";
import { terminal, terminalV1 } from "./terminal.js";
import { DEFAULT_TEMPLATE_PRESET, templateAccentRefusal, type TemplatePreset } from "./theme.js";
import { titleCard } from "./title-card.js";
import { videoGrid } from "./video-grid.js";
import { wordFill } from "./word-fill.js";
import { wordTitle } from "./word-title.js";

// The graphic template catalog of any `make_ugc` script run (#778 S3, #840): one entry per kind, from which both schemas and every refusal come.

export const TEMPLATE_PLACEMENTS = ["over", "full"] as const;
export type TemplatePlacement = (typeof TEMPLATE_PLACEMENTS)[number];
export const MAX_TEMPLATES = 40;
export { contrastRatio, DEFAULT_TEMPLATE_PRESET, TEMPLATE_MIN_CONTRAST, TEMPLATE_PRESET_SURFACES, TEMPLATE_PRESETS, templateAccentRefusal, templateTheme,
  type TemplatePreset, type TemplateTheme } from "./theme.js";

/** One kind: a strict data schema with no defaults or transforms; `kindVersion` moves only when that shape changes (A8). */
export interface TemplateKind<D extends z.ZodObject = z.ZodObject> {
  kind: string;
  kindVersion: number;
  description: string;
  /** The placements it takes; the first is used when an item names none. */
  placements: readonly TemplatePlacement[];
  data: D;
  /** Text fields and the most units each takes; a dotted path reaches into objects and every element of a list. */
  text: Readonly<Record<string, number>>;
  /** Inner quotes, as dotted paths: each value is one beat, in order, landing on its words inside the item's own; absent is spread evenly (D6). */
  quotes?: readonly string[];
  /** A list whose elements each take a beat when the item quotes none, spread evenly; absent is one beat per quote value. */
  spreads?: string;
  /** The first frame a beat may land on: the kind has entered and, for a checklist, its cursor has reached the rows; absent is the frame after the enter. */
  beatsFrom?: number;
  /** Its first beat plays on its first frame whatever its quote: the first beat draws its first element, and a full frame is never bare (#1129). */
  firstBeatAtStart?: true;
  /** It fills the frame at medium, so large draws as medium, and says so (#1128). */
  fillsFrame?: true;
  /** Media fields, each `{ asset_id }`, and what each takes; they pin as `<id>.<slot>` (A1). */
  slots: Readonly<Record<string, TemplateSlot>>;
  /** Whether captions are hidden while it shows: it sits in the caption spot. */
  hidesCaptions(data: z.infer<D>): boolean;
  /** Drawn on full-frame insert frames too; other over-presenter kinds step aside there. */
  onInserts: boolean;
  /** Where it draws, in shares of the frame: over the presenter its footprint, on a full frame the area its content takes. */
  /** `framing` is the presenter's as rendered, close when absent (#884 S5d). */
  rect(data: z.infer<D>, aspectRatio: string, placement?: TemplatePlacement, framing?: PresenterFraming): LayerRect;
  /** Named parts the composition draws in, in shares of the frame; they may reach past it, where the footprint crops them (A7). */
  parts?(data: z.infer<D>, aspectRatio: string, framing?: PresenterFraming): Record<string, LayerRect>;
  /** The part the face rule applies to, or none; absent is the whole footprint. */
  faceRect?(data: z.infer<D>, aspectRatio: string, framing?: PresenterFraming): LayerRect | undefined;
  sample: z.infer<D>;
}

export const TEMPLATE_KINDS: readonly TemplateKind[] = [tag, lowerThird, endCard, titleCard, quote, stat, callout, checklist, phoneCall, compare,
  notification, progress, rating, chatWindow, videoGrid, wordTitle, phoneScreen, terminal, pointerChips, chart, race, handTitle, wordFill] as unknown as readonly TemplateKind[];
export const TEMPLATE_KIND_IDS = ["tag", "lower_third", "end_card", "title_card", "quote", "stat", "callout", "checklist", "phone_call", "compare",
  "notification", "progress", "rating", "chat_window", "video_grid", "word_title", "phone_screen", "terminal", "pointer_chips", "chart", "race",
  "hand_title", "word_fill"] as const;
/** Earlier versions of kinds a frozen timeline may still name, each with its own footprint (A8, #819). The phone's version 2 (#857 S5) and the
 *  five kinds' version 2 (#1119) only add optional fields, so version 1 keeps its geometry. */
export const TEMPLATE_KIND_HISTORY: readonly TemplateKind[] = [{ ...phoneCall, kindVersion: 1 } as TemplateKind,
  ...[chatWindowV1, notificationV1, terminalV1, lowerThirdV1, compareV1] as unknown as TemplateKind[]];

/** A kind as it was at `version`: the current entry or one from its history; a version neither holds has no footprint to draw. */
export function templateKindAt(kind: string, version: number | undefined, kinds: readonly TemplateKind[] = TEMPLATE_KINDS,
  history: readonly TemplateKind[] = TEMPLATE_KIND_HISTORY): TemplateKind {
  const current = kinds.find(entry => entry.kind === kind);
  if (!current) throw new Error(`unknown template kind ${kind}`);
  if (version === undefined || version === current.kindVersion) return current;
  const past = history.find(entry => entry.kind === kind && entry.kindVersion === version);
  if (!past) throw new Error(`template kind ${kind}@${version} has no footprint: the registry holds no such version`);
  return past;
}
export { TEMPLATE_SIZES } from "./size.js";
export { DEFAULT_TEMPLATE_SOUNDS, editSoundRefusals, editSounds, FACELESS_LOOK_SOUND, FACELESS_SOUND_BEATS, facelessSoundMap, facelessSoundRefusals,
  facelessTemplateSounds, type FacelessSoundMap, type FacelessTemplateSounds, listTemplateSounds, mcpTemplateSounds, TEMPLATE_KIND_SOUNDS, TEMPLATE_SOUND_BEATS, TEMPLATE_SOUNDS, TEMPLATE_SOUNDS_PATH, templateSoundBeats, templateSoundMap,
  templateSounds, templateSoundsList, type TemplateSoundBeat, type TemplateSoundMap, type TemplateSounds, type TemplateSoundsList } from "./sounds.js";
export { TAG_RECT_EMS } from "./tag.js";
export { END_CARD_RECT_EMS } from "./end-card.js";
export { TITLE_CARD_RECT_EMS } from "./title-card.js";
export { QUOTE_RECT_EMS } from "./quote.js";
export { STAT_RECT_EMS } from "./stat.js";
export { CALLOUT_LABEL_EMS, calloutParts } from "./callout.js";
export { CHECKLIST_EMS } from "./checklist.js";
export { COMPARE_CARD_SHAPE, COMPARE_REVEALS } from "./compare.js";
export { LOWER_THIRD_STYLES } from "./lower-third.js";
export { NOTIFICATION_EMS, notificationEms } from "./notification.js";
export { PROGRESS_EMS } from "./progress.js";
export { RATING_EMS } from "./rating.js";
export { CHAT_WINDOW_EMS, CHAT_WINDOW_ZOOM, chatWindowEms } from "./chat-window.js";
export { VIDEO_GRID_EMS, VIDEO_GRID_LAYOUTS, videoGridLayout, videoGridShape } from "./video-grid.js";
export { WORD_TITLE_RECT_EMS, WORD_TITLE_REVEALS } from "./word-title.js";
export { PHONE_SCREEN_EMS, PHONE_SCREEN_STATES } from "./phone-screen.js";
export { TERMINAL_CHANGES, TERMINAL_EMS, terminalEms } from "./terminal.js";
export { POINTER_CHIPS_EMS, pointerChipsParts } from "./pointer-chips.js";
export { CHART_EMS, CHART_TYPES, chartEms } from "./chart.js";
export { RACE_EMS, raceEms } from "./race.js";
export { HAND_MARKS, HAND_TITLE_EMS } from "./hand-title.js";
export { WORD_FILL_EMS } from "./word-fill.js";
export { templateMedia, type TemplateSlot } from "./slot.js";

/** Every value at a dotted path of a kind's data, one per element where the path crosses or ends in a list, with its own path; an absent last
 * field is listed, a path through an absent object or list lists nothing. */
export function templateFieldValues(data: unknown, field: string): { path: (string | number)[]; value: unknown }[] {
  const walk = (value: unknown, keys: readonly string[], path: (string | number)[]): { path: (string | number)[]; value: unknown }[] => {
    if (Array.isArray(value)) return value.flatMap((entry, index) => walk(entry, keys, [...path, index]));
    if (!keys.length) return [{ path, value }];
    if (value === null || typeof value !== "object") return [];
    const [key, ...rest] = keys as [string, ...string[]];
    return walk((value as Record<string, unknown>)[key], rest, [...path, key]);
  };
  return walk(data, field.split("."), []);
}

/** The data with every value at a dotted path set to `value`, through lists and in each element of a list it ends in; a missing object on the
 * way is created. */
export function withTemplateField(data: Record<string, unknown>, field: string, value: unknown): Record<string, unknown> {
  const set = (target: unknown, keys: readonly string[]): unknown => {
    if (Array.isArray(target)) return target.map(entry => set(entry, keys));
    if (!keys.length) return value;
    const [key, ...rest] = keys as [string, ...string[]];
    const object = (target ?? {}) as Record<string, unknown>;
    return { ...object, [key]: set(object[key], rest) };
  };
  return set(data, field.split(".")) as Record<string, unknown>;
}

/** Frames a template takes to enter; a beat without a quote is spread evenly from there to 80% of its span (D6). */
export const TEMPLATE_ENTER_FRAMES = 8;

/** The word each beat of a template lands on: its quote's first word inside the item's words, after the beat before; none for a beat without
 * a quote; or why it cannot land (D6, D10). */
export function templateMomentWords(kind: TemplateKind, data: unknown, tokens: readonly string[], range: WordRange):
  { path: (string | number)[]; word?: number; refusal?: string }[] {
  let after = range.startWord;
  const quoted = (kind.quotes ?? []).flatMap(field => templateFieldValues(data, field));
  const beats = kind.spreads && quoted.every(({ value }) => value === undefined) ? templateFieldValues(data, kind.spreads).map(({ path }) => ({ path, value: undefined }))
    : quoted;
  return beats.map(({ path, value }) => {
    if (typeof value !== "string") return { path };
    const matches = quoteOccurrences(tokens, value), inside = matches.filter(match => match.startWord >= range.startWord && match.endWord <= range.coverWord);
    const next = inside.find(match => match.startWord >= after);
    if (!next) {
      return { path, refusal: !matches.length ? `"${value}" does not occur in the script` : !inside.length
        ? `"${value}" lies outside the template's own words: an inner quote sits inside them`
        : `"${value}" comes before the beat ahead of it: inner quotes follow the script's word order` };
    }
    after = next.startWord + 1;
    return { path, word: next.startWord };
  });
}

/** Frames an over-the-presenter template starts before its words, so its first quoted beat lands on its word once it is on screen (#1198 item 3):
 *  at most `beatsFrom`, never before the video's first frame. */
export function templateLeadFrames(kind: TemplateKind, data: unknown, tokens: readonly string[], range: WordRange,
  words: readonly { word: string; startSec: number }[], fps: number, span: { startFrame: number }): number {
  const first = kind.firstBeatAtStart ? undefined : templateMomentWords(kind, data, tokens, range)[0];
  if (first?.word === undefined) return 0;
  const lexical = words.filter(word => !/^\p{P}+$/u.test(word.word)), from = kind.beatsFrom ?? TEMPLATE_ENTER_FRAMES + 1;
  const at = Math.round(lexical[first.word]!.startSec * fps) - span.startFrame;
  return Math.max(0, Math.min(from - at, from, span.startFrame));
}

/** Frames between a moved beat and the next, so a checklist's cursor still travels between two clicks. */
export const TEMPLATE_BEAT_GAP = 6;

/** Each beat's frame from the template's start, frozen in the timeline; the renderer reads frames only (D11). A beat spoken before the kind's
 * `beatsFrom` moves there, the beats after it keep `TEMPLATE_BEAT_GAP`, and each move is a warning. */
export function templateMoments(kind: TemplateKind, data: unknown, tokens: readonly string[], range: WordRange,
  words: readonly { word: string; startSec: number }[], fps: number, span: { startFrame: number; endFrame: number }, id = "template"):
  { moments: number[]; warnings: string[] } {
  const lexical = words.filter(word => !/^\p{P}+$/u.test(word.word)), duration = span.endFrame - span.startFrame;
  const beats = templateMomentWords(kind, data, tokens, range), from = kind.beatsFrom ?? TEMPLATE_ENTER_FRAMES + 1, warnings: string[] = [];
  let before: number | undefined;
  const moments = beats.map((beat, index) => {
    if (beat.refusal) throw new Error(`template beat ${beat.path.join(".")} ${beat.refusal}`);
    if (index === 0 && kind.firstBeatAtStart) { before = 0; return 0; }
    const at = beat.word === undefined
      ? TEMPLATE_ENTER_FRAMES + Math.round(((0.8 * duration - TEMPLATE_ENTER_FRAMES) * (index + 1)) / beats.length)
      : Math.round(lexical[beat.word]!.startSec * fps) - span.startFrame;
    const early = at < from, crowded = before !== undefined && at < before + TEMPLATE_BEAT_GAP;
    const moved = Math.min(duration - 1, Math.max(0, at, from, before === undefined ? 0 : before + TEMPLATE_BEAT_GAP));
    before = early || crowded ? moved : undefined;
    if (moved !== Math.min(duration - 1, Math.max(0, at))) {
      const quote = templateFieldValues(data, beat.path.filter(part => typeof part === "string").join("."))
        .find(entry => entry.path.join(".") === beat.path.join("."))?.value;
      warnings.push(`template "${id}" ${beat.path.join(".")}${typeof quote === "string" ? ` "${quote}" is spoken` : " falls"} on frame ${Math.max(0, at)} of the ` +
        `template, ${early ? `before its ${kind.kind} is on screen` : "too close after the beat before it moved"}: the beat plays on frame ${moved}`);
    }
    return moved;
  });
  return { moments, warnings };
}
/** The most pins a run's templates take: each template's slots. */
export const MAX_TEMPLATE_MEDIA = MAX_TEMPLATES * Math.max(...TEMPLATE_KINDS.map(kind => Object.keys(kind.slots).length));

/** Every way a kind draws: each placement with its sample, then each value of each enum field over the sample at its first placement;
 * the composition declares motion phases for each, and the media test checks them. */
export function templateVariants(kind: TemplateKind): { key: string; placement: TemplatePlacement; data: Record<string, unknown> }[] {
  const sample = kind.sample as Record<string, unknown>;
  return [...kind.placements.map(placement => ({ key: `placement:${placement}`, placement, data: sample })),
    ...Object.entries(kind.data.shape).flatMap(([field, schema]) => {
      const inner = (schema as unknown as { unwrap?: () => unknown }).unwrap?.() ?? schema;
      return ((inner as { options?: readonly string[] }).options ?? [])
        .map(option => ({ key: `${field}:${option}`, placement: kind.placements[0]!, data: { ...sample, [field]: option } }));
    })];
}

/** Every media slot the templates fill, in item then slot order: what admission pins and every source walker reads (#778 S3a(ii)). */
export function templateMediaOf(templates: readonly { id: string; kind: string; data: Record<string, unknown> }[] | undefined):
  { index: number; id: string; slot: string; asset_id: string; media_type: "image" | "video"; cover?: number | undefined }[] {
  return (templates ?? []).flatMap((item, index) => Object.entries(TEMPLATE_KINDS.find(kind => kind.kind === item.kind)?.slots ?? {}).flatMap(([slot, takes]) => {
    const media = item.data[slot] as { asset_id?: unknown } | undefined;
    return typeof media?.asset_id === "string" ? [{ index, id: item.id, slot, asset_id: media.asset_id, media_type: takes.type, cover: takes.cover }] : [];
  }));
}

const RANGES = (pairs: number[]) => pairs.flatMap((value, index): [number, number][] => (index % 2 ? [] : [[value, pairs[index + 1]!]]));
/** Latin letters every face draws: ASCII, Latin-1 and Latin Extended-A/B; Vietnamese adds its own block. */
const LATIN = RANGES([0x41, 0x5a, 0x61, 0x7a, 0xc0, 0xd6, 0xd8, 0xf6, 0xf8, 0x24f]);
const COMMON = RANGES([0x20, 0x40, 0x5b, 0x60, 0x7b, 0x7e, 0xa0, 0xbf, 0xd7, 0xd7, 0xf7, 0xf7, 0x2010, 0x2027, 0x2030, 0x203a, 0x20ac, 0x20ac]);
const EXTRA: Record<string, [number, number][]> = {
  vi: RANGES([0x1e00, 0x1eff]), ar: RANGES([0x60c, 0x60c, 0x61b, 0x61b, 0x61f, 0x61f, 0x64b, 0x65f, 0x670, 0x670]), hi: RANGES([0x964, 0x965]),
  ...Object.fromEntries(["ja", "zh", "ko"].map(language => [language, RANGES([0x3000, 0x3003, 0x3008, 0x3017, 0x301c, 0x301c, 0x301e, 0x301e,
    0x30fb, 0x30fc, 0xff01, 0xff5e])])),
};
const SCRIPTS: Record<string, [string, RegExp]> = {
  ru: ["Cyrillic", /\p{Script=Cyrillic}/u], el: ["Greek", /\p{Script=Greek}/u], ja: ["Japanese", /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u],
  zh: ["Chinese", /\p{Script=Han}/u], ko: ["Hangul", /\p{Script=Hangul}/u], ar: ["Arabic", /\p{Script=Arabic}/u],
  hi: ["Devanagari", /\p{Script=Devanagari}/u], ta: ["Tamil", /\p{Script=Tamil}/u],
};

/** Code points template text may use besides the run script's letters, for a caption language; the glyph test reads this list. */
export function templateCharRanges(language: string): [number, number][] {
  return [...LATIN, ...COMMON, ...(EXTRA[language] ?? [])];
}

const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u{3000}-\u{303f}\u{ff01}-\u{ff60}\u{ffe0}-\u{ffe6}]/u;
/** Units of a text: a wide CJK character takes the room of two. */
export const textUnits = (text: string): number => Array.from(text).reduce((sum, char) => sum + (WIDE.test(char) ? 2 : 1), 0);

/** Why a template text cannot be drawn, or nothing; the language is the run's, as the caption fonts read it. */
export function templateTextRefusal(text: string, limit: number, language: string): string | undefined {
  if (!text.trim()) return "is blank";
  if (/[\r\n\u{2028}\u{2029}]/u.test(text)) return "has a line break: template text is one line";
  const emoji = /\p{Extended_Pictographic}/u.exec(text);
  if (emoji) return `has "${emoji[0]}": no emoji or pictographs, the renderer has no font for them`;
  const units = textUnits(text);
  if (units > limit) return `is ${units} units long, over the ${limit} it takes (a wide character counts 2)`;
  const [name, letters] = SCRIPTS[language] ?? ["", undefined];
  const ranges = templateCharRanges(language);
  const odd = Array.from(text).find(char => !letters?.test(char) && !ranges.some(([from, to]) => char.codePointAt(0)! >= from && char.codePointAt(0)! <= to));
  if (odd) return `has "${odd}", which the run's fonts cannot draw: use Latin${name ? ` or ${name}` : ""} letters, digits and common punctuation`;
  return undefined;
}

export interface TemplateItem extends AnchoredItem { kind: string; placement?: TemplatePlacement | undefined; transition?: string | undefined;
  data: Record<string, unknown>; place?: Place | undefined }

/** The run's over-presenter templates as scene items for one framing (#973 S4): each with its kind's own rect and its place, if any. */
export function templateSceneItems(input: { templates?: readonly TemplateItem[] | undefined; aspect_ratio?: string | undefined },
  framing: PresenterFraming, kinds: readonly TemplateKind[] = TEMPLATE_KINDS): PlaceableOverlay[] {
  return (input.templates ?? []).flatMap(item => {
    const kind = kinds.find(entry => entry.kind === item.kind), parsed = kind?.data.safeParse(item.data);
    if (!kind || !parsed?.success || (item.placement ?? kind.placements[0]) !== "over") return [];
    return [{ id: item.id, anchor: item.anchor, cover_words: item.cover_words, place: item.place,
      own: kind.rect(parsed.data, input.aspect_ratio ?? "9:16", undefined, framing) }];
  });
}

/** Where a template draws and what it does to captions, at a format; a frozen `kindVersion` reads that version's geometry (#819). */
export function templateFootprint(item: { kind: string; kindVersion?: number | undefined; placement: TemplatePlacement; data: Record<string, unknown> },
  aspectRatio: string, kinds: readonly TemplateKind[] = TEMPLATE_KINDS, history: readonly TemplateKind[] = TEMPLATE_KIND_HISTORY,
  framing: PresenterFraming = "close"): { rect: LayerRect; hidesCaptions: boolean; onInserts: boolean; content?: LayerRect; parts?: Record<string, LayerRect> } {
  const kind = templateKindAt(item.kind, item.kindVersion, kinds, history);
  if (item.placement === "full") {
    return { rect: { left: 0, top: 0, width: 1, height: 1 }, hidesCaptions: true, onInserts: false, content: kind.rect(item.data, aspectRatio, "full", framing) };
  }
  return { rect: kind.rect(item.data, aspectRatio, undefined, framing), hidesCaptions: kind.hidesCaptions(item.data), onInserts: kind.onInserts,
    ...(kind.parts ? { parts: kind.parts(item.data, aspectRatio, framing) } : {}) };
}

/** Templates asked at size large whose kind already fills the frame at medium: drawn at medium, and named (rule 3, #1128). */
export function templateSizeWarnings(input: { templates?: unknown }): string[] {
  if (!Array.isArray(input.templates)) return [];
  return (input.templates as { id?: unknown; kind?: unknown; data?: { size?: unknown } }[]).flatMap(item =>
    item.data?.size === "large" && TEMPLATE_KINDS.find(entry => entry.kind === item.kind)?.fillsFrame
      ? [`template "${String(item.id)}" is drawn at medium: a ${String(item.kind)} already fills the frame there, so size large draws no larger`] : []);
}

/** Whether a template takes the whole frame: its entry and exit are cuts edit_sounds sounds. */
export function hasFullFrameTemplate(templates: unknown): boolean {
  return Array.isArray(templates) && (templates as { kind?: unknown; placement?: unknown }[]).some(item =>
    (item.placement ?? TEMPLATE_KINDS.find(kind => kind.kind === item.kind)?.placements[0]) === "full");
}

/** Over-presenter templates whose footprint meets the face: drawn as asked, and named (rule 3); every kind's default stays off it. */
export function templateFaceWarnings(input: { templates?: unknown; aspect_ratio?: unknown; presenter_framing?: unknown }): string[] {
  if (!Array.isArray(input.templates)) return [];
  const aspect = typeof input.aspect_ratio === "string" ? input.aspect_ratio : "9:16";
  const framing = input.presenter_framing === "wide" || input.presenter_framing === "full" ? input.presenter_framing : "close";
  return (input.templates as { id?: unknown; kind?: unknown; placement?: unknown; data?: unknown; place?: unknown }[]).flatMap(item => {
    const kind = TEMPLATE_KINDS.find(entry => entry.kind === item.kind);
    const placement = item.placement ?? kind?.placements[0];
    // A placed template is judged by its box, with the placed overlays (#973 S4).
    if (!kind || placement !== "over" || item.place !== undefined || !kind.data.safeParse(item.data).success) return [];
    const guarded = kind.faceRect ? kind.faceRect(item.data as never, aspect, framing) : kind.rect(item.data as never, aspect, "over", framing);
    return guarded && rectsOverlap(guarded, faceZone(aspect, framing))
      ? [`template "${String(item.id)}" is drawn over the presenter's face: its ${kind.kind}${kind.faceRect ? " label" : ""} sits there as asked; ` +
        "move it or use the kind's default place to keep the face clear"]
      : [];
  });
}

function catalogField(kind: TemplateKind, key: string, schema: z.ZodType, path = key): string {
  const def = schema._zod.def as { type: string; innerType?: z.ZodType; element?: z.ZodType };
  if (def.type === "optional") return `${catalogField(kind, key, def.innerType!, path)}?`.replace(/^(\S+)(.*)\?$/, "$1?$2");
  const options = (schema as unknown as { options?: readonly string[] }).options;
  if (kind.slots[path]) return `${key} {asset_id} ${kind.slots[path].type}${kind.slots[path].cover ? " (cut to fill)" : ""}`;
  if (def.type === "number") return `${key} number`;
  if (def.type === "boolean") return `${key} true|false`;
  if (def.type === "array") {
    // zod 4.6 fills `_zod.bag` lazily, so the bounds come from the public JSON Schema export.
    const { minItems, maxItems } = z.toJSONSchema(schema, { unrepresentable: "any" }) as { minItems?: number; maxItems?: number };
    return `${key} ${minItems ?? 0}–${maxItems} of ${catalogField(kind, "", def.element!, path).trim()}`;
  }
  if (def.type === "object") {
    const shape = Object.entries((schema as z.ZodObject).shape);
    // An object holding text or a quote lists its fields; a plain one, such as a target, its keys.
    const deep = [...Object.keys(kind.text), ...(kind.quotes ?? [])].some(name => name.startsWith(`${path}.`));
    return `${key} {${deep ? shape.map(([name, inner]) => catalogField(kind, name, inner as z.ZodType, `${path}.${name}`)).join(", ") : shape.map(([name]) => name).join(",")}}`;
  }
  if (kind.quotes?.includes(path)) return `${key} inner quote`;
  return options ? `${key} ${options.join("|")}` : `${key} ≤ ${kind.text[path]}`;
}

/** A kind's data fields as its catalog line names them: types, text limits, media slots and inner quotes. */
export function templateDataText(kind: TemplateKind): string {
  return Object.entries(kind.data.shape).map(([key, schema]) => catalogField(kind, key, schema as z.ZodType)).join(", ");
}

/** The `templates` description: the gate, the text rules and one catalog line per kind, all from the registry. */
export function templateCatalogText(kinds: readonly TemplateKind[] = TEMPLATE_KINDS): string {
  return "Graphic templates, each { id, kind, anchor, cover_words?, placement?, transition?, data }. On any script run. Templates never " +
    "change the price: every run is billed by its parts as list_prices states them, and a presenter a template covers is still " +
    "presenter time. Ids are unique across inserts, overlays, layout_windows " +
    "and templates. Text is one line of Latin or the script's own letters, digits and common punctuation, with no emoji; a wide CJK glyph " +
    "counts 2 toward a limit, and long text shrinks to fit the kind's width. size small|medium|large scales a kind; absent is medium. " +
    "A media field takes { asset_id } of a ready asset of the kind it names. An inner quote names words inside the template's own words, after " +
    "the one before it: its beat lands on their first word, and must not fall under an insert or full-frame template; a click or step without one " +
    "is spread evenly. A beat spoken before its template has entered moves just after the enter, with a warning. A template that meets the caption band hides captions while it shows; one elsewhere, such as a small one at the top, " +
    "leaves them. A full-frame template also hides the presenter, overlays " +
    "and over-presenter templates while it shows, never meets a wipe or zoom insert, and the covered presenter is billed. " +
    `At most ${MAX_OVERLAYS_AT_ONCE} overlays and over-presenter templates show at once, on footprints that do not ` +
    "overlap. template_theme sets the look of them all. Kinds: " +
    kinds.map(kind => `${kind.kind} (${kind.placements.join("|")}): ${kind.description}; data ${templateDataText(kind)}`).join(". ") + ".";
}

const overlaps = (a: WordRange, b: WordRange) => a.startWord < b.coverWord && b.startWord < a.coverWord;
const meets = (a: WordRange, b: WordRange) => a.coverWord === b.startWord || b.coverWord === a.startWord;
const coveredBy = (range: WordRange, cover: readonly WordRange[]) => Array.from({ length: range.coverWord - range.startWord },
  (_, offset) => range.startWord + offset).every(word => cover.some(other => word >= other.startWord && word < other.coverWord));
const MOVING = new Set(["wipe", "zoom"]);

export interface TemplateCheckInput {
  script?: string | undefined;
  segments?: unknown;
  aspect_ratio?: string | undefined;
  presenter_framing?: PresenterFraming | undefined;
  actor_id?: string | undefined;
  inserts?: readonly (AnchoredItem & { transition?: string | undefined })[] | undefined;
  overlays?: readonly PlaceableOverlay[] | undefined;
  layout_windows?: readonly AnchoredItem[] | undefined;
  templates?: readonly TemplateItem[] | undefined;
  template_theme?: { preset?: TemplatePreset | undefined; accent?: string | undefined } | undefined;
  template_sounds?: unknown;
  edit_sounds?: boolean | undefined;
  shots?: readonly { transition?: string | undefined }[] | undefined;
  call?: unknown;
  captions?: boolean | undefined;
  caption_style?: string | undefined;
  caption_position?: LayerCheckInput["caption_position"];
  caption_place?: LayerCheckInput["caption_place"];
  presenter_place?: LayerCheckInput["presenter_place"];
}

/** Every refusal of `templates`, `template_theme` and `template_sounds` against the run, named by path; empty when they render (D4, D5, D6, D8, D10, A5, A6). */
export function templateRefusals(input: TemplateCheckInput, kinds: readonly TemplateKind[] = TEMPLATE_KINDS): LayerRefusal[] {
  if (input.templates === undefined) {
    // The edit sound alone needs no templates; it and `false` beside edit_sounds are judged by `editSoundRefusals`.
    const sounds = input.template_sounds;
    const named = typeof sounds === "object" && sounds !== null ? Object.keys(sounds) : [];
    const editOnly = (sounds === false && input.edit_sounds === true) || (named.length > 0 && named.every(beat => beat === "edit"));
    // A live shot's flash, light leak or whoosh plays the flash or whoosh sound, which template_sounds names or mutes (#1129).
    const shotSounds = (input.shots ?? []).some(shot => shot.transition !== undefined && shot.transition !== "cut") &&
      (sounds === false || named.every(beat => beat === "flash" || beat === "whoosh" || beat === "edit"));
    // A call brings its own phone (#857 S5), which the run's theme and sounds style as any template.
    if (input.call !== undefined) return [];
    return [...(input.template_theme === undefined ? [] : [{ path: ["template_theme"], message: "template_theme styles templates: add templates or drop it" }]),
      ...(sounds === undefined || editOnly || shotSounds ? [] : [{ path: ["template_sounds"], message: "template_sounds sounds templates: add templates or drop it" }])];
  }
  if (input.script === undefined || input.segments !== undefined) {
    return [{ path: ["templates"], message: "templates require script and cannot be combined with segments" }];
  }
  const refusals: LayerRefusal[] = [];
  const accent = input.template_theme?.accent;
  const contrast = accent === undefined || !/^#[0-9A-Fa-f]{6}$/.test(accent) ? undefined : templateAccentRefusal(input.template_theme?.preset ?? DEFAULT_TEMPLATE_PRESET, accent);
  if (contrast) refusals.push({ path: ["template_theme", "accent"], message: `template_theme accent ${contrast}` });
  const tokens = lexicalTokens(input.script);
  const language = captionLanguageOf(input.script);
  const aspect = input.aspect_ratio ?? "9:16";
  const used = new Map<string, string>((["inserts", "overlays", "layout_windows"] as const).flatMap(field => (input[field] ?? []).map(item => [item.id, field] as const)));
  const ranged = <T extends AnchoredItem>(items: readonly T[] | undefined) =>
    (items ?? []).flatMap(item => { const range = layerWordRange(tokens, item); return typeof range === "string" ? [] : [{ item, range }]; });
  const inserts = ranged(input.inserts), windows = ranged(input.layout_windows);
  // A wider request may render narrower when the actor has no such view, so footprints are checked in every framing it may render.
  const framings: PresenterFraming[] = admissionFramings({ ...input, aspect_ratio: aspect });
  // An overlay's footprint is its preset's, or the box its place resolves to (#973 S1); a place on a broken chain is refused with the overlays.
  // A template's is its kind's rect, or that rect scaled whole into its place (S4); overlays and templates may stand by one another.
  const scenes = framings.map(framing => {
    const scene = admissionScene(input, aspect, framing), items = [...input.overlays ?? [], ...templateSceneItems(input, framing, kinds)];
    return { items, boxes: overlayFootprints(items, aspect, framing, scene), face: scene.face };
  });
  const overlays = ranged(input.overlays).flatMap(entry => {
    const rects = scenes.map(({ boxes }) => boxes.get(entry.item.id));
    return rects.every(rect => rect !== undefined) ? [{ ...entry, rects: rects as LayerRect[] }] : [];
  });
  const items = scenes[0]!.items, canvas = frameCanvasOf(aspect);
  // A place over its anchor is drawn on it by asking, so the pair is no clash.
  const over = (a: string, b: string) => { const place = items.find(item => item.id === a)?.place;
    return place !== undefined && "side" in place && place.side === "over" && placeAnchorOf(place) === b; };
  const placed: { index: number; id: string; placement: TemplatePlacement; transition?: string | undefined; range: WordRange; rects: LayerRect[];
    onInserts: boolean; beats: { path: (string | number)[]; word: number }[] }[] = [];
  for (const [index, item] of input.templates.entries()) {
    const at = (...rest: (string | number)[]) => ["templates", index, ...rest];
    const owner = used.get(item.id);
    if (owner !== undefined) refusals.push({ path: at("id"), message: `id "${item.id}" is already used in ${owner}: ids are unique across inserts, overlays, layout_windows and templates` });
    used.set(item.id, "templates");
    const kind = kinds.find(entry => entry.kind === item.kind);
    if (!kind) { refusals.push({ path: at("kind"), message: `unknown template kind "${item.kind}": use one of ${kinds.map(entry => entry.kind).join(", ")}` }); continue; }
    const parsed = kind.data.safeParse(item.data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) refusals.push({ path: at("data", ...issue.path.map(String)), message: `${item.kind}: ${issue.message}` });
      continue;
    }
    const placement = item.placement ?? kind.placements[0]!;
    if (!kind.placements.includes(placement)) refusals.push({ path: at("placement"), message: `${item.kind} takes placement ${kind.placements.join(" or ")}, not ${placement}` });
    if (item.transition !== undefined && placement !== "full") refusals.push({ path: at("transition"), message: "transition works on a full-frame template only" });
    for (const [field, limit] of Object.entries(kind.text)) for (const { path, value } of templateFieldValues(parsed.data, field)) {
      const why = typeof value === "string" ? templateTextRefusal(value, limit, language) : undefined;
      if (why) refusals.push({ path: at("data", ...path), message: `${item.kind} ${path.join(".")} ${why}` });
    }
    const range = layerWordRange(tokens, item);
    if (typeof range === "string") { refusals.push({ path: at("anchor"), message: `template "${item.id}": ${range}` }); continue; }
    const beats = templateMomentWords(kind, parsed.data, tokens, range);
    for (const beat of beats) if (beat.refusal) refusals.push({ path: at("data", ...beat.path), message: `template "${item.id}" ${beat.path.join(".")} ${beat.refusal}` });
    const footprints = framings.map(framing => templateFootprint({ kind: item.kind, placement, data: parsed.data as Record<string, unknown> }, aspect, kinds,
      undefined, framing));
    let rects = footprints.map(footprint => footprint.rect);
    if (item.place) {
      // A placed template is its own drawing scaled whole into the box (#973 S4): over the presenter, never cut to fit, never moved by the captions.
      const place = item.place, why = placement !== "over" ? "a template takes place over the presenter only (placement over)"
        : placeByCaptions(place) ? "a template does not stand by the captions: place it by the frame, the face, an overlay or a template"
          : place.fit === "cover" ? "a template is scaled whole into its box: drop fit cover" : undefined;
      if (why) { refusals.push({ path: at("place"), message: `template "${item.id}": ${why}` }); continue; }
      refusals.push(...placedRefusals("template", { ...item, place }, range, (...rest) => at("place", ...rest), { items, tokens, footprints: scenes, canvas }));
      const boxes = scenes.map(({ boxes }) => boxes.get(item.id));
      if (boxes.some(box => box === undefined)) continue;
      rects = boxes as LayerRect[];
    }
    placed.push({ index, id: item.id, placement, transition: item.transition, range, rects, onInserts: footprints[0]!.onInserts,
      beats: beats.flatMap(beat => (beat.word === undefined ? [] : [{ path: beat.path, word: beat.word }])) });
  }
  const fulls = placed.filter(entry => entry.placement === "full"), overs = placed.filter(entry => entry.placement === "over");
  for (const entry of placed) {
    const refuse = (message: string) => refusals.push({ path: ["templates", entry.index], message: `template "${entry.id}" ${message}` });
    const window = windows.find(other => overlaps(other.range, entry.range));
    if (window) refuse(`overlaps layout window "${window.item.id}": a window reframes the presenter, and a template does not share the frame with it`);
    // A beat under an insert or another full frame would play unseen (D6).
    const hiding = [...inserts.map(other => ({ id: other.item.id, range: other.range })), ...fulls.filter(other => other.index !== entry.index)];
    for (const beat of entry.beats) {
      const cover = hiding.find(other => beat.word >= other.range.startWord && beat.word < other.range.coverWord);
      if (cover) refusals.push({ path: ["templates", entry.index, "data", ...beat.path], message: `template "${entry.id}" ${beat.path.join(".")} lands on words ` +
        `"${cover.id}" covers with a full frame: the beat would play unseen; quote words outside it` });
    }
    if (entry.placement === "full") {
      const insert = inserts.find(other => overlaps(other.range, entry.range));
      if (insert) refuse(`overlaps insert "${insert.item.id}": both fill the frame`);
      const earlier = fulls.find(other => other.index < entry.index && overlaps(other.range, entry.range));
      if (earlier) refuse(`overlaps full-frame template "${earlier.id}": both fill the frame`);
      const moving = inserts.find(other => MOVING.has(other.item.transition ?? "") && meets(other.range, entry.range));
      if (moving) refuse(`meets insert "${moving.item.id}", whose ${moving.item.transition} would show a hidden presenter frame: use cut or flash on one of them`);
      const next = MOVING.has(entry.transition ?? "") && [...inserts.map(other => ({ id: other.item.id, range: other.range })),
        ...fulls.filter(other => other.index !== entry.index)].find(other => meets(other.range, entry.range));
      if (next) refuse(`has a ${entry.transition} and meets "${next.id}": it would show the presenter between two full-frame visuals; use cut or flash`);
      continue;
    }
    const covers = [...(entry.onInserts ? [] : inserts.map(other => other.range)), ...fulls.map(other => other.range)];
    if (covers.some(other => overlaps(other, entry.range)) && coveredBy(entry.range, covers)) {
      refuse("lies wholly under full-frame inserts or templates: it draws over the presenter, who is not on screen there");
    }
    const together = [...overlays.map(other => ({ id: other.item.id, range: other.range, rects: other.rects })),
      ...overs.filter(other => other.index < entry.index)].filter(other => overlaps(other.range, entry.range));
    const clash = together.find(other => !over(other.id, entry.id) && !over(entry.id, other.id) &&
      other.rects.some((rect, at) => rectsOverlap(rect, entry.rects[at]!)));
    if (clash) { refuse(`shares the screen with "${clash.id}" at the same time on an overlapping footprint: move one of them or its words`); continue; }
    const crowd = overlayCrowd(together, entry.range);
    if (crowd) refuse(`would be on screen together with ${crowd.map(other => `"${other.id}"`).join(", ")}: at most ${MAX_OVERLAYS_AT_ONCE} ` +
      "overlays and templates show at once");
  }
  for (const overlay of overlays) {
    if (fulls.some(other => overlaps(other.range, overlay.range)) && coveredBy(overlay.range, [...inserts, ...fulls].map(other => other.range))) {
      refusals.push({ path: ["overlays", input.overlays!.indexOf(overlay.item)], message: `overlay "${overlay.item.id}" lies wholly under full-frame inserts or templates` });
    }
  }
  return refusals;
}
