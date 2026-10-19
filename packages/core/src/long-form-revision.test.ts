import { describe, expect, it } from "vitest";

import {
  LONG_FORM_REVISION_ID, LONG_FORM_RUN_ID, overlayFixture, reboundTimeline, revisionRecordFixture, revisionTimingsFixture,
  scriptInsertsTimelineFixture, segmentsTimelineFixture,
} from "./__fixtures__/long-form-timeline.fixture.js";
import { freezeResolvedTimeline } from "./resolved-timeline.js";
import { identityEditDocument } from "./edit-document.js";
import { longFormFrame, longFormRevisionShots, longFormWords } from "./edit-long-form.js";
import { validateEditDocument } from "./edit-validate.js";
import {
  LONG_FORM_BACKGROUNDS, LONG_FORM_REVISION_RECORD_MAX_BYTES, longFormOwnKey, longFormRevisionInput, longFormRevisionRecordKey,
  readLongFormRevisionRecord, type LongFormOverlay,
} from "./long-form-revision.js";
import { makeUgcInputShape } from "./skills.js";

type Stored = { run_id: string; account_id: string; source_run_id: string; base: unknown; visual: LongFormOverlay[] };
/** The stored record with one change applied to a plain copy. */
function changed(change: (record: Stored) => void, visual?: LongFormOverlay[]): unknown {
  const record = revisionRecordFixture(visual) as Stored;
  change(record);
  return record;
}
const OWN = { runId: LONG_FORM_REVISION_ID, accountId: "acc_fixture" };
/** The record as the run being read stores it. */
const read = (value: unknown, expected = OWN) => readLongFormRevisionRecord(JSON.stringify(value), expected);
const refusal = (value: unknown, expected = OWN) => {
  try {
    read(value, expected);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

describe("the long-form revision record (#604 S7b-1)", () => {
  it("a record whose keys leave runs/<id>/ is refused", () => {
    expect(longFormRevisionRecordKey(LONG_FORM_REVISION_ID)).toBe(`runs/${LONG_FORM_REVISION_ID}/long-form-revision.v1.json`);
    for (const key of [`runs/${LONG_FORM_RUN_ID}/overlays/cover-1.png`, `runs/${LONG_FORM_REVISION_ID}/../${LONG_FORM_RUN_ID}/a.png`,
      `runs/${LONG_FORM_REVISION_ID}/overlays/cover-1`, `runs/${LONG_FORM_REVISION_ID}//cover-1.png`]) {
      expect(longFormOwnKey(key, LONG_FORM_REVISION_ID), key).toBe(false);
      expect(refusal(revisionRecordFixture([overlayFixture("cover-1", 900, 1000, { object: { ...overlayFixture("cover-1", 0, 1).object, key } })])), key)
        .toMatch(/a key leaves the run's prefix/);
    }
    // A timeline slot whose key climbs out is refused too: the timeline itself checks only the prefix.
    const { hash: _hash, ...content } = reboundTimeline(segmentsTimelineFixture(), LONG_FORM_REVISION_ID);
    const climbing = freezeResolvedTimeline({ ...content, slots: content.slots.map((slot) => (slot.kind === "media" && slot.position === 2
      ? { ...slot, key: `runs/${LONG_FORM_REVISION_ID}/../${LONG_FORM_RUN_ID}/seg2/media.image` } : slot)) });
    expect(refusal(changed((record) => { record.base = JSON.parse(JSON.stringify(climbing)); }))).toMatch(/a key leaves the run's prefix/);
    expect(longFormOwnKey(`runs/${LONG_FORM_REVISION_ID}/seg2/media.image`, LONG_FORM_REVISION_ID)).toBe(true);
  });

  it("a key with several dots in its file name is the run's own; a `..` segment or an empty extension is not", () => {
    for (const key of ["seg2/avatar.source.mp4", "seg2/avatar.source.json", "long-form-revision.v1.json", "overlays/cover-1.png"]) {
      expect(longFormOwnKey(`runs/${LONG_FORM_REVISION_ID}/${key}`, LONG_FORM_REVISION_ID), key).toBe(true);
    }
    for (const key of ["seg2/../avatar.source.mp4", "../seg2/avatar.source.mp4", "seg2/avatar..mp4", "seg2/avatar.source.", ".hidden.png"]) {
      expect(longFormOwnKey(`runs/${LONG_FORM_REVISION_ID}/${key}`, LONG_FORM_REVISION_ID), key).toBe(false);
    }
  });

  it("a record stored under another run or account is refused, though it agrees with itself", () => {
    expect(refusal(revisionRecordFixture())).toBeNull();
    expect(refusal(revisionRecordFixture(), { ...OWN, runId: "run_someoneelse1" })).toMatch(/belongs to another run or account/);
    expect(refusal(revisionRecordFixture(), { ...OWN, accountId: "acc_other" })).toMatch(/belongs to another run or account/);
  });

  it("a record over 512 000 bytes is refused before it is parsed", () => {
    const text = JSON.stringify(revisionRecordFixture());
    const padded = text + " ".repeat(LONG_FORM_REVISION_RECORD_MAX_BYTES - new TextEncoder().encode(text).length);
    expect(readLongFormRevisionRecord(padded, OWN).run_id).toBe(LONG_FORM_REVISION_ID);
    expect(() => readLongFormRevisionRecord(`${padded} `, OWN)).toThrow(/512001 bytes, at most 512000/);
    expect(readLongFormRevisionRecord(new TextEncoder().encode(text), OWN).run_id).toBe(LONG_FORM_REVISION_ID);
  });

  it("the cap holds for stored bytes too: 512 000 bytes pass it and 512 001 are refused", () => {
    const text = JSON.stringify(revisionRecordFixture());
    const exact = new TextEncoder().encode(text + " ".repeat(LONG_FORM_REVISION_RECORD_MAX_BYTES - new TextEncoder().encode(text).length));
    expect(exact.length).toBe(512_000);
    expect(readLongFormRevisionRecord(exact, OWN).run_id).toBe(LONG_FORM_REVISION_ID);
    const over = new Uint8Array(512_001);
    over.set(exact);
    over[512_000] = 0x20;
    expect(() => readLongFormRevisionRecord(over, OWN)).toThrow(/512001 bytes, at most 512000/);
  });

  it("an overlay may end on the last frame; the record holds at most 500 overlays, each key at most 1024 characters", () => {
    expect(refusal(revisionRecordFixture([overlayFixture("insert-4", 1228, 1728)]))).toBeNull();
    expect(refusal(revisionRecordFixture([overlayFixture("insert-4", 1228, 1729)]))).toMatch(/insert-4 lies outside the video/);
    // One-frame covers on both takes: take-1 holds 376 of them, take-3 the rest.
    const covers = (count: number) => Array.from({ length: count }, (_, at) =>
      overlayFixture(`cover-${at + 1}`, at < 376 ? at : 876 + at - 376, (at < 376 ? at : 876 + at - 376) + 1));
    expect(refusal(revisionRecordFixture(covers(500)))).toBeNull();
    expect(refusal(revisionRecordFixture(covers(501)))).toMatch(/too_big/);
    const keyed = (length: number) => {
      const key = `runs/${LONG_FORM_REVISION_ID}/overlays/`;
      return revisionRecordFixture([overlayFixture("cover-1", 900, 1000,
        { object: { ...overlayFixture("cover-1", 0, 1).object, key: `${key}${"k".repeat(length - key.length - 4)}.png` } })]);
    };
    expect(refusal(keyed(1024))).toBeNull();
    expect(refusal(keyed(1025))).toMatch(/too_big/);
  });

  it("the cap counts UTF-8 bytes: a record of 512 000 characters and 513 900 bytes is refused", () => {
    const { hash: _hash, ...content } = reboundTimeline(segmentsTimelineFixture(), LONG_FORM_REVISION_ID);
    const worded = freezeResolvedTimeline({ ...content, warnings: ["я".repeat(1900)] });
    const text = JSON.stringify(changed((record) => { record.base = JSON.parse(JSON.stringify(worded)); }));
    const padded = text + " ".repeat(LONG_FORM_REVISION_RECORD_MAX_BYTES - text.length);
    expect([padded.length, new TextEncoder().encode(padded).length]).toEqual([512_000, 513_900]);
    expect(() => readLongFormRevisionRecord(padded, OWN)).toThrow(/513900 bytes, at most 512000/);
    expect(readLongFormRevisionRecord(text, OWN).base.warnings).toEqual(["я".repeat(1900)]);
  });

  it("LONG_FORM_BACKGROUNDS are the background modes make_ugc takes", () => {
    expect([...LONG_FORM_BACKGROUNDS]).toEqual(makeUgcInputShape.background.unwrap().options);
  });

  it("a record round-trips through the projection", () => {
    const visual = [overlayFixture("insert-2", 376, 926, { origin: "source", motion: { direction: "in", amount: 0.1 } }),
      overlayFixture("cover-1", 1000, 1100)];
    const stored = revisionRecordFixture(visual);
    const record = read(stored);
    expect(read(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(record.visual).toEqual(visual);
    const view = longFormRevisionShots(record, longFormWords(record.base, revisionTimingsFixture()), {
      runId: LONG_FORM_REVISION_ID, frame: longFormFrame("16:9"),
      editable: { state: "editable", media_available_until: "2026-10-21T10:00:00.000Z", reason: null },
      lineage: { source_run_id: LONG_FORM_RUN_ID, root_run_id: LONG_FORM_RUN_ID, revisions: [] }, captions: false, contractVersion: "test",
      exposure: { descriptions: true, source_media: true },
      previews: new Map([[visual[1]!.object.key, "https://media.example.test/cover-1.png"]]), background: null,
    });
    const shots = new Map(view.tracks.flatMap((track) => track.shots).map((shot) => [shot.id, shot]));
    // One shot per id: the base takes, the inserts not drawn over, and every overlay over its own span.
    expect([...shots.keys()].sort()).toEqual(["cover-1", "insert-2", "insert-4", "take-1", "take-3"]);
    for (const overlay of visual) expect([shots.get(overlay.shot_id)!.start_frame, shots.get(overlay.shot_id)!.end_frame]).toEqual([overlay.start_frame, overlay.end_frame]);
    expect([shots.get("cover-1")!.source, shots.get("insert-2")!.source, shots.get("cover-1")!.preview_url])
      .toEqual(["upload", "customer", "https://media.example.test/cover-1.png"]);
    expect(validateEditDocument(identityEditDocument(view), view, { candidates: {}, uploads: {} })).toMatchObject({ ok: true });
  });

  it("a record binds its run and account: a timeline of another run or account, or a revision of itself, is refused", () => {
    expect(refusal(revisionRecordFixture())).toBeNull();
    expect(refusal(changed((record) => { record.account_id = "acc_other"; }))).toMatch(/another run or account/);
    expect(refusal(changed((record) => { record.run_id = "run_someoneelse1"; }))).toMatch(/another run or account/);
    expect(refusal(changed((record) => { record.source_run_id = LONG_FORM_REVISION_ID; }))).toMatch(/names itself as its source/);
    const foreign = JSON.parse(JSON.stringify(reboundTimeline(segmentsTimelineFixture(), "run_someoneelse1")));
    expect(refusal(changed((record) => { record.base = foreign; }))).toMatch(/another run or account/);
    // A timeline edited after it was hashed is refused by its own digest.
    expect(refusal(changed((record) => { (record.base as { accountId: string }).accountId = "acc_other"; }))).toMatch(/hash mismatch/);
  });

  it("an overlay outside the video, on a take, short of its insert's slot, overlapping another or repeated is refused", () => {
    const cases: [LongFormOverlay[], RegExp][] = [
      [[overlayFixture("cover-1", 1700, 1729)], /cover-1 lies outside the video/],
      [[overlayFixture("take-3", 900, 1000)], /take-3 is a presenter take/],
      [[overlayFixture("insert-2", 400, 876)], /insert-2 leaves part of its slot uncovered/],
      [[overlayFixture("insert-2", 376, 800)], /insert-2 leaves part of its slot uncovered/],
      [[overlayFixture("cover-1", 1200, 1260)], /two visual shots overlap/],
      [[overlayFixture("cover-1", 900, 1000), overlayFixture("cover-2", 950, 1100)], /two visual shots overlap/],
      [[overlayFixture("cover-1", 900, 1000), overlayFixture("cover-1", 1100, 1200)], /two overlays are cover-1/],
    ];
    for (const [visual, message] of cases) expect(refusal(revisionRecordFixture(visual)), String(message)).toMatch(message);
    // An insert extended over the take after it covers its slot and more, and passes.
    expect(refusal(revisionRecordFixture([overlayFixture("insert-2", 376, 926)]))).toBeNull();
  });

  it("a cover that moves, or an overlay over a clip insert, is refused", () => {
    const zoom = { direction: "in", amount: 0.1 } as const;
    expect(refusal(revisionRecordFixture([overlayFixture("cover-1", 900, 1000, { motion: zoom })]))).toMatch(/cover-1 is a cover and does not move/);
    expect(refusal(revisionRecordFixture([overlayFixture("insert-2", 376, 876, { motion: zoom })]))).toBeNull();
    // The script-with-inserts fixture: insert-2 is a clip on 200–450, insert-4 a picture on 625–750.
    const inserts = JSON.parse(JSON.stringify(reboundTimeline(scriptInsertsTimelineFixture(), LONG_FORM_REVISION_ID)));
    const over = (overlay: LongFormOverlay) => changed((record) => { record.base = inserts; }, [overlay]);
    expect(refusal(over(overlayFixture("insert-2", 200, 450)))).toMatch(/insert-2 is a clip/);
    expect(refusal(over(overlayFixture("insert-4", 625, 750)))).toBeNull();
  });

  it("the stored input carries the render settings copied from the root and refuses a canvas of another shape", () => {
    const record = read(revisionRecordFixture());
    const document = identityEditDocument(longFormRevisionShots(record, longFormWords(record.base, revisionTimingsFixture()), {
      runId: LONG_FORM_RUN_ID, frame: longFormFrame("16:9"), editable: { state: "editable", media_available_until: null, reason: null },
      lineage: { source_run_id: null, root_run_id: LONG_FORM_RUN_ID, revisions: [] }, captions: false, contractVersion: "test",
      exposure: { descriptions: true, source_media: true }, previews: new Map(), background: "blur" }));
    const input = { input_mode: "revision", revision: { source_run_id: LONG_FORM_RUN_ID, document },
      resolved_revision: { root_run_id: LONG_FORM_RUN_ID,
        summary: { retimed: [], deleted: [], added: ["cover-1"], replaced: [{ shot_id: "cover-1", from: "source" }], generated: [], changed: true },
        billing: { tariff_id: "long-form-edit-v1", lines: [], render_credits: 60, zero_unit: "priced", total_credits: 60 },
        render: { aspect_ratio: "16:9", width: 1920, height: 1080, background: "blur", motion_by_position: { 2: { direction: "in", amount: 0.1 } } } } };
    expect(longFormRevisionInput.parse(input)).toEqual(input);
    const reshaped = (render: object) => longFormRevisionInput.safeParse({ ...input, resolved_revision: { ...input.resolved_revision,
      render: { ...input.resolved_revision.render, ...render } } }).success;
    expect([reshaped({ height: 1081 }), reshaped({ aspect_ratio: "9:16" }), reshaped({ background: "green" }),
      reshaped({ motion_by_position: { first: { direction: "in", amount: 0.1 } } }), reshaped({ background: null })]).toEqual([false, false, false, false, true]);
    // A zoom amount lies in [0, 1); a position is 1 to 9999.
    const moved = (position: string, amount: number) => reshaped({ motion_by_position: { [position]: { direction: "out", amount } } });
    expect([moved("2", 0), moved("2", 0.999), moved("2", 1), moved("2", -0.001)]).toEqual([true, true, false, false]);
    expect([moved("1", 0.1), moved("9999", 0.1), moved("0", 0.1), moved("10000", 0.1)]).toEqual([true, true, false, false]);
  });
});
