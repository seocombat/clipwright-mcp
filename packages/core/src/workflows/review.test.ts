import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { WORKFLOW_METHODS, capabilityProfile, workflowNativeInput, queryWorkflowMethod, checkWorkflowBrief, validateWorkflowPlan,
    protectedProductArea, workflowPlanDocument, type CapabilityProfile } from './index.js';

const snapshot: CapabilityProfile = { v: 1, content_digest: 'a'.repeat(64), executors: [
    { skill: 'make_ugc', configured: true, qualified: true, enabled: true, profiles: ['ugc-native-v1'], features: ['exact_script', 'actor', 'voice'],
        formats: [{ aspect_ratio: '9:16', resolution: '1080p' }], field_dispositions: { captions: 'warned', look: 'warned' } },
    { skill: 'make_faceless', configured: true, qualified: true, enabled: true, profiles: ['faceless-native-v1'], features: ['exact_script', 'voice', 'word_anchors', 'scene_images'],
        formats: [{ aspect_ratio: '9:16', resolution: '1080p' }], field_dispositions: {} },
] };
const plan = (id = 'ugc-faq-answer') => {
    const card = queryWorkflowMethod(id, snapshot)!.descriptor;
    return { v: 1, method: { method_id: id, version: card.version, content_digest: card.content_digest, capability_digest: snapshot.content_digest },
        brief: card.example.brief, beats: card.example.beats, claims: [], assets: [] };
};
const asset = { instance_id: 'shape', asset_id: 'upl_11111111111111111111111111111111', content_digest: 'b'.repeat(64),
    provenance: 'owner_supplied', rights: 'owner_authorized', purpose: 'product_proof', anchor: { quote: 'ceramic mug' } };
const kinds = (value: ReturnType<typeof validateWorkflowPlan>) => value.issues.map(issue => issue.kind);
type ToolSchema = { const?: unknown; properties?: Record<string, ToolSchema>; oneOf?: ToolSchema[]; anyOf?: ToolSchema[]; minItems?: number; maxItems?: number; items?: ToolSchema;
    minLength?: number; maxLength?: number; required?: string[]; additionalProperties?: boolean };

describe('WF-01 review: independent catalog qualification and immutability', () => {
    it('discloses bounded product-photo conditioning and illustration limits in plan readiness', () => {
        const checked = validateWorkflowPlan({ ...plan('product-image-story'), assets: [asset] }, snapshot);
        expect(checked.ready).toBe(true);
        const warnings = checked.warnings.join(' ');
        expect(warnings).toContain('1 original product-photo'); expect(warnings).toContain('first two distinct');
        expect(warnings).toContain('primary shape'); expect(warnings).toContain('may differ');
    });
    it.each(['make_ugc', 'make_faceless'])('blocks %s when the declared method profile is missing', skill => {
        const changed = structuredClone(snapshot);
        changed.executors.find(executor => executor.skill === skill)!.profiles = ['unrelated-profile'];
        const id = skill === 'make_ugc' ? 'ugc-faq-answer' : 'faceless-explainer';
        expect(queryWorkflowMethod(id, changed)!.availability.status).toBe('execution_blocked');
        expect(kinds(checkWorkflowBrief(id, plan(id).brief, changed))).toContain('profile_not_qualified');
    });
    it.each([{ formats: [] }, { formats: [{ aspect_ratio: '16:9' as const, resolution: '1080p' as const }] }, { formats: [{ aspect_ratio: '9:16' as const, resolution: '720p' as const }] }])('blocks unqualified faceless output geometry %#', ({ formats }) => {
        const changed = structuredClone(snapshot);
        changed.executors[1]!.formats = formats;
        expect(queryWorkflowMethod('faceless-explainer', changed)!.availability.status).toBe('execution_blocked');
        expect(checkWorkflowBrief('faceless-explainer', plan('faceless-explainer').brief, changed).ready).toBe(false);
        expect(kinds(checkWorkflowBrief('faceless-explainer', plan('faceless-explainer').brief, changed))).toContain('unsupported_format');
    });
    it('refuses duplicate executor skills even when their feature sets disagree', () => {
        const changed = { ...snapshot, executors: [...snapshot.executors, { ...snapshot.executors[0]!, enabled: false }] };
        expect(capabilityProfile.safeParse(changed).success).toBe(false);
        expect(() => queryWorkflowMethod('ugc-faq-answer', changed)).toThrow();
    });
    it('prevents callers from changing exported cards, nested rules or the catalog array', () => {
        const card = WORKFLOW_METHODS.find(method => method.id === 'ugc-faq-answer')!;
        expect(Reflect.set(card, 'title', 'Invented question')).toBe(false);
        expect(Reflect.set(card.script_rules.structure, '0', 'invented')).toBe(false);
        expect(Reflect.set(WORKFLOW_METHODS, 'length', 0)).toBe(false);
        expect(queryWorkflowMethod('ugc-faq-answer', snapshot)!.descriptor.title).toBe('Answer one product question');
        expect(queryWorkflowMethod('ugc-faq-answer', snapshot)!.descriptor.script_rules.structure).toEqual(['answer', 'explanation', 'next_step']);
    });
});

describe('WF-01 review: bounded documents and complete semantic checks', () => {
    it.each([{ x: 0.8, y: 0, width: 0.3, height: 0.5 }, { x: 0, y: 0.8, width: 0.5, height: 0.3 }])('refuses a protected area beyond source bounds %#', area => {
        expect(protectedProductArea.safeParse(area).success).toBe(false);
        expect(workflowPlanDocument.safeParse({ ...plan('product-image-story'), assets: [{ ...asset, protected_area: area }] }).success).toBe(false);
    });
    it('accepts an area touching the far boundaries without exceeding them', () => {
        expect(protectedProductArea.safeParse({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 }).success).toBe(true);
    });
    it('refuses repeated claim IDs independently of beat and asset IDs', () => {
        const claim = { id: 'fact', text: 'Download an MP4', required: true, status: 'checked', source: { kind: 'owner', reference: 'Supplied fact' } };
        expect(workflowPlanDocument.safeParse({ ...plan(), claims: [claim, { ...claim, text: 'A conflicting claim' }] }).success).toBe(false);
    });
    it.each(['script', 'message', 'native', 'reference'])('refuses damaged text in every brief branch: %s', field => {
        const brief = structuredClone(plan().brief);
        if (field === 'script') {
            brief.script = 'Broken \uFFFD text';
            brief.native = { skill: 'make_ugc', input: { script: brief.script, captions: false, caption_style: 'hormozi', look: 'natural' } };
        } else if (field === 'message') brief.message = 'Broken \uFFFD fact';
        else if (field === 'reference') brief.references = [{ kind: 'owner', reference: 'Broken \uFFFD evidence' }];
        else if (brief.native?.skill === 'make_ugc') brief.native.input.name = 'Broken \uFFFD name';
        const checked = checkWorkflowBrief('ugc-faq-answer', brief, snapshot);
        expect(checked.ready).toBe(false);
        expect(kinds(checked)).toContain('damaged_text');
    });
    it.each(['ugc-faq-answer', 'faceless-explainer'])('refuses the wrong native executor for %s', id => {
        const brief = plan(id).brief;
        const native = id === 'ugc-faq-answer' ? { skill: 'make_faceless', input: { input_mode: 'script', script: brief.script, duration_seconds: 30 } }
            : { skill: 'make_ugc', input: { script: brief.script } };
        expect(kinds(checkWorkflowBrief(id, { ...brief, native }, snapshot))).toContain('executor_mismatch');
    });
    it.each(['ugc-faq-answer', 'faceless-explainer'])('requires a native input for an otherwise complete %s brief', id => {
        const checked = checkWorkflowBrief(id, { ...plan(id).brief, native: undefined }, snapshot);
        expect(checked.ready).toBe(false);
        expect(kinds(checked)).toContain('needs_native_input');
    });
    it.each(['warned', 'rejected', 'stored'] as const)('does not honor a listed required feature whose disposition is %s', disposition => {
        const changed = structuredClone(snapshot);
        changed.executors[0]!.features.push('captions');
        changed.executors[0]!.field_dispositions.captions = disposition;
        const checked = checkWorkflowBrief('ugc-faq-answer', { ...plan().brief, requirements: [{ feature: 'captions', required: true }] }, changed);
        expect(checked.ready).toBe(false);
        expect(kinds(checked)).toContain('missing_capability');
    });
    it('does not reject an implemented required feature merely because it is required', () => {
        const changed = structuredClone(snapshot);
        changed.executors[0]!.features.push('captions');
        changed.executors[0]!.field_dispositions.captions = 'implemented';
        expect(checkWorkflowBrief('ugc-faq-answer', { ...plan().brief, requirements: [{ feature: 'captions', required: true }] }, changed).ready).toBe(true);
    });
    it('requires product-image assets on an otherwise complete plan', () => {
        const checked = validateWorkflowPlan(plan('product-image-story'), snapshot);
        expect(checked.ready).toBe(false);
        expect(checked.issues).toContainEqual({ kind: 'missing_method_input', path: 'assets', message: 'This method requires supplied asset bindings.' });
    });
    it('refuses reversed method roles even when anchors stay in script order', () => {
        const document = plan();
        const checked = validateWorkflowPlan({ ...document, beats: document.beats.map((beat, index) => ({ ...beat, role: index === 0 ? 'next_step' : 'answer' })) }, snapshot);
        expect(checked.ready).toBe(false);
        expect(kinds(checked)).toContain('invalid_method_structure');
    });
    it.each([{ quote: 'missing words' }, { startWord: 999, endWord: 1000 }, { quote: 'the', occurrence: 999 }])('refuses an invalid beat anchor independently of assets %#', anchor => {
        const document = plan();
        const checked = validateWorkflowPlan({ ...document, beats: [{ ...document.beats[0]!, anchor }] }, snapshot);
        expect(checked.ready).toBe(false);
        expect(kinds(checked)).toContain('invalid_anchor');
    });
    it.each([{ captions: true }, { look: 'commercial' }, { caption_style: 'tiktok' }, { person: 'A gardener', actor_id: undefined }, { name: 'A campaign' }])('warns for each requested native advisory field %#', input => {
        const document = plan();
        const native = document.brief.native!;
        const checked = checkWorkflowBrief('ugc-faq-answer', { ...document.brief, native: { skill: 'make_ugc', input: { ...native.input, ...input } } }, snapshot);
        expect(checked.ready).toBe(true);
        expect(checked.warnings.some(warning => warning.startsWith('Native '))).toBe(true);
    });
    it('refuses an asset with unresolved rights', () => {
        const checked = validateWorkflowPlan({ ...plan('product-image-story'), assets: [{ ...asset, rights: 'unresolved' }] }, snapshot);
        expect(checked.ready).toBe(false);
        expect(kinds(checked)).toContain('unresolved_rights');
    });
    it.each(['product_proof', 'ui_proof'])('refuses generated illustration as %s', purpose => {
        const checked = validateWorkflowPlan({ ...plan('product-image-story'), assets: [{ ...asset, purpose, provenance: 'generated_illustration' }] }, snapshot);
        expect(checked.ready).toBe(false);
        expect(kinds(checked)).toContain('unsupported_proof');
    });
    it('allows a generated illustration when it does not claim to prove product details', () => {
        expect(validateWorkflowPlan({ ...plan('product-image-story'), assets: [asset, { ...asset, instance_id: 'illustration', anchor: { quote: 'wide handle' }, purpose: 'illustration', provenance: 'generated_illustration' }] }, snapshot).ready).toBe(true);
    });
    it('requires an original product proof asset rather than only illustrative images', () => {
        expect(kinds(validateWorkflowPlan({ ...plan('product-image-story'), assets: [{ ...asset, purpose: 'illustration', provenance: 'generated_illustration' }] }, snapshot))).toContain('missing_product_proof');
    });
    it('resolves repeated phrases by occurrence for independent asset instances and beats', () => {
        const document = plan('product-image-story');
        const script = 'ceramic mug stands here and ceramic mug rests there';
        const brief = { ...document.brief, script, native: { skill: 'make_faceless', input: { input_mode: 'script', script, duration_seconds: 30 } } };
        const assets = [{ ...asset, anchor: { quote: 'ceramic mug', occurrence: 0 } }, { ...asset, instance_id: 'second', anchor: { quote: 'ceramic mug', occurrence: 1 } }];
        const beats = [{ id: 'first', role: 'visible_fact', anchor: { quote: 'ceramic mug', occurrence: 0 }, required: false },
            { id: 'second', role: 'image_evidence', anchor: { quote: 'ceramic mug', occurrence: 1 }, required: false }];
        expect(validateWorkflowPlan({ ...document, brief, assets, beats }, snapshot)).toEqual({ ready: true, issues: [],
            warnings: [expect.stringContaining('1 original product-photo')] });
    });
});

describe('WF-01 review: native source and tools-list boundaries', () => {
    it.each([{ field: 'look', standard: 'natural', requested: 'commercial' }, { field: 'caption_style', standard: 'hormozi', requested: 'tiktok' }])
    ('rejects only non-default UGC $field requests when its effective disposition is rejected', ({ field, standard, requested }) => {
        const capabilities = structuredClone(snapshot);
        capabilities.executors[0]!.field_dispositions[field] = 'rejected';
        const brief = plan().brief;
        for (const value of [undefined, standard, requested]) {
            const input = { ...brief.native!.input, [field]: value };
            const checked = checkWorkflowBrief('ugc-faq-answer', { ...brief, native: { skill: 'make_ugc', input } }, capabilities);
            expect(checked.issues.filter(issue => issue.kind === 'native_field_rejected')).toHaveLength(value === requested ? 1 : 0);
            expect(checked.ready).toBe(value !== requested);
        }
    });
    it.each([
        { field: 'actor_id', value: 'actor_male' }, { field: 'voice', value: 'george' }, { field: 'voice_id', value: 'a'.repeat(20) },
        { field: 'aspect_ratio', value: '9:16' }, { field: 'resolution', value: '1080p' }, { field: 'person', value: 'A gardener' },
        { field: 'name', value: 'A campaign' }, { field: 'captions', value: true },
    ])('honors an effective UGC rejection of $field, independently of its static disposition', ({ field, value }) => {
        const document = plan();
        const brief = { ...document.brief, native: { skill: 'make_ugc', input: { script: document.brief.script, [field]: value } } };
        const changed = structuredClone(snapshot);
        changed.executors[0]!.field_dispositions[field] = 'implemented';
        expect(checkWorkflowBrief('ugc-faq-answer', brief, changed).ready).toBe(true);
        changed.executors[0]!.field_dispositions[field] = 'rejected';
        const checked = checkWorkflowBrief('ugc-faq-answer', brief, changed);
        expect(checked.ready).toBe(false);
        expect(checked.issues).toContainEqual(expect.objectContaining({ kind: 'native_field_rejected', path: `brief.native.input.${field}` }));
    });
    it('does not reject a UGC field absent from the native request', () => {
        const changed = structuredClone(snapshot);
        changed.executors[0]!.field_dispositions.actor_id = 'rejected';
        const brief = { ...plan().brief, native: { skill: 'make_ugc', input: { script: plan().brief.script } } };
        expect(checkWorkflowBrief('ugc-faq-answer', brief, changed).ready).toBe(true);
    });
    it.each([{ field: 'voice', value: 'george' }, { field: 'captions', value: true }, { field: 'duration_seconds', value: 30 }])('honors an effective faceless rejection of $field', ({ field, value }) => {
        const document = plan('faceless-explainer');
        const brief = { ...document.brief, native: { skill: 'make_faceless', input: { ...document.brief.native!.input, [field]: value } } };
        const changed = structuredClone(snapshot);
        changed.executors[1]!.field_dispositions[field] = 'rejected';
        const checked = checkWorkflowBrief('faceless-explainer', brief, changed);
        expect(checked.ready).toBe(false);
        expect(checked.issues).toContainEqual(expect.objectContaining({ kind: 'native_field_rejected', path: `brief.native.input.${field}` }));
    });
    it.each(['voice', 'character_details'])('adds no native field refusal for absent rejected faceless %s (#633)', field => {
        const changed = structuredClone(snapshot);
        changed.executors[1]!.field_dispositions[field] = 'rejected';
        const checked = checkWorkflowBrief('faceless-explainer', plan('faceless-explainer').brief, changed);
        expect(checked.issues).not.toContainEqual(expect.objectContaining({ kind: 'native_field_rejected', path: `brief.native.input.${field}` }));
        if (field === 'voice') expect(kinds(checked)).toEqual(['missing_feature']);
        else expect(checked.ready).toBe(true);
    });
    it.each(['warned', 'stored'] as const)('accepts present faceless captions with %s disposition (#633)', disposition => {
        const changed = structuredClone(snapshot);
        changed.executors[1]!.field_dispositions.captions = disposition;
        expect(checkWorkflowBrief('faceless-explainer', plan('faceless-explainer').brief, changed).ready).toBe(true);
    });
    it.each([undefined, true, false])('checks effective faceless captions=%s rather than field presence (#633)', captions => {
        const changed = structuredClone(snapshot);
        changed.executors[1]!.field_dispositions.captions = 'rejected';
        const document = plan('faceless-explainer');
        const brief = { ...document.brief, native: { skill: 'make_faceless', input: { ...document.brief.native!.input, captions } } };
        const checked = checkWorkflowBrief('faceless-explainer', brief, changed);
        expect(checked.ready).toBe(captions === false);
        if (captions === false) expect(kinds(checked)).not.toContain('native_field_rejected');
        else expect(checked.issues).toContainEqual(expect.objectContaining({ kind: 'native_field_rejected', path: 'brief.native.input.captions' }));
    });
    it.each([undefined, true, false])('checks effective UGC captions=%s rather than field presence (#633 class)', captions => {
        const changed = structuredClone(snapshot);
        changed.executors[0]!.field_dispositions.captions = 'rejected';
        const document = plan();
        const brief = { ...document.brief, native: { skill: 'make_ugc', input: { ...document.brief.native!.input, captions } } };
        expect(checkWorkflowBrief('ugc-faq-answer', brief, changed).ready).toBe(captions !== true);
    });
    it.each(['faceless-explainer', 'product-image-story'])('checks supplied assets against scene_images qualification for %s', id => {
        const document = plan(id);
        const bound = { ...document, assets: [{ ...asset, anchor: document.beats[0]!.anchor }] };
        expect(validateWorkflowPlan(bound, snapshot).ready).toBe(true);
        const changed = structuredClone(snapshot);
        changed.executors[1]!.features = changed.executors[1]!.features.filter(feature => feature !== 'scene_images');
        const checked = validateWorkflowPlan(bound, changed);
        expect(checked.ready).toBe(false);
        expect(checked.issues).toContainEqual(expect.objectContaining({ kind: 'missing_capability', path: 'assets' }));
        if (id === 'faceless-explainer') expect(validateWorkflowPlan(document, changed).ready).toBe(true);
    });
    it.each(['warned', 'stored', 'rejected'] as const)('does not treat listed scene_images with %s disposition as qualified', disposition => {
        const changed = structuredClone(snapshot);
        changed.executors[1]!.field_dispositions.scene_images = disposition;
        const document = plan('faceless-explainer');
        const checked = validateWorkflowPlan({ ...document, assets: [{ ...asset, anchor: document.beats[0]!.anchor }] }, changed);
        expect(checked.issues).toContainEqual(expect.objectContaining({ kind: 'missing_capability', path: 'assets' }));
        expect(queryWorkflowMethod('product-image-story', changed)!.availability.status).toBe('execution_blocked');
        expect(queryWorkflowMethod('faceless-explainer', changed)!.availability.status).toBe('available');
    });
    it('accepts scene_images explicitly marked implemented', () => {
        const changed = structuredClone(snapshot);
        changed.executors[1]!.field_dispositions.scene_images = 'implemented';
        expect(validateWorkflowPlan({ ...plan('product-image-story'), assets: [asset] }, changed).ready).toBe(true);
    });
    it.each(['ugc-product-intro', 'ugc-faq-answer', 'faceless-explainer', 'product-image-story'])('applies effective dispositions to every required catalog feature for %s', id => {
        const method = queryWorkflowMethod(id, snapshot)!.descriptor;
        for (const feature of method.required_features) {
            for (const disposition of ['warned', 'stored', 'rejected'] as const) {
                const changed = structuredClone(snapshot);
                changed.executors.find(executor => executor.skill === method.binding.skill)!.field_dispositions[feature] = disposition;
                expect(queryWorkflowMethod(id, changed)!.availability.reasons).toContainEqual(expect.objectContaining({ kind: 'missing_feature' }));
            }
            const changed = structuredClone(snapshot);
            changed.executors.find(executor => executor.skill === method.binding.skill)!.field_dispositions[feature] = 'implemented';
            expect(queryWorkflowMethod(id, changed)!.availability.status).toBe('available');
        }
    });
    it.each(['warned', 'stored', 'rejected'] as const)('requires honored long_form even when the feature is listed with %s disposition', disposition => {
        const changed = structuredClone(snapshot);
        changed.executors[0]!.features.push('long_form');
        const document = plan();
        const brief = { ...document.brief, native: { skill: 'make_ugc', input: { script: document.brief.script,
            inserts: [{ id: 'detail', media_url: 'https://example.com/item.png', media_type: 'image', anchor: { quote: 'finished MP4' } }], broll_policy: 'anyone' } } };
        expect(kinds(checkWorkflowBrief('ugc-faq-answer', brief, changed))).not.toContain('missing_capability');
        changed.executors[0]!.field_dispositions.long_form = disposition;
        expect(checkWorkflowBrief('ugc-faq-answer', brief, changed).issues).toContainEqual(expect.objectContaining({ kind: 'missing_capability', path: 'brief.native.input' }));
    });
    it.each(['owner_supplied', 'verified_capture'])('requires product_proof purpose even for %s originals', provenance => {
        for (const purpose of ['illustration', 'ui_proof']) {
            const checked = validateWorkflowPlan({ ...plan('product-image-story'), assets: [{ ...asset, provenance, purpose }] }, snapshot);
            expect(checked.ready).toBe(false);
            expect(kinds(checked)).toContain('missing_product_proof');
        }
        expect(validateWorkflowPlan({ ...plan('product-image-story'), assets: [{ ...asset, provenance }] }, snapshot).ready).toBe(true);
    });
    it.each(['', ' ', '   ', '\n\t', 'x'.repeat(10_001)])('refuses invalid faceless script at the native input boundary %#', script => {
        expect(workflowNativeInput.safeParse({ skill: 'make_faceless', input: { input_mode: 'script', script, duration_seconds: 30 } }).success).toBe(false);
    });
    it.each(['x', 'x'.repeat(10_000), '  Exact narration.\n\t'])('accepts the native faceless script limits and preserves raw text %#', script => {
        const parsed = workflowNativeInput.parse({ skill: 'make_faceless', input: { input_mode: 'script', script, duration_seconds: 30 } });
        expect(parsed.input).toHaveProperty('script', script);
    });
    it.each(['script', 'brief'])('refuses unknown faceless %s writes at every nested boundary', input_mode => {
        const input = { input_mode, [input_mode]: 'Exact narration', duration_seconds: 30 };
        expect(workflowNativeInput.safeParse({ skill: 'make_faceless', input }).success).toBe(true);
        for (const anchor of [{ quote: 'narration' }, { startWord: 0, endWord: 1 }]) {
            expect(workflowNativeInput.safeParse({ skill: 'make_faceless', input: { ...input, scene_images: [{ image_url: 'https://example.com/item.png', anchor }] } }).success).toBe(true);
        }
        for (const changed of [
            { ...input, unknown_native_field: true },
            { ...input, scene_images: [{ image_url: 'https://example.com/item.png', anchor: { quote: 'narration' }, unknown_image_field: true }] },
            { ...input, scene_images: [{ image_url: 'https://example.com/item.png', anchor: { quote: 'narration', unknown_anchor_field: true } }] },
            { ...input, scene_images: [{ image_url: 'https://example.com/item.png', anchor: { startWord: 0, endWord: 1, unknown_anchor_field: true } }] },
        ]) expect(workflowNativeInput.safeParse({ skill: 'make_faceless', input: changed }).success).toBe(false);
    });
    it.each([{ mode: 'script', maximum: 10_000 }, { mode: 'brief', maximum: 5000 }])('publishes strict faceless $mode limits and required fields to tools/list', ({ mode, maximum }) => {
        const schema = z.toJSONSchema(workflowNativeInput, { io: 'input' }) as ToolSchema;
        const native = (schema.oneOf ?? schema.anyOf ?? []).find(branch => branch.properties?.skill?.const === 'make_faceless');
        const input = native?.properties?.input?.oneOf?.find(branch => branch.properties?.input_mode?.const === mode);
        expect(input?.properties?.[mode]?.minLength).toBe(1);
        expect(input?.properties?.[mode]?.maxLength).toBe(maximum);
        expect(input?.required).toEqual(expect.arrayContaining(['input_mode', mode, 'duration_seconds']));
        expect(input?.additionalProperties).toBe(false);
        expect(input?.properties?.scene_images?.items?.additionalProperties).toBe(false);
        const anchors = input?.properties?.scene_images?.items?.properties?.anchor?.anyOf;
        expect(anchors).toHaveLength(2);
        for (const anchor of anchors ?? []) expect(anchor.additionalProperties).toBe(false);
    });
    it.each([
        { id: 'ugc-faq-answer', native: { skill: 'make_ugc', input: { script: 'Show the item', image: 'https://example.com/item.png' } } },
        { id: 'ugc-faq-answer', native: { skill: 'make_ugc', input: { script: 'Show the item', broll_url: 'https://example.com/item.mp4' } } },
        { id: 'ugc-faq-answer', native: { skill: 'make_ugc', input: { segments: [{ kind: 'actor', script: 'Show the item' }, { kind: 'media', media_url: 'https://example.com/item.mp4' }] } } },
        { id: 'ugc-faq-answer', native: { skill: 'make_ugc', input: { script: 'Show the item', inserts: [{ id: 'item', media_url: 'https://example.com/item.png', media_type: 'image', anchor: { quote: 'the item' } }] } } },
        { id: 'faceless-explainer', native: { skill: 'make_faceless', input: { input_mode: 'script', script: 'Show the item', duration_seconds: 30, style_reference: 'https://example.com/style.png' } } },
        { id: 'faceless-explainer', native: { skill: 'make_faceless', input: { input_mode: 'script', script: 'Show the item', duration_seconds: 30, character_reference: 'https://example.com/person.png' } } },
        { id: 'faceless-explainer', native: { skill: 'make_faceless', input: { input_mode: 'script', script: 'Show the item', duration_seconds: 30, scene_images: [{ image_url: 'https://example.com/item.png', anchor: { quote: 'the item' } }] } } },
    ])('refuses every native media URL without a stable workflow binding %#', ({ id, native }) => {
        expect(kinds(checkWorkflowBrief(id, { ...plan(id).brief, script: 'Show the item', native }, snapshot))).toContain('unbound_native_source');
    });
    it('requires native long-form qualification before an insert can be considered', () => {
        const document = plan();
        const native = { skill: 'make_ugc', input: { script: document.brief.script, inserts: [{ id: 'detail', media_url: 'https://example.com/item.png', media_type: 'image', anchor: { quote: 'finished MP4' } }], broll_policy: 'anyone' } };
        expect(kinds(checkWorkflowBrief('ugc-faq-answer', { ...document.brief, native }, snapshot))).toContain('missing_capability');
        const qualified = structuredClone(snapshot);
        qualified.executors[0]!.features.push('long_form');
        expect(kinds(checkWorkflowBrief('ugc-faq-answer', { ...document.brief, native }, qualified))).toContain('unbound_native_source');
    });
    it('does not silently accept faceless asset bindings on a UGC workflow', () => {
        const document = plan();
        expect(kinds(validateWorkflowPlan({ ...document, assets: [{ ...asset, anchor: { quote: 'finished MP4' } }] }, snapshot))).toContain('unsupported_asset_binding');
    });
    it.each(['make_ugc', 'make_faceless'])('exposes the composed %s schema in tools-list JSON', skill => {
        const schema = z.toJSONSchema(workflowNativeInput, { io: 'input' }) as ToolSchema;
        const branches = schema.oneOf ?? schema.anyOf ?? [];
        const native = branches.find(branch => typeof branch === 'object' && branch.properties?.skill?.const === skill);
        expect(native?.properties?.input).toHaveProperty(skill === 'make_ugc' ? 'properties' : 'oneOf');
    });
    it('exposes the same strict segment and motion boundaries to tools/list that writes enforce', () => {
        const schema = z.toJSONSchema(workflowNativeInput, { io: 'input' }) as ToolSchema;
        const native = (schema.oneOf ?? schema.anyOf ?? []).find(branch => typeof branch === 'object' && branch.properties?.skill?.const === 'make_ugc');
        const segments = native?.properties?.input?.properties?.segments;
        expect(segments?.minItems).toBe(1);
        expect(segments?.maxItems).toBe(5);
        expect(segments?.items).toHaveProperty('additionalProperties', false);
        expect(segments?.items).toHaveProperty('properties.image_motion.additionalProperties', false);
    });
});
