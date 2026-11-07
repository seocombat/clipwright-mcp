import { z } from 'zod';
import { launchWorkflow, workflowQuoteBinding } from './workflow-execution.js';
import { workflowDigest, workflowNext, workflowRevision, type WorkflowNext } from './workflow-primitives.js';

/** A quote answer with the ready run call beside the binding. */
export const workflowQuoteAnswer = z.strictObject({ ...workflowQuoteBinding.shape, next: workflowNext });
export const launchWorkflowRequest = z.strictObject({ ...launchWorkflow.shape, idempotency_key: launchWorkflow.shape.idempotency_key.optional() });

/** Draft plan: approve body to echo back; approved: the quote call. A plan needing revalidation has no next call but a revision. */
export function planNext(plan: { plan_id: string; status: string; revision: number; content_digest: string }): WorkflowNext | null {
    const base = `/v1/workflow-plans/${plan.plan_id}`;
    if (plan.status === 'draft') return { action: 'approve', method: 'POST', path: `${base}/approve`,
        body: { revision: workflowRevision.parse(plan.revision), content_digest: workflowDigest.parse(plan.content_digest) } };
    if (plan.status === 'approved') return { action: 'quote', method: 'POST', path: `${base}/quote`, body: null };
    return null;
}

export function quoteNext<Q extends { plan_id: string; launch: z.infer<typeof launchWorkflow> }>(quote: Q): Q & { next: WorkflowNext } {
    return { ...quote, next: { action: 'run', method: 'POST', path: `/v1/workflow-plans/${quote.plan_id}/run`,
        headers: { 'Idempotency-Key': quote.launch.idempotency_key }, body: quote.launch } };
}
