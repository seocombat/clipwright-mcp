import { z } from "zod";
import { editSummaryWire, revisionBilling, revisionPriceLine } from "./edit-billing.js";
import { editDocument } from "./edit-document.js";
import { shotChange } from "./edit-operations.js";
import { EDIT_MAX_SHOTS } from "./edit-rules.js";
import { runId } from "./runs.js";

/** A revision asks for exactly one of: the whole document, or a list of shot changes over the run as it is. */
export const revisionRequest = z.union([
  z.strictObject({ document: editDocument }),
  z.strictObject({ changes: z.array(shotChange).min(1).max(EDIT_MAX_SHOTS) }),
]);
export type RevisionRequest = z.infer<typeof revisionRequest>;

/** What a revision would change and cost. The run route refuses what the quote refuses. */
export const revisionQuote = z.strictObject({
  source_run_id: runId,
  root_run_id: runId,
  summary: editSummaryWire,
  billing: revisionBilling,
  warnings: z.array(z.string()),
  contract_version: z.string().min(1),
});
export type RevisionQuote = z.infer<typeof revisionQuote>;

// What installed clients parse: units, zero rules, kinds, modes and origins are open strings, and unknown keys are kept.
const priceLineRead = revisionPriceLine.extend({ unit: z.string().min(1) }).loose();
const summaryRead = editSummaryWire.extend({
  replaced: z.array(editSummaryWire.shape.replaced.element.extend({ from: z.string().min(1) }).loose()),
  generated: z.array(editSummaryWire.shape.generated.element.extend({ kind: z.string().min(1), mode: z.string().min(1) }).loose()),
}).loose();
export const revisionQuoteRead = revisionQuote.extend({
  summary: summaryRead,
  billing: revisionBilling.extend({ lines: z.array(priceLineRead), zero_unit: z.string().min(1).nullable() }).loose(),
}).loose();
export type RevisionQuoteRead = z.infer<typeof revisionQuoteRead>;

/** The one sentence every client and the docs page state a revision's charge by. */
export const REVISION_CHARGE_TEXT =
  "A revision that delivers is charged its quoted total; one that fails is charged nothing, even when its paid work was already done.";

/** The paths of a run's revision quote and start. The id is encoded, since it comes from the caller. */
export const runRevisionsQuotePath = (id: string): string => `/v1/runs/${encodeURIComponent(id)}/revisions/quote`;
export const runRevisionsPath = (id: string): string => `/v1/runs/${encodeURIComponent(id)}/revisions`;
