import { z } from 'zod';
import { quoteResponse } from '../../skills.js';
import { facelessQuoteResponse } from '../../faceless-public.js';
import { runId } from '../../runs.js';
import { workflowDigest, workflowFormatRead, workflowId, workflowIssueRead, workflowLocalId, workflowMethodPin, workflowMethodPinRead, workflowRevision, workflowText } from './workflow-primitives.js';

export const workflowQuoteBinding = z.strictObject({
    v: z.literal(1), quote_id: z.string().regex(/^wq_[a-zA-Z0-9_-]{1,64}$/), plan_id: workflowId, revision: workflowRevision, content_digest: workflowDigest,
    method: workflowMethodPin, semantic_input_digest: workflowDigest, expires_at: z.string().datetime(),
    native_quote: z.discriminatedUnion('skill', [z.strictObject({ skill: z.literal('make_ugc'), quote: quoteResponse }), z.strictObject({ skill: z.literal('make_faceless'), quote: facelessQuoteResponse })]),
});
export type WorkflowQuoteBinding = z.infer<typeof workflowQuoteBinding>;
const nativeQuoteRead = z.union([
    z.object({ skill: z.literal('make_ugc'), quote: z.object({ ...quoteResponse.shape, resolved_aspect_ratio: z.string(),
        actor: z.object({ ...quoteResponse.shape.actor.unwrap().shape, gender: z.string() }).nullable() }) }),
    z.object({ skill: z.literal('make_faceless'), quote: z.object({ ...facelessQuoteResponse.shape, tariffId: z.string(), skill: z.string() }) }),
    z.object({ skill: z.string().refine(skill => skill !== 'make_ugc' && skill !== 'make_faceless'), quote: z.record(z.string(), z.unknown()) }),
]);
export const workflowQuoteBindingRead = z.object({ ...workflowQuoteBinding.shape, v: z.number(), method: workflowMethodPinRead, native_quote: nativeQuoteRead });
export const launchWorkflow = z.strictObject({
    revision: workflowRevision, content_digest: workflowDigest, semantic_input_digest: workflowDigest,
    quote_id: workflowQuoteBinding.shape.quote_id, idempotency_key: workflowText(200),
});
export const workflowReceipt = z.strictObject({
    v: z.literal(1), account_id: workflowText(200), plan_id: workflowId, revision: workflowRevision, content_digest: workflowDigest, method: workflowMethodPin,
    semantic_input_digest: workflowDigest, transport_request_digest: workflowDigest, run_id: runId, skill: z.enum(['make_ugc', 'make_faceless']), admitted_at: z.string().datetime(),
});
export type WorkflowReceipt = z.infer<typeof workflowReceipt>;
export const workflowReceiptRead = z.object({ ...workflowReceipt.shape, v: z.number(), method: workflowMethodPinRead, skill: z.string() });
export const workflowOutcomeRead = z.object({
    receipt: workflowReceiptRead, state: z.string(), warnings: z.array(z.string()),
    actual_output: z.object({ format: workflowFormatRead, duration_seconds: z.number().positive(), artifact_id: z.string(), content_digest: workflowDigest }).nullable(),
    beat_dispositions: z.array(z.object({ beat_id: workflowLocalId, disposition: z.string(), reason: z.string().optional() })),
    validation_issues: z.array(workflowIssueRead), creative_acceptance: z.string(),
});
