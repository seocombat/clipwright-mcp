import { describe, expect, it } from "vitest";
import { editableContext, facelessPlanFixture, frozen, longFormShotsFixture } from "./__fixtures__/edit-views.fixture.js";
import {
  EDIT_DOCUMENT_MAX_BYTES, applyShotChanges as applyChanges, editDocument, identityEditDocument as identityOf, runEdit,
  runEditPath, runEditRead, saveRunEdit, serializeEditDocument,
} from "./edit-document.js";
import { facelessRunShots } from "./edit-faceless.js";
import { shotId, shotOperation } from "./edit-operations.js";
import type { ViewShot } from "./edit-shots.js";
import { EDIT_ISSUE_CODES, validateEditDocument } from "./edit-validate.js";
import { uploadId, uploadResponse } from "./uploads.js";

// Both functions take frozen arguments here: one that writes to its input throws.
const identityEditDocument: typeof identityOf = view => identityOf(frozen(view));
const applyShotChanges: typeof applyChanges = (document, changes) => applyChanges(frozen(document), frozen(changes));

const faceless = () => facelessRunShots(facelessPlanFixture(), editableContext());
const UNCHANGED = { retimed: [], deleted: [], added: [], replaced: [], generated: [], changed: false };

describe("the edit document", () => {
  it("the identity document of a view validates with an empty summary and `changed: false`", () => {
    for (const view of [faceless(), longFormShotsFixture()]) {
      const document = identityEditDocument(view);
      expect(editDocument.parse(document)).toEqual(document);
      expect(document.shots.map(shot => shot.id)).toEqual(view.tracks.flatMap(track => track.shots.map(shot => shot.id)));
      expect(document.shots.every(shot => shot.asset.from === "source" && shot.asset.shot_id === shot.id)).toBe(true);
      expect(validateEditDocument(document, view, { candidates: {}, uploads: {} })).toEqual({ ok: true, summary: UNCHANGED });
    }
    // A view's offset is copied; a shot without one states none.
    const shots = identityEditDocument(longFormShotsFixture()).shots;
    expect(shots.find(shot => shot.id === "take-2")).toMatchObject({ media_offset_frames: 0 });
    expect(shots.find(shot => shot.id === "insert-1")).not.toHaveProperty("media_offset_frames");

    // Values no default equals: 30 fps, a clip 3 frames into its footage, a take 40 frames into its recording.
    const long = longFormShotsFixture();
    const moved: Record<string, Partial<ViewShot>> = { "insert-2": { media_offset_frames: 3 }, "take-2": { media_offset_frames: 40, media_frames: 640 } };
    const shifted = { ...long, timebase: { fps: 30 },
      tracks: long.tracks.map(track => ({ ...track, shots: track.shots.map(shot => ({ ...shot, ...moved[shot.id] })) })) };
    const identity = identityEditDocument(shifted);
    expect(identity.timebase).toEqual({ fps: 30 });
    expect(identity.shots.flatMap(shot => shot.media_offset_frames ? [[shot.id, shot.media_offset_frames]] : [])).toEqual([["take-2", 40], ["insert-2", 3]]);
    expect(validateEditDocument(identity, shifted, { candidates: {}, uploads: {} })).toEqual({ ok: true, summary: UNCHANGED });
    // A document that states no offset keeps the source's.
    const silent = { ...identity, shots: identity.shots.map(({ media_offset_frames, ...shot }) => shot) };
    expect(validateEditDocument(silent, shifted, { candidates: {}, uploads: {} })).toEqual({ ok: true, summary: UNCHANGED });
  });

  it("the document schema refuses an unknown key, a fractional frame and a negative frame", () => {
    const document = identityEditDocument(faceless());
    const withFirstShot = (change: object) => ({ ...document, shots: [{ ...document.shots[0], ...change }, ...document.shots.slice(1)] });
    expect(editDocument.safeParse(document).success).toBe(true);
    expect(editDocument.safeParse({ ...document, note: "x" }).success).toBe(false);
    expect(editDocument.safeParse(withFirstShot({ note: "x" })).success).toBe(false);
    expect(editDocument.safeParse(withFirstShot({ asset: { from: "source", shot_id: "beat-1", note: "x" } })).success).toBe(false);
    expect(editDocument.safeParse(withFirstShot({ end_frame: 87.5 })).success).toBe(false);
    expect(editDocument.safeParse(withFirstShot({ start_frame: -1 })).success).toBe(false);
    expect(editDocument.safeParse(withFirstShot({ media_offset_frames: -1 })).success).toBe(false);
    expect(editDocument.safeParse({ ...document, duration_frames: 1041.5 }).success).toBe(false);
  });

  it("the schemas hold their limits: ids by pattern and length, texts trimmed and capped, 1–500 shots, at most 500 discarded runs, version 1", () => {
    const hex = "a1".repeat(16), accepts = (schema: { safeParse(value: unknown): { success: boolean } }, value: unknown) => schema.safeParse(value).success;
    expect([`upl_${hex}`, `upl_${hex.slice(1)}`, `upl_${hex}a`, `upl_${hex.toUpperCase()}`, `upl_${hex}\n`, `xupl_${hex}`].map(id => accepts(uploadId, id)))
      .toEqual([true, false, false, false, false, false]);
    expect(uploadResponse.shape.upload_id).toBe(uploadId);
    expect(["a", "A".repeat(64), "beat-1", "a_b", "A".repeat(65), "-a", "_a", "", "a b"].map(id => accepts(shotId, id)))
      .toEqual([true, true, true, true, false, false, false, false, false]);

    const of = (length: number) => "x".repeat(length);
    const operations = [["new_picture", "description", 600], ["edit_picture", "instruction", 600], ["animate", "motion", 300]] as const;
    for (const [mode, field, cap] of operations) {
      expect([cap, cap + 1].map(length => accepts(shotOperation, { mode, [field]: of(length) })), mode).toEqual([true, false]);
      expect(shotOperation.parse({ mode, [field]: "  a lighthouse  " }), mode).toEqual({ mode, [field]: "a lighthouse" });
      expect(accepts(shotOperation, { mode, [field]: "   " }), mode).toBe(false);
    }
    expect(accepts(shotOperation, { mode: "animate" })).toBe(true);

    const document = identityEditDocument(faceless()), shot = document.shots[0]!;
    const withShots = (count: number) => ({ ...document, shots: Array.from({ length: count }, (_, i) => ({ ...shot, id: `s${i}` })) });
    const withDiscarded = (count: number) => ({ ...document, discarded: Array.from({ length: count }, (_, i) => `run_d${i}`) });
    expect([0, 1, 500, 501].map(count => accepts(editDocument, withShots(count)))).toEqual([false, true, true, false]);
    expect([500, 501].map(count => accepts(editDocument, withDiscarded(count)))).toEqual([true, false]);
    const { discarded, ...silent } = document;
    expect(discarded).toEqual([]);
    expect(editDocument.parse(silent).discarded).toEqual([]);
    expect([1, 2, "1"].map(v => accepts(editDocument, { ...document, v }))).toEqual([true, false, false]);
  });

  it("applyShotChanges replaces only the named shots' assets", () => {
    const document = identityEditDocument(faceless());
    const retake = { mode: "retake" as const }, picture = { mode: "new_picture" as const, description: "A lighthouse in fog" };
    const changed = applyShotChanges(document, [{ shot_id: "beat-3", operation: retake }, { shot_id: "beat-1", operation: picture }]);
    expect(changed.shots.map(shot => ({ ...shot, asset: null }))).toEqual(document.shots.map(shot => ({ ...shot, asset: null })));
    expect(changed.shots.map(shot => shot.asset)).toEqual(document.shots.map(shot =>
      shot.id === "beat-3" ? { from: "generate", operation: retake } : shot.id === "beat-1" ? { from: "generate", operation: picture } : shot.asset));
    expect({ ...changed, shots: [] }).toEqual({ ...document, shots: [] });
    // The input is not modified.
    expect(document).toEqual(identityEditDocument(faceless()));
  });

  it("applyShotChanges refuses an unknown shot id and a shot named twice", () => {
    const document = identityEditDocument(faceless());
    expect(() => applyShotChanges(document, [{ shot_id: "beat-99", operation: { mode: "retake" } }])).toThrow("unknown shot beat-99");
    expect(() => applyShotChanges(document, [{ shot_id: "beat-3", operation: { mode: "retake" } },
      { shot_id: "beat-3", operation: { mode: "retake" } }])).toThrow("shot beat-3 is named twice");
  });
});

describe("the draft of an edit", () => {
  const described = (words: string) => applyShotChanges(identityEditDocument(faceless()), [{ shot_id: "beat-4", operation: { mode: "new_picture", description: words } }]);
  /** The document padded by one discarded run id to the byte, around letters of two and of four bytes. */
  const sized = (bytes: number) => {
    const document = { ...described("Сцена у моря 🌊"), discarded: ["run_a"] };
    return { ...document, discarded: [`run_${"a".repeat(1 + bytes - Buffer.byteLength(JSON.stringify(document)))}`] };
  };

  it("a document is stored as its JSON, and its size is the length of that JSON in bytes", () => {
    const document = frozen(described("Сцена у моря 🌊"));
    const { json, bytes } = serializeEditDocument(document);

    expect(JSON.parse(json)).toEqual(document);
    expect(json).toBe(JSON.stringify(document));
    expect(bytes).toBe(Buffer.byteLength(json, "utf8"));
    // Ten letters of two bytes and one of four, which is two units of a string: twelve bytes more than the string's length.
    expect(bytes).toBe(json.length + 12);
    expect(serializeEditDocument(frozen(described("Sea"))).bytes).toBe(JSON.stringify(described("Sea")).length);
  });

  it("a save holds the whole document and the version it was written against, and nothing else", () => {
    const document = described("A lighthouse in fog");
    const accepts = (value: unknown) => saveRunEdit.safeParse(value).success;

    expect(saveRunEdit.parse({ base_version: 4, document })).toEqual({ base_version: 4, document });
    expect([0, 1, 2 ** 40, -1, 0.5, "0", null, undefined, 2 ** 53].map(base => accepts({ base_version: base, document })))
      .toEqual([true, true, true, false, false, false, false, false, false]);
    expect(accepts({ base_version: 0 })).toBe(false);
    expect(accepts({ base_version: 0, document, note: "x" })).toBe(false);
    expect(accepts({ base_version: 0, document: { ...document, note: "x" } })).toBe(false);
    // The document a save carries is the edit document: its default is filled in.
    const { discarded: _discarded, ...silent } = document;
    expect(saveRunEdit.parse({ base_version: 0, document: silent }).document).toEqual(document);
  });

  it("a save refuses a document over 256 000 bytes as stored, and takes one of exactly that size", () => {
    expect(EDIT_DOCUMENT_MAX_BYTES).toBe(256_000);
    expect([255_999, 256_000, 256_001].map(bytes => serializeEditDocument(sized(bytes)).bytes)).toEqual([255_999, 256_000, 256_001]);
    expect([255_999, 256_000, 256_001].map(bytes => saveRunEdit.safeParse({ base_version: 0, document: sized(bytes) }).success))
      .toEqual([true, true, false]);
    // The refused document is shorter than the limit counted in units of a string: bytes are what is counted.
    expect(JSON.stringify(sized(256_001)).length).toBeLessThan(256_000);

    const refused = saveRunEdit.safeParse({ base_version: 0, document: sized(256_007) });
    expect(refused.error?.issues).toEqual([expect.objectContaining({ path: ["document"],
      message: "the document is 256007 bytes as stored; a draft holds at most 256000" })]);
  });

  it("a text refuses U+0000 and half of a surrogate pair, and takes a whole pair", () => {
    const refusal = "holds U+0000 or half of a surrogate pair, which cannot be stored";
    const operations = [["new_picture", "description"], ["edit_picture", "instruction"], ["animate", "motion"]] as const;
    for (const [mode, field] of operations) {
      for (const words of ["a\u0000b", "\u0000", "a \ud83c b", "a \udf0a b", "\ud83c", "\udf0a", "🌊\ud83c", "\udf0a🌊", "\udf0a\ud83c"]) {
        const parsed = shotOperation.safeParse({ mode, [field]: words });
        expect(parsed.error?.issues.map(issue => [issue.path, issue.message]), `${mode}: ${JSON.stringify(words)}`).toEqual([[[field], refusal]]);
      }
      for (const words of ["a 🌊 b", "🌊", "🌊🎬", "Сцена", "a\tb", "a\\u0000b", "a \\ud83c b"]) {
        expect(shotOperation.parse({ mode, [field]: words }), `${mode}: ${JSON.stringify(words)}`).toEqual({ mode, [field]: words });
      }
    }
    // A document carries the refusal with the path of the text.
    const parsed = saveRunEdit.safeParse({ base_version: 0, document: described("a\u0000b") });
    expect(parsed.error?.issues.map(issue => [issue.path, issue.message])).toEqual([[["document", "shots", 3, "asset", "operation", "description"], refusal]]);
  });

  it("the draft a route returns is a run, a version, a document, its issues and the time it was saved", () => {
    const document = described("A lighthouse in fog");
    const issue = { code: "uncovered" as const, from_frame: 0, to_frame: 87, message: "no shot is on screen here" };
    const stored = { run_id: "run_a1", version: 3, document, issues: [issue, { code: "too_short" as const, shot_id: "beat-2", message: "x" }],
      updated_at: "2026-10-13T08:09:10.123Z" };
    const empty = { run_id: "run_a1", version: 0, document: identityEditDocument(faceless()), issues: [], updated_at: null };

    expect(runEdit.parse(stored)).toEqual(stored);
    expect(runEdit.parse(empty)).toEqual(empty);
    const accepts = (change: object) => runEdit.safeParse({ ...stored, ...change }).success;
    expect([accepts({ version: -1 }), accepts({ version: 1.5 }), accepts({ updated_at: "yesterday" }), accepts({ run_id: "a1" }),
      accepts({ issues: [{ ...issue, code: "not_a_code" }] }), accepts({ issues: [{ ...issue, message: "" }] }),
      accepts({ document: { ...document, v: 2 } })]).toEqual([false, false, false, false, false, false, false]);
    // Every code the validator can raise is a code a draft can return.
    for (const code of EDIT_ISSUE_CODES) expect(accepts({ issues: [{ code, message: "x" }] }), code).toBe(true);
  });

  it("runEditRead parses what a later server may send, each of which runEdit refuses: an unknown kind, track, asset source, operation and issue code, an added key at every level of the document, and a document outside the limits of a save. It keeps every key of the document, and still refuses another document version and a broken structure", () => {
    const document = described("A lighthouse in fog");
    const stored = { run_id: "run_a1", version: 3, document, issues: [{ code: "too_short", shot_id: "beat-2", message: "x" }],
      updated_at: "2026-10-13T08:09:10.123Z" };
    const empty = { run_id: "run_a1", version: 0, document: identityEditDocument(faceless()), issues: [], updated_at: null };
    for (const draft of [stored, empty]) {
      expect(runEdit.parse(draft)).toEqual(draft);
      expect(runEditRead.parse(draft)).toEqual(draft);
    }

    const withDocument = (change: object) => ({ ...stored, document: { ...document, ...change } });
    const withFirstShot = (change: object) => withDocument({ shots: [{ ...document.shots[0], ...change }, ...document.shots.slice(1)] });
    const later: Array<[name: string, draft: unknown]> = [
      ["kind", withFirstShot({ kind: "split_screen" })],
      ["track", withFirstShot({ track: "overlay" })],
      ["asset source", withFirstShot({ asset: { from: "stock", stock_id: "s1" } })],
      ["operation", withFirstShot({ asset: { from: "generate", operation: { mode: "restyle", style: "ink" } } })],
      ["key of a shot", withFirstShot({ transition: "cut" })],
      ["key of an asset", withFirstShot({ asset: { from: "source", shot_id: "beat-1", crop: "center" } })],
      ["key of the timebase", withDocument({ timebase: { fps: 25, drop_frame: false } })],
      ["key of the document", withDocument({ captions: false })],
      ["issue code", { ...stored, issues: [{ code: "aspect_changed", shot_id: "beat-2", from_frame: 3, to_frame: 9, message: "x" }] }],
      ["more shots than a save takes", withDocument({ shots: Array.from({ length: 501 }, (_, i) => ({ ...document.shots[0], id: `s${i}` })) })],
      ["no shot", withDocument({ shots: [] })],
    ];
    for (const [name, draft] of later) {
      expect(runEdit.safeParse(draft).success, name).toBe(false);
      expect(runEditRead.parse(draft), name).toEqual(draft);
    }
    const all = { ...stored, issues: [{ code: "aspect_changed", message: "x" }],
      document: { ...document, captions: false, timebase: { fps: 25, drop_frame: false },
        shots: [{ ...document.shots[0], kind: "split_screen", track: "overlay", transition: "cut", asset: { from: "stock", stock_id: "s1" } }] } };
    expect(runEditRead.parse(all)).toEqual(all);

    // What is open is the vocabulary, not the structure.
    const { version: _version, ...versionless } = stored;
    const broken: Array<[name: string, draft: unknown]> = [
      ["document version", withDocument({ v: 2 })], ["no version", versionless], ["negative frame", withFirstShot({ start_frame: -1 })],
      ["asset without a source", withFirstShot({ asset: { shot_id: "beat-1" } })], ["no asset", withFirstShot({ asset: undefined })],
      ["kind that is no string", withFirstShot({ kind: 7 })], ["issue without a message", { ...stored, issues: [{ code: "too_short" }] }],
      ["issue code that is no string", { ...stored, issues: [{ code: 7, message: "x" }] }], ["run id", { ...stored, run_id: "a1" }],
      // Ids keep their shape and numbers their bounds: each of these is closed on read as on a save.
      ["shot id of another shape", withFirstShot({ id: "bad id" })], ["source run id of another shape", withDocument({ source_run_id: "a1" })],
      ["discarded id of another shape", withDocument({ discarded: ["a1"] })], ["fps of zero", withDocument({ timebase: { fps: 0 } })],
      ["fractional fps", withDocument({ timebase: { fps: 29.97 } })], ["duration of zero", withDocument({ duration_frames: 0 })],
      ["fractional duration", withDocument({ duration_frames: 10.5 })], ["end frame of zero", withFirstShot({ start_frame: 0, end_frame: 0 })],
      ["fractional frame", withFirstShot({ end_frame: 87.5 })], ["negative media offset", withFirstShot({ media_offset_frames: -1 })],
    ];
    for (const [name, draft] of broken) expect(runEditRead.safeParse(draft).success, name).toBe(false);
    // The default of the write schema is the default of the read.
    const { discarded: _discarded, ...silent } = document;
    expect(runEditRead.parse({ ...stored, document: silent }).document).toEqual(document);
  });

  it("the path of a draft encodes the run id it is given", () => {
    expect(runEditPath("run_a1")).toBe("/v1/runs/run_a1/edit");
    expect(runEditPath("run_a/../b c")).toBe("/v1/runs/run_a%2F..%2Fb%20c/edit");
  });
});
