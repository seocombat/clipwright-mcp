import type { ReferenceProfileInput } from "./reference-profile.js";
import type { StagingRect } from "./reference-staging.js";

// Burned-in text never reaches a vendor in a reference clip (#1103 D12): a span free of it, else its boxes masked, else no clip.

/** What the reference's text says about a span: free of text, free once the boxes are masked, or unusable. */
export type ReferenceSpanVerdict =
  | { kind: "clean"; start_s: number; end_s: number }
  | { kind: "masked"; start_s: number; end_s: number; boxes: StagingRect[] }
  | { kind: "refused"; reason: string };
export type ReferenceTextProfile = Pick<ReferenceProfileInput, "source" | "beats" | "captions" | "transcript" | "segments" | "speakers" | "staging">;

/** A caption stays up a little after its last word is spoken. */
export const CAPTION_HOLD_S = 0.4;
export const MASK_PADDING = 0.02;
/** Where a caption block of each position sits when no box was measured: a full-width band. */
const CAPTION_BANDS: Record<ReferenceTextProfile["captions"]["position"], readonly [number, number]> = {
  top: [0.05, 0.3], middle: [0.35, 0.65], lower: [0.55, 0.85], bottom: [0.7, 0.95],
};
type Text = { start: number; end: number; box?: StagingRect; what: string };
const ms = (value: number) => Math.round(value * 1000) / 1000;
const unit = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;

function union(boxes: readonly StagingRect[]): StagingRect | undefined {
  if (!boxes.length) return undefined;
  const left = Math.min(...boxes.map(box => box.left)), top = Math.min(...boxes.map(box => box.top));
  return { left, top, width: Math.max(...boxes.map(box => box.left + box.width)) - left, height: Math.max(...boxes.map(box => box.top + box.height)) - top };
}

/** Every stretch of the reference that shows text or a graphic, with its box when one was measured. */
function referenceTexts(profile: ReferenceTextProfile): Text[] {
  const duration = profile.source.duration_s, texts: Text[] = [];
  if (profile.captions.present) {
    const [top, bottom] = CAPTION_BANDS[profile.captions.position];
    const box = profile.captions.box ?? union(profile.speakers?.flatMap(speaker => speaker.caption?.box ?? []) ?? [])
      ?? { left: 0, top, width: 1, height: bottom - top };
    // Without word times the captions may be anywhere in the reel.
    const said = profile.transcript?.length ? profile.transcript : profile.segments?.length ? profile.segments : [{ start_s: 0, end_s: duration }];
    for (const word of said) texts.push({ start: word.start_s, end: word.end_s + CAPTION_HOLD_S, box, what: "a caption" });
  }
  const elements = profile.staging?.elements ?? [];
  for (const element of elements) {
    const beat = profile.beats[element.beat_index];
    texts.push({ start: element.entry?.first_visible_s ?? beat?.start_s ?? 0, end: element.exit?.last_visible_s ?? beat?.end_s ?? duration,
      ...(element.rect_hold ? { box: element.rect_hold } : {}), what: `a ${element.kind.replaceAll("_", " ")}` });
  }
  profile.beats.forEach((beat, index) => {
    beat.graphics.forEach((graphic, at) => {
      if (!elements.some(element => element.beat_index === index && element.graphic_index === at)) {
        texts.push({ start: beat.start_s, end: beat.end_s, what: `a ${graphic.kind.replaceAll("_", " ")}` });
      }
    });
  });
  return texts;
}

/** The part of `want` a reference clip may use: the span itself when no text shows, else the longest text-free stretch of at least
 *  `minSeconds`, else the span with every text box masked, else a refusal naming the text that has no box. */
export function cleanReferenceSpan(profile: ReferenceTextProfile, want: { start_s: number; end_s: number }, minSeconds: number): ReferenceSpanVerdict {
  const start = Math.max(0, want.start_s), end = Math.min(profile.source.duration_s, want.end_s);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(minSeconds > 0) || end - start < minSeconds) {
    return { kind: "refused", reason: `the span ${want.start_s}–${want.end_s} s holds less than ${minSeconds} s of the reference` };
  }
  const texts = referenceTexts(profile).filter(text => text.start < end && start < text.end);
  if (!texts.length) return { kind: "clean", start_s: ms(start), end_s: ms(end) };
  let cursor = start, free = { start, end: start };
  for (const text of [...texts].sort((a, b) => a.start - b.start)) {
    if (text.start - cursor > free.end - free.start) free = { start: cursor, end: text.start };
    cursor = Math.max(cursor, text.end);
  }
  if (end - cursor > free.end - free.start) free = { start: cursor, end };
  if (free.end - free.start >= minSeconds) return { kind: "clean", start_s: ms(free.start), end_s: ms(free.end) };
  const bare = texts.find(text => !text.box);
  if (bare) {
    return { kind: "refused", reason: `${bare.what} at ${ms(Math.max(start, bare.start))}–${ms(Math.min(end, bare.end))} s has no box to mask, ` +
      `and no ${minSeconds} s of the span is free of text` };
  }
  const boxes = new Map<string, StagingRect>();
  for (const { box } of texts) {
    const left = unit(box!.left - MASK_PADDING), top = unit(box!.top - MASK_PADDING);
    const padded = { left, top, width: unit(unit(box!.left + box!.width + MASK_PADDING) - left), height: unit(unit(box!.top + box!.height + MASK_PADDING) - top) };
    boxes.set(JSON.stringify(padded), padded);
  }
  return { kind: "masked", start_s: ms(start), end_s: ms(end), boxes: [...boxes.values()] };
}
