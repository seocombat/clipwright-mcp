import { z } from "zod";
import { editSummaryWire, revisionBilling, revisionPriceLine } from "./edit-billing.js";
import { editDocument } from "./edit-document.js";
import { shotChange } from "./edit-operations.js";
import { EDIT_MAX_SHOTS } from "./edit-rules.js";
import { maxCreditsField } from "./max-credits.js";
import { runId } from "./runs.js";

export const revisionRequest = z.union([
  z.strictObject({ document: editDocument, max_credits: maxCreditsField }),
  z.strictObject({ changes: z.array(shotChange).min(1).max(EDIT_MAX_SHOTS), max_credits: maxCreditsField }),
]);
export type RevisionRequest = z.infer<typeof revisionRequest>;

export const revisionQuote = z.strictObject({
  source_run_id: runId,
  root_run_id: runId,
  summary: editSummaryWire,
  billing: revisionBilling,
  warnings: z.array(z.string()),
  contract_version: z.string().min(1),
});
export type RevisionQuote = z.infer<typeof revisionQuote>;

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

export const REVISION_CHARGE_TEXT =
  "A revision that delivers is charged its quoted total; one that fails is charged nothing.";

export const runRevisionsQuotePath = (id: string): string => `/v1/runs/${encodeURIComponent(id)}/revisions/quote`;
export const runRevisionsPath = (id: string): string => `/v1/runs/${encodeURIComponent(id)}/revisions`;
