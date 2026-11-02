import { z } from 'zod';
import { approveWorkflowPlan, saveWorkflowPlan, workflowPlanDocument } from './workflow-plan.js';
import { launchWorkflow } from './workflow-execution.js';
import { workflowId, workflowText } from './workflow-primitives.js';
import { workflowBrief, workflowNativeInput } from './workflow-brief.js';
import { offeredUgcInputShape } from '../../contract-dispositions.js';
import { planReferenceRemake } from '../../workflows/reference-remake.js';

const [ugc, faceless] = workflowNativeInput.options;
type UgcShape = typeof ugc.shape.input.shape;
const offeredShape = Object.fromEntries(Object.keys(offeredUgcInputShape).map(key => [key, ugc.shape.input.shape[key as keyof UgcShape]])) as
    Pick<UgcShape, keyof typeof offeredUgcInputShape>;
const offeredUgc = z.strictObject(offeredShape).superRefine((value, context) => {
    const parsed = ugc.shape.input.safeParse(value);
    if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
});
const offeredBrief = workflowBrief.safeExtend({ native: z.discriminatedUnion('skill', [ugc.safeExtend({ input: offeredUgc }), faceless]).optional() });
const offeredDocument = workflowPlanDocument.safeExtend({ brief: offeredBrief });

export const workflowToolInputs = {
    list_workflows: z.strictObject({}),
    get_workflow: z.strictObject({ method_id: workflowText(200) }),
    prepare_workflow_plan: z.strictObject({ document: offeredDocument, plan_id: workflowId.optional(),
        base_version: saveWorkflowPlan.shape.base_version.optional() })
        .refine(value => (value.plan_id === undefined) === (value.base_version === undefined), 'plan_id and base_version must be supplied together'),
    plan_reference_remake: planReferenceRemake,
    get_workflow_plan: z.strictObject({ plan_id: workflowId }),
    approve_workflow_plan: z.strictObject({ plan_id: workflowId, ...approveWorkflowPlan.shape }),
    quote_workflow_plan: z.strictObject({ plan_id: workflowId }),
    run_workflow_plan: z.strictObject({ plan_id: workflowId, ...launchWorkflow.shape }),
};
export const WORKFLOW_TOOL_DESCRIPTIONS = {
    list_workflows: 'List seven workflow methods and their current availability. Free and read-only. Five methods use native executors; website-proof-demo and kinetic-launch remain execution_blocked. Availability is not account-specific permission to buy.',
    get_workflow: 'Read one workflow method by method_id: required inputs, script rules, evidence, limitations and current availability. Free and read-only. Use the returned method and capability digests in a plan.',
    prepare_workflow_plan: 'Create or save a workflow plan without paying or starting a run. Supply the complete document. Omit both plan_id and base_version to create; supply both to save a revision. The document is strict and bounded to 256000 JSON bytes. Preserve exact accepted narration. After a lost save answer, read and compare the saved document; do not automatically approve or purchase.',
    plan_reference_remake: 'Compile a reference remake into a new workflow plan without paying or starting a run. Free. Pass the reference_profile of the ad to remake, the accepted script (copied unchanged), actor_id, a voice and optional ready ast_* assets. The server lays the script on the reference beats and picks templates, captions and sounds; its warnings name everything the plan does not reproduce. Nothing is generated: make missing media separately with generate_image or generate_video, each with its own quote, and compile again. Then approve, quote and run the plan as any other.',
    get_workflow_plan: 'Read the current account-owned plan, revision, content digest, readiness issues and warnings. Free and read-only. The document is intent; it is not a delivered video or creative acceptance.',
    approve_workflow_plan: 'Explicitly approve the chosen plan revision and content_digest. Free; it stores approval but starts no run. Read all issues and warnings first. Approval is separate from a quote and a paid launch.',
    quote_workflow_plan: 'Quote the approved current plan without spending credits. Free and read-only. Show the native price and every warning before requesting a paid launch. The returned quote_id expires and binds the exact revision and semantic input. Its launch is the ready run_workflow_plan body, with a fresh idempotency_key.',
    run_workflow_plan: 'Start one explicitly approved paid workflow run: pass the launch object of its quote unchanged (revision, content_digest, semantic_input_digest, quote_id and idempotency_key). Over REST, send the header Idempotency-Key equal to launch.idempotency_key; this tool sets it for you. Returns immediately with its captured receipt and native run_id; call get_run with its poll.arguments. Never auto-approve, auto-quote or invent a new key. If delivery is uncertain, recover with the original request and key; a new key can pay twice. Technical evidence is separate from human creative acceptance.',
} as const;
