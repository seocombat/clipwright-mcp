import { z } from 'zod';
import { run, runRead } from '../../runs.js';
import { workflowNativeRunRead, workflowOutcomeRead } from './workflow-execution.js';
import { workflowPlanDocumentRead } from './workflow-plan.js';
import { workflowDigest } from './workflow-primitives.js';

const frame = z.number().int().nonnegative().safe();
export const workflowAssetPlacementRead = z.looseObject({
    instance_id: z.string().min(1), asset_id: z.string().min(1), source_digest: workflowDigest,
    first_word: frame, end_word: frame, shot_id: z.string().min(1), start_frame: frame, end_frame: frame,
    normalized_sha256: workflowDigest, width: z.number().int().positive().safe(), height: z.number().int().positive().safe(),
}).refine(value => value.end_word > value.first_word && value.end_frame >= value.start_frame, 'Placement interval must be ordered');
export type WorkflowAssetPlacementRead = z.infer<typeof workflowAssetPlacementRead>;
export const workflowRunOutcomeRead = workflowOutcomeRead.extend({
    approved_plan: workflowPlanDocumentRead, asset_placements: z.array(workflowAssetPlacementRead).nullable(),
}).refine(value => (['method_id', 'version', 'content_digest', 'capability_digest'] as const)
    .every(key => value.receipt.method[key] === value.approved_plan.method[key]), 'Approved plan must identify the purchased method');
export type WorkflowRunOutcomeRead = z.infer<typeof workflowRunOutcomeRead>;
type Identity = { run_id: string; skill: string; state: string; workflow?: WorkflowRunOutcomeRead | undefined };
const identifiesRun = (value: Identity) => !value.workflow || (value.workflow.receipt.run_id === value.run_id &&
    value.workflow.receipt.skill === value.skill && value.workflow.state === value.state);
const workflow = workflowRunOutcomeRead.optional();
export const workflowRunIdentityRead = runRead.pick({ run_id: true, skill: true, state: true }).loose().extend({ workflow })
    .refine(identifiesRun, 'Workflow must identify the native run');
export const workflowRun = run.extend({ workflow }).refine(identifiesRun, 'Workflow must identify the native run');
export type WorkflowRun = z.infer<typeof workflowRun>;
export const workflowRunRead = workflowNativeRunRead.extend({ workflow }).refine(identifiesRun, 'Workflow must identify the native run');
export type WorkflowRunRead = z.infer<typeof workflowRunRead>;
