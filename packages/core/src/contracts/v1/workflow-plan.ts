import { z } from 'zod';
import { workflowBrief, workflowBriefRead } from './workflow-brief.js';
import { workflowBeat, workflowBeatRead, workflowMethodResponseRead } from './workflow-catalog.js';
import { assetBinding, assetBindingRead, claimEvidence, claimEvidenceRead } from './workflow-evidence.js';
import { isWorkflowTextStorable, workflowDigest, workflowId, workflowIssueRead, workflowMethodPin, workflowMethodPinRead, workflowRevision, workflowText } from './workflow-primitives.js';

const storableJson = (value: unknown): boolean => typeof value === 'string' ? isWorkflowTextStorable(value)
    : Array.isArray(value) ? value.every(storableJson)
    : value !== null && typeof value === 'object' ? Object.entries(value).every(([key, child]) => isWorkflowTextStorable(key) && storableJson(child)) : true;

export const workflowPlanDocument = z.strictObject({
    v: z.literal(1), method: workflowMethodPin, brief: workflowBrief, beats: z.array(workflowBeat).max(100),
    claims: z.array(claimEvidence).max(100), assets: z.array(assetBinding).max(30),
}).refine(document => new Set(document.beats.map(beat => beat.id)).size === document.beats.length, 'Beat IDs must be unique')
    .refine(storableJson, 'Workflow document contains text that cannot be stored')
    .refine(document => new Set(document.claims.map(claim => claim.id)).size === document.claims.length, 'Claim IDs must be unique')
    .refine(document => new TextEncoder().encode(JSON.stringify(document)).length <= WORKFLOW_DOCUMENT_MAX_BYTES, 'Workflow document exceeds the byte limit');
export type WorkflowPlanDocument = z.infer<typeof workflowPlanDocument>;
export type WorkflowPlanDocumentArgs = z.input<typeof workflowPlanDocument>;
export const workflowPlanDocumentRead = z.looseObject({ v: z.number(), method: workflowMethodPinRead, brief: workflowBriefRead,
    beats: z.array(workflowBeatRead), claims: z.array(claimEvidenceRead), assets: z.array(assetBindingRead) });
export const createWorkflowPlan = z.strictObject({ document: workflowPlanDocument });
export const saveWorkflowPlan = z.strictObject({ base_version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), document: workflowPlanDocument });
export const approveWorkflowPlan = z.strictObject({ revision: workflowRevision, content_digest: workflowDigest });
export const workflowPlanRead = z.looseObject({
    v: z.number(), plan_id: workflowId, account_id: workflowText(200), revision: workflowRevision, content_digest: workflowDigest, document: workflowPlanDocumentRead,
    status: z.string(), issues: z.array(workflowIssueRead), warnings: z.array(z.string()), approved_at: z.string().datetime().nullable(), created_at: z.string().datetime(),
    capability_snapshot: workflowMethodResponseRead.shape.capabilities.optional(),
});
export type CreateWorkflowPlanArgs = z.input<typeof createWorkflowPlan>;
export type SaveWorkflowPlanArgs = z.input<typeof saveWorkflowPlan>;
export type ApproveWorkflowPlanArgs = z.input<typeof approveWorkflowPlan>;
export type WorkflowPlanRead = z.infer<typeof workflowPlanRead>;
export const WORKFLOW_DOCUMENT_MAX_BYTES = 256_000;
export function serializeWorkflowDocument(document: WorkflowPlanDocument): { json: string; bytes: number } {
    const json = JSON.stringify(document);
    return { json, bytes: new TextEncoder().encode(json).length };
}
