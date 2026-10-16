import { z } from 'zod';
import { quoteResponse } from '../../skills.js';
import { facelessQuoteResponse } from '../../faceless-public.js';
import { run, runId, runRead, runStep } from '../../runs.js';
import { faceBillingTariffSchema } from '../../face-billing.js';
import { speechRhythmResult } from '../../speech-rhythm-contract.js';
import { workflowDigest, workflowFormatRead, workflowId, workflowIssue, workflowIssueRead, workflowLocalId, workflowMethodPin, workflowMethodPinRead, workflowRevision, workflowText } from './workflow-primitives.js';

export const workflowQuoteBinding = z.strictObject({
    v: z.literal(1), quote_id: z.string().regex(/^wq_[a-zA-Z0-9_-]{1,64}$/), plan_id: workflowId, revision: workflowRevision, content_digest: workflowDigest,
    method: workflowMethodPin, semantic_input_digest: workflowDigest, expires_at: z.string().datetime(),
    native_quote: z.discriminatedUnion('skill', [z.strictObject({ skill: z.literal('make_ugc'), quote: quoteResponse }), z.strictObject({ skill: z.literal('make_faceless'), quote: facelessQuoteResponse })]),
});
export type WorkflowQuoteBinding = z.infer<typeof workflowQuoteBinding>;
const nativeQuoteRead = z.union([
    z.looseObject({ skill: z.literal('make_ugc'), quote: z.looseObject({ ...quoteResponse.shape, resolved_aspect_ratio: z.string(),
        source: quoteResponse.shape.source.unwrap().loose().nullable(),
        actor: z.looseObject({ ...quoteResponse.shape.actor.unwrap().shape, gender: z.string() }).nullable() }) }),
    z.looseObject({ skill: z.literal('make_faceless'), quote: z.looseObject({ ...facelessQuoteResponse.shape, tariffId: z.string(), skill: z.string() }) }),
    z.looseObject({ skill: z.string().refine(skill => skill !== 'make_ugc' && skill !== 'make_faceless'), quote: z.record(z.string(), z.unknown()) }),
]);
export const workflowQuoteBindingRead = z.looseObject({ ...workflowQuoteBinding.shape, v: z.number(), method: workflowMethodPinRead, native_quote: nativeQuoteRead });
export const launchWorkflow = z.strictObject({
    revision: workflowRevision, content_digest: workflowDigest, semantic_input_digest: workflowDigest,
    quote_id: workflowQuoteBinding.shape.quote_id, idempotency_key: workflowText(200),
});
export const workflowReceipt = z.strictObject({
    v: z.literal(1), account_id: workflowText(200), plan_id: workflowId, revision: workflowRevision, content_digest: workflowDigest, method: workflowMethodPin,
    semantic_input_digest: workflowDigest, transport_request_digest: workflowDigest, run_id: runId, skill: z.enum(['make_ugc', 'make_faceless']), admitted_at: z.string().datetime(),
});
export type WorkflowReceipt = z.infer<typeof workflowReceipt>;
export const workflowReceiptRead = z.looseObject({ ...workflowReceipt.shape, v: z.number(), method: workflowMethodPinRead, skill: z.string() });
export const workflowLaunchResponse = z.strictObject({ receipt: workflowReceipt, run })
    .refine(value => value.receipt.run_id === value.run.run_id && value.receipt.skill === value.run.skill, 'Receipt must identify the native run');
const [legacyTariff, currentTariff] = faceBillingTariffSchema.options;
const tariffRead = z.union([
    legacyTariff.unwrap().extend({ version: z.number(), rounding: z.string() }).loose(),
    currentTariff.unwrap().extend({ version: z.number(), rounding: z.string(), failurePolicy: z.string() }).loose(),
]);
const rhythmRead = z.union([
    speechRhythmResult.options[0].loose(), speechRhythmResult.options[1].extend({ reason: z.string() }).loose(),
    z.looseObject({ status: z.string().refine(status => status !== 'available' && status !== 'unavailable') }),
]);
/** Workflow readers accept informational enums from newer native executors; financial writers stay strict. */
export const workflowNativeRunRead = runRead.extend({
    actor: run.shape.actor.unwrap().extend({ aspect_ratio: z.string() }).loose().optional(),
    faceless_billing: run.shape.faceless_billing.unwrap().extend({ tariffId: z.string() }).loose().optional(),
    billing_terms: z.looseObject({ ...run.shape.billing_terms.unwrap().unwrap().shape,
        mode: z.string(), tariffSnapshot: tariffRead }).optional(),
    resolved_broll_policy: z.string().optional(),
    steps: z.array(runStep.extend({ state: z.string() }).loose()).default([]),
    final_output: run.shape.final_output.unwrap().extend({ speech_timing_gaps: rhythmRead.optional() }).loose().nullable(),
}).loose();
export const workflowLaunchResponseRead = z.looseObject({ receipt: workflowReceiptRead, run: workflowNativeRunRead })
    .refine(value => value.receipt.run_id === value.run.run_id && value.receipt.skill === value.run.skill, 'Receipt must identify the native run');
export type WorkflowLaunchResponse = z.infer<typeof workflowLaunchResponse>;
export const workflowCommandError = z.strictObject({ error: z.strictObject({
    code: z.enum(['workflow_invalid', 'workflow_conflict', 'workflow_not_ready']), message: z.string().min(1),
    issues: z.array(workflowIssue), warnings: z.array(z.string()),
}) });
export const workflowCommandErrorRead = z.looseObject({ error: z.looseObject({ ...workflowCommandError.shape.error.shape, issues: z.array(workflowIssueRead) }) });
export const workflowOutcomeRead = z.looseObject({
    receipt: workflowReceiptRead, state: z.string(), warnings: z.array(z.string()),
    actual_output: z.looseObject({ format: workflowFormatRead, duration_seconds: z.number().positive(), artifact_id: z.string(), content_digest: workflowDigest }).nullable(),
    beat_dispositions: z.array(z.looseObject({ beat_id: workflowLocalId, disposition: z.string(), reason: z.string().optional() })),
    validation_issues: z.array(workflowIssueRead), creative_acceptance: z.string(),
});
export type LaunchWorkflowArgs = z.input<typeof launchWorkflow>;
export type WorkflowQuoteRead = z.infer<typeof workflowQuoteBindingRead>;
export type WorkflowLaunchRead = z.infer<typeof workflowLaunchResponseRead>;
