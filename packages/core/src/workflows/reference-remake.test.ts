import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { requestHash } from '../idempotency.js';
import { type CallStage, isNarratedUgcInput, makeUgcInput } from '../skills.js';
import { estimateDurationSec } from '../pacing.js';
import { countActorShots, lexicalTokens, planSemanticInserts, quoteOccurrences } from '../semantic-inserts.js';
import { templateFaceWarnings } from '../templates/index.js';
import { FRAMING_SCALE } from '../ugc-framing.js';
import { admissionScene, faceZone, frameCanvasOf, overlayFootprints, overlayRect, rectsOverlap } from '../ugc-layers.js';
import { listVoices } from '../voice-listing.js';
import { compileReferenceRemake, queryWorkflowMethod, referenceProfileWarnings, validateWorkflowPlan, workflowPlanDocument, workflowPlanDocumentRead,
    type CapabilityProfile, type WorkflowPlanDocument } from './index.js';

/** The reference reel's fused profile with every word of its speech and labels replaced (C6). */
const PROFILE = JSON.parse(readFileSync(new URL('../fixtures/reference-profile-reel.json', import.meta.url), 'utf8'));
/** The tester's script from packages/mcp-server/README.md, Recipes. */
const SCRIPT = 'Every missed call is a lost deal. Your receptionist sleeps, takes breaks, and sometimes gets annoyed. This one doesn\'t. ' +
    'It answers calls all day, works around the clock, and never gets annoyed. Here\'s a real one: a customer calls at two in the morning to book ' +
    'a cleaning, and it handles everything, the time, the price, the confirmation text. Small businesses miss a third of their calls. Not anymore. ' +
    'Set it up in ten minutes and stop losing deals while you sleep.';
const ugc = (features: string[] = []) => ({ skill: 'make_ugc', configured: true, qualified: true, enabled: true, profiles: ['ugc-native-v1'],
    features: ['exact_script', 'actor', 'voice', ...features], formats: [{ aspect_ratio: '9:16' as const, resolution: '1080p' as const }],
    field_dispositions: { captions: 'implemented' as const, caption_style: 'implemented' as const, templates: 'implemented' as const } });
const capabilities = (features: string[] = []): CapabilityProfile => ({ v: 1, content_digest: 'c'.repeat(64), executors: [ugc(features)] });
const request = (extra: Record<string, unknown> = {}) => ({ reference_profile: structuredClone(PROFILE), script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah', ...extra });
function compiled(extra: Record<string, unknown> = {}, features: string[] = []): WorkflowPlanDocument {
    const result = compileReferenceRemake(request(extra), capabilities(features));
    if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
    return result.document;
}
const native = (document: WorkflowPlanDocument) => {
    if (document.brief.native?.skill !== 'make_ugc') throw new Error('not a make_ugc plan');
    return document.brief.native.input;
};
/** The words an anchor or inner quote names, as make_ugc counts them. */
const wordsOf = (quote: string, occurrence = 0) => quoteOccurrences(lexicalTokens(SCRIPT), quote)[occurrence];

describe('reference profile in the plan document (S1b)', () => {
    it('stores the profile in brief.reference_profile, and the plan digest covers it', () => {
        const document = compiled();
        expect(workflowPlanDocument.safeParse(document).success).toBe(true);
        const changed = structuredClone(document);
        changed.brief.reference_profile!.beats[3]!.role = 'proof';
        const { reference_profile: _profile, ...bare } = document.brief;
        expect(requestHash(changed)).not.toBe(requestHash(document));
        expect(requestHash({ ...document, brief: bare })).not.toBe(requestHash(document));
    });
    /** Mutants: take the stored profile schema as input, and a profile read from an answer (no models, cost or time) is refused; keep the
     *  models in the plan, and the saved plan names the vendors behind the analysis (rule 8). */
    it('compiles a profile as an answer carries it, and the plan keeps no models, cost or time', () => {
        const { models: _m, cost_usd: _c, latency_ms: _l, ...kept } = PROFILE.analysis;
        const read = compiled({ reference_profile: { ...structuredClone(PROFILE), analysis: kept } });
        const full = compiled();
        expect(read).toEqual(full);
        expect(full.brief.reference_profile?.analysis).toEqual({});
        expect(JSON.stringify(full)).not.toMatch(/gemini|scribe|cost_usd|latency_ms|"models"/i);
    });
    /** Mutant: copy the profile whole, and the plan carries the reference's speech, labels and transcript (#930) into a remake that copies none of it. */
    it('does not keep the reference\'s speech, transcript, hook or on-screen text in the saved plan', () => {
        const dirty = structuredClone(PROFILE) as typeof PROFILE & { transcript?: unknown[]; hook?: unknown };
        dirty.beats[0].spoken_summary = 'ZQXSPOKEN verbatim line';
        for (const beat of dirty.beats) for (const graphic of beat.graphics) graphic.label_hint = 'ZQXLABEL on screen';
        dirty.transcript = [{ text: 'ZQXWORD', start_s: 0.1, end_s: 0.4, speaker: 'speaker_0' }];
        dirty.hook = { text: 'ZQXHOOK line', end_s: 0.4, caption: 'ZQXCAPTION' };
        const result = compileReferenceRemake({ ...request(), reference_profile: dirty }, capabilities());
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        const saved = JSON.stringify(result.document);
        for (const marker of ['ZQXSPOKEN', 'ZQXLABEL', 'ZQXWORD', 'ZQXHOOK', 'ZQXCAPTION']) expect(saved).not.toContain(marker);
        expect(result.document.brief.reference_profile).not.toHaveProperty('transcript');
    });
    it('names the English card text when the script is not Latin', () => {
        const russian = 'Каждый пропущенный звонок — потерянная сделка. Ваш секретарь спит, берёт перерывы и иногда раздражается. Этот — нет. ' +
            'Он отвечает на звонки весь день, работает круглосуточно и никогда не раздражается. Вот реальный случай: клиент звонит в два часа ночи, ' +
            'чтобы записаться на уборку, и он решает всё, время, цену, подтверждение. Малый бизнес теряет треть звонков. Больше нет. ' +
            'Настройте за десять минут и перестаньте терять сделки, пока спите.';
        const cyrillic = compiled({ script: russian }).brief.reference_profile!.unmapped.map(entry => entry.what);
        expect(cyrillic.some(what => what.includes('Incoming call') || what.includes('Messages'))).toBe(true);
        expect(compiled().brief.reference_profile!.unmapped.map(entry => entry.what).some(what => what.includes('Incoming call'))).toBe(false);
    });
    it('refuses a broken profile and reads a newer one openly', () => {
        const document = compiled();
        const broken = structuredClone(document);
        broken.brief.reference_profile!.beats[1]!.start_frac = 0;
        expect(workflowPlanDocument.safeParse(broken).error?.issues.map(issue => issue.path.join('.'))).toContain('brief.reference_profile.beats.1.start_frac');
        const newer = JSON.parse(JSON.stringify(document));
        newer.brief.reference_profile.future_field = true;
        expect(workflowPlanDocumentRead.parse(newer).brief.reference_profile).toMatchObject({ future_field: true });
    });
    it('holds the profile inside the 256000-byte document bound', () => {
        const document = compiled();
        const graphic = { kind: 'tag', source_kind: 'tag', position: 'top', label_hint: 'x'.repeat(120),
            state_changes: Array.from({ length: 12 }, (_, at) => ({ at_frac: at / 12, change: 'highlighted' })) };
        const heavy = structuredClone(document), [first] = heavy.brief.reference_profile!.beats;
        heavy.brief.reference_profile!.beats = Array.from({ length: 40 }, (_, at) => ({ ...first!, start_frac: at / 40, end_frac: (at + 1) / 40, start_s: at, end_s: at + 1,
            graphics: Array.from({ length: 8 }, () => graphic) })) as never;
        expect(workflowPlanDocument.safeParse(heavy).error?.issues.map(issue => issue.message)).toContain('Workflow document exceeds the byte limit');
    });
});

describe('reference-remake compiles a plan from the profile (S2a)', () => {
    it('builds a ready plan from the profile and the script alone', () => {
        const document = compiled({}, ['long_form']);
        expect(document.method.method_id).toBe('reference-remake');
        expect(validateWorkflowPlan(document, capabilities(['long_form'])).issues).toEqual([]);
        expect(makeUgcInput.safeParse(native(document)).success).toBe(true);
        expect(native(document)).toMatchObject({ script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah', captions: true });
        expect(compiled({}, ['long_form'])).toEqual(document);
    });
    // #884: the reference's captions sat at the bottom and the remake's at the style's own height.
    it('places captions at the reference\'s height where the deployment draws caption_position, and leaves them alone where it does not', () => {
        const executor = ugc(['long_form']);
        const placed: CapabilityProfile = { ...capabilities(['long_form']), executors: [{ ...executor, field_dispositions: { ...executor.field_dispositions, caption_position: 'implemented' } }] };
        for (const position of ['top', 'middle', 'lower', 'bottom'] as const) {
            const result = compileReferenceRemake(request({ reference_profile: { ...structuredClone(PROFILE), captions: { ...PROFILE.captions, position } } }), placed);
            if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
            expect(native(result.document).caption_position).toBe(position);
            expect(validateWorkflowPlan(result.document, placed).issues).toEqual([]);
        }
        expect(native(compiled()).caption_position).toBeUndefined();
        // Mutant: place on any disposition but rejected; a warned or stored field would reach a render that ignores it.
        for (const disposition of ['warned', 'stored', 'rejected'] as const) {
            const declared: CapabilityProfile = { ...capabilities(['long_form']), executors: [{ ...executor, field_dispositions: { ...executor.field_dispositions, caption_position: disposition } }] };
            const result = compileReferenceRemake(request(), declared);
            if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
            expect(native(result.document).caption_position, disposition).toBeUndefined();
        }
    });
    // #884 S5d: the reference's presenter holds a mini-mic.
    /** Mutant: pass presenter_mic on any disposition but rejected, and a warned or stored field reaches a render that ignores it. */
    /** Mutant: drop the wide condition from the mic, and a close remake asks for a mic view no library actor has. */
    it('asks for the mic view where the reference shows one, the plan is wide and the deployment implements presenter_mic', () => {
        const executor = ugc(['long_form']);
        const remake = (presenter_mic: boolean | undefined, disposition?: 'implemented' | 'warned' | 'stored' | 'rejected', framing: 'close' | 'wide' = 'wide') => {
            const declared: CapabilityProfile = { ...capabilities(['long_form']), executors: [{ ...executor,
                field_dispositions: { ...executor.field_dispositions, presenter_framing: 'implemented', ...(disposition ? { presenter_mic: disposition } : {}) } }] };
            const profile = { ...structuredClone(PROFILE), presenter_framing: framing, ...(presenter_mic === undefined ? {} : { presenter_mic }) };
            const result = compileReferenceRemake(request({ reference_profile: profile }), declared);
            if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
            expect(validateWorkflowPlan(result.document, declared).issues).toEqual([]);
            return native(result.document).presenter_mic;
        };
        expect(remake(true, 'implemented')).toBe(true);
        expect([remake(false, 'implemented'), remake(undefined, 'implemented'), remake(true), remake(true, 'implemented', 'close')])
            .toEqual([undefined, undefined, undefined, undefined]);
        for (const disposition of ['warned', 'stored', 'rejected'] as const) expect(remake(true, disposition), disposition).toBeUndefined();
    });
    it('anchors beats and graphics on verbatim script words, in the reference beat order', () => {
        const document = compiled();
        expect(document.beats.map(beat => beat.role)).toEqual(PROFILE.beats.map((beat: { role: string }) => beat.role));
        for (const anchor of [...document.beats.map(beat => beat.anchor), ...(native(document).templates ?? []).map(item => item.anchor)]) {
            if ('startWord' in anchor) throw new Error('anchors are quotes');
            expect(SCRIPT).toContain(anchor.quote);
            expect(wordsOf(anchor.quote, anchor.occurrence)).toBeDefined();
        }
        const starts = document.beats.map(beat => 'quote' in beat.anchor ? wordsOf(beat.anchor.quote, beat.anchor.occurrence)!.startWord : -1);
        expect(starts).toEqual([...starts].sort((a, b) => a - b));
    });
    it('keeps the opening and the close when the script has fewer breaks than the reference has beats', () => {
        const script = 'Every missed call is a lost deal. It answers all day. Set it up today.';
        const document = compiled({ script });
        // The three demo beats share one span before any beat gives up its words (#884).
        expect(document.beats.map(beat => beat.role)).toEqual(['hook', 'demo', 'demo', 'demo', 'cta']);
        expect(new Set(document.beats.filter(beat => beat.role === 'demo').map(beat => JSON.stringify(beat.anchor))).size).toBe(1);
        expect(validateWorkflowPlan(document, capabilities()).warnings.filter(text => text.includes('fewer sentence and clause breaks'))).toHaveLength(5);
    });
    it('turns the checklist into rows the presenter names, each clicked on its own words, names the call it leaves out, and keeps the sounds', () => {
        const templates = native(compiled()).templates ?? [];
        const checklist = templates.find(item => item.kind === 'checklist');
        // Eight sentences for ten beats: the three demo beats share "Here's a real one: …" (#884).
        expect(checklist?.data).toMatchObject({ items: [{ label: 'Here\'s a real one' }, { label: 'a customer calls at two' }, { label: 'it handles everything' }, { label: 'the time' }] });
        const clicks = (checklist!.data as { clicks: { item: number; quote: string }[] }).clicks;
        expect(clicks.map(click => click.item)).toEqual([0, 1, 2, 3]);
        const own = wordsOf((checklist!.anchor as { quote: string }).quote)!.startWord;
        for (const click of clicks) expect(wordsOf(click.quote)!.startWord).toBeGreaterThanOrEqual(own);
        // The call shares the demo span with the checklist, and the run schema refuses the overlap: the drop loop names it.
        expect(templates.map(item => item.kind)).not.toContain('phone_call');
        expect(compiled().brief.reference_profile!.unmapped).toContainEqual(expect.objectContaining({ beat_index: 6,
            what: expect.stringContaining('shares the screen with "ref-5-checklist"'), suggested_substitute: expect.stringContaining('left out') }));
        expect(native(compiled()).template_sounds).toBeUndefined();
    });
});

describe('the accepted script is copied, never rewritten (S2b)', () => {
    it('refuses a native script one word away from the brief', () => {
        const document = compiled();
        native(document).script = SCRIPT.replace('sometimes', 'often');
        expect(validateWorkflowPlan(document, capabilities()).issues.map(issue => issue.kind)).toContain('script_mismatch');
    });
    it('passes stress marks and break tags through byte for byte', () => {
        const script = 'Звоните потОм. <break time="1.0s" /> Мы ответим всегда, днём и ночью, без выходных. Подключите сегодня.';
        const document = compiled({ script });
        expect(document.brief.script).toBe(script);
        expect(native(document).script).toBe(script);
        expect(validateWorkflowPlan(document, capabilities()).issues.map(issue => issue.kind)).not.toContain('script_mismatch');
    });
    /** Mutant: trim or normalize the script in the request schema, and the plan holds words the client never accepted. */
    it.each([
        ['leading spaces and a trailing newline', `  ${SCRIPT}\n`],
        ['CRLF line ends', SCRIPT.replace('. Your', '.\r\nYour').replace('. Small', '.\r\nSmall')],
        ['a no-break space', SCRIPT.replace('Set it up', 'Set it up')],
        ['combining accents', SCRIPT.replace('Every', 'Evéry').replace('receptionist', 'receptíonist')],
    ])('keeps a script with %s byte for byte', (_name, script) => {
        const document = compiled({ script });
        expect(document.brief.script).toBe(script);
        expect(native(document).script).toBe(script);
        expect(validateWorkflowPlan(document, capabilities(['long_form'])).issues).toEqual([]);
    });
});

describe('what the saved plan keeps of the reference (A6)', () => {
    /** Mutant: copy a state change as free text, and a quote from the reference is stored in the plan. */
    it('refuses a state change that is not one of the closed categories', () => {
        const dirty = structuredClone(PROFILE);
        dirty.beats.find((beat: { graphics: unknown[] }) => beat.graphics.length)!.graphics[0].state_changes = [{ at_frac: 0.5, change: 'title changes to "ACME never sleeps"' }];
        const result = compileReferenceRemake({ ...request(), reference_profile: dirty }, capabilities());
        expect(result.kind).toBe('invalid');
        expect(JSON.stringify(result)).not.toContain('ACME');
    });
    /** Mutant: keep the profile's music line, and a description of the reference's track is stored in the plan. */
    it('does not keep the reference music line', () => {
        const dirty = structuredClone(PROFILE);
        dirty.music = 'ZQXMUSIC the reference track';
        const result = compileReferenceRemake({ ...request(), reference_profile: dirty }, capabilities());
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        expect(JSON.stringify(result.document)).not.toContain('ZQXMUSIC');
    });
});

describe('role order (S2c)', () => {
    const beat = (id: string, role: string, quote: string) => ({ id, role, anchor: { quote }, required: false });
    it('lets reference-remake return to an earlier role while anchors move forward', () => {
        const document = compiled();
        document.beats = [beat('a', 'demo', 'Every missed call'), beat('b', 'solution', 'This one doesn\'t'), beat('c', 'demo', 'It answers calls')];
        expect(validateWorkflowPlan(document, capabilities(['long_form'])).issues).toEqual([]);
        document.beats = [beat('a', 'demo', 'It answers calls'), beat('b', 'solution', 'This one doesn\'t')];
        expect(validateWorkflowPlan(document, capabilities(['long_form'])).issues.map(issue => issue.path)).toEqual(['beats.b.anchor']);
    });
    it('keeps the strict order of the other methods', () => {
        const method = queryWorkflowMethod('ugc-product-intro', capabilities())!.descriptor;
        const document = { v: 1 as const, method: { method_id: method.id, version: method.version, content_digest: method.content_digest, capability_digest: 'c'.repeat(64) },
            brief: method.example.brief, claims: [], assets: [], beats: [beat('a', 'solution', 'Keep your watering tasks'), beat('b', 'problem', 'A missed note'),
                beat('c', 'solution', 'This checklist keeps')] };
        expect(validateWorkflowPlan(document, capabilities()).issues.map(issue => issue.kind)).toEqual(['invalid_method_structure']);
    });
});

describe('no generations in the plan (S2d) and every gap named (S2e)', () => {
    it('names each graphic it cannot place without media, with a hint to generate it separately', () => {
        const document = compiled();
        const input = native(document);
        expect([input.overlays, input.inserts, input.layout_windows]).toEqual([undefined, undefined, undefined]);
        expect((input.templates ?? []).map(item => item.kind)).not.toContain('compare');
        expect(JSON.stringify(document)).not.toMatch(/generate_(image|video)"\s*:/);
        const warnings = validateWorkflowPlan(document, capabilities()).warnings;
        for (const kind of ['compare', 'layout_split', 'insert_media', 'overlay_media']) {
            expect(warnings.some(text => text.includes(kind) && text.includes('generate_image'))).toBe(true);
        }
    });
    it('places media layers from the client assets when long form is qualified', () => {
        const assets = ['1', '2', '3', '4'].map(digit => ({ asset_id: `ast_${digit.repeat(32)}`, media_type: 'image' }));
        const document = compiled({ assets }, ['long_form']);
        const input = native(document);
        expect([input.layout_windows?.map(item => item.asset_id), input.inserts?.map(item => item.asset_id)]).toEqual([[assets[0]!.asset_id], [assets[1]!.asset_id]]);
        expect((input.templates ?? []).find(item => item.kind === 'compare')?.data).toMatchObject({ before: { asset_id: assets[2]!.asset_id }, after: { asset_id: assets[3]!.asset_id } });
        expect(input.overlays).toBeUndefined();
        expect(validateWorkflowPlan(document, capabilities(['long_form'])).issues).toEqual([]);
    });
    it('carries every unmapped entry of the profile into the plan warnings', () => {
        const document = compiled();
        const warnings = validateWorkflowPlan(document, capabilities()).warnings;
        expect(referenceProfileWarnings(document.brief.reference_profile)).toEqual(expect.arrayContaining([expect.stringContaining('particles')]));
        for (const text of referenceProfileWarnings(document.brief.reference_profile)) expect(warnings).toContain(text);
        expect(warnings.filter(text => text.includes('particles'))).toHaveLength(2);
    });
    /** Mutant: keep the analyser's items first past 40, and the compiler's own gap (a punch_in camera) hides behind "N more items". */
    it('keeps the compiler\'s own gaps when the analyser already named forty', () => {
        const profile = structuredClone(PROFILE);
        profile.beats = [{ ...profile.beats[0], graphics: [], sounds: [], presenter_behaviour: 'speaking', camera: 'punch_in', transition_in: 'none' }];
        profile.captions.present = false;
        profile.unmapped = Array.from({ length: 40 }, (_, at) => ({ what: `gap-${at}`, beat_index: 0, suggested_substitute: `substitute-${at}` }));
        const result = compileReferenceRemake({ ...request(), reference_profile: profile }, capabilities());
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        const saved = result.document.brief.reference_profile!;
        expect(saved.unmapped.length).toBeLessThanOrEqual(40);
        const stored = referenceProfileWarnings(saved), ready = validateWorkflowPlan(result.document, capabilities(['long_form']));
        for (const warnings of [stored, ready.warnings]) {
            expect(warnings.some(text => text.includes('punch_in'))).toBe(true);
            expect(warnings.some(text => /\d+ more items/.test(text))).toBe(true);
        }
        expect(ready.issues).toEqual([]);
    });
    it('keeps an undrawn graphic\'s entry when the overflow drops the analyser\'s others', () => {
        const profile = structuredClone(PROFILE);
        const second = { ...profile.beats[0], start_frac: 0.5, end_frac: 1, start_s: 36, end_s: 72, camera: 'static', transition_in: 'none',
            graphics: [{ kind: 'particles', source_kind: 'particles', position: 'full_screen', state_changes: [], label_hint: '' }], sounds: [] };
        profile.beats = [{ ...profile.beats[0], start_frac: 0, end_frac: 0.5, start_s: 0, end_s: 36, graphics: [], sounds: [], presenter_behaviour: 'speaking' }, second];
        profile.unmapped = [...Array.from({ length: 39 }, (_, at) => ({ what: `gap-${at}`, beat_index: 0, suggested_substitute: 's' })),
            { what: 'particles', beat_index: 1, suggested_substitute: 'a stat' }];
        const result = compileReferenceRemake({ ...request(), reference_profile: profile }, capabilities());
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        expect(result.document.brief.reference_profile!.unmapped.some(entry => entry.beat_index === 1)).toBe(true);
    });
});

describe('every gap the compiler leaves is named in the plan (rule 3)', () => {
    const graphic = (kind: string, position = 'center') => ({ kind, source_kind: kind, position, state_changes: [], label_hint: '' });
    const beat = (extra: Record<string, unknown> = {}) => ({ ...PROFILE.beats[0], graphics: [], sounds: [], camera: 'static', transition_in: 'none', presenter_behaviour: 'speaking', ...extra });
    const images = ['1', '2', '3'].map(digit => ({ asset_id: `ast_${digit.repeat(32)}`, media_type: 'image' }));
    const LONG_WORD = 'Supercalifragilisticexpialidocious'.padEnd(40, 'x');
    const RUSSIAN = 'Каждый пропущенный звонок — потерянная сделка. Ваш секретарь спит, берёт перерывы и иногда раздражается. Он отвечает на звонки весь день.';
    /** The gaps the compiler added to a profile that named none, with the deployment and request varied per case. */
    function gaps(beats: unknown[], extra: Record<string, unknown> = {}, features: string[] = [], templates = 'implemented'): { what: string; suggested_substitute: string }[] {
        const profile = structuredClone(PROFILE);
        profile.beats = beats.map((entry, at) => ({ ...(entry as object), start_frac: at / beats.length, end_frac: (at + 1) / beats.length, start_s: (at * 60) / beats.length, end_s: ((at + 1) * 60) / beats.length }));
        profile.captions.present = false;
        profile.unmapped = [];
        const profileCapabilities = capabilities(features);
        profileCapabilities.executors[0]!.field_dispositions.templates = templates as 'implemented';
        const result = compileReferenceRemake({ ...request(extra), reference_profile: profile }, profileCapabilities);
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        return result.document.brief.reference_profile!.unmapped;
    }
    const NUMBERS = 'We save 30 hours a week. Every single week.';
    const SHORT = 'Every missed call is a lost deal.';
    /** Mutant: delete any one note(...) in the compiler, and the plan, quote and outcome lose a gap silently. */
    const cases: [string, unknown[], Record<string, unknown>, string[], string, string, string?][] = [
        ['143 beat without words', [beat(), beat({ role: 'cta' })], { script: SHORT }, [], 'fewer sentence and clause breaks', 'join a neighbouring beat'],
        ['156 second media layer', [beat({ graphics: [graphic('overlay_media'), graphic('insert_media')] })], { assets: images }, ['long_form'], 'one media layer per beat', 'first one shows'],
        ['157 no media left', [beat({ graphics: [graphic('overlay_media')] })], {}, ['long_form'], 'no image or video left in assets', 'generate_image'],
        ['158 media without long form', [beat({ graphics: [graphic('overlay_media')] })], { assets: images }, [], 'media layers need long-form qualification', 'stays on screen'],
        ['168 templates off', [beat({ graphics: [graphic('stat')] })], { script: NUMBERS }, [], 'templates are not available right now', 'without it', 'rejected'],
        ['169 second graphic', [beat({ graphics: [graphic('stat'), graphic('quote')] })], { script: NUMBERS }, [], 'quote (one graphic per beat)', 'the stat on these words'],
        ['171 callout', [beat({ graphics: [graphic('callout')] })], {}, [], 'it needs a point on screen to mark', 'without it'],
        ['171 lower_third', [beat({ graphics: [graphic('lower_third')] })], {}, [], 'it needs a name and a role', 'without it'],
        ['171 checklist rows', [beat({ graphics: [graphic('checklist')] })], { script: 'Hello.' }, [], 'fewer than two short phrases for its rows', 'without it'],
        ['171 progress steps', [beat({ graphics: [graphic('progress')] })], { script: 'Hello.' }, [], 'fewer than two short phrases for its steps', 'without it'],
        ['171 compare images', [beat({ graphics: [graphic('compare')] })], {}, [], 'needs two images in assets', 'generate_image'],
        ['171 no label fits', [beat({ graphics: [graphic('tag')] })], { script: `${LONG_WORD}.` }, [], 'no words short enough for a label', 'without it'],
        ['172 call has no word', [beat({ graphics: [graphic('phone_call')] })], { script: 'Hello <break time="1.0s" />' }, [], 'no word to answer the call on', 'a tag with the same words'],
        ['172 compare has no word', [beat({ graphics: [graphic('compare')] })], { script: 'Hello <break time="1.0s" />', assets: images }, [], 'no word to reveal on', 'a tag with the same words'],
        ['171 notification, no label fits', [beat({ graphics: [graphic('notification')] })], { script: `${LONG_WORD}.` }, [], 'notification (no words short enough for a label)', 'without it'],
        ['172 notification as title card', [beat({ graphics: [graphic('notification', 'full_screen')] })], { script: `${LONG_WORD}.` }, [], 'no words short enough for it', 'a title_card with the same words'],
        ['172 stat without number', [beat({ graphics: [graphic('stat')] })], {}, [], 'no number in these words', 'a tag with the same words'],
        ['172 stat as title card', [beat({ graphics: [graphic('stat', 'full_screen')] })], {}, [], 'no number in these words', 'a title_card with the same words'],
        ['172 absent presenter', [beat({ graphics: [graphic('phone_call')], presenter_behaviour: 'absent' })], { script: 'Hello <break time="1.0s" />' }, [], 'no word to answer the call on', 'a title_card with the same words'],
        ['172 rating without stars', [beat({ graphics: [graphic('rating')] })], {}, [], 'no star count from 1 to 5', 'a tag with the same words'],
        ['172 end card without site', [beat({ graphics: [graphic('end_card')] })], {}, [], 'no site: pass site', 'a tag with the same words'],
        ['172 title card as a band', [beat({ graphics: [graphic('title_card', 'bottom')] })], {}, [], 'a band over the presenter, not a full frame', 'a tag with the same words'],
        ['174 call card text', [beat({ graphics: [graphic('phone_call')] })], { script: RUSSIAN }, [], 'card text stays English ("Incoming call")', 'edit the plan'],
        ['174 notification card text', [beat({ graphics: [graphic('notification')] })], { script: RUSSIAN }, [], 'card text stays English ("Messages")', 'edit the plan'],
        ['179 presenter leaves', [beat({ presenter_behaviour: 'absent' })], {}, [], 'the presenter leaving the frame', 'stays on screen'],
        ['264 transition', [beat({ transition_in: 'wipe' }), beat({ transition_in: 'wipe' })], { script: 'Every missed call is a lost deal. It answers all day.' }, [], 'wipe transitions into beats 1, 2', 'cuts'],
        ['264 camera', [beat({ camera: 'shake' })], {}, [], 'shake camera on beats 1', 'a static frame'],
        ['270 music', [beat({ sounds: [{ at_frac: 0, kind: 'music' }] })], {}, [], 'the music bed', 'no music'],
        ['284 layer dropped by the run schema', [beat({ graphics: [graphic('layout_split', 'split_top'), graphic('stat')] })], { script: NUMBERS, assets: images }, ['long_form'], 'stat (', 'left out'],
        ['292 tag in the script', [beat()], { script: 'Hello <break time="1.0s" /> there.' }, [], 'advisory beat anchors', 'keeps no beats'],
    ];
    it.each(cases)('%s', (_site, beats, extra, features, what, substitute, templates) => {
        const found = gaps(beats, extra, features, templates);
        expect(found.some(entry => entry.what.includes(what) && entry.suggested_substitute.includes(substitute)), JSON.stringify(found)).toBe(true);
    });
});

describe('narration pace from the reference voice (reference-elements S7)', () => {
    const summary = (median: number | null) => ({ count: median === null ? 0 : 10, median_s: median, p90_s: median, count_ge150ms: 0 });
    const kind = (median: number | null) => ({ timestamp: summary(median), acoustic_pause: summary(null), cut_safe: summary(null), acoustic_no_dip_count: 0,
        acoustic_unconfirmed_count: 0 });
    const voice = (wordsPerSecond: number | null, medians: [number | null, number | null, number | null] = [0.18, 0.22, 0.06]) => ({ version: 'voice-profile-v1',
        method: { pause_drop_db: 12, pause_min_run_s: 0.04, cut_safe_db: -40, pitch: 'yin', sample_rate: 44100 }, presenter_speaker: 'speaker_0',
        speakers: [{ speaker: 'speaker_0', word_count: 158, sentence_count: 16,
            pace: { status: wordsPerSecond === null ? 'unmeasured' : 'measured', words_per_second: wordsPerSecond, basis: 'sentence_spans' },
            pauses: { sentence_end: kind(medians[0]), comma: kind(medians[1]), mid_phrase: kind(medians[2]) }, long_pause_count: 0,
            hinge: { status: 'not_evaluated', sentence_share: null, evaluated_sentences: 0, coverage: 0, timestamp_sentence_share: null, median_position: null, median_seconds: null },
            pitch: { status: 'no_voiced_frames', ceiling_hz: 400, ceiling_basis: 'default', median_hz: null, p10_hz: null, p90_hz: null, range_st: null, voiced_frames: 0 },
            loudness: { status: 'unmeasured', range_db_p10_p90: null }, warnings: [] }] });
    const paced = (wordsPerSecond: number | null) => compiled({ reference_profile: { ...structuredClone(PROFILE), voice: voice(wordsPerSecond) } });
    const paceNotes = (document: WorkflowPlanDocument) => document.brief.reference_profile!.unmapped.filter(entry => entry.what.startsWith('narration pace'));

    const pacedWith = (wordsPerSecond: number, extra: Record<string, unknown>) =>
        compiled({ reference_profile: { ...structuredClone(PROFILE), voice: voice(wordsPerSecond) }, ...extra });

    /** Mutant: send voice_pace on eleven_v4, and every remake run warns of a pace the vendor drops (#890: v4 has no speed). */
    it('asks eleven_v4 for no speed and keeps the measured voice in the plan', () => {
        const document = paced(3.7);
        expect(native(document)).not.toHaveProperty('voice_pace');
        expect(document.brief.reference_profile?.voice?.speakers[0]?.pace.words_per_second).toBe(3.7);
        expect(makeUgcInput.safeParse(native(document)).success).toBe(true);
    });

    /** Mutant: forget the voice suggestion, and a plan slower than its reference offers no way to match it (#890). */
    it('names the measured voices nearest the reference pace, per gender, when no voice is named', () => {
        const document = pacedWith(3.7, { voice: undefined });
        expect(native(document)).not.toHaveProperty('voice');
        expect(paceNotes(document)).toEqual([expect.objectContaining({ what: 'narration pace 3.7 words/s of the reference presenter',
            suggested_substitute: 'eleven_v4 has no speed; English voices speak 3.09–3.58 words/s. '
                + 'Nearer voices: female en_female_cassidy 3.48, sarah 3.33; male en_male_mark 3.58, eric 3.52' })]);
        expect(validateWorkflowPlan(document, capabilities()).warnings.some(text => text.includes('en_male_mark 3.58'))).toBe(true);
    });

    /** Mutant: widen or narrow the 5% band (PACE_MATCH_SHARE): sarah, 3.33 words/s, sits 4.6% under 3.49 and 5.4% under 3.52. */
    it('says nothing for a named voice within 5% of the reference, and names a farther one with its pace', () => {
        expect(paceNotes(pacedWith(3.49, { voice: 'sarah' }))).toEqual([]);
        expect(paceNotes(pacedWith(3.52, { voice: 'sarah' }))).toHaveLength(1);
        expect(paceNotes(pacedWith(3.7, { voice: 'george' }))).toEqual([expect.objectContaining({
            suggested_substitute: 'eleven_v4 has no speed; george speaks 3.27. Nearer voices: female en_female_cassidy 3.48, sarah 3.33; '
                + 'male en_male_mark 3.58, eric 3.52' })]);
    });

    /** Mutant: drop the "nearer than the named voice" filter, and the fastest voice is told to swap for slower ones. */
    it('names only voices nearer than the named one, and says when none is', () => {
        expect(paceNotes(pacedWith(4.2, { voice: 'en_male_mark' }))).toEqual([expect.objectContaining({
            suggested_substitute: 'eleven_v4 has no speed; en_male_mark speaks 3.58. No measured voice is nearer' })]);
    });

    /** Mutant: suggest the named voice back, or let a long name or model push the note past the 200-character cap where it is cut. */
    it('never suggests the named voice and keeps every note whole, for every make_ugc voice and pace', () => {
        for (const named of [undefined, ...listVoices({}).voices.map(entry => entry.name)]) {
            for (const target of [2.5, 3.1, 3.3, 3.5, 4.2]) {
                // No captions in the reference: a model voice returns no word timings and refuses them.
                const profile = { ...structuredClone(PROFILE), voice: voice(target), captions: { ...structuredClone(PROFILE).captions, present: false } };
                const [entry] = paceNotes(compiled({ reference_profile: profile, voice: named }));
                if (!entry) continue;
                expect(entry.suggested_substitute.length, entry.suggested_substitute).toBeLessThan(200);
                const suggested = entry.suggested_substitute.split('Nearer voices: ')[1] ?? '';
                expect(suggested.split(/[;,] ?/).map(part => part.replace(/^(female|male) /, '').split(' ')[0])).not.toContain(named);
            }
        }
    });

    /** Mutant: test only Cyrillic, and an unaccented Spanish or a Greek script gets English voices named. */
    it.each([
        ['Russian', 'Привет. Это короткий сценарий для проверки темпа речи ведущего.'],
        ['Greek', 'Γεια σας. Αυτό είναι ένα σύντομο κείμενο για τον έλεγχο του ρυθμού.'],
        ['unaccented Spanish', 'Hola. Este es un texto para probar la velocidad de la voz del presentador.'],
    ])('suggests no voice for a %s script: paces are measured on English only', (_language, script) => {
        expect(paceNotes(pacedWith(3.7, { script }))).toEqual([expect.objectContaining({ suggested_substitute: expect.stringContaining('measured on English only') })]);
    });

    it('leaves the pace to the voice when the reference voice was not measured, and says so', () => {
        for (const document of [compiled(), paced(null)]) {
            expect(native(document)).not.toHaveProperty('voice_pace');
            expect(paceNotes(document)).toEqual([expect.objectContaining({ suggested_substitute: expect.stringContaining('its own pace') })]);
        }
    });

    /** Mutant: forget pause_trim, and the plan names the reference's pauses while our narration keeps every long one (owner, 25.10). */
    it('turns pause trimming on with the reference presenter\'s word-gap medians as targets', () => {
        expect(native(paced(2.6)).pause_trim).toEqual({ sentence_end_s: 0.18, comma_s: 0.22, mid_phrase_s: 0.06 });
        const sparse = compiled({ reference_profile: { ...structuredClone(PROFILE), voice: voice(2.6, [0.3, null, 0.01]) } });
        expect(native(sparse).pause_trim).toEqual({ sentence_end_s: 0.3, mid_phrase_s: 0.05 });
        expect(makeUgcInput.safeParse(native(sparse)).success).toBe(true);
    });

    /** Mutant: drop the ceiling, and a 2.4 s sentence-end median makes the whole plan invalid over a field nobody set. */
    it('caps a reference pause past the longest target and says so', () => {
        const document = compiled({ reference_profile: { ...structuredClone(PROFILE), voice: voice(2.6, [2.4, 0.22, 0.06]) } });
        expect(native(document).pause_trim).toEqual({ sentence_end_s: 2, comma_s: 0.22, mid_phrase_s: 0.06 });
        expect(makeUgcInput.safeParse(native(document)).success).toBe(true);
        expect(document.brief.reference_profile!.unmapped.filter(entry => entry.what.startsWith('narration pauses')))
            .toEqual([expect.objectContaining({ what: expect.stringContaining('sentence_end_s 2.4 s'), suggested_substitute: expect.stringContaining('pause_trim sentence_end_s 2') })]);
    });

    it('leaves pauses as spoken without a measured reference voice, and says so', () => {
        const document = compiled();
        expect(native(document)).not.toHaveProperty('pause_trim');
        expect(document.brief.reference_profile!.unmapped.filter(entry => entry.what.startsWith('narration pauses')))
            .toEqual([expect.objectContaining({ suggested_substitute: expect.stringContaining('as the voice speaks them') })]);
        expect(native(compiled({ reference_profile: { ...structuredClone(PROFILE), voice: voice(2.6, [null, null, null]) } }))).not.toHaveProperty('pause_trim');
    });
});

describe('a compiled plan always gets a quote on the long-form path (reference-user-path D1)', () => {
    const images = (count: number) => Array.from({ length: count }, (_, at) => ({ asset_id: `ast_${String(at + 1).padStart(32, '0')}`, media_type: 'image' }));
    const disclosed = (document: WorkflowPlanDocument) => document.brief.reference_profile!.unmapped.filter(entry => entry.suggested_substitute.includes('broll_policy=anyone'));
    const media = { kind: 'insert_media', source_kind: 'insert_media', position: 'full_screen', state_changes: [], label_hint: '' };
    function compileBeats(beats: Record<string, unknown>[], script: string, assets: unknown[]) {
        const profile = structuredClone(PROFILE);
        profile.beats = beats.map((entry, at) => ({ ...PROFILE.beats[0], sounds: [], camera: 'static', transition_in: 'none', presenter_behaviour: 'speaking', ...entry,
            start_frac: at / beats.length, end_frac: (at + 1) / beats.length, start_s: (at * 60) / beats.length, end_s: ((at + 1) * 60) / beats.length }));
        profile.captions.present = false;
        profile.unmapped = [];
        return compileReferenceRemake({ ...request({ script, assets }), reference_profile: profile }, capabilities(['long_form']));
    }
    const sentences = (count: number) => Array.from({ length: count }, (_, at) => `Sentence w${at}a w${at}b w${at}c w${at}d.`).join(' ');
    const shots = (input: ReturnType<typeof native>) => countActorShots(planSemanticInserts(input.script!, (input.inserts ?? []).map(item => ({ insertId: item.id,
        mediaId: item.id, anchor: item.anchor as { quote: string; occurrence?: number }, ...(item.cover_words === undefined ? {} : { coverWords: item.cover_words }) }))));

    /** Mutant: drop broll_policy from the native input, and every remake with the client's media is refused at quote (BROLL refusal). */
    it('allows the client media with broll_policy anyone only when it places media, and says so', () => {
        const layered = compiled({ assets: images(1) }, ['long_form']);
        expect(native(layered).layout_windows).toHaveLength(1);
        expect(native(layered).broll_policy).toBe('anyone');
        expect(disclosed(layered)).toHaveLength(1);
        const templated = compiled({ assets: images(2) });
        expect((native(templated).templates ?? []).map(item => item.kind)).toContain('compare');
        expect(native(templated).broll_policy).toBe('anyone');
        expect(disclosed(templated)).toHaveLength(1);
        for (const bare of [compiled({}, ['long_form']), compiled({ assets: images(1) })]) {
            expect(native(bare)).not.toHaveProperty('broll_policy');
            expect(disclosed(bare)).toEqual([]);
        }
    });

    /** Mutant: skip the shot cap, and eight insert beats compile to a plan the quote refuses for too many actor appearances. */
    it('drops the inserts that cover the fewest words until the presenter appears at most six times, naming each', () => {
        const beats = Array.from({ length: 16 }, (_, at) => at % 2 ? { graphics: [media] } : { graphics: [] });
        const result = compileBeats(beats, sentences(16), images(8));
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        const input = native(result.document), kept = input.inserts ?? [];
        expect(shots(input)).toBeLessThanOrEqual(6);
        expect(kept.length).toBeGreaterThan(0);
        const dropped = result.document.brief.reference_profile!.unmapped.filter(entry => entry.what.includes('actor appearances'));
        expect(dropped).toHaveLength(8 - kept.length);
        expect(makeUgcInput.safeParse(input).success).toBe(true);
    });

    /** Mutant: let inserts cover every word, and the quote refuses a plan that leaves no speech for the presenter. */
    it('keeps the presenter on screen somewhere when inserts would cover every word', () => {
        const result = compileBeats([{ graphics: [media] }, { graphics: [media] }, { graphics: [media] }], sentences(3), images(3));
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        expect(shots(native(result.document))).toBeGreaterThanOrEqual(1);
        expect(result.document.brief.reference_profile!.unmapped.some(entry => entry.what.includes('actor appearances'))).toBe(true);
    });

    /** Mutant: estimate the length with another pace, and a plan compiles that the quote refuses as longer than 327 s. */
    it('refuses a script longer than the 327 s the long-form path renders at script, by the quote\'s own estimate', () => {
        const words = (count: number) => Array.from({ length: count }, (_, at) => at % 10 === 9 ? `w${at}.` : `w${at}`).join(' ');
        expect(compileReferenceRemake(request({ script: words(851) }), capabilities(['long_form'])).kind).toBe('compiled');
        const refused = compileReferenceRemake(request({ script: words(852) }), capabilities(['long_form']));
        expect(refused).toMatchObject({ kind: 'invalid', issues: [{ kind: 'invalid_request', path: 'script', message: expect.stringContaining('327 s') }] });
        expect(estimateDurationSec(words(852))).toBe(328);
    });

    /** Mutant: estimate without the run's speech model, and 714 Russian words compile at 2.3 words/s that the quote refuses at 2.18 (M11). */
    it('counts a Russian script at its run model\'s pace against the 327 s limit', () => {
        const russian = (count: number) => Array.from({ length: count }, (_, at) => at % 10 === 9 ? `да${at}.` : `да${at}`).join(' ');
        expect(compileReferenceRemake(request({ script: russian(713) }), capabilities(['long_form'])).kind).toBe('compiled');
        expect(compileReferenceRemake(request({ script: russian(714) }), capabilities(['long_form'])))
            .toMatchObject({ kind: 'invalid', issues: [{ path: 'script', message: expect.stringContaining('327 s') }] });
        expect(estimateDurationSec(russian(714))).toBeLessThanOrEqual(327);
    });

    /** Mutant: drop long_form from required_features, and every remake on such a deployment meets a quote refusal that recompiling cannot fix (B1). */
    it('blocks the method in the catalog where long form is unavailable, and a compiled plan names why', () => {
        const missing = { kind: 'missing_feature', path: 'required_features', message: 'Required capability long_form is unavailable.' };
        expect(queryWorkflowMethod('reference-remake', capabilities(['long_form']))!.availability).toEqual({ status: 'available', reasons: [] });
        for (const disposition of [undefined, 'warned', 'rejected', 'stored']) {
            const snapshot = capabilities(disposition ? ['long_form'] : []);
            if (disposition) (snapshot.executors[0]!.field_dispositions as Record<string, string>).long_form = disposition;
            expect(queryWorkflowMethod('reference-remake', snapshot)!.availability).toEqual({ status: 'execution_blocked', reasons: [missing] });
            expect(validateWorkflowPlan(compiled(), snapshot).issues).toContainEqual(missing);
        }
    });

    /** Mutant: skip the word check, and a "fast—really" or break-tag script compiles to a plan the long-form quote refuses (M10). */
    it('refuses at script a script the long-form path cannot count word by word, and says how to write it', () => {
        const slashed = 'We are fast—really fast. Every call gets booked.', tagged = 'Call us today. <break time="1.0s" /> We answer every call.';
        const refusal = (script: string) => compileReferenceRemake(request({ script }), capabilities(['long_form']));
        for (const script of [slashed, tagged]) {
            expect(compileReferenceRemake(request({ script }), capabilities()).kind).toBe('compiled');
            expect(refusal(script)).toMatchObject({ kind: 'invalid', issues: [{ kind: 'invalid_request', path: 'script' }] });
        }
        const message = (script: string) => (refusal(script) as { issues: { message: string }[] }).issues[0]!.message;
        expect(message(slashed)).toContain('Write "fast—really" as separate words, as "fast—really" becomes "fast — really"');
        expect(message(tagged)).toContain('Remove the break tags');
        for (const [script, symbol] of [['It costs $ 29 a month.', '$'], ['Missed a call 📞 again?', '📞'], ['AI + you wins.', '+']] as const) {
            expect(message(script)).not.toContain('undefined');
            expect(message(script)).toContain(`Write "${symbol}" as a word or remove it`);
        }
        const both = message('Call us today. <break time="1.0s" /> We pick red,blue.');
        expect(both).toContain('Remove the break tags');
        expect(both).toContain('Write "red,blue" as separate words');
        const two = message('It costs $ 29 and runs fast—really.');
        expect(two).toContain('Write "$" as a word or remove it');
        expect(two).toContain('Write "fast—really" as separate words');
    });

    /** Mutant: split a chunk at its joiners, and a CTA naming a site, handle, price or "24/7" is refused on the long-form path (#1029). */
    it('compiles a long-form remake whose script names a site, a handle, a price and 24/7', () => {
        const script = 'We answer 24/7. Plans start at $29 a month. Follow @clip_wright. Try it free at clipwright.io.';
        expect(compileReferenceRemake(request({ script }), capabilities(['long_form'])).kind).toBe('compiled');
    });

    /** Mutant: leave inserts out of the broll check, and an inserts-only remake with the client's picture is refused at quote. */
    it('allows the client media on a remake whose only media layer is an insert', () => {
        const result = compileBeats([{ graphics: [] }, { graphics: [media] }], sentences(2), images(1));
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        const input = native(result.document);
        expect([input.inserts?.length, input.overlays, input.layout_windows, input.templates]).toEqual([1, undefined, undefined, undefined]);
        expect(input.broll_policy).toBe('anyone');
        expect(disclosed(result.document)).toHaveLength(1);
    });

    /** Mutant: append the disclosures after the other notes, and past forty entries the cap cuts the media and tariff terms (rule 3). */
    it('keeps the media and tariff disclosures past the forty-entry cap, worded true as warnings', () => {
        const callout = { kind: 'callout', source_kind: 'callout', position: 'center', state_changes: [], label_hint: '' };
        const compare = { kind: 'compare', source_kind: 'compare', position: 'center', state_changes: [], label_hint: '' };
        const result = compileBeats([...Array.from({ length: 6 }, () => ({ graphics: Array(8).fill(callout) })), { graphics: [compare] }], sentences(7), images(2));
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        const warnings = referenceProfileWarnings(result.document.brief.reference_profile), role = PROFILE.beats[0].role;
        expect(warnings.some(text => /\d+ more items/.test(text))).toBe(true);
        expect(warnings).toContain(`Reference beat 7 (${role}): a check that your media shows no people is not reproduced; ` +
            'instead: your media is shown as you supplied it (broll_policy=anyone).');
        expect(warnings).toContain(`Reference beat 1 (${role}): the single-take path that bills every second as presenter time is not reproduced; ` +
            'instead: the long-form path: one presenter take billed by the seconds it fills.');
    });
});

describe('a templates-only remake bills on the long-form tariff (reference-user-path D2)', () => {
    const THREE = 'Every missed call is a lost deal. It answers calls all day. Set it up in ten minutes.';
    const tag = { kind: 'tag', source_kind: 'tag', position: 'top', state_changes: [], label_hint: '' };
    const beat = (extra: Record<string, unknown> = {}) => ({ ...PROFILE.beats[0], graphics: [], sounds: [], camera: 'static', transition_in: 'none', presenter_behaviour: 'speaking', ...extra });
    function compile(beats: unknown[], features = ['long_form']) {
        const profile = structuredClone(PROFILE);
        profile.beats = beats.map((entry, at) => ({ ...(entry as object), start_frac: at / beats.length, end_frac: (at + 1) / beats.length,
            start_s: (at * 60) / beats.length, end_s: ((at + 1) * 60) / beats.length }));
        profile.captions.present = false;
        profile.unmapped = [];
        const result = compileReferenceRemake({ ...request({ script: THREE }), reference_profile: profile }, capabilities(features));
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        return { input: native(result.document), document: result.document };
    }
    const tariffNotes = (document: WorkflowPlanDocument) => document.brief.reference_profile!.unmapped.filter(entry => entry.suggested_substitute.includes('billed by the seconds it fills'));

    /** Mutant: skip the marker, and a templates-only remake bills on the single-take path instead of the long-form one its plan names. */
    it('puts a templates-only remake on the narrated path with one medium framing over the whole script, and says so', () => {
        const { input, document } = compile([beat({ graphics: [tag] }), beat(), beat()]);
        expect(input.templates).toHaveLength(1);
        expect(input.framing).toEqual([{ id: 'ref-long-form', anchor: { quote: 'Every missed call is a lost' }, cover_words: lexicalTokens(THREE).length, size: 'medium', transition: 'cut' }]);
        expect(isNarratedUgcInput(input)).toBe(true);
        expect(tariffNotes(document)).toHaveLength(1);
        expect(makeUgcInput.safeParse(input).success).toBe(true);
        expect(validateWorkflowPlan(document, capabilities(['long_form'])).issues).toEqual([]);
    });

    it('adds no marker when a framing already puts the remake on the narrated path, or long form is off', () => {
        const punched = compile([beat({ camera: 'punch_in' }), beat(), beat()]);
        expect((punched.input.framing ?? []).map(item => item.id)).toEqual(['ref-1-framing', 'ref-2-framing']);
        expect(tariffNotes(punched.document)).toEqual([]);
        const off = compile([beat({ graphics: [tag] }), beat(), beat()], []);
        expect(off.input.framing).toBeUndefined();
        expect(validateWorkflowPlan(off.document, capabilities()).issues.map(issue => issue.message)).toEqual(['Required capability long_form is unavailable.']);
        expect(tariffNotes(off.document)).toEqual([]);
    });
});

describe('punch-in cameras and flash transitions become framing (reference-elements S2)', () => {
    const THREE = 'Every missed call is a lost deal. It answers calls all day. Set it up in ten minutes.';
    const beat = (extra: Record<string, unknown> = {}) => ({ ...PROFILE.beats[0], graphics: [], sounds: [], camera: 'static', transition_in: 'none', presenter_behaviour: 'speaking', ...extra });
    const insertMedia = { kind: 'insert_media', source_kind: 'insert_media', position: 'full_screen', state_changes: [], label_hint: '' };
    function compile(beats: unknown[], features = ['long_form'], extra: Record<string, unknown> = {}) {
        const profile = structuredClone(PROFILE);
        profile.beats = beats.map((entry, at) => ({ ...(entry as object), start_frac: at / beats.length, end_frac: (at + 1) / beats.length,
            start_s: (at * 60) / beats.length, end_s: ((at + 1) * 60) / beats.length }));
        profile.captions.present = false;
        profile.unmapped = [];
        const result = compileReferenceRemake({ ...request({ script: THREE, ...extra }), reference_profile: profile }, capabilities(features));
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        return { input: native(result.document), notes: result.document.brief.reference_profile!.unmapped.map(entry => entry.what), document: result.document };
    }
    const span = (item: { anchor: { quote: string }; cover_words?: number }) => {
        const words = quoteOccurrences(lexicalTokens(THREE), item.anchor.quote)[0]!;
        return [words.startWord, words.startWord + (item.cover_words ?? words.endWord - words.startWord)];
    };

    /** Mutant: keep either note for a mapped beat, or drop the medium return, and the plan names a gap it filled or holds the close shot. */
    it('cuts close on a punch_in beat, back to medium on the next presenter beat, and flashes into a speaking beat', () => {
        const { input, notes, document } = compile([beat({ camera: 'punch_in' }), beat({ transition_in: 'flash' }), beat()]);
        const framing = input.framing as { id: string; anchor: { quote: string }; cover_words?: number; size?: string; transition?: string }[];
        expect(framing.map(item => [item.id, item.size, item.transition])).toEqual([['ref-1-framing', 'close', 'cut'], ['ref-2-framing', 'medium', 'flash']]);
        expect(framing.map(span)).toEqual([[0, 7], [7, 12]]);
        expect(makeUgcInput.safeParse(input).success).toBe(true);
        expect(notes.filter(what => what.includes('punch_in') || what.includes('flash'))).toEqual([]);
        expect(validateWorkflowPlan(document, capabilities(['long_form'])).issues).toEqual([]);
    });

    it('returns to medium only on a later presenter beat, and keeps two punch_in beats close', () => {
        const { input } = compile([beat({ camera: 'punch_in' }), beat({ camera: 'punch_in' }), beat()]);
        expect((input.framing as { id: string; size?: string }[]).map(item => [item.id, item.size]))
            .toEqual([['ref-1-framing', 'close'], ['ref-2-framing', 'close'], ['ref-3-framing', 'medium']]);
        const last = compile([beat(), beat(), beat({ camera: 'punch_in' })]).input;
        expect((last.framing as { id: string; size?: string }[]).map(item => [item.id, item.size])).toEqual([['ref-3-framing', 'close']]);
    });

    /** #924: S6's three flash cuts all compiled medium after medium, so the face changed ×0.99–1.09 against the reference's ≥ ×1.10.
     *  Mutants: compile a flash as medium again, or drop the toggle back, and a cut changes the face by less than 10%. */
    it('makes every flash cut change the face by at least 10%, alternating close and medium', () => {
        const { input } = compile([beat(), beat({ transition_in: 'flash' }), beat({ transition_in: 'flash' })]);
        const sizes = (input.framing as { id: string; size: 'close' | 'medium' }[]).map(item => [item.id, item.size]);
        expect(sizes).toEqual([['ref-2-framing', 'close'], ['ref-3-framing', 'medium']]);
        const scales = [FRAMING_SCALE.medium, ...sizes.map(([, size]) => FRAMING_SCALE[size as 'close' | 'medium'])];
        for (let at = 1; at < scales.length; at++) expect(Math.max(scales[at]! / scales[at - 1]!, scales[at - 1]! / scales[at]!)).toBeGreaterThanOrEqual(1.1);
    });

    /** #924: S6's punch_in beat lost its words to a neighbour, so its punch became "a static frame". Mutant: drop the carry, and it is lost again. */
    it('carries a punch_in from a beat that gave up its words to the next beat with the presenter on screen', () => {
        const { input, notes } = compile([beat({ role: 'hook' }), beat({ role: 'problem', camera: 'punch_in' }), beat({ role: 'solution' }), beat({ role: 'cta' })]);
        expect(notes).toEqual(expect.arrayContaining([expect.stringContaining('fewer sentence and clause breaks')]));
        expect((input.framing as { id: string; size?: string }[]).map(item => [item.id, item.size]))
            .toEqual([['ref-3-framing', 'close'], ['ref-4-framing', 'medium']]);
        expect(notes.filter(what => what.includes('punch_in'))).toEqual([]);
    });

    it('keeps the notes where the presenter is not on screen or long form is off', () => {
        const images = [{ asset_id: `ast_${'1'.repeat(32)}`, media_type: 'image' }];
        const covered = compile([beat({ camera: 'punch_in', graphics: [insertMedia] }), beat({ transition_in: 'flash', presenter_behaviour: 'absent' }), beat()],
            ['long_form'], { assets: images });
        expect(covered.input.framing).toBeUndefined();
        expect(covered.notes).toEqual(expect.arrayContaining(['punch_in camera on beats 1', 'flash transitions into beats 2']));
        const off = compile([beat({ camera: 'punch_in' }), beat({ transition_in: 'flash' }), beat()], []);
        expect(off.input.framing).toBeUndefined();
        expect(off.notes).toEqual(expect.arrayContaining(['punch_in camera on beats 1', 'flash transitions into beats 2']));
    });
});

describe('the live remake of a nine-beat reel (#884)', () => {
    /** The live profile's beats, speech and labels left out; the script and media are the ones that run used. */
    const LIVE: [string, number, number, string, string, string, string?][] = [
        ['hook', 0, 0.1564, 'static', 'none', 'speaking', 'overlay_media@top'], ['agitation', 0.1564, 0.198, 'punch_in', 'cut', 'speaking'],
        ['solution', 0.198, 0.3145, 'zoom_out', 'other', 'speaking', 'title_card@top'], ['solution', 0.3145, 0.4217, 'static', 'cut', 'speaking'],
        ['solution', 0.4217, 0.4873, 'static', 'other', 'speaking'], ['offer', 0.4873, 0.6306, 'static', 'cut', 'speaking'],
        ['demo', 0.6306, 0.7723, 'static', 'cut', 'absent', 'insert_media@full_screen'], ['cta', 0.7723, 0.9014, 'static', 'other', 'speaking'],
        ['cta', 0.9014, 1, 'static', 'cut', 'absent', 'end_card@full_screen'],
    ];
    const LIVE_SCRIPT = 'If your AI agent writes the script and then leaves the video to you, this is for you. ' +
        'Filming yourself every single day eats hours you don\'t have. There\'s a tool called Clipwright. ' +
        'Your agent sends the script, and Clipwright sends back a finished video with a presenter, captions and graphics. ' +
        'You see the price before anything renders. And if a render fails, it costs you nothing. ' +
        'Here\'s what it looks like from the inside. Try it free at clipwright dot io.';
    const media = [{ asset_id: `ast_${'1'.repeat(32)}`, media_type: 'image' }, { asset_id: `ast_${'2'.repeat(32)}`, media_type: 'video' }];
    /** `wide` makes the reference's presenter wide and declares presenter_framing with that disposition (#884 S5d). */
    function live(edit: (beats: Record<string, unknown>[]) => void = () => {}, script = LIVE_SCRIPT, features = ['long_form'],
        wide?: 'implemented' | 'warned' | 'stored' | 'rejected', actor = 'actor_alex') {
        const profile = structuredClone(PROFILE);
        if (wide) profile.presenter_framing = 'wide';
        const declared = capabilities(features);
        if (wide) declared.executors[0]!.field_dispositions.presenter_framing = wide;
        profile.beats = LIVE.map(([role, start, end, camera, transition, presenter, graphic]) => ({ ...PROFILE.beats[0], role, start_frac: start, end_frac: end,
            start_s: start * 36.57, end_s: end * 36.57, camera, transition_in: transition, presenter_behaviour: presenter, sounds: [],
            graphics: graphic ? [{ kind: graphic.split('@')[0], source_kind: graphic.split('@')[0], position: graphic.split('@')[1], state_changes: [], label_hint: '' }] : [] }));
        edit(profile.beats);
        profile.captions = { present: true, words_per_caption_max: 3, position: 'bottom', emphasis_style: 'color', hidden_under_graphics: true };
        profile.unmapped = [];
        const result = compileReferenceRemake({ reference_profile: profile, script, actor_id: actor, voice: 'eric', site: 'clipwright.io', assets: media },
            declared);
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        return { document: result.document, input: native(result.document), notes: result.document.brief.reference_profile!.unmapped, declared };
    }
    const startOf = (quote: string, script = LIVE_SCRIPT) => quoteOccurrences(lexicalTokens(script), quote)[0]!.startWord;

    /** Mutant: keep the label's site words, and the end card prints the site twice, once as the narration spells it. */
    it('cuts the site out of the end card\'s call to action, spoken or written', () => {
        const spoken = live().input.templates!.find(item => item.kind === 'end_card')!;
        expect(spoken.data).toEqual({ site: 'clipwright.io', cta: 'Try it free' });
        // Both paths take a written site as one word (#1029).
        for (const site of ['clipwright.io', 'https://www.clipwright.io']) {
            const script = LIVE_SCRIPT.replace('clipwright dot io', site);
            for (const features of [undefined, []]) {
                expect(live(undefined, script, features).input.templates!.find(item => item.kind === 'end_card')!.data).toEqual({ site: 'clipwright.io', cta: 'Try it free' });
            }
        }
        // Codex r1: every trailing preposition goes, and a site that opens the clause leaves no call to action.
        const card = (close: string) => live(undefined, LIVE_SCRIPT.replace('Try it free at clipwright dot io.', close)).input.templates!
            .find(item => item.kind === 'end_card')!.data;
        for (const word of ['on', 'via', 'from', 'to']) expect(card(`Try it free ${word} clipwright dot io.`)).toEqual({ site: 'clipwright.io', cta: 'Try it free' });
        expect(card('Clipwright dot io is where you try it free.')).toEqual({ site: 'clipwright.io' });
    });

    /** Mutant: copy the reference's top place into the tag, and the pill sits on the presenter's face. */
    it('moves a text card off the presenter\'s face to its default place, and says so', () => {
        const { input, notes } = live();
        const tag = input.templates!.find(item => item.kind === 'tag')!;
        expect(tag.data).toEqual({ text: 'There\'s a tool called Clipwright' });
        expect(templateFaceWarnings(input)).toEqual([]);
        expect(notes).toContainEqual(expect.objectContaining({ beat_index: 2, what: expect.stringContaining('top'), suggested_substitute: expect.stringContaining('face clear') }));
        const bottom = live(beats => { (beats[2]!.graphics as { position: string }[])[0]!.position = 'bottom'; });
        expect(bottom.input.templates!.find(item => item.kind === 'tag')!.data).toEqual({ text: 'There\'s a tool called Clipwright', position: 'bottom' });
        expect(bottom.notes.some(entry => entry.beat_index === 2 && entry.suggested_substitute.includes('face clear'))).toBe(false);
    });

    /** Mutant: copy the reference's top place into the overlay, and the picture covers the presenter's face. */
    it.each([['top', 'bottom_right'], ['top_left', 'bottom_left'], ['top_right', 'bottom_right'], ['bottom_left', 'bottom_left'], ['bottom', 'bottom']])(
        'places an overlay the reference shows at %s at %s, clear of the face', (from, to) => {
            const { input, notes } = live(beats => { (beats[0]!.graphics as { position: string }[])[0]!.position = from; });
            const overlay = input.overlays![0]!;
            expect(overlay.position).toBe(to);
            expect(rectsOverlap(overlayRect(overlay.position!, frameCanvasOf('9:16')), faceZone('9:16'))).toBe(false);
            const moved = notes.filter(entry => entry.beat_index === 0 && entry.suggested_substitute.includes('face clear'));
            expect(moved).toHaveLength(from === to ? 0 : 1);
        });

    // #884 S5d, C3: the reference's presenter sat low with room above, and its top graphics there.
    /** Mutant: keep judging places against the close face, and a wide remake still moves the reference's top overlay to the bottom. */
    it.each([['top', 'top'], ['top_left', 'top_left'], ['top_right', 'top_right'], ['bottom', 'bottom']])(
        'keeps an overlay the reference shows at %s at %s over a wide presenter, clear of the wide face', (from, to) => {
            const { input, notes, document, declared } = live(beats => { (beats[0]!.graphics as { position: string }[])[0]!.position = from; }, LIVE_SCRIPT,
                ['long_form'], 'implemented');
            expect(input.presenter_framing).toBe('wide');
            expect(input.overlays![0]!.position).toBe(to);
            expect(rectsOverlap(overlayRect(input.overlays![0]!.position!, frameCanvasOf('9:16')), faceZone('9:16', 'wide'))).toBe(false);
            expect(notes.filter(entry => entry.beat_index === 0 && entry.suggested_substitute.includes('face clear'))).toEqual([]);
            expect(makeUgcInput.safeParse(input).success).toBe(true);
            expect(validateWorkflowPlan(document, declared).issues).toEqual([]);
        });

    it('keeps the reference\'s top tag over a wide presenter, since it clears the wide face', () => {
        const { input, notes } = live(undefined, LIVE_SCRIPT, ['long_form'], 'implemented');
        expect(input.templates!.find(item => item.kind === 'tag')!.data).toEqual({ text: 'There\'s a tool called Clipwright', position: 'top' });
        expect(templateFaceWarnings(input)).toEqual([]);
        expect(notes.some(entry => entry.beat_index === 2 && entry.suggested_substitute.includes('face clear'))).toBe(false);
    });

    /** Mutant: pass presenter_framing on any disposition but rejected, and a warned or stored field reaches a render that ignores it. */
    it('asks for the wide view only where the deployment implements presenter_framing, and places graphics for the close face otherwise', () => {
        for (const disposition of ['warned', 'stored', 'rejected'] as const) {
            const { input } = live(beats => { (beats[0]!.graphics as { position: string }[])[0]!.position = 'top'; }, LIVE_SCRIPT, ['long_form'], disposition);
            expect({ disposition, framing: input.presenter_framing, overlay: input.overlays![0]!.position })
                .toEqual({ disposition, framing: undefined, overlay: 'bottom_right' });
        }
        expect(live().input.presenter_framing).toBeUndefined();
    });

    /** Mutant: drop the library-actor condition, and a personal actor's close face sits under an overlay placed for a wide one. */
    it('plans a personal actor close, since personal actors have no wide view, and keeps graphics off that face', () => {
        const { input } = live(beats => { (beats[0]!.graphics as { position: string }[])[0]!.position = 'top'; }, LIVE_SCRIPT, ['long_form'], 'implemented',
            `actor_u_${'a'.repeat(26)}`);
        expect({ framing: input.presenter_framing, overlay: input.overlays![0]!.position }).toEqual({ framing: undefined, overlay: 'bottom_right' });
    });

    /** Mutant: cut a clause before merging the closing beats, and the demo insert starts one sentence early. */
    it('shares the last sentence between the two closing beats, so the demo lands on its own sentence', () => {
        const { document, input } = live();
        const beats = Object.fromEntries(document.beats.map(beat => [beat.id, 'quote' in beat.anchor ? beat.anchor.quote : '']));
        expect(beats['beat-7']).toMatch(/^Here's what it looks like/);
        expect(beats['beat-8']).toMatch(/^Try it free at/);
        expect(beats['beat-9']).toBe(beats['beat-8']);
        const insert = input.inserts![0]!;
        expect(startOf((insert.anchor as { quote: string }).quote)).toBe(startOf('Here\'s what it looks like'));
        expect((insert.anchor as { quote: string }).quote).toMatch(/^Here's what/);
        expect(startOf((input.templates!.find(item => item.kind === 'end_card')!.anchor as { quote: string }).quote)).toBe(startOf('Try it free'));
        expect(makeUgcInput.safeParse(input).success).toBe(true);
        expect(validateWorkflowPlan(document, capabilities(['long_form'])).issues).toEqual([]);
        const ids = [...(input.templates ?? []), ...(input.inserts ?? []), ...(input.overlays ?? []), ...(input.framing ?? [])].map(item => item.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect((input.caption_emphasis ?? []).map(item => typeof item === 'string' ? item : item.quote)).toEqual(['is for you', 'clipwright dot io']);
    });
});

describe('the reference\'s call in the remake (#857 S5, D9)', () => {
    const lines = [{ speaker: 'agent', text: 'Hi, thanks for calling Brightline Plumbing! This is Mia. How can I help you?' },
        { speaker: 'caller', text: 'Hey Mia, it\'s Dan Walker. My water heater just started leaking. Can you book me the first slot?' },
        { speaker: 'agent', text: 'Of course, Dan. I\'ve booked you for two o\'clock today, and I\'m texting you the details now.' }];
    const notes = (document: WorkflowPlanDocument) => document.brief.reference_profile!.unmapped.map(entry => `${entry.beat_index}: ${entry.what} → ${entry.suggested_substitute}`);
    const startOf = (quote: string) => quoteOccurrences(lexicalTokens(SCRIPT), quote)[0]!.startWord;

    /** Mutants: open the call after another beat's words, keep the reference's phone beside the call's, or drop the in-call screen, and the
     *  call lands off its beat, two phones show, or it reads "incoming call" during the call (C6). */
    it('opens the call after the last words before the listening beat, with the reference\'s in-call screen, and a run that admits it', () => {
        const document = compiled({ call: { lines, voices: { caller: 'en_male_mark' } } }, ['long_form']);
        const input = native(document) as Record<string, unknown> & { call: { after: { quote: string } }; templates?: { kind: string }[] };
        const parsed = makeUgcInput.parse(input);
        expect(parsed.call).toEqual({ after: input.call.after, lines, voices: { caller: 'en_male_mark' },
            phone: { caller: '+1 (305) 555-0147', banner: 'Hold This Call?', banner_note: 'You\'ll be notified to pick up.', mask_number: true } });
        const resume = quoteOccurrences(lexicalTokens(SCRIPT), input.call.after.quote)[0]!.endWord;
        const listening = document.beats.find(beat => beat.id === 'beat-7')!;
        expect(startOf((listening.anchor as { quote: string }).quote)).toBe(resume);
        expect((input.templates ?? []).filter(item => item.kind === 'phone_call')).toEqual([]);
        // The reference's phone graphic on the listening beat gives way to the call's, before any clash could drop it with a note.
        expect(notes(document).filter(entry => entry.startsWith('6: phone_call'))).toEqual([]);
        expect(notes(compiled({}, ['long_form'])).filter(entry => entry.startsWith('6: phone_call'))).toHaveLength(1);
        expect(validateWorkflowPlan(document, capabilities(['long_form'])).issues).toEqual([]);
        expect(notes(document).filter(entry => entry.includes('reference\'s call'))).toEqual([]);
    });

    /** #924: reel B's call opened after "That's why these days", a clause, cutting the sentence in two. Mutant: drop the snap, and the call opens
     *  after "Nobody answers them". */
    it('opens the call on the sentence end nearest the listening beat, never inside a sentence', () => {
        const script = 'Calls come at night. Nobody answers them, and the client walks away for good. So we built a fix.';
        const listening = PROFILE.beats[6];
        const profile = structuredClone(PROFILE);
        profile.beats = [{ ...PROFILE.beats[0], role: 'hook' }, { ...PROFILE.beats[0], role: 'problem' }, listening, { ...PROFILE.beats[0], role: 'cta' }]
            .map((beat, at) => ({ ...beat, graphics: [], camera: 'static', transition_in: 'none', start_frac: at / 4, end_frac: (at + 1) / 4,
                start_s: at * 15, end_s: (at + 1) * 15, ...(at === 2 ? {} : { sounds: [], presenter_behaviour: 'speaking' }) }));
        profile.unmapped = [];
        const result = compileReferenceRemake({ ...request({ script, call: { lines } }), reference_profile: profile }, capabilities(['long_form']));
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        const beat = result.document.beats.find(entry => entry.id === 'beat-3')!;
        expect((beat.anchor as { quote: string }).quote).toMatch(/^and the client/);
        expect((native(result.document).call as { after: { quote: string } }).after).toEqual({ quote: 'Calls come at night' });
    });

    /** Mutant: keep the analyser's entry, and the plan says both that the call plays and that recorded audio is not played. */
    it('drops the analyser\'s "we do not play recorded audio" on the call\'s beat once the plan plays the call, and keeps it otherwise', () => {
        const recorded = (document: WorkflowPlanDocument) => notes(document).filter(entry => entry.includes('recorded audio'));
        expect(recorded(compiled({ call: { lines } }, ['long_form']))).toEqual([]);
        expect(recorded(compiled({}, ['long_form']))).toHaveLength(1);
        expect(notes(compiled({ call: { lines } }, ['long_form'])).filter(entry => entry.startsWith('8: particles'))).toHaveLength(1);
    });

    it('takes the client\'s phone screen over the reference\'s', () => {
        const input = native(compiled({ call: { lines, phone: { caller: '+44 (20) 7946 0958', banner: 'Hold?', mask_number: false } } }, ['long_form']));
        expect((input.call as { phone: Record<string, unknown> }).phone)
            .toEqual({ caller: '+44 (20) 7946 0958', banner: 'Hold?', banner_note: 'You\'ll be notified to pick up.', mask_number: false });
    });

    /** Mutant: drop the note, and the presenter talks through the reference's call unnamed. */
    it('without lines keeps the presenter talking and says the call needs the client\'s lines', () => {
        const document = compiled({}, ['long_form']);
        expect(native(document)).not.toHaveProperty('call');
        expect(notes(document)).toContain('6: the reference\'s call needs your lines → the presenter keeps talking');
        expect(native(compiled({ call: { lines } })).call).toBeUndefined();
    });
});

describe('the remake places the call phone by the reference\'s measured staging (#914 D1e, C6)', () => {
    const lines = [{ speaker: 'agent', text: 'Hi, thanks for calling Brightline Plumbing! This is Mia. How can I help you?' },
        { speaker: 'caller', text: 'Hey Mia, it\'s Dan Walker. My water heater just started leaking. Can you book me the first slot?' }];
    /** The Ganesh call scene, measured (D1a fixture) and tied to the reel's listening beat, as the analysis ties it. */
    const STAGING = JSON.parse(readFileSync(new URL('../__fixtures__/ganesh-staging.json', import.meta.url), 'utf8'));
    const RECT_TARGET = { left: 0.55, top: 0.1, width: 0.38, height: 0.42 };
    const ganesh = (change: (staging: typeof STAGING) => void = () => undefined) => {
        const staging = structuredClone(STAGING);
        staging.elements[0].beat_index = 6;
        change(staging);
        return { ...structuredClone(PROFILE), staging };
    };
    const plan = (profile: unknown, extra: Record<string, unknown> = { call: { lines } }) => {
        const result = compileReferenceRemake({ ...request(extra), reference_profile: profile }, capabilities(['long_form']));
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        return result.document;
    };
    const stageOf = (document: WorkflowPlanDocument) => (native(document).call as { stage?: Record<string, never> } | undefined)?.stage as
        { rect: Record<string, number>; rect_face?: Record<string, number>; enter?: { from: string; displacement: [number, number]; duration_s: number;
            anchor: { id: string; offset_s: number } }; layer?: string } | undefined;
    const notes = (document: WorkflowPlanDocument) => document.brief.reference_profile!.unmapped.map(entry => `${entry.beat_index}: ${entry.what} → ${entry.suggested_substitute}`);

    /** Mutants: take the kind's own rect, the side-slide, the S4d lead, or no layer, and the phone lands, enters or sits where the reference's did not. */
    it('puts the phone within 0.03 of each edge of rect_target, rising straight up, behind the presenter, anchored at freeze_start#1 −3.9 s', () => {
        for (const offset of [-3.96, -3.866]) {
            const document = plan(ganesh(staging => { staging.elements[0].entry.anchors[0].offset_s = offset; }));
            const stage = stageOf(document)!;
            for (const edge of ['left', 'top', 'width', 'height'] as const) expect(Math.abs(stage.rect[edge]! - RECT_TARGET[edge]), edge).toBeLessThanOrEqual(0.03);
            expect(stage.enter!.from).toBe('bottom');
            expect(Math.abs(stage.enter!.displacement[0])).toBeLessThan(0.01);
            expect(stage.enter!.displacement[1]).toBeLessThan(-0.3);
            expect(stage.enter!.anchor.id).toBe('freeze_start#1');
            expect(Math.abs(stage.enter!.anchor.offset_s - -3.9)).toBeLessThanOrEqual(0.1);
            expect([stage.enter!.anchor.offset_s, stage.enter!.duration_s]).toEqual([offset, STAGING.elements[0].entry.duration_s]);
            expect(stage.layer).toBe('behind_presenter');
            expect(stage.rect_face).toEqual(STAGING.elements[0].rect_hold_face);
            expect(makeUgcInput.safeParse(native(document)).success).toBe(true);
            expect(validateWorkflowPlan(document, capabilities(['long_form'])).issues).toEqual([]);
            expect(notes(document).filter(entry => /staging|call phone/.test(entry))).toEqual([]);
        }
    });

    /** Mutant (Codex r1): let the anchor's offset run past 0, and a rise that starts after the freeze is admitted. */
    it('refuses a stage the composition cannot draw, each by its path', () => {
        const input = native(plan(ganesh())) as { call: { stage: CallStage } };
        const refused = (change: (stage: CallStage) => void) => {
            const copy = structuredClone(input);
            change(copy.call.stage);
            return makeUgcInput.safeParse(copy).error?.issues.map(issue => issue.path.join('.'));
        };
        expect(refused(() => undefined)).toBeUndefined();
        expect(refused(stage => { stage.enter!.anchor.offset_s = 1; })).toEqual(['call.stage.enter.anchor.offset_s']);
        expect(refused(stage => { stage.enter!.anchor.offset_s = -10.5; })).toEqual(['call.stage.enter.anchor.offset_s']);
        expect(refused(stage => { (stage.enter!.anchor as { id: string }).id = 'freeze_start#2'; })).toEqual(['call.stage.enter.anchor.id']);
        expect(refused(stage => { (stage.enter as { from: string }).from = 'left'; })).toEqual(['call.stage.enter.from']);
        expect(refused(stage => { stage.rect.left = 0.7; })).toEqual(['call.stage.rect']);
    });

    /** Today's plans as sha256 of their JSON, taken from main 73781645 before D1e, re-taken when the plan's analysis lost its models and cost
     *  (the old digests come back with them restored). Mutant: emit a default stage when there is no staging. */
    it('gives today\'s plan byte for byte from a profile without staging', () => {
        const assets = ['a', 'b', 'c'].map((digit, at) => ({ asset_id: `ast_${digit.repeat(32)}`, media_type: at < 2 ? 'image' : 'video' }));
        const today: [Record<string, unknown>, string[], string][] = [
            [{}, [], 'e285c31bc2c82a52e7c01f429b90331ff665ed705be9602b1f845e77f829d6a1'],
            [{}, ['long_form'], '99fd1a81571469dcfb84f01f3fbc5ef808a4497fac9abd1f7b1b11cd633d14eb'],
            [{ call: { lines: [...lines, { speaker: 'agent', text: 'Of course, Dan. I\'ve booked you for two o\'clock today, and I\'m texting you the details now.' }] } },
                ['long_form'], '4545924926582baed00ddec3767a059de9ffcc045fb6200a102e8c445578c308'],
            [{ call: { lines: [...lines, { speaker: 'agent', text: 'Of course, Dan. I\'ve booked you for two o\'clock today, and I\'m texting you the details now.' }] },
                assets, site: 'clipwright.io' }, ['long_form'], '8f59ad11d228a082b472675efb40d08536f5ea5727c0cbf4f9bfe0f537ffc418'],
            [{ assets }, ['long_form'], 'aa10dfdaae1721734eada355251f0833a59bf1cbbfc65f1a722969d916fa05c7'],
        ];
        for (const [extra, features, digest] of today) {
            const result = compileReferenceRemake(request(extra), capabilities(features));
            expect(createHash('sha256').update(JSON.stringify(result)).digest('hex'), JSON.stringify(extra).slice(0, 40)).toBe(digest);
        }
    });

    /** Mutant: drop a part the composition cannot draw without a note, and the plan silently draws the call scene's default (rule 3). */
    it('names every measured part the composition cannot draw, and every part the staging did not measure', () => {
        const blurred = notes(plan(ganesh(staging => { staging.elements[0].entry.style = 'blur_in'; staging.elements[0].layer.value = 'in_front_of_presenter'; })));
        expect(blurred).toContain('6: the call phone\'s blur_in entry (side: bottom) → the call scene\'s rise from below: the phone draws no other entry');
        expect(blurred).toContain('6: the call phone in front of presenter → behind the presenter, as the call scene draws it');
        const unanchored = plan(ganesh(staging => { staging.elements[0].entry.anchors = []; }));
        expect(stageOf(unanchored)!.enter).toBeUndefined();
        expect(notes(unanchored)).toContain('6: the call phone\'s entry (it is not anchored on the call\'s freeze) → the call scene\'s rise, 3.96 s before the freeze');
        const missing = plan(ganesh(staging => { staging.elements = []; }));
        expect(stageOf(missing)).toBeUndefined();
        expect(notes(missing)).toContain('6: the call phone\'s place (reference staging did not measure it) → the reference call scene\'s place: default used');
        const checklist = plan(ganesh(staging => { staging.elements.push({ ...structuredClone(STAGING.elements[0]), id: 'list', beat_index: 4, graphic_index: 0, kind: 'toggle_checklist' }); }));
        // A checklist over the presenter is drawn at its measured box since #973 S5; only its entry stays the kind's own.
        expect(native(checklist).templates!.find(item => item.kind === 'checklist')!.place).toEqual({ relative_to: 'face', rect: STAGING.elements[0].rect_hold_face });
        expect(notes(checklist)).toContain('4: the measured entry of the templates on beats 5 → each template\'s own entry');
        expect(notes(checklist).filter(entry => entry.startsWith('6: phone_call'))).toEqual([]);
        // Mutant (#930 S2): call every staged box measured, and an element only the vision pass saw is claimed as measured.
        const seen = plan(ganesh(staging => { staging.elements.push({ id: 'list', beat_index: 4, graphic_index: 0, kind: 'toggle_checklist', rect_method: 'estimated-video',
            rect_hold: { left: 0.3, top: 0.15, width: 0.4, height: 0.3 } }); }));
        expect(notes(seen)).toContain('4: checklist: its vision-pass place, over the presenter\'s face → the checklist\'s default place, to keep the face clear');
        // Mutant (Codex 930-s2 r1): match estimated-video only, and a still-grounded box the budget left unmeasured is called measured.
        const still = plan(ganesh(staging => { staging.elements.push({ id: 'list', beat_index: 4, graphic_index: 0, kind: 'toggle_checklist', rect_method: 'estimated-still',
            rect_hold: { left: 0.3, top: 0.15, width: 0.4, height: 0.3 } }); }));
        expect(notes(still)).toContain('4: checklist: its vision-pass place, over the presenter\'s face → the checklist\'s default place, to keep the face clear');
        const noCall = notes(plan(ganesh(), {}));
        expect(noCall).toContain('6: phone_call: its measured place, over the presenter\'s face → the phone_call\'s default place, to keep the face clear');
    });
});

describe('the remake draws measured staging without snapping it to presets (#973 S5)', () => {
    /** The job-01 reference's stored analysis (ref_907c321d…), its words replaced; boxes, times and staging as measured. */
    const JOB01 = JSON.parse(readFileSync(new URL('../__fixtures__/reference-job01-profile.json', import.meta.url), 'utf8')).reference_profile;
    /** S0's numbers for it (evidence/reference-numbers.json): the median icon width and the face height while the icons show. */
    const ICON_WIDTH_W = 0.2852, FACE_HEIGHT_H = 0.2667, FACE_CENTRE = [0.4761, 0.2856] as const;
    const JOB01_SCRIPT = 'Need a quick email? ChatGPT. Planning a launch? Claude. Studying for a test? NotebookLM. Checking your rivals? Perplexity. ' +
        'Making ad clips? Higgsfield. Shipping an app? Cursor. A site by tonight? Lovable. A video of you? HeyGen. Slides for Monday? Gamma. ' +
        'A posting plan? Poppy. Stuck on a bug? Codex. Learning something fast? Gemini. What is trending? Grok. A voiceover? ElevenLabs. ' +
        'Meeting notes? Supernormal. Earning on the side? Canva. Want more tools like these? Follow for daily tips.';
    const icons = Array.from({ length: 12 }, (_, at) => ({ asset_id: `ast_${at.toString(16).repeat(32)}`, media_type: 'image' }));
    const declared = () => {
        const profile = capabilities(['long_form']);
        Object.assign(profile.executors[0]!.field_dispositions, { caption_position: 'implemented', presenter_place: 'implemented' });
        return profile;
    };
    const remake = (profile: unknown, script = JOB01_SCRIPT, assets: unknown[] = icons) => {
        const result = compileReferenceRemake({ reference_profile: profile, script, actor_id: 'actor_alex', voice: 'eric', assets }, declared());
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        return { document: result.document, input: native(result.document), notes: result.document.brief.reference_profile!.unmapped };
    };

    /** Mutants: snap to a preset, drop the caption relation, take the frame box over it, or skip the face; the icons land where v1's did (0.532 W). */
    it('places every icon of the stored job-01 analysis under the captions at the reference width, and frames the face as the reference did', () => {
        const { document, input, notes } = remake(structuredClone(JOB01));
        const overlays = input.overlays!;
        // A run shows ten overlays; the rest of the icons become text cards, and the plan says so.
        expect(overlays).toHaveLength(10);
        expect(notes.filter(entry => entry.what === 'logo_card (a run shows at most 10 overlays)').map(entry => entry.beat_index)).toEqual([10, 11, 12, 13, 14, 15]);
        for (const overlay of overlays) {
            expect(overlay.position, overlay.id).toBeUndefined();
            expect(overlay.place, overlay.id).toMatchObject({ relative_to: 'captions', side: 'below' });
            const width = (overlay.place as { width: number }).width;
            expect(Math.abs(width - ICON_WIDTH_W) / ICON_WIDTH_W, overlay.id).toBeLessThanOrEqual(0.15);
            if (overlay.enter_offset_s !== undefined) expect(Math.abs(overlay.enter_offset_s)).toBeLessThanOrEqual(0.5);
        }
        const scene = admissionScene(input as never, '9:16', 'close'), boxes = overlayFootprints(overlays as never, '9:16', 'close', scene);
        for (const overlay of overlays) {
            const box = boxes.get(overlay.id)!, captions = scene.captions!;
            expect(Math.abs(box.left + box.width / 2 - (captions.left + captions.width / 2)), overlay.id).toBeLessThanOrEqual(0.02);
            expect(box.top - captions.top - captions.height, overlay.id).toBeGreaterThanOrEqual(0);
            expect(box.top - captions.top - captions.height, overlay.id).toBeLessThanOrEqual(0.02);
        }
        expect(Math.abs(input.presenter_place!.face_height - FACE_HEIGHT_H)).toBeLessThanOrEqual(0.005);
        for (const axis of [0, 1]) expect(Math.abs(input.presenter_place!.face_centre[axis]! - FACE_CENTRE[axis]!)).toBeLessThanOrEqual(0.005);
        // The reference shows the first icon 0.23 s after its beat's last word starts; ours waits the same after our beat's last word.
        expect(overlays[0]!.anchor).toEqual({ quote: 'email' });
        expect(overlays[0]!.enter_offset_s).toBe(0.23);
        expect(makeUgcInput.safeParse(input).success).toBe(true);
        expect(validateWorkflowPlan(document, declared()).issues).toEqual([]);
        const said = notes.map(entry => `${entry.what} → ${entry.suggested_substitute}`);
        expect(said).toContainEqual(expect.stringMatching(/^the reference's caption box, for the graphics on beats 1, 2, .* \(not measured\) → placed under the captions/));
        expect(said.filter(entry => entry.includes('measured staging is drawn'))).toEqual([]);
    });

    /** Mutant: read the caption box but keep inferring, and a measured gap of 0.009 H becomes the default 0.01 with a note that it was not measured. */
    it('takes the measured gap from a caption box when the analysis has one, and a far box leaves the icon on the face', () => {
        const near = structuredClone(JOB01);
        near.captions.box = { left: 0.3, top: 0.52, width: 0.4, height: 0.075 };
        const placed = remake(near);
        expect(placed.input.overlays![0]!.place).toEqual({ relative_to: 'captions', side: 'below', gap: 0.0092, width: 0.2852 });
        expect(placed.notes.some(entry => entry.what.includes('caption box'))).toBe(false);
        const far = structuredClone(JOB01);
        far.captions.box = { left: 0.3, top: 0.4, width: 0.4, height: 0.075 };
        expect(remake(far).input.overlays![0]!.place).toEqual({ relative_to: 'face', rect: JOB01.staging.elements[0].rect_hold_face });
    });

    /** Owner: general, not one reference. Mutant: map a staged tag back to its position, and the reference's lower third lands in the tag's default band. */
    it('maps a presenter reference\'s corner logo to a face place and its lower-third tag to a frame place', () => {
        const profile = structuredClone(PROFILE);
        const base = { ...PROFILE.beats[0], sounds: [], camera: 'static', transition_in: 'none', presenter_behaviour: 'speaking' };
        const graphic = (kind: string, source_kind: string, position: string) => ({ kind, source_kind, position, state_changes: [], label_hint: '' });
        profile.beats = [{ ...base, start_frac: 0, end_frac: 0.5, start_s: 0, end_s: 10, graphics: [graphic('title_card', 'logo_card', 'top_right')] },
            { ...base, role: 'cta', start_frac: 0.5, end_frac: 1, start_s: 10, end_s: 20, graphics: [graphic('tag', 'banner', 'bottom')] }];
        profile.source = { ...profile.source, duration_s: 20, width: 720, height: 1280 };
        profile.captions = { present: true, words_per_caption_max: 3, position: 'bottom', emphasis_style: 'none', hidden_under_graphics: false };
        profile.unmapped = [];
        const logoTwin = { left: 0.495, top: -1, width: 0.495, height: 0.48 };
        profile.staging = { version: 'reference-staging-v1', analysis_width: 720, anchors: [], freezes: [], elements: [
            { id: 'logo', beat_index: 0, graphic_index: 0, kind: 'logo_card', rect_hold: { left: 0.72, top: 0.05, width: 0.22, height: 0.12 }, rect_hold_face: logoTwin,
                rect_method: 'frames-box/v1', entry: { first_visible_s: 2, style: 'fade', duration_s: 0.3 }, exit: { style: 'fade' } },
            { id: 'lower', beat_index: 1, graphic_index: 0, kind: 'banner', rect_hold: { left: 0.05, top: 0.74, width: 0.6, height: 0.07 }, rect_method: 'frames-motion/v1',
                entry: { first_visible_s: 11, style: 'slide', from: 'left' } }] };
        const script = 'Every missed call is a lost deal. Set it up in ten minutes and stop losing deals while you sleep.';
        const { document, input, notes } = remake(profile, script, [icons[0]]);
        expect(input.overlays).toEqual([expect.objectContaining({ asset_id: icons[0]!.asset_id, place: { relative_to: 'face', rect: logoTwin }, enter: 'fade',
            enter_duration_s: 0.3, exit: 'fade' })]);
        expect(input.overlays![0]!.position).toBeUndefined();
        const tag = input.templates!.find(item => item.kind === 'tag')!;
        expect(tag.place).toEqual({ relative_to: 'frame', rect: { left: 0.05, top: 0.74, width: 0.6, height: 0.07 } });
        expect(tag.data).not.toHaveProperty('position');
        expect(input.presenter_place).toEqual({ face_height: 0.25, face_centre: [0.5, 0.3] });
        expect(makeUgcInput.safeParse(input).success).toBe(true);
        expect(validateWorkflowPlan(document, declared()).issues).toEqual([]);
        expect(notes.map(entry => entry.what)).toContain('the measured entry of the templates on beats 2');
        expect(notes.some(entry => entry.what.includes('caption box'))).toBe(false);
    });
});
