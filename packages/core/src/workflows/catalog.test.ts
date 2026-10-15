import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    WORKFLOW_METHODS, queryWorkflowCatalog, queryWorkflowMethod, checkWorkflowBrief, validateWorkflowPlan,
    methodDescriptor, methodDescriptorRead, capabilityProfile, type CapabilityProfile,
} from './index.js';

const capabilities: CapabilityProfile = {
    v: 1, content_digest: 'a'.repeat(64), executors: [
        { skill: 'make_ugc', configured: true, qualified: true, enabled: true, profiles: ['ugc-native-v1'], features: ['exact_script', 'actor', 'voice'],
            formats: [{ aspect_ratio: '9:16', resolution: '1080p' }], field_dispositions: { captions: 'warned', look: 'warned' } },
        { skill: 'make_faceless', configured: true, qualified: true, enabled: true, profiles: ['faceless-native-v1'], features: ['exact_script', 'voice', 'word_anchors', 'scene_images', 'captions'],
            formats: [{ aspect_ratio: '9:16', resolution: '1080p' }], field_dispositions: {} },
    ],
};

function document(methodId = 'ugc-faq-answer') {
    const method = queryWorkflowMethod(methodId, capabilities)!;
    return { v: 1 as const, method: { method_id: method.descriptor.id, version: method.descriptor.version, content_digest: method.descriptor.content_digest,
        capability_digest: 'a'.repeat(64) }, brief: method.descriptor.example.brief, beats: method.descriptor.example.beats, claims: [], assets: [] };
}

describe('original workflow methods and measured capabilities', () => {
    it('offers all six cards with distinct script structures and native bindings', () => {
        const cards = queryWorkflowCatalog(capabilities).methods;
        expect(cards.map(card => card.descriptor.id)).toEqual(['ugc-product-intro', 'ugc-faq-answer', 'faceless-explainer', 'product-image-story', 'website-proof-demo', 'kinetic-launch']);
        expect(cards.map(card => card.availability.status)).toEqual(['available', 'available', 'available', 'available', 'execution_blocked', 'execution_blocked']);
        expect(new Set(WORKFLOW_METHODS.map(card => card.script_rules.structure.join(','))).size).toBe(6);
        expect(cards[0]!.descriptor.binding.skill).toBe('make_ugc');
        expect(cards[2]!.descriptor.binding.skill).toBe('make_faceless');
        expect(cards[4]!.availability.reasons.map(reason => reason.kind)).toContain('composition_not_qualified');
        expect(cards[5]!.availability.reasons.map(reason => reason.kind)).toContain('tariff_not_chosen');
    });
    it('returns a short index and loads full authoring instructions by method ID', () => {
        const catalog = queryWorkflowCatalog(capabilities);
        expect(catalog.methods[0]!.descriptor).not.toHaveProperty('example');
        expect(catalog.methods[0]!.descriptor).not.toHaveProperty('script_rules');
        expect(queryWorkflowMethod('ugc-product-intro', capabilities)!.descriptor.example.brief.script).toContain('watering');
    });
    it('pins effective card content with SHA256 without Node crypto in the catalog', () => {
        for (const descriptor of WORKFLOW_METHODS) {
            expect(methodDescriptor.safeParse(descriptor).success).toBe(true);
            const { content_digest, ...content } = descriptor;
            expect(content_digest).toBe(createHash('sha256').update(JSON.stringify(content)).digest('hex'));
            expect(descriptor.example.brief.script!.trim().length).toBeGreaterThan(20);
        }
    });
    it('returns no method for an unknown ID and detaches mutable query results', () => {
        expect(queryWorkflowMethod('unknown', capabilities)).toBeNull();
        const first = queryWorkflowMethod('ugc-faq-answer', capabilities)!;
        first.descriptor.title = 'Mutated title';
        expect(queryWorkflowMethod('ugc-faq-answer', capabilities)!.descriptor.title).toBe('Answer one product question');
    });
    it.each(['configured', 'qualified', 'enabled'] as const)('requires %s as well as the other executor gates', field => {
        const snapshot = structuredClone(capabilities);
        snapshot.executors[0]![field] = false;
        expect(queryWorkflowMethod('ugc-product-intro', snapshot)!.availability.status).toBe('execution_blocked');
    });
    it('does not trust a claimed composition executor or a missing native feature', () => {
        const snapshot = structuredClone(capabilities);
        snapshot.executors[1]!.features = ['exact_script', 'voice'];
        expect(queryWorkflowMethod('product-image-story', snapshot)!.availability.reasons.map(reason => reason.kind)).toContain('missing_feature');
        snapshot.executors.push({ ...snapshot.executors[0]!, skill: 'make_composition', profiles: ['website-proof-demo-v1', 'kinetic-launch-v1'] });
        expect(queryWorkflowMethod('website-proof-demo', snapshot)!.availability.status).toBe('execution_blocked');
    });
    it('uses open read projections and closed write profiles', () => {
        const card = { ...WORKFLOW_METHODS[0]!, id: 'future-method', authoring_status: 'future', binding: { kind: 'future_binding', skill: 'future_executor', profile: 'future' }, future: true };
        expect(methodDescriptorRead.parse(card).id).toBe('future-method');
        expect(methodDescriptor.safeParse(card).success).toBe(false);
        expect(capabilityProfile.safeParse({ ...capabilities, unexpected: true }).success).toBe(false);
    });
});

describe('workflow script and semantic readiness', () => {
    it.each(['ugc-product-intro', 'ugc-faq-answer', 'faceless-explainer', 'product-image-story'])('accepts the complete %s fixture plan', methodId => {
        const plan = document(methodId);
        const asset = { asset_id: 'upl_11111111111111111111111111111111', content_digest: 'a'.repeat(64),
            provenance: 'owner_supplied', rights: 'owner_authorized', purpose: 'product_proof' };
        const assets = methodId === 'product-image-story' ? [{ ...asset, instance_id: 'shape', anchor: { quote: 'ceramic mug' } },
            { ...asset, instance_id: 'handle', anchor: { quote: 'wide handle' } }] : [];
        expect(validateWorkflowPlan({ ...plan, assets }, capabilities)).toEqual({ ready: true, issues: [], warnings: [] });
    });
    it('rejects a qualified native format that contradicts requested or method geometry', () => {
        const snapshot = structuredClone(capabilities);
        snapshot.executors[0]!.formats.push({ aspect_ratio: '16:9', resolution: '1080p' });
        const brief = { ...document().brief, requested_format: { aspect_ratio: '9:16', resolution: '1080p' },
            native: { skill: 'make_ugc', input: { script: document().brief.script, aspect_ratio: '16:9' } } };
        expect(checkWorkflowBrief('ugc-faq-answer', brief, snapshot).issues.map(issue => issue.kind)).toContain('format_mismatch');
        expect(checkWorkflowBrief('ugc-faq-answer', { ...brief, requested_format: undefined }, snapshot).issues.map(issue => issue.kind)).toContain('unsupported_format');
    });
    it('matches the raw faceless text without silently trimming native whitespace', () => {
        const base = document('faceless-explainer').brief;
        const script = `  ${base.script}\n`;
        expect(checkWorkflowBrief('faceless-explainer', { ...base, script,
            native: { skill: 'make_faceless', input: { input_mode: 'script', script, duration_seconds: 30 } } }, capabilities).issues.map(issue => issue.kind)).not.toContain('script_mismatch');
        expect(checkWorkflowBrief('faceless-explainer', { ...base,
            native: { skill: 'make_faceless', input: { input_mode: 'script', script, duration_seconds: 30 } } }, capabilities).issues.map(issue => issue.kind)).toContain('script_mismatch');
    });
    it('keeps the accepted beat anchors in script order', () => {
        const plan = document();
        const beats = plan.beats.map((beat, index) => ({ ...beat, anchor: plan.beats[plan.beats.length - index - 1]!.anchor }));
        expect(validateWorkflowPlan({ ...plan, beats }, capabilities).issues.map(issue => issue.kind)).toContain('invalid_method_structure');
    });
    it('does not let native temporary scene URLs replace durable workflow asset bindings', () => {
        const plan = document('faceless-explainer');
        const native = { skill: 'make_faceless', input: { input_mode: 'script', script: plan.brief.script, duration_seconds: 30,
            scene_images: [{ image_url: 'https://example.com/image.png', anchor: { quote: 'absent' } }] } };
        expect(validateWorkflowPlan({ ...plan, brief: { ...plan.brief, native } }, capabilities).issues.map(issue => issue.kind)).toContain('unbound_native_source');
    });
    it('checks the capability pin separately from the authored method pin', () => {
        const plan = document();
        expect(validateWorkflowPlan({ ...plan, method: { ...plan.method, capability_digest: 'b'.repeat(64) } }, capabilities).issues.map(issue => issue.kind)).toContain('capability_pin_changed');
    });
    it('refuses unsupported native output settings even without requested_format', () => {
        const brief = { ...document().brief, native: { skill: 'make_ugc', input: { script: document().brief.script, resolution: '4k' } } };
        expect(checkWorkflowBrief('ugc-faq-answer', brief, capabilities).issues.map(issue => issue.kind)).toContain('unsupported_format');
    });
    it('refuses native fields rejected by the authoritative disposition registry', () => {
        const brief = { ...document().brief, native: { skill: 'make_ugc', input: { script: document().brief.script, character: 'char_abc' } } };
        expect(checkWorkflowBrief('ugc-faq-answer', brief, capabilities).issues.map(issue => issue.kind)).toContain('native_field_rejected');
    });
    it('keeps visual beat roles in the method order and rejects roles from a different method', () => {
        const plan = document();
        expect(validateWorkflowPlan({ ...plan, beats: [...plan.beats].reverse() }, capabilities).issues.map(issue => issue.kind)).toContain('invalid_method_structure');
        expect(validateWorkflowPlan({ ...plan, beats: [{ ...plan.beats[0], role: 'announcement' }] }, capabilities).issues.map(issue => issue.kind)).toContain('invalid_method_structure');
    });
    it('requires a measured placement preflight for a protected product area', () => {
        const plan = document('product-image-story');
        const asset = { instance_id: 'shape', asset_id: 'upl_11111111111111111111111111111111', content_digest: 'a'.repeat(64),
            provenance: 'owner_supplied', rights: 'owner_authorized', purpose: 'product_proof', anchor: { quote: 'ceramic mug' }, protected_area: { x: 0, y: 0, width: 1, height: 1 } };
        expect(validateWorkflowPlan({ ...plan, assets: [asset] }, capabilities).issues.map(issue => issue.kind)).toContain('placement_preflight_required');
    });
    it('keeps brief-only planning free and explains needs_script', () => {
        expect(checkWorkflowBrief('ugc-faq-answer', { audience: 'Users', message: 'Explain export', question: 'Can I export?' }, capabilities).issues.map(issue => issue.kind)).toContain('needs_script');
    });
    it('validates every authored B1 example and keeps B2 explicitly blocked', () => {
        for (const descriptor of WORKFLOW_METHODS) {
            const card = queryWorkflowMethod(descriptor.id, capabilities)!;
            const result = checkWorkflowBrief(descriptor.id, descriptor.example.brief, capabilities);
            if (card.descriptor.binding.kind === 'native') expect(result.issues.filter(issue => ['needs_script', 'script_mismatch', 'missing_method_input'].includes(issue.kind))).toEqual([]);
            else expect(result.ready).toBe(false);
        }
    });
    it('requires the FAQ question and preserves required exact terms', () => {
        const brief = { audience: 'Users', message: 'Explain export', script: 'Export your MP4.', question: 'Can I export?', required_terms: ['1080p'] };
        expect(checkWorkflowBrief('ugc-faq-answer', brief, capabilities).issues.map(issue => issue.kind)).toContain('required_term_missing');
        expect(checkWorkflowBrief('ugc-faq-answer', { ...brief, question: undefined }, capabilities).issues.map(issue => issue.kind)).toContain('missing_method_input');
    });
    it('rejects rewritten native scripts and preserves the accepted text byte for byte', () => {
        const brief = { ...document().brief, script: '  Export your MP4.\n', native: { skill: 'make_ugc' as const, input: { script: 'Export your MP4.' } } };
        expect(checkWorkflowBrief('ugc-faq-answer', brief, capabilities).issues.map(issue => issue.kind)).toContain('script_mismatch');
    });
    it('blocks mandatory unsupported features and warns for advisory native fields', () => {
        const brief = { ...document().brief, requirements: [{ feature: 'captions', required: true }] };
        expect(checkWorkflowBrief('ugc-faq-answer', brief, capabilities).issues.map(issue => issue.kind)).toContain('missing_capability');
        const advisory = { ...brief, requirements: [{ feature: 'captions', required: false }] };
        expect(checkWorkflowBrief('ugc-faq-answer', advisory, capabilities).warnings.length).toBeGreaterThan(0);
    });
    it('blocks an exact still-only product story and unsupported output geometry', () => {
        const brief = { ...document('product-image-story').brief, requirements: [{ feature: 'still_only', required: true }] };
        expect(checkWorkflowBrief('product-image-story', brief, capabilities).issues.map(issue => issue.kind)).toContain('missing_capability');
        expect(checkWorkflowBrief('faceless-explainer', { ...document('faceless-explainer').brief, requested_format: { aspect_ratio: '16:9', resolution: '1080p' } }, capabilities).issues.map(issue => issue.kind)).toContain('unsupported_format');
    });
    it('rejects a changed method pin and advisory-only required visual directives', () => {
        const plan = document();
        expect(validateWorkflowPlan({ ...plan, method: { ...plan.method, content_digest: 'f'.repeat(64) } }, capabilities).issues.map(issue => issue.kind)).toContain('method_pin_changed');
        const faceless = document('faceless-explainer');
        expect(validateWorkflowPlan({ ...faceless, beats: [{ ...faceless.beats[0]!, visual: 'Place a red chart at the top', required: true }] }, capabilities).issues.map(issue => issue.kind)).toContain('unsupported_visual_directive');
    });
    it('does not promote supplied evidence into checked product proof', () => {
        const plan = document();
        const claim = { id: 'proof', text: 'Exports exact source images', required: true, status: 'supplied', source: { kind: 'owner', reference: 'Owner statement' } };
        expect(validateWorkflowPlan({ ...plan, claims: [claim] }, capabilities).issues.map(issue => issue.kind)).toContain('unresolved_claim');
        expect(validateWorkflowPlan({ ...plan, claims: [{ ...claim, status: 'checked' }] }, capabilities).issues.map(issue => issue.kind)).not.toContain('unresolved_claim');
    });
    it('accepts repeated assets as separate instances but refuses overlaps and absent anchors', () => {
        const plan = document('product-image-story');
        const asset = { instance_id: 'front', asset_id: 'upl_11111111111111111111111111111111', content_digest: 'a'.repeat(64),
            provenance: 'owner_supplied', rights: 'owner_authorized', purpose: 'product_proof', anchor: { quote: 'ceramic mug' } };
        const second = { ...asset, instance_id: 'handle', anchor: { quote: 'wide handle' } };
        expect(validateWorkflowPlan({ ...plan, assets: [asset, second] }, capabilities).issues.filter(issue => ['invalid_anchor', 'duplicate_instance'].includes(issue.kind))).toEqual([]);
        expect(validateWorkflowPlan({ ...plan, assets: [asset, { ...second, anchor: asset.anchor }] }, capabilities).issues.map(issue => issue.kind)).toContain('invalid_anchor');
        expect(validateWorkflowPlan({ ...plan, assets: [{ ...asset, anchor: { quote: 'absent phrase' } }] }, capabilities).issues.map(issue => issue.kind)).toContain('invalid_anchor');
        expect(validateWorkflowPlan({ ...plan, assets: [asset, asset] }, capabilities).issues.map(issue => issue.kind)).toContain('duplicate_instance');
    });
});
