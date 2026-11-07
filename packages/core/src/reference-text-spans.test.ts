import { describe, expect, it } from "vitest";
import { cleanReferenceSpan, type ReferenceTextProfile } from "./reference-text-spans.js";

/** #1103 D12: a reference clip is cut where no burned-in text shows, else its text boxes are masked, else it is refused. */

type Overrides = { captions?: Partial<ReferenceTextProfile["captions"]> } & Record<string, unknown>;
const profile = ({ captions, ...rest }: Overrides = {}): ReferenceTextProfile => ({
  source: { digest: `sha256:${"a".repeat(64)}`, duration_s: 10, width: 1080, height: 1920 },
  beats: [{ start_s: 0, end_s: 5, graphics: [] }, { start_s: 5, end_s: 10, graphics: [] }],
  captions: { present: false, words_per_caption_max: 3, position: "lower", emphasis_style: "none", hidden_under_graphics: false, ...captions },
  ...rest,
}) as unknown as ReferenceTextProfile;
const words = (...spans: [number, number][]) => spans.map(([start_s, end_s]) => ({ text: "word", start_s, end_s }));
const element = (extra: Record<string, unknown>) => ({ id: "e1", beat_index: 1, graphic_index: 0, kind: "title_card", ...extra });
const LOWER_BAND = { left: 0, top: 0.53, width: 1, height: 0.34 };

describe("cleanReferenceSpan", () => {
  it("keeps the whole span when no text shows in it", () => {
    expect(cleanReferenceSpan(profile(), { start_s: 1, end_s: 6 }, 2)).toEqual({ kind: "clean", start_s: 1, end_s: 6 });
    // Captions outside the span, their hold included, do not touch it.
    const said = profile({ captions: { present: true }, transcript: words([0, 0.5], [8, 9]) });
    expect(cleanReferenceSpan(said, { start_s: 1, end_s: 7.5 }, 2)).toEqual({ kind: "clean", start_s: 1, end_s: 7.5 });
  });

  // Mutants: take the first free stretch instead of the longest, or forget the caption hold after each word.
  it("picks the longest text-free stretch of the span when it is long enough", () => {
    const said = profile({ captions: { present: true }, transcript: words([1, 2], [7, 8]) });
    expect(cleanReferenceSpan(said, { start_s: 0, end_s: 10 }, 3)).toEqual({ kind: "clean", start_s: 2.4, end_s: 7 });
    expect(cleanReferenceSpan(said, { start_s: 7.5, end_s: 10 }, 1.5)).toEqual({ kind: "clean", start_s: 8.4, end_s: 10 });
  });

  // A captioned ad reel: captions on every spoken word from 3 to 6 s, at the lower position, no box measured.
  it("masks the lower caption band when captions cover all of the speech", () => {
    const dense = Array.from({ length: 10 }, (_, at) => [3 + at * 0.3, 3 + at * 0.3 + 0.25] as [number, number]);
    const said = profile({ captions: { present: true, position: "lower" }, transcript: words(...dense) });
    expect(cleanReferenceSpan(said, { start_s: 3, end_s: 6 }, 2)).toEqual({ kind: "masked", start_s: 3, end_s: 6, boxes: [LOWER_BAND] });
  });

  // Mutant: ignore the measured box, or the speakers' boxes, and mask the guessed band instead.
  it("masks the measured caption box, else the union of the speakers' caption boxes, padded and kept in the frame", () => {
    const said = { transcript: words([1, 9]) };
    expect(cleanReferenceSpan(profile({ captions: { present: true, box: { left: 0.1, top: 0.6, width: 0.8, height: 0.1 } }, ...said }), { start_s: 2, end_s: 5 }, 2))
      .toEqual({ kind: "masked", start_s: 2, end_s: 5, boxes: [{ left: 0.08, top: 0.58, width: 0.84, height: 0.14 }] });
    const caption = (box: object) => ({ colour: null, style: "bold", position: null, box });
    const speakers = [{ id: "presenter", caption: caption({ left: 0.2, top: 0.4, width: 0.3, height: 0.1 }) },
      { id: "off_screen_1", caption: caption({ left: 0.5, top: 0.7, width: 0.49, height: 0.29 }) }, { id: "on_screen_2", caption: null }];
    expect(cleanReferenceSpan(profile({ captions: { present: true }, speakers, ...said }), { start_s: 2, end_s: 5 }, 2))
      .toEqual({ kind: "masked", start_s: 2, end_s: 5, boxes: [{ left: 0.18, top: 0.38, width: 0.82, height: 0.62 }] });
  });

  it("times captions by segments without a transcript, and over the whole reel without either", () => {
    const segments = [{ start_s: 1, end_s: 2, text: "x", speaker: "presenter", frames_s: [1] }];
    expect(cleanReferenceSpan(profile({ captions: { present: true }, segments }), { start_s: 0, end_s: 10 }, 3))
      .toEqual({ kind: "clean", start_s: 2.4, end_s: 10 });
    expect(cleanReferenceSpan(profile({ captions: { present: true, position: "top" } }), { start_s: 0, end_s: 10 }, 3))
      .toEqual({ kind: "masked", start_s: 0, end_s: 10, boxes: [{ left: 0, top: 0.03, width: 1, height: 0.29 }] });
  });

  // Mutants: read a staging element's times from its beat when it measured its own, or mask an element without a box.
  it("uses a staging element's own visible interval and box, and refuses one without a box", () => {
    const rect = { left: 0.2, top: 0.2, width: 0.6, height: 0.2 };
    const beats = [{ start_s: 0, end_s: 5, graphics: [] }, { start_s: 5, end_s: 10, graphics: [{ kind: "title_card" }] }];
    const timed = (rect_hold?: object) => profile({ beats, staging: { elements: [element({ ...rect_hold ? { rect_hold } : {},
      entry: { first_visible_s: 6 }, exit: { last_visible_s: 7 } })] } });
    expect(cleanReferenceSpan(timed(rect), { start_s: 5, end_s: 10 }, 2)).toEqual({ kind: "clean", start_s: 7, end_s: 10 });
    expect(cleanReferenceSpan(timed(rect), { start_s: 5, end_s: 8.5 }, 2))
      .toEqual({ kind: "masked", start_s: 5, end_s: 8.5, boxes: [{ left: 0.18, top: 0.18, width: 0.64, height: 0.24 }] });
    expect(cleanReferenceSpan(timed(), { start_s: 5, end_s: 8.5 }, 2))
      .toEqual({ kind: "refused", reason: "a title card at 6–7 s has no box to mask, and no 2 s of the span is free of text" });
    // Without its own times the element holds its beat.
    const untimed = profile({ beats, staging: { elements: [element({ rect_hold: rect })] } });
    expect(cleanReferenceSpan(untimed, { start_s: 3, end_s: 10 }, 1.5)).toEqual({ kind: "clean", start_s: 3, end_s: 5 });
  });

  // Mutant: treat a graphic the staging did not measure as text-free.
  it("refuses a beat graphic the staging did not measure, which has no box", () => {
    const beats = [{ start_s: 0, end_s: 5, graphics: [] }, { start_s: 5, end_s: 10, graphics: [{ kind: "stat" }] }];
    expect(cleanReferenceSpan(profile({ beats }), { start_s: 4, end_s: 10 }, 2))
      .toEqual({ kind: "refused", reason: "a stat at 5–10 s has no box to mask, and no 2 s of the span is free of text" });
    expect(cleanReferenceSpan(profile({ beats }), { start_s: 2, end_s: 10 }, 2)).toEqual({ kind: "clean", start_s: 2, end_s: 5 });
  });

  it("refuses a span shorter than the minimum or outside the reel", () => {
    expect(cleanReferenceSpan(profile(), { start_s: 2, end_s: 3 }, 2).kind).toBe("refused");
    expect(cleanReferenceSpan(profile(), { start_s: 9, end_s: 14 }, 2).kind).toBe("refused");
    expect(cleanReferenceSpan(profile(), { start_s: 1, end_s: 6 }, 0).kind).toBe("refused");
  });
});
