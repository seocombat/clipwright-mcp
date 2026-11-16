import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { facelessStoredInput, makeFacelessInput, missingKitGlyphs } from '../index.js';
import {
    WORKFLOW_FILM_METHODS, WORKFLOW_METHODS, methodDescriptor, queryWorkflowCatalog, queryWorkflowMethod, validateWorkflowPlan, workflowFilmDirections,
    type CapabilityProfile, type WorkflowPlanDocument,
} from './index.js';

// #1461: kinetic-launch and website-proof-demo on the explainer film, offered only while the faceless executor qualifies their profiles.

const faceless = { skill: 'make_faceless', configured: true, qualified: true, enabled: true, profiles: ['faceless-native-v1'],
    features: ['exact_script', 'voice', 'word_anchors', 'scene_images', 'protected_product_area'], formats: [{ aspect_ratio: '9:16' as const, resolution: '720p' as const }, { aspect_ratio: '9:16' as const, resolution: '1080p' as const }],
    field_dispositions: { scene_images: 'implemented' as const } };
const off: CapabilityProfile = { v: 1, content_digest: 'a'.repeat(64), executors: [faceless] };
const on: CapabilityProfile = { v: 1, content_digest: 'b'.repeat(64), executors: [{ ...faceless,
    profiles: [...faceless.profiles, 'kinetic-launch-film-v1', 'website-proof-demo-film-v1'],
    features: [...faceless.features, 'authored_scenes', 'accepted_word_clock', 'verified_captures'] }] };
const capture = (instance: string, quote: string) => ({ instance_id: instance, asset_id: `upl_${createHash('md5').update(instance).digest('hex')}`, content_digest: 'a'.repeat(64),
    provenance: 'verified_capture', rights: 'owner_authorized', purpose: 'ui_proof', anchor: { quote } });

function plan(methodId: string, assets: unknown[] = []): WorkflowPlanDocument {
    const method = queryWorkflowMethod(methodId, on)!;
    return structuredClone({ v: 1 as const, method: { method_id: methodId, version: method.descriptor.version, content_digest: method.descriptor.content_digest,
        capability_digest: on.content_digest }, brief: method.descriptor.example.brief, beats: method.descriptor.example.beats, claims: [], assets }) as WorkflowPlanDocument;
}
const kinds = (document: WorkflowPlanDocument) => validateWorkflowPlan(document, on).issues.map(issue => issue.kind);
const proof = () => [capture('toolbar', 'Choose Export in the verified toolbar'), capture('result', 'the downloaded file in your folder')];

describe('film versions of the composition methods', () => {
    it('keeps today\'s blocked version 1 while no executor qualifies the film profile', () => {
        for (const id of ['kinetic-launch', 'website-proof-demo']) {
            const method = queryWorkflowMethod(id, off)!;
            expect(method.descriptor).toEqual(WORKFLOW_METHODS.find(item => item.id === id));
            expect(method.availability.status).toBe('execution_blocked');
            expect(method.availability.reasons.map(reason => reason.kind)).toEqual(['composition_not_qualified', 'tariff_not_chosen']);
        }
    });
    it('offers version 2 on the faceless executor once it qualifies the profile', () => {
        const cards = queryWorkflowCatalog(on).methods.filter(card => ['kinetic-launch', 'website-proof-demo'].includes(card.descriptor.id));
        expect(cards.map(card => [card.descriptor.version, card.descriptor.binding, card.availability.status])).toEqual([
            [2, { kind: 'native', skill: 'make_faceless', profile: 'website-proof-demo-film-v1', visual_beats: 'enforced' }, 'available'],
            [2, { kind: 'native', skill: 'make_faceless', profile: 'kinetic-launch-film-v1', visual_beats: 'enforced' }, 'available'],
        ]);
        const unqualified = structuredClone(on);
        unqualified.executors[0]!.qualified = false;
        expect(queryWorkflowMethod('kinetic-launch', unqualified)!.availability.reasons.map(reason => reason.kind)).toEqual(['executor_not_qualified']);
    });
    it('pins each film version by its content and keeps its example at the explainer floor', () => {
        for (const descriptor of WORKFLOW_FILM_METHODS) {
            expect(methodDescriptor.safeParse(descriptor).success).toBe(true);
            const { content_digest, ...content } = descriptor;
            expect(content_digest).toBe(createHash('sha256').update(JSON.stringify(content)).digest('hex'));
            const native = descriptor.example.brief.native!;
            expect(native.skill).toBe('make_faceless');
            expect(makeFacelessInput.parse(native.input)).toMatchObject({ format: 'explainer', script: descriptor.example.brief.script });
        }
    });
    it('approves the kinetic-launch example and compiles its required beats into moments', () => {
        const document = plan('kinetic-launch');
        expect(validateWorkflowPlan(document, on)).toMatchObject({ ready: true, issues: [] });
        expect(workflowFilmDirections(document)).toEqual({ method: 'kinetic-launch', captures: false, moments: [
            { id: 'announce', kind: 'text', quote: 'The next workshop is ready' },
            { id: 'time', kind: 'text', quote: 'Thursday at 6 pm' },
            { id: 'cta', kind: 'hold', quote: 'Read the schedule' }] });
        // The run stores them beside the request; a public body cannot carry them.
        const input = { ...document.brief.native!.input, workflow_directions: workflowFilmDirections(document) };
        expect(facelessStoredInput.parse(input)).toMatchObject({ workflow_directions: { method: 'kinetic-launch' } });
        expect(makeFacelessInput.safeParse(input).success).toBe(false);
    });
    /** Codex r2. Mutant: drop a repeated quote's occurrence, and the run's moment names words the script says twice. */
    it('keeps a repeated quote\'s occurrence in its moment', () => {
        const document = plan('kinetic-launch');
        const script = `${document.brief.script!} Read the schedule today.`;
        document.brief.script = script;
        if (document.brief.native?.skill !== 'make_faceless' || document.brief.native.input.input_mode !== 'script') throw new Error('faceless script example required');
        document.brief.native.input.script = script;
        document.beats[2]!.anchor = { quote: 'Read the schedule', occurrence: 1 };
        expect(validateWorkflowPlan(document, on).issues).toEqual([]);
        expect(workflowFilmDirections(document)!.moments[2]).toEqual({ id: 'cta', kind: 'hold', quote: 'Read the schedule', occurrence: 1 });
    });
    it('refuses what the film cannot enforce before approval', () => {
        const startWord = plan('kinetic-launch');
        startWord.beats[0]!.anchor = { startWord: 0, endWord: 5 };
        expect(kinds(startWord)).toContain('invalid_anchor');
        const glyph = plan('kinetic-launch');
        const script = `${glyph.brief.script!} Ready ✅ now.`;
        glyph.brief.script = script;
        if (glyph.brief.native?.skill !== 'make_faceless' || glyph.brief.native.input.input_mode !== 'script') throw new Error('faceless script example required');
        glyph.brief.native.input.script = script;
        glyph.beats.push({ id: 'mark', role: 'end_card', anchor: { quote: 'Ready ✅ now' }, required: true, visual: 'Hold it' });
        expect(kinds(glyph)).toContain('glyph_unsupported');
        const standard = plan('kinetic-launch');
        if (standard.brief.native?.skill !== 'make_faceless') throw new Error('faceless example required');
        delete (standard.brief.native.input as { format?: string }).format;
        expect(kinds(standard)).toContain('film_format_required');
    });
    it('needs a ui_proof capture on every required website beat, at most three', () => {
        expect(kinds(plan('website-proof-demo'))).toEqual(expect.arrayContaining(['missing_method_input', 'beat_without_capture']));
        const ready = plan('website-proof-demo', proof());
        expect(validateWorkflowPlan(ready, on)).toMatchObject({ ready: true, issues: [] });
        expect(workflowFilmDirections(ready)).toEqual({ method: 'website-proof-demo', captures: true, moments: [] });
        expect(kinds(plan('website-proof-demo', [proof()[0]]))).toEqual(['beat_without_capture']);
        expect(kinds(plan('website-proof-demo', [...proof(), capture('three', 'Pick PDF'), capture('four', 'press Save')]))).toEqual(['too_many_captures']);
        expect(kinds(plan('website-proof-demo', [{ ...proof()[0], purpose: 'product_proof' }, proof()[1]]))).toEqual(['capture_required']);
    });
    /** #1466. Mutant: approve a protected area the film never measures, and the paid run fails at zero on a promise the plan made. */
    it('refuses a protected area on a film method\'s asset before approval', () => {
        // The executor measures protected areas in picture videos, as production's does; a film still cannot.
        const area = { x: 0.1, y: 0.1, width: 0.3, height: 0.2 }, measured = structuredClone(on);
        measured.executors[0]!.field_dispositions = { ...measured.executors[0]!.field_dispositions, protected_product_area: 'implemented' };
        const issues = (document: WorkflowPlanDocument) => validateWorkflowPlan(document, measured).issues;
        expect(issues(plan('website-proof-demo', proof()))).toEqual([]);
        expect(issues(plan('website-proof-demo', [{ ...proof()[0], protected_area: area }, proof()[1]]))).toEqual([expect.objectContaining({
            kind: 'placement_preflight_required', path: 'assets.toolbar.protected_area', message: expect.stringContaining('film') })]);
        expect(issues(plan('kinetic-launch', [{ ...capture('logo', 'The next workshop is ready'), protected_area: area }])).map(issue => issue.kind))
            .toContain('placement_preflight_required');
    });
    it('names no directions for a method that does not enforce its beats', () => {
        const method = queryWorkflowMethod('faceless-explainer', on)!;
        expect(workflowFilmDirections({ v: 1, method: { method_id: method.descriptor.id, version: 1, content_digest: method.descriptor.content_digest,
            capability_digest: on.content_digest }, brief: method.descriptor.example.brief, beats: method.descriptor.example.beats, claims: [], assets: [] } as WorkflowPlanDocument))
            .toBeUndefined();
    });
    it('reads the film fonts\' glyphs: Latin and Cyrillic draw, a symbol outside them does not', () => {
        expect(missingKitGlyphs('Готово — 6 pm, café №1 €5')).toEqual([]);
        expect(missingKitGlyphs('Ready ✅ 日本')).toEqual(['✅', '日', '本']);
        // Vietnamese letters live in a subset the kit does not load.
        expect(missingKitGlyphs('Việt Ngữ')).toEqual(['ệ', 'ữ']);
    });
});
