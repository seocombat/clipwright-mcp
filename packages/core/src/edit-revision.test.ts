import { describe, expect, it } from "vitest";

import { storedRevisionInputFixture } from "./__fixtures__/edit-views.fixture.js";
import { editSummaryWire, revisionBilling, revisionPriceLine } from "./edit-billing.js";
import { revisionQuote, revisionQuoteRead, revisionRequest } from "./edit-revision.js";
import { facelessRevisionInput, facelessStoredInput, makeFacelessInput } from "./faceless-public.js";

const stored = storedRevisionInputFixture();
const document = stored.revision.document;
const changes = [{ shot_id: "beat-3", operation: { mode: "retake" } }];

describe("revisionRequest", () => {
  it("takes exactly one of the document and the changes", () => {
    expect(revisionRequest.parse({ document })).toEqual({ document });
    expect(revisionRequest.parse({ changes })).toEqual({ changes });
    for (const body of [{}, { document, changes }, { changes: [] }, { changes, extra: 1 }, { document, note: "x" }]) {
      expect(revisionRequest.safeParse(body).success, JSON.stringify(Object.keys(body))).toBe(false);
    }
  });
  it("refuses text a JSON column cannot store", () => {
    const described = (description: string) => ({ changes: [{ shot_id: "beat-3", operation: { mode: "new_picture", description } }] });
    expect(revisionRequest.safeParse(described("a harbour at dawn")).success).toBe(true);
    expect(revisionRequest.safeParse(described("a harbour\u0000at dawn")).success).toBe(false);
    expect(revisionRequest.safeParse(described("half \uD83C pair")).success).toBe(false);
  });
});

describe("the billing leaf", () => {
  it("is strict at every level and counts whole credits", () => {
    expect(revisionBilling.parse(stored.resolved_revision.billing)).toEqual(stored.resolved_revision.billing);
    expect(revisionBilling.safeParse({ ...stored.resolved_revision.billing, extra: 1 }).success).toBe(false);
    expect(revisionPriceLine.safeParse({ shot_id: "beat-3", unit: "picture", credits: 1.5 }).success).toBe(false);
    expect(revisionPriceLine.safeParse({ shot_id: "beat-3", unit: "voice", credits: 1 }).success).toBe(false);
    expect(revisionBilling.safeParse({ ...stored.resolved_revision.billing, zero_unit: "not_offered" }).success).toBe(false);
    expect(editSummaryWire.safeParse({ ...stored.resolved_revision.summary, generated: [{ shot_id: "beat-3", kind: "picture", mode: "dance" }] }).success).toBe(false);
  });
  it("a quote is strict and names both runs of the family", () => {
    const quote = { source_run_id: "run_src", root_run_id: "run_root", summary: stored.resolved_revision.summary,
      billing: stored.resolved_revision.billing, warnings: [], contract_version: "v" };
    expect(revisionQuote.parse(quote)).toEqual(quote);
    expect(revisionQuote.safeParse({ ...quote, root_run_id: "root" }).success).toBe(false);
    expect(revisionQuote.safeParse({ ...quote, total: 18 }).success).toBe(false);
  });
  it("revisionQuoteRead parses a quote with an unknown unit, zero rule, kind, mode, origin and key, and keeps the unknown key", () => {
    const quote = { source_run_id: "run_src", root_run_id: "run_root", summary: stored.resolved_revision.summary,
      billing: stored.resolved_revision.billing, warnings: [], contract_version: "v" };
    expect(revisionQuoteRead.parse(quote)).toEqual(quote);
    const future = {
      ...quote, eta_seconds: 90,
      summary: { ...quote.summary, voiced: ["beat-1"], replaced: [{ shot_id: "beat-2", from: "library" }],
        generated: [{ shot_id: "beat-3", kind: "voice", mode: "dance" }] },
      billing: { ...quote.billing, zero_unit: "included", lines: [{ shot_id: "beat-3", unit: "voice", credits: 5, note: "new" }] },
    };
    expect(revisionQuote.safeParse(future).success).toBe(false);
    expect(revisionQuoteRead.parse(future)).toEqual(future);
    expect(revisionQuoteRead.safeParse({ ...quote, root_run_id: "root" }).success).toBe(false);
    expect(revisionQuoteRead.safeParse({ ...quote, billing: { ...quote.billing, total_credits: -1 } }).success).toBe(false);
  });
});

describe("the stored input of a faceless run", () => {
  it("is a generate request or a revision; the generate contract alone stays two members", () => {
    expect(facelessStoredInput.parse(stored)).toEqual(stored);
    const brief = { input_mode: "brief", brief: "A story", duration_seconds: 30 };
    expect(facelessStoredInput.parse(brief)).toEqual(makeFacelessInput.parse(brief));
    expect(makeFacelessInput.safeParse(stored).success).toBe(false);
  });
  it("a revision is strict: no depth, no unknown key, both runs named", () => {
    expect(facelessRevisionInput.safeParse({ ...stored, resolved_revision: { ...stored.resolved_revision, depth: 2 } }).success).toBe(false);
    expect(facelessRevisionInput.safeParse({ ...stored, script: "x" }).success).toBe(false);
    const { own_images: _ownImages, ...withoutOwnImages } = stored.resolved_revision;
    expect(facelessRevisionInput.safeParse({ ...stored, resolved_revision: withoutOwnImages }).success).toBe(false);
  });
});
