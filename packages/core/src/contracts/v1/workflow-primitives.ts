import { z } from 'zod';
import { ASPECT_RATIOS, offeredResolution } from '../../skills.js';

/** The exact next call of the approve, quote, run chain: send `body` (and `headers`) unchanged to `path`. */
export const workflowNext = z.strictObject({
    action: z.enum(['approve', 'quote', 'run']), method: z.literal('POST'), path: z.string(),
    headers: z.record(z.string(), z.string()).optional(), body: z.record(z.string(), z.unknown()).nullable(),
});
export type WorkflowNext = z.infer<typeof workflowNext>;
export const workflowNextRead = z.looseObject({ ...workflowNext.shape, action: z.string() });

export const WORKFLOW_METHOD_IDS = ['ugc-product-intro', 'ugc-faq-answer', 'faceless-explainer', 'product-image-story', 'website-proof-demo', 'kinetic-launch', 'reference-remake'] as const;
export const workflowMethodId = z.enum(WORKFLOW_METHOD_IDS);
export const workflowDigest = z.string().regex(/^[a-f0-9]{64}$/);
export const workflowId = z.string().regex(/^wfp_[a-zA-Z0-9_-]{1,64}$/);
export const workflowRevision = z.number().int().positive().safe();
export const workflowLocalId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const HALF_PAIR = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
export const isWorkflowTextStorable = (text: string): boolean => !text.includes('\u0000') && !HALF_PAIR.test(text);
export const workflowText = (max: number) => z.string().min(1).max(max).refine(text => text.trim().length > 0, 'Text must not be blank')
    .refine(isWorkflowTextStorable, 'Text contains U+0000 or an unpaired surrogate and cannot be stored');
export const workflowFormat = z.strictObject({ aspect_ratio: z.enum(ASPECT_RATIOS), resolution: offeredResolution });
export const workflowFormatRead = z.looseObject({ aspect_ratio: z.string(), resolution: z.string() });
export const workflowMethodPin = z.strictObject({ method_id: workflowMethodId, version: workflowRevision, content_digest: workflowDigest, capability_digest: workflowDigest });
export const workflowMethodPinRead = z.looseObject({ method_id: z.string(), version: workflowRevision, content_digest: workflowDigest, capability_digest: workflowDigest });
export type WorkflowMethodPin = z.infer<typeof workflowMethodPin>;

export const workflowIssue = z.strictObject({ kind: workflowText(80), path: z.string().max(500), message: workflowText(2000) });
export type WorkflowIssue = z.infer<typeof workflowIssue>;
export const workflowIssueRead = z.looseObject({ kind: z.string(), path: z.string(), message: z.string() });
