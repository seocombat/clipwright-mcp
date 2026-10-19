import { workflowBrief, type WorkflowNativeInput } from '../contracts/v1/workflow-brief.js';
import type { CapabilityProfile } from '../contracts/v1/workflow-catalog.js';
import { workflowPlanDocument } from '../contracts/v1/workflow-plan.js';
import type { WorkflowIssue } from '../contracts/v1/workflow-primitives.js';
import { damagedTextPaths } from '../script-integrity.js';
import { planSemanticInserts } from '../semantic-inserts.js';
import { resolveFacelessCustomerAnchors } from '../faceless-customer-anchors.js';
import type { FacelessSceneAnchor } from '../faceless-public.js';
import { FIELD_DISPOSITIONS } from '../contract-dispositions.js';
import { makeUgcInputShape } from '../skills.js';
import { queryWorkflowMethod } from './catalog.js';
import { workflowProductReferenceWarnings } from './product-references.js';

export type WorkflowReadiness = { ready: boolean; issues: WorkflowIssue[]; warnings: string[] };
const result = (issues: WorkflowIssue[], warnings: string[]): WorkflowReadiness => ({ ready: issues.length === 0, issues, warnings });
const semanticAnchor = (anchor: FacelessSceneAnchor) => 'startWord' in anchor ? anchor
    : { quote: anchor.quote, ...(anchor.occurrence === undefined ? {} : { occurrence: anchor.occurrence }) };
const nativeFieldRequested = (input: Readonly<Record<string, unknown>>, field: string, skill: WorkflowNativeInput['skill']): boolean => {
    if (field === 'captions') return input[field] === true;
    if (input[field] === undefined) return false;
    if (skill === 'make_ugc' && field in FIELD_DISPOSITIONS) {
        const key = field as keyof typeof FIELD_DISPOSITIONS, disposition = FIELD_DISPOSITIONS[key];
        if (disposition.kind === 'warned' && disposition.triggersWhen === 'differs-from-default') {
            const standard = makeUgcInputShape[key].safeParse(undefined);
            return !standard.success || input[field] !== standard.data;
        }
    }
    return true;
};

function nativeTransportPaths(native: WorkflowNativeInput): string[] {
    const paths: string[] = [];
    if (native.skill === 'make_ugc') {
        for (const field of ['image', 'broll_url'] as const) if (native.input[field] !== undefined) paths.push(field);
        for (const [index, segment] of (native.input.segments ?? []).entries()) if (segment.media_url !== undefined) paths.push(`segments.${index}.media_url`);
        for (const [index] of (native.input.inserts ?? []).entries()) paths.push(`inserts.${index}.media_url`);
    } else {
        for (const field of ['style_reference', 'character_reference'] as const) if (native.input[field] !== undefined) paths.push(field);
        for (const [index] of (native.input.scene_images ?? []).entries()) paths.push(`scene_images.${index}.image_url`);
    }
    return paths;
}

/** Semantic readiness only: ownership, expiry, media placement, pricing and permission remain native admission work. */
export function checkWorkflowBrief(methodId: string, input: unknown, capabilities: CapabilityProfile): WorkflowReadiness {
    const issues: WorkflowIssue[] = [];
    const warnings: string[] = [];
    const add = (code: string, path: string, message: string) => issues.push({ kind: code, path, message });
    const method = queryWorkflowMethod(methodId, capabilities);
    if (!method) return result([{ kind: 'unknown_method', path: 'method', message: 'Workflow method does not exist.' }], []);
    issues.push(...method.availability.reasons);
    const parsed = workflowBrief.safeParse(input);
    if (!parsed.success) return result([...issues, ...parsed.error.issues.map(issue => ({ kind: 'invalid_brief', path: issue.path.join('.'), message: issue.message }))], warnings);
    const brief = parsed.data;
    const descriptor = method.descriptor;
    for (const field of descriptor.required_inputs) {
        if (field === 'assets') continue;
        if (brief[field] === undefined) add(field === 'script' ? 'needs_script' : 'missing_method_input', `brief.${field}`, `This method requires ${field}.`);
    }
    for (const path of damagedTextPaths(brief)) add('damaged_text', `brief.${path}`, 'Text contains a replacement character: repair it before approval.');
    for (const term of brief.required_terms) {
        if (brief.script !== undefined && !brief.script.includes(term)) add('required_term_missing', 'brief.script', `The accepted script must contain the exact required term: ${term}`);
    }
    if (descriptor.binding.kind === 'native') {
        const executor = capabilities.executors.find(item => item.skill === descriptor.binding.skill);
        for (const requirement of brief.requirements) {
            if (!executor?.features.includes(requirement.feature) || ['warned', 'rejected', 'stored'].includes(executor.field_dispositions[requirement.feature] ?? '')) {
                if (requirement.required) add('missing_capability', 'brief.requirements', `Required capability ${requirement.feature} is not honored by this binding.`);
                else warnings.push(`Optional capability ${requirement.feature} is not honored by this binding.`);
            }
        }
        if (brief.requested_format && (!descriptor.output.formats.some(format => format.aspect_ratio === brief.requested_format!.aspect_ratio && format.resolution === brief.requested_format!.resolution) ||
            !executor?.formats.some(format => format.aspect_ratio === brief.requested_format!.aspect_ratio && format.resolution === brief.requested_format!.resolution))) {
            add('unsupported_format', 'brief.requested_format', 'Requested geometry is not qualified for this workflow binding.');
        }
        if (brief.native === undefined) add('needs_native_input', 'brief.native', 'Choose the supported native input before approval and launch.');
        else if (brief.native.skill !== descriptor.binding.skill) add('executor_mismatch', 'brief.native.skill', 'Native input does not match the method executor.');
        else {
            const native = brief.native.input;
            if (!('script' in native) || native.script !== brief.script) add('script_mismatch', 'brief.native.input.script', 'Native execution must use the exact accepted script. Brief mode and segmented narration cannot replace it.');
            const format = brief.native.skill === 'make_ugc' ? { aspect_ratio: brief.native.input.aspect_ratio ?? '9:16', resolution: brief.native.input.resolution ?? '1080p' }
                : { aspect_ratio: '9:16', resolution: '1080p' };
            if (!descriptor.output.formats.some(actual => actual.aspect_ratio === format.aspect_ratio && actual.resolution === format.resolution)) {
                add('unsupported_format', 'brief.native.input', 'Native output settings contradict this method output profile.');
            }
            if (brief.requested_format && (format.aspect_ratio !== brief.requested_format.aspect_ratio || format.resolution !== brief.requested_format.resolution)) {
                add('format_mismatch', 'brief.requested_format', 'The requested format must match the effective native output settings.');
            }
            for (const path of nativeTransportPaths(brief.native)) add('unbound_native_source', `brief.native.input.${path}`, 'Use stable asset bindings; native transport URLs are resolved only by launch preflight.');
            if (brief.native.skill === 'make_ugc') {
                const settings = brief.native.input;
                if ((settings.inserts !== undefined || settings.segments !== undefined) &&
                    (!executor?.features.includes('long_form') || ['warned', 'rejected', 'stored'].includes(executor.field_dispositions.long_form ?? ''))) {
                    add('missing_capability', 'brief.native.input', 'Segments and inserts require native long-form qualification on this deployment.');
                }
                if (!executor?.formats.some(actual => actual.aspect_ratio === format.aspect_ratio && actual.resolution === format.resolution)) {
                    add('unsupported_format', 'brief.native.input', 'Native output settings are not qualified on this deployment.');
                }
                for (const [field, disposition] of Object.entries(FIELD_DISPOSITIONS)) {
                    if ((disposition.kind === 'rejected' || executor?.field_dispositions[field] === 'rejected') && nativeFieldRequested(settings, field, 'make_ugc')) {
                        add('native_field_rejected', `brief.native.input.${field}`, disposition.kind === 'rejected' ? disposition.message : `Native ${field} is rejected on this deployment.`);
                    }
                }
                for (const field of ['captions', 'look', 'person', 'caption_style', 'name'] as const) {
                    if (nativeFieldRequested(settings, field, 'make_ugc') &&
                        executor?.field_dispositions[field] !== 'implemented') warnings.push(`Native ${field} is advisory or not honored; launch keeps the native disposition.`);
                }
            } else {
                for (const [field, disposition] of Object.entries(executor?.field_dispositions ?? {})) {
                    if (disposition === 'rejected' && nativeFieldRequested(native, field, 'make_faceless')) {
                        add('native_field_rejected', `brief.native.input.${field}`, `Native ${field} is rejected on this deployment.`);
                    }
                }
            }
        }
    }
    return result(issues, warnings);
}

export function validateWorkflowPlan(input: unknown, capabilities: CapabilityProfile): WorkflowReadiness {
    const parsed = workflowPlanDocument.safeParse(input);
    if (!parsed.success) return result(parsed.error.issues.map(issue => ({ kind: 'invalid_plan', path: issue.path.join('.'), message: issue.message })), []);
    const document = parsed.data;
    const readiness = checkWorkflowBrief(document.method.method_id, document.brief, capabilities);
    const { issues, warnings } = readiness;
    warnings.push(...workflowProductReferenceWarnings(document.method.method_id, document.assets));
    const add = (code: string, path: string, message: string) => issues.push({ kind: code, path, message });
    const method = queryWorkflowMethod(document.method.method_id, capabilities)!;
    if (document.method.version !== method.descriptor.version || document.method.content_digest !== method.descriptor.content_digest) {
        add('method_pin_changed', 'method', 'The method content has changed; save a new revision and approve its exact digest.');
    }
    if (document.method.capability_digest !== capabilities.content_digest) add('capability_pin_changed', 'method.capability_digest', 'Capabilities changed; revalidate, save and approve a new revision before a new launch.');
    for (const claim of document.claims) {
        if (claim.status !== 'checked') {
            if (claim.required) add('unresolved_claim', `claims.${claim.id}`, 'Required product evidence is not checked.');
            else warnings.push(`Claim ${claim.id} is ${claim.status}; it is not checked proof.`);
        }
    }
    const script = document.brief.script;
    const faceless = method.descriptor.binding.kind === 'native' && method.descriptor.binding.skill === 'make_faceless';
    let previousRole = -1;
    let previousWord = -1;
    for (const beat of document.beats) {
        const role = method.descriptor.script_rules.structure.indexOf(beat.role);
        if (role < 0 || role < previousRole) add('invalid_method_structure', `beats.${beat.id}.role`, 'Beat roles must follow this method script structure in order.');
        previousRole = role;
        if (beat.visual !== undefined && method.descriptor.binding.kind === 'native') {
            if (beat.required) add('unsupported_visual_directive', `beats.${beat.id}`, 'The native binding does not enforce authored visual directions.');
            else warnings.push(`Visual direction for beat ${beat.id} is advisory; the executor chooses its actual layout.`);
        }
        if (script !== undefined) {
            try {
                const first = faceless ? resolveFacelessCustomerAnchors(script, [{ image_url: beat.id, anchor: beat.anchor }])[0]!.first
                    : planSemanticInserts(script, [{ insertId: beat.id, mediaId: beat.id, anchor: semanticAnchor(beat.anchor) }]).inserts[0]!.startWord;
                if (first < previousWord) add('invalid_method_structure', `beats.${beat.id}.anchor`, 'Accepted semantic beats must follow the script order.');
                previousWord = first;
            }
            catch (error) { add('invalid_anchor', `beats.${beat.id}.anchor`, error instanceof Error ? error.message : 'Invalid semantic anchor.'); }
        }
    }
    const instances = new Set<string>();
    if (document.assets.length > 0 && method.descriptor.binding.kind === 'native') {
        const executor = capabilities.executors.find(item => item.skill === method.descriptor.binding.skill);
        if (method.descriptor.binding.skill === 'make_ugc') add('unsupported_asset_binding', 'assets', 'This B1 UGC binding does not compile faceless asset placements.');
        else if (!executor?.features.includes('scene_images') || ['warned', 'rejected', 'stored'].includes(executor.field_dispositions.scene_images ?? '')) {
            add('missing_capability', 'assets', 'Supplied assets require qualified scene_images support.');
        }
    }
    for (const asset of document.assets) {
        if (instances.has(asset.instance_id)) add('duplicate_instance', 'assets', 'Each asset placement needs its own instance ID.');
        instances.add(asset.instance_id);
        if (asset.rights === 'unresolved') add('unresolved_rights', `assets.${asset.instance_id}`, 'Asset rights are unresolved.');
        if (asset.protected_area !== undefined) {
            const executor = faceless ? capabilities.executors.find(item => item.skill === 'make_faceless') : undefined;
            if (!executor?.configured || !executor.qualified || !executor.enabled || !executor.features.includes('protected_product_area') ||
                executor.field_dispositions.protected_product_area !== 'implemented') {
                add('placement_preflight_required', `assets.${asset.instance_id}.protected_area`, 'A measured crop and motion preflight must prove that this product area remains visible.');
            }
        }
        if (asset.purpose !== 'illustration' && asset.provenance === 'generated_illustration') add('unsupported_proof', `assets.${asset.instance_id}`, 'Generated illustration cannot establish product or UI proof.');
    }
    if (method.descriptor.required_inputs.includes('assets') && document.assets.length === 0) add('missing_method_input', 'assets', 'This method requires supplied asset bindings.');
    if (method.descriptor.id === 'product-image-story' && document.assets.length > 0 && !document.assets.some(asset => asset.purpose === 'product_proof' && asset.provenance !== 'generated_illustration')) {
        add('missing_product_proof', 'assets', 'This method requires original product proof; illustrative assets cannot replace it.');
    }
    if (script !== undefined && document.assets.length > 0) {
        try {
            if (faceless) resolveFacelessCustomerAnchors(script, document.assets.map(asset => ({ image_url: asset.asset_id, anchor: asset.anchor })));
            else planSemanticInserts(script, document.assets.map(asset => ({ insertId: asset.instance_id, mediaId: asset.asset_id, anchor: semanticAnchor(asset.anchor) })));
        }
        catch (error) { add('invalid_anchor', 'assets', error instanceof Error ? error.message : 'Asset anchors are invalid or overlap.'); }
    }
    return result(issues, warnings);
}
