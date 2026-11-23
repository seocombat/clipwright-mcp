import { z } from "zod";
import { captionLanguageOf } from "../caption-language.js";
import { lexicalTokens, quoteOccurrences } from "../semantic-inserts.js";
import { admissionFramings, admissionScene, type AnchoredItem, faceZone, frameCanvasOf, type LayerCheckInput, type LayerRect, type LayerRefusal, layerWordRange,
  MAX_OVERLAYS_AT_ONCE, overlayCrowd, overlayFootprints, placedRefusals, type PlaceableOverlay, type PresenterFraming, rectsOverlap, type WordRange } from "../ugc-layers.js";
import { placeAnchorOf, placeByCaptions, type Place } from "../scene-place.js";
import { callout } from "./callout.js";
import { chatWindow, chatWindowV1 } from "./chat-window.js";
import { checklist } from "./checklist.js";
import { compare, compareV1, compareV2 } from "./compare.js";
import { backdrop } from "./backdrop.js";
import { coverStory } from "./cover-story.js";
import { endCard } from "./end-card.js";
import { lowerThird, lowerThirdV1 } from "./lower-third.js";
import { notification, notificationV1 } from "./notification.js";
import { phoneCall } from "./phone-call.js";
import { phoneScreen } from "./phone-screen.js";
import { pointerChips } from "./pointer-chips.js";
import { chart } from "./chart.js";
import { handTitle } from "./hand-title.js";
import { race } from "./race.js";
import { CANVAS_FPS } from "../media-timebase.js";
import { estimateWordsPerSecond, PAUSE_TRIM_PACE_FACTOR } from "../pacing.js";
import { SERIES_MAX_FRAMES, seriesFrame } from "./series-frame.js";
import { commentCta } from "./comment-cta.js";
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


export const TEMPLATE_PLACEMENTS = ["over", "full"] as const;
export type TemplatePlacement = (typeof TEMPLATE_PLACEMENTS)[number];
export const MAX_TEMPLATES = 40;
export { contrastRatio, DEFAULT_TEMPLATE_PRESET, TEMPLATE_MIN_CONTRAST, TEMPLATE_PRESET_SURFACES, TEMPLATE_PRESETS, templateAccentRefusal, templateTheme,
  type TemplatePreset, type TemplateTheme } from "./theme.js";

export interface TemplateKind<D extends z.ZodObject = z.ZodObject> {
  kind: string;
  kindVersion: number;
  description: string;
  placements: readonly TemplatePlacement[];
  data: D;
  text: Readonly<Record<string, number>>;
  quotes?: readonly string[];
  spreads?: string;
  beatsFrom?: number;
  firstBeatAtStart?: true;
  fillsFrame?: true;
  cutout?: true;
  slots: Readonly<Record<string, TemplateSlot>>;
  maxMedia?: number;
  aspects?: readonly string[];
  timing?(data: z.infer<D>, beats: readonly (number | undefined)[], duration: number, fps: number, id: string, most: number):
    { moments: number[]; warnings: string[]; frames?: number };
  check?(data: z.infer<D>, context: { language: string; endsScript: boolean }): { path: (string | number)[]; message: string }[];
  hidesCaptions(data: z.infer<D>): boolean;
  onInserts: boolean;
  rect(data: z.infer<D>, aspectRatio: string, placement?: TemplatePlacement, framing?: PresenterFraming): LayerRect;
  parts?(data: z.infer<D>, aspectRatio: string, framing?: PresenterFraming): Record<string, LayerRect>;
  faceRect?(data: z.infer<D>, aspectRatio: string, framing?: PresenterFraming): LayerRect | undefined;
  sample: z.infer<D>;
}

export const TEMPLATE_KINDS: readonly TemplateKind[] = [tag, lowerThird, endCard, titleCard, quote, stat, callout, checklist, phoneCall, compare,
  notification, progress, rating, chatWindow, videoGrid, wordTitle, phoneScreen, terminal, pointerChips, chart, race, handTitle, wordFill,
  coverStory, seriesFrame, commentCta, backdrop] as unknown as readonly TemplateKind[];
export const TEMPLATE_KIND_IDS = ["tag", "lower_third", "end_card", "title_card", "quote", "stat", "callout", "checklist", "phone_call", "compare",
  "notification", "progress", "rating", "chat_window", "video_grid", "word_title", "phone_screen", "terminal", "pointer_chips", "chart", "race",
  "hand_title", "word_fill", "cover_story", "series_frame", "comment_cta", "backdrop"] as const;
export function offeredTemplateKinds(kinds: readonly TemplateKind[] = TEMPLATE_KINDS): readonly TemplateKind[] {
  return kinds;
}
export const TEMPLATE_KIND_HISTORY: readonly TemplateKind[] = [{ ...phoneCall, kindVersion: 1 } as TemplateKind,
  ...[chatWindowV1, notificationV1, terminalV1, lowerThirdV1, compareV1, compareV2] as unknown as TemplateKind[]];

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
export { BACKDROP_NOTES_STYLES, BACKDROP_PICTURE_STYLES, BACKDROP_STYLES, type BackdropStyle } from "./backdrop.js";
export { SERIES_ASPECT, SERIES_ITEM_FLOOR_SEC, SERIES_ITEM_LOOKS, SERIES_ITEMS, SERIES_LOOP_FRAMES,
  SERIES_MAX_FRAMES, SERIES_ONE_COLUMN_MAX, seriesFitWarnings, seriesFrameMoments, seriesLeastFrames } from "./series-frame.js";
export { commentCtaActLines, commentCtaMoments, commentCtaSchedule, CTA_ASPECT, CTA_FUNNEL, CTA_ITEMS, CTA_LABELS, CTA_LINE_GAP,
  CTA_LINES, CTA_LOOP_FRAMES } from "./comment-cta.js";
export { templateMedia, type TemplateSlot } from "./slot.js";

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

export const TEMPLATE_ENTER_FRAMES = 8;

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

export function templateLeadFrames(kind: TemplateKind, data: unknown, tokens: readonly string[], range: WordRange,
  words: readonly { word: string; startSec: number }[], fps: number, span: { startFrame: number }): number {
  const first = kind.firstBeatAtStart ? undefined : templateMomentWords(kind, data, tokens, range)[0];
  if (first?.word === undefined) return 0;
  const lexical = words.filter(word => !/^\p{P}+$/u.test(word.word)), from = kind.beatsFrom ?? TEMPLATE_ENTER_FRAMES + 1;
  const at = Math.round(lexical[first.word]!.startSec * fps) - span.startFrame;
  return Math.max(0, Math.min(from - at, from, span.startFrame));
}

export const TEMPLATE_BEAT_GAP = 6;

export function templateMoments(kind: TemplateKind, data: unknown, tokens: readonly string[], range: WordRange,
  words: readonly { word: string; startSec: number }[], fps: number, span: { startFrame: number; endFrame: number }, id = "template",
  most = span.endFrame): { moments: number[]; warnings: string[]; frames?: number } {
  const lexical = words.filter(word => !/^\p{P}+$/u.test(word.word)), duration = span.endFrame - span.startFrame;
  const beats = templateMomentWords(kind, data, tokens, range), from = kind.beatsFrom ?? TEMPLATE_ENTER_FRAMES + 1, warnings: string[] = [];
  const inside = (result: { moments: number[]; warnings: string[]; frames?: number }) => {
    const length = result.frames ?? duration;
    if (!Number.isSafeInteger(length) || length < duration || span.startFrame + length > Math.max(most, span.endFrame) ||
        result.moments.some(moment => !Number.isSafeInteger(moment) || moment < 0 || moment >= length)) throw new Error("a beat lies outside the template's frames");
    return result;
  };
  if (kind.timing) {
    for (const beat of beats) if (beat.refusal) throw new Error(`template beat ${beat.path.join(".")} ${beat.refusal}`);
    return inside(kind.timing(data as never, beats.map(beat => (beat.word === undefined ? undefined
      : Math.max(0, Math.round(lexical[beat.word]!.startSec * fps) - span.startFrame))), duration, fps, id, Math.max(most, span.endFrame) - span.startFrame));
  }
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
  return inside({ moments, warnings });
}

export const HOLDING_TEMPLATE_KINDS: readonly string[] = ["series_frame", "comment_cta"];

export function heldTemplateReason(template: { id: string; kind: string; data: unknown }): string {
  return template.kind === "comment_cta" ? `every act of template "${template.id}" plays, the follow button tapped`
    : `all ${(template.data as { items: unknown[] }).items.length} items of template "${template.id}" show`;
}

export function commentCtaFitWarnings(input: { script?: unknown; templates?: unknown; pause_trim?: unknown }): string[] {
  if (typeof input.script !== "string" || !Array.isArray(input.templates)) return [];
  const tokens = lexicalTokens(input.script), trimmed = typeof input.pause_trim === "object" && input.pause_trim !== null;
  const pace = estimateWordsPerSecond(input.script) * (trimmed ? PAUSE_TRIM_PACE_FACTOR : 1);
  const words = tokens.map((word, at) => ({ word, startSec: at / pace }));
  return (input.templates as Partial<AnchoredItem & { kind: string; data: unknown }>[]).flatMap(item => {
    const data = item.kind === "comment_cta" && item.anchor ? commentCta.data.safeParse(item.data).data : undefined;
    const range = data ? layerWordRange(tokens, item as AnchoredItem) : undefined, id = String(item.id);
    if (!data || range === undefined || typeof range === "string") return [];
    const span = { startFrame: Math.round((range.startWord / pace) * CANVAS_FPS), endFrame: Math.round((range.coverWord / pace) * CANVAS_FPS) };
    let frames: number | undefined;
    try { frames = templateMoments(commentCta as TemplateKind, data, tokens, range, words, CANVAS_FPS, span, id, span.endFrame + SERIES_MAX_FRAMES).frames; }
    catch { return []; }
    if (frames === undefined) return [];
    const spoken = (span.endFrame - span.startFrame) / CANVAS_FPS, more = ((frames - span.endFrame + span.startFrame) / CANVAS_FPS).toFixed(1);
    const past = span.startFrame + frames - Math.round((tokens.length / pace) * CANVAS_FPS);
    return [`template "${id}": its sentence gives about ${spoken.toFixed(1)} s and its comment, message and follow need about ${more} s more; ` +
      `${past > 0 ? `the video runs ${(past / CANVAS_FPS).toFixed(1)} s past its last word so ${heldTemplateReason({ id, kind: "comment_cta", data })}`
        : "the call to action will run on past it and the next template starts later"}; lengthen the sentence to keep the call to action on it`];
  });
}
function mostValuesAt(schema: z.ZodType, keys: readonly string[]): number {
  const def = schema._zod.def as { type: string; innerType?: z.ZodType; element?: z.ZodType };
  if (def.type === "optional") return mostValuesAt(def.innerType!, keys);
  if (def.type === "array") {
    const { maxItems } = z.toJSONSchema(schema, { unrepresentable: "any" }) as { maxItems?: number };
    if (maxItems === undefined) throw new Error(`a template list has no most length (${keys.join(".")})`);
    return maxItems * mostValuesAt(def.element!, keys);
  }
  if (!keys.length) return 1;
  const [key, ...rest] = keys as [string, ...string[]], inner = def.type === "object" ? (schema as z.ZodObject).shape[key] : undefined;
  if (!inner) throw new Error(`a template quote names no field ${keys.join(".")}`);
  return mostValuesAt(inner as z.ZodType, rest);
}
function mostBeatsOf(kind: TemplateKind): number {
  const at = (field: string) => mostValuesAt(kind.data, field.split("."));
  return Math.max(kind.spreads ? at(kind.spreads) : 0, (kind.quotes ?? []).reduce((sum, field) => sum + at(field), 0));
}
const FROZEN_KINDS = [...TEMPLATE_KINDS, ...TEMPLATE_KIND_HISTORY];
export const MAX_MOMENTS_PER_TEMPLATE = Math.max(1, ...FROZEN_KINDS.map(mostBeatsOf));
export const MAX_MEDIA_PER_TEMPLATE = Math.max(1, ...FROZEN_KINDS.map(kind => kind.maxMedia ?? Object.keys(kind.slots).length));
export const MAX_TEMPLATE_MEDIA = MAX_TEMPLATES * MAX_MEDIA_PER_TEMPLATE;

export function templateVariants(kind: TemplateKind): { key: string; placement: TemplatePlacement; data: Record<string, unknown> }[] {
  const sample = kind.sample as Record<string, unknown>;
  return [...kind.placements.map(placement => ({ key: `placement:${placement}`, placement, data: sample })),
    ...Object.entries(kind.data.shape).flatMap(([field, schema]) => {
      const inner = (schema as unknown as { unwrap?: () => unknown }).unwrap?.() ?? schema;
      return ((inner as { options?: readonly string[] }).options ?? [])
        .map(option => ({ key: `${field}:${option}`, placement: kind.placements[0]!, data: { ...sample, [field]: option } }));
    })];
}

export function templateMediaOf(templates: readonly { id: string; kind: string; data: Record<string, unknown> }[] | undefined):
  { index: number; id: string; slot: string; path?: string; asset_id: string; media_type: "image" | "video"; cover?: number | undefined }[] {
  return (templates ?? []).flatMap((item, index) => Object.entries(TEMPLATE_KINDS.find(kind => kind.kind === item.kind)?.slots ?? {}).flatMap(([slot, takes]) =>
    templateFieldValues(item.data, slot).flatMap(({ path, value }) => {
      const media = value as { asset_id?: unknown } | undefined;
      return typeof media?.asset_id === "string" ? [{ index, id: item.id, slot: path.join("_"), ...(path.length > 1 ? { path: path.join(".") } : {}),
        asset_id: media.asset_id, media_type: takes.type, cover: takes.cover }] : [];
    })));
}

const RANGES = (pairs: number[]) => pairs.flatMap((value, index): [number, number][] => (index % 2 ? [] : [[value, pairs[index + 1]!]]));
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

export function templateCharRanges(language: string): [number, number][] {
  return [...LATIN, ...COMMON, ...(EXTRA[language] ?? [])];
}

const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u{3000}-\u{303f}\u{ff01}-\u{ff60}\u{ffe0}-\u{ffe6}]/u;
export const textUnits = (text: string): number => Array.from(text).reduce((sum, char) => sum + (WIDE.test(char) ? 2 : 1), 0);

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

export function templateSceneItems(input: { templates?: readonly TemplateItem[] | undefined; aspect_ratio?: string | undefined },
  framing: PresenterFraming, kinds: readonly TemplateKind[] = TEMPLATE_KINDS): PlaceableOverlay[] {
  return (input.templates ?? []).flatMap(item => {
    const kind = kinds.find(entry => entry.kind === item.kind), parsed = kind?.data.safeParse(item.data);
    if (!kind || !parsed?.success || (item.placement ?? kind.placements[0]) !== "over") return [];
    return [{ id: item.id, anchor: item.anchor, cover_words: item.cover_words, place: item.place,
      own: kind.rect(parsed.data, input.aspect_ratio ?? "9:16", undefined, framing) }];
  });
}

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

export function templateSizeWarnings(input: { templates?: unknown }): string[] {
  if (!Array.isArray(input.templates)) return [];
  return (input.templates as { id?: unknown; kind?: unknown; data?: { size?: unknown } }[]).flatMap(item =>
    item.data?.size === "large" && TEMPLATE_KINDS.find(entry => entry.kind === item.kind)?.fillsFrame
      ? [`template "${String(item.id)}" is drawn at medium: a ${String(item.kind)} already fills the frame there, so size large draws no larger`] : []);
}

export function hasFullFrameTemplate(templates: unknown): boolean {
  return Array.isArray(templates) && (templates as { kind?: unknown; placement?: unknown }[]).some(item =>
    (item.placement ?? TEMPLATE_KINDS.find(kind => kind.kind === item.kind)?.placements[0]) === "full");
}

export function templateFaceWarnings(input: { templates?: unknown; aspect_ratio?: unknown; presenter_framing?: unknown }): string[] {
  if (!Array.isArray(input.templates)) return [];
  const aspect = typeof input.aspect_ratio === "string" ? input.aspect_ratio : "9:16";
  const framing = input.presenter_framing === "wide" || input.presenter_framing === "full" ? input.presenter_framing : "close";
  return (input.templates as { id?: unknown; kind?: unknown; placement?: unknown; data?: unknown; place?: unknown }[]).flatMap(item => {
    const kind = TEMPLATE_KINDS.find(entry => entry.kind === item.kind);
    const placement = item.placement ?? kind?.placements[0];
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
    const { minItems, maxItems } = z.toJSONSchema(schema, { unrepresentable: "any" }) as { minItems?: number; maxItems?: number };
    return `${key} ${minItems ?? 0}–${maxItems} of ${catalogField(kind, "", def.element!, path).trim()}`;
  }
  if (def.type === "object") {
    const shape = Object.entries((schema as z.ZodObject).shape);
    const deep = [...Object.keys(kind.text), ...(kind.quotes ?? [])].some(name => name.startsWith(`${path}.`));
    return `${key} {${deep ? shape.map(([name, inner]) => catalogField(kind, name, inner as z.ZodType, `${path}.${name}`)).join(", ") : shape.map(([name]) => name).join(",")}}`;
  }
  if (kind.quotes?.includes(path)) return `${key} inner quote`;
  return options ? `${key} ${options.join("|")}` : `${key} ≤ ${kind.text[path]}`;
}

export function templateDataText(kind: TemplateKind): string {
  return Object.entries(kind.data.shape).map(([key, schema]) => catalogField(kind, key, schema as z.ZodType)).join(", ");
}

export function templateCatalogText(kinds: readonly TemplateKind[] = offeredTemplateKinds()): string {
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
    kinds.filter(kind => kind.cutout).map(kind => `A ${kind.kind} keeps the presenter in front of it, drawn as a full frame otherwise. `).join("") +
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
  image?: unknown;
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
  framing?: unknown;
  interview?: unknown;
  presenter_gaze?: unknown;
  end_hold_s?: unknown;
}

const MORE_THAN_A_TAKE = ["inserts", "overlays", "layout_windows", "framing", "call", "interview", "presenter_gaze", "end_hold_s", "shots"] as const;

export function templateRefusals(input: TemplateCheckInput, kinds: readonly TemplateKind[] = TEMPLATE_KINDS): LayerRefusal[] {
  if (input.templates === undefined) {
    const sounds = input.template_sounds;
    const named = typeof sounds === "object" && sounds !== null ? Object.keys(sounds) : [];
    const editOnly = (sounds === false && input.edit_sounds === true) || (named.length > 0 && named.every(beat => beat === "edit"));
    const shotSounds = (input.shots ?? []).some(shot => shot.transition !== undefined && shot.transition !== "cut") &&
      (sounds === false || named.every(beat => beat === "flash" || beat === "whoosh" || beat === "edit"));
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
  const framings: PresenterFraming[] = admissionFramings({ ...input, aspect_ratio: aspect });
  const scenes = framings.map(framing => {
    const scene = admissionScene(input, aspect, framing), items = [...input.overlays ?? [], ...templateSceneItems(input, framing, kinds)];
    return { items, boxes: overlayFootprints(items, aspect, framing, scene), face: scene.face };
  });
  const overlays = ranged(input.overlays).flatMap(entry => {
    const rects = scenes.map(({ boxes }) => boxes.get(entry.item.id));
    return rects.every(rect => rect !== undefined) ? [{ ...entry, rects: rects as LayerRect[] }] : [];
  });
  const items = scenes[0]!.items, canvas = frameCanvasOf(aspect);
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
    if (!kind) {
      refusals.push({ path: at("kind"), message: `unknown template kind "${item.kind}": use one of ${offeredTemplateKinds(kinds).map(entry => entry.kind).join(", ")}` });
      continue;
    }
    if (kind.aspects && (input.aspect_ratio === undefined ? input.image !== undefined : !kind.aspects.includes(input.aspect_ratio))) {
      refusals.push({ path: input.aspect_ratio === undefined ? at("kind") : ["aspect_ratio"], message: `${kind.kind} is drawn in ${kind.aspects.join(" or ")} only: ` +
        `pass aspect_ratio ${kind.aspects[0]}${input.aspect_ratio === undefined ? " with image" : ""}, or use another template kind` });
    }
    const parsed = kind.data.safeParse(item.data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) refusals.push({ path: at("data", ...issue.path.map(String)), message: `${item.kind}: ${issue.message}` });
      continue;
    }
    const placement = item.placement ?? kind.placements[0]!;
    const beyond = kind.cutout ? MORE_THAN_A_TAKE.filter(field => input[field] !== undefined) : [];
    if (beyond.length) refusals.push({ path: at("kind"), message: `${item.kind} takes a plain script run, without ${beyond.join(", ")}` });
    if (!kind.placements.includes(placement)) refusals.push({ path: at("placement"), message: `${item.kind} takes placement ${kind.placements.join(" or ")}, not ${placement}` });
    if (item.transition !== undefined && placement !== "full") refusals.push({ path: at("transition"), message: "transition works on a full-frame template only" });
    for (const [field, limit] of Object.entries(kind.text)) for (const { path, value } of templateFieldValues(parsed.data, field)) {
      const why = typeof value === "string" ? templateTextRefusal(value, limit, language) : undefined;
      if (why) refusals.push({ path: at("data", ...path), message: `${item.kind} ${path.join(".")} ${why}` });
    }
    const range = layerWordRange(tokens, item);
    if (typeof range === "string") { refusals.push({ path: at("anchor"), message: `template "${item.id}": ${range}` }); continue; }
    for (const why of kind.check?.(parsed.data, { language, endsScript: range.coverWord >= tokens.length }) ?? []) {
      refusals.push({ path: at("data", ...why.path), message: why.message });
    }
    const beats = templateMomentWords(kind, parsed.data, tokens, range);
    for (const beat of beats) if (beat.refusal) refusals.push({ path: at("data", ...beat.path), message: `template "${item.id}" ${beat.path.join(".")} ${beat.refusal}` });
    const footprints = framings.map(framing => templateFootprint({ kind: item.kind, placement, data: parsed.data as Record<string, unknown> }, aspect, kinds,
      undefined, framing));
    let rects = footprints.map(footprint => footprint.rect);
    if (item.place) {
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
