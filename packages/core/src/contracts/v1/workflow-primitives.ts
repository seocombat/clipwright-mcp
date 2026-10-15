import { z } from 'zod';
import { ASPECT_RATIOS, RESOLUTIONS } from '../../skills.js';

export const WORKFLOW_METHOD_IDS = ['ugc-product-intro', 'ugc-faq-answer', 'faceless-explainer', 'product-image-story', 'website-proof-demo', 'kinetic-launch'] as const;
export const workflowMethodId = z.enum(WORKFLOW_METHOD_IDS);
export const workflowDigest = z.string().regex(/^[a-f0-9]{64}$/);
export const workflowId = z.string().regex(/^wfp_[a-zA-Z0-9_-]{1,64}$/);
export const workflowRevision = z.number().int().positive().safe();
export const workflowLocalId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
export const workflowText = (max: number) => z.string().min(1).max(max).refine(text => text.trim().length > 0, 'Text must not be blank');
export const workflowFormat = z.strictObject({ aspect_ratio: z.enum(ASPECT_RATIOS), resolution: z.enum(RESOLUTIONS) });
export const workflowFormatRead = z.object({ aspect_ratio: z.string(), resolution: z.string() });
export const workflowMethodPin = z.strictObject({ method_id: workflowMethodId, version: workflowRevision, content_digest: workflowDigest, capability_digest: workflowDigest });
export const workflowMethodPinRead = z.object({ method_id: z.string(), version: workflowRevision, content_digest: workflowDigest, capability_digest: workflowDigest });
export type WorkflowMethodPin = z.infer<typeof workflowMethodPin>;

export const workflowIssue = z.strictObject({ kind: workflowText(80), path: z.string().max(500), message: workflowText(2000) });
export type WorkflowIssue = z.infer<typeof workflowIssue>;
export const workflowIssueRead = z.object({ kind: z.string(), path: z.string(), message: z.string() });
