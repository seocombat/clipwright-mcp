import { z } from 'zod';
import { facelessSceneAnchor } from '../../faceless-public.js';
import { workflowBrief, workflowBriefRead } from './workflow-brief.js';
import { workflowAnchorRead } from './workflow-evidence.js';
import { workflowDigest, workflowFormat, workflowFormatRead, workflowIssue, workflowIssueRead, workflowLocalId, workflowMethodId, workflowRevision, workflowText } from './workflow-primitives.js';

export const workflowBeat = z.strictObject({ id: workflowLocalId, role: workflowText(80), anchor: facelessSceneAnchor, required: z.boolean(), visual: workflowText(2000).optional() });
export type WorkflowBeat = z.infer<typeof workflowBeat>;
export const workflowBeatRead = z.looseObject({ id: z.string(), role: z.string(), anchor: workflowAnchorRead, required: z.boolean(), visual: z.string().optional() });
const binding = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('native'), skill: z.enum(['make_ugc', 'make_faceless']), profile: workflowText(80), visual_beats: z.literal('advisory') }),
    z.strictObject({ kind: z.literal('blocked'), skill: z.literal('make_composition'), profile: workflowText(80), reasons: z.array(workflowIssue).min(1).max(20) }),
]);
const descriptorShape = {
    id: workflowMethodId, version: workflowRevision, content_digest: workflowDigest, authoring_status: z.literal('ready'),
    title: workflowText(200), purpose: workflowText(2000), required_inputs: z.array(z.enum(['audience', 'message', 'script', 'question', 'product', 'topic', 'assets'])).min(1).max(10),
    required_features: z.array(workflowText(80)).min(1).max(30),
    script_rules: z.strictObject({ structure: z.array(workflowText(80)).min(1).max(20), instructions: z.array(workflowText(2000)).min(1).max(20) }),
    binding, output: z.strictObject({ formats: z.array(workflowFormat).min(1).max(20), timing: workflowText(2000) }),
    limitations: z.array(workflowText(2000)).min(1).max(30), qa_policy: z.array(workflowText(2000)).min(1).max(30),
    example: z.strictObject({ brief: workflowBrief, beats: z.array(workflowBeat).min(1).max(100) }),
};
export const methodDescriptor = z.strictObject(descriptorShape);
export type MethodDescriptor = z.infer<typeof methodDescriptor>;
export type MethodDescriptorArgs = z.input<typeof methodDescriptor>;
export const methodDescriptorRead = z.looseObject({ ...descriptorShape,
    id: z.string(), authoring_status: z.string(), required_inputs: z.array(z.string()), required_features: z.array(z.string()),
    script_rules: z.looseObject({ structure: z.array(z.string()), instructions: z.array(z.string()) }),
    binding: z.looseObject({ kind: z.string(), skill: z.string(), profile: z.string(), visual_beats: z.string().optional(), reasons: z.array(workflowIssueRead).optional() }),
    output: z.looseObject({ formats: z.array(workflowFormatRead), timing: z.string() }), example: z.looseObject({ brief: workflowBriefRead, beats: z.array(workflowBeatRead) }),
});
export const executorCapability = z.strictObject({
    skill: workflowText(80), configured: z.boolean(), qualified: z.boolean(), enabled: z.boolean(), profiles: z.array(workflowText(80)).max(30),
    features: z.array(workflowText(80)).max(100), formats: z.array(workflowFormat).max(30),
    field_dispositions: z.record(z.string().max(80), z.enum(['implemented', 'warned', 'rejected', 'stored'])),
});
export type ExecutorCapability = z.infer<typeof executorCapability>;
export const capabilityProfile = z.strictObject({ v: z.literal(1), content_digest: workflowDigest.describe('SHA256 computed by the server capability resolver from the effective snapshot; never accept a client-asserted digest.'), executors: z.array(executorCapability).max(20) })
    .refine(snapshot => new Set(snapshot.executors.map(executor => executor.skill)).size === snapshot.executors.length, 'Executor skills must be unique');
export type CapabilityProfile = z.infer<typeof capabilityProfile>;
export const workflowAvailability = z.strictObject({ status: z.enum(['available', 'execution_blocked']), reasons: z.array(workflowIssue).max(100) });
export const workflowMethodResponse = z.strictObject({ descriptor: methodDescriptor, availability: workflowAvailability, capabilities: capabilityProfile });
export type WorkflowMethodResponse = z.infer<typeof workflowMethodResponse>;
export const workflowMethodSummary = z.strictObject({ descriptor: methodDescriptor.pick({ id: true, version: true, content_digest: true, title: true, purpose: true, binding: true }), availability: workflowAvailability });
export const workflowCatalogResponse = z.strictObject({ v: z.literal(1), capabilities: capabilityProfile, methods: z.array(workflowMethodSummary).max(100) });
export type WorkflowCatalogResponse = z.infer<typeof workflowCatalogResponse>;
export const workflowMethodResponseRead = z.looseObject({ descriptor: methodDescriptorRead,
    availability: z.looseObject({ status: z.string(), reasons: z.array(workflowIssueRead) }),
    capabilities: z.looseObject({ v: z.number(), content_digest: workflowDigest, executors: z.array(z.looseObject({ skill: z.string(), configured: z.boolean(), qualified: z.boolean(), enabled: z.boolean(), profiles: z.array(z.string()), features: z.array(z.string()), formats: z.array(workflowFormatRead), field_dispositions: z.record(z.string(), z.string()) })) }),
});
export const workflowCatalogResponseRead = z.looseObject({ v: z.number(), capabilities: workflowMethodResponseRead.shape.capabilities,
    methods: z.array(z.looseObject({ descriptor: methodDescriptorRead.pick({ id: true, version: true, content_digest: true, title: true, purpose: true, binding: true }), availability: workflowMethodResponseRead.shape.availability })) });
export type WorkflowCatalogRead = z.infer<typeof workflowCatalogResponseRead>;
export type WorkflowMethodRead = z.infer<typeof workflowMethodResponseRead>;
