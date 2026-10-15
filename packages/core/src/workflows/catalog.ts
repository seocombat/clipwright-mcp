import { capabilityProfile, type CapabilityProfile, type MethodDescriptor, type WorkflowMethodResponse, type WorkflowCatalogResponse } from '../contracts/v1/workflow-catalog.js';
import type { WorkflowIssue } from '../contracts/v1/workflow-primitives.js';
import { ugcProductIntro } from './methods/ugc-product-intro.js';
import { ugcFaqAnswer } from './methods/ugc-faq-answer.js';
import { facelessExplainer } from './methods/faceless-explainer.js';
import { productImageStory } from './methods/product-image-story.js';
import { websiteProofDemo } from './methods/website-proof-demo.js';
import { kineticLaunch } from './methods/kinetic-launch.js';

function freeze<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
}
export const WORKFLOW_METHODS: readonly MethodDescriptor[] = freeze([ugcProductIntro, ugcFaqAnswer, facelessExplainer, productImageStory, websiteProofDemo, kineticLaunch]);

function methodResponse(descriptor: MethodDescriptor, snapshot: CapabilityProfile): WorkflowMethodResponse {
    const reasons: WorkflowIssue[] = [];
    if (descriptor.binding.kind === 'blocked') reasons.push(...descriptor.binding.reasons);
    else {
        const executor = snapshot.executors.find(item => item.skill === descriptor.binding.skill);
        if (!executor) reasons.push({ kind: 'executor_missing', path: 'binding', message: `No measured capability snapshot for ${descriptor.binding.skill}.` });
        else {
            for (const gate of ['configured', 'qualified', 'enabled'] as const) {
                if (!executor[gate]) reasons.push({ kind: `executor_not_${gate}`, path: 'binding', message: `${descriptor.binding.skill} is not ${gate}.` });
            }
            if (!executor.profiles.includes(descriptor.binding.profile)) reasons.push({ kind: 'profile_not_qualified', path: 'binding.profile', message: `Profile ${descriptor.binding.profile} is not qualified.` });
            for (const feature of descriptor.required_features) {
                if (!executor.features.includes(feature) || ['warned', 'rejected', 'stored'].includes(executor.field_dispositions[feature] ?? '')) {
                    reasons.push({ kind: 'missing_feature', path: 'required_features', message: `Required capability ${feature} is unavailable.` });
                }
            }
            if (!descriptor.output.formats.some(format => executor.formats.some(actual => actual.aspect_ratio === format.aspect_ratio && actual.resolution === format.resolution))) {
                reasons.push({ kind: 'unsupported_format', path: 'output.formats', message: 'No qualified output format matches this method.' });
            }
        }
    }
    return structuredClone({ descriptor, availability: { status: reasons.length === 0 ? 'available' : 'execution_blocked', reasons }, capabilities: snapshot });
}
export function queryWorkflowCatalog(capabilities: CapabilityProfile): WorkflowCatalogResponse {
    const snapshot = capabilityProfile.parse(capabilities);
    return { v: 1, capabilities: structuredClone(snapshot), methods: WORKFLOW_METHODS.map(descriptor => {
        const response = methodResponse(descriptor, snapshot);
        const { id, version, content_digest, title, purpose, binding } = response.descriptor;
        return { descriptor: { id, version, content_digest, title, purpose, binding }, availability: response.availability };
    }) };
}
export function queryWorkflowMethod(id: string, capabilities: CapabilityProfile): WorkflowMethodResponse | null {
    const snapshot = capabilityProfile.parse(capabilities);
    const descriptor = WORKFLOW_METHODS.find(method => method.id === id);
    return descriptor ? methodResponse(descriptor, snapshot) : null;
}
