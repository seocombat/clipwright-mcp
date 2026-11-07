import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileReferenceRemake, referenceProfileWarnings, type CapabilityProfile, type WorkflowPlanDocument } from './index.js';
import { proportionalSpans, type ReferenceSpanPlanner } from './reference-remake.js';
import { MAX_LAYOUT_WINDOWS } from '../ugc-layers.js';

// A remake shows the product's screens large on the beats that show the product, and a site puts an end card on the closing beat (#1161).

const PROFILE = JSON.parse(readFileSync(new URL('../fixtures/reference-profile-reel.json', import.meta.url), 'utf8'));
const SCRIPT = 'Every missed call is a lost deal. Your receptionist sleeps, takes breaks, and sometimes gets annoyed. This one doesn\'t. ' +
    'It answers calls all day, works around the clock, and never gets annoyed. Here\'s a real one: a customer calls at two in the morning to book ' +
    'a cleaning, and it handles everything, the time, the price, the confirmation text. Small businesses miss a third of their calls. Not anymore. ' +
    'Set it up in ten minutes and stop losing deals on Ringly.';
const SCREENS = ['a', 'b', 'c'].map(letter => ({ asset_id: `ast_${letter.repeat(32)}`, media_type: 'image' as const }));
const graphic = (kind: string, position: string) => ({ kind, source_kind: kind, position, state_changes: [], label_hint: '' });
const capabilities = (templates: 'implemented' | 'rejected' = 'implemented'): CapabilityProfile => ({ v: 1, content_digest: 'c'.repeat(64),
    executors: [{ skill: 'make_ugc', configured: true, qualified: true, enabled: true, profiles: ['ugc-native-v1'],
        features: ['exact_script', 'actor', 'voice', 'long_form'], formats: [{ aspect_ratio: '9:16', resolution: '1080p' }],
        field_dispositions: { captions: 'implemented', caption_style: 'implemented', templates, scenes: 'rejected' } }] });

function compile(edit: (profile: typeof PROFILE) => void, extra: Record<string, unknown> = {}, templates?: 'implemented' | 'rejected',
    spans: ReferenceSpanPlanner = proportionalSpans): WorkflowPlanDocument {
    const profile = structuredClone(PROFILE);
    delete profile.staging;
    edit(profile);
    const result = compileReferenceRemake({ reference_profile: profile, script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah', assets: SCREENS, ...extra },
        capabilities(templates), spans);
    if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
    return result.document;
}
const input = (document: WorkflowPlanDocument) => (document.brief.native as { input: Record<string, unknown> }).input;
type Window = { id: string; asset_id: string; layout: string; media_side?: string; media_share?: number };
type Template = { id: string; kind: string; anchor: { quote: string }; data: Record<string, unknown> };

describe('a product screen on a demo beat takes half the frame (#1161)', () => {
    const shown = (profile: typeof PROFILE) => {
        // The fixture's own media beats would take the screens first.
        profile.beats[1].graphics = [];
        profile.beats[2] = { ...profile.beats[2], graphics: [], presenter_behaviour: 'speaking' };
        profile.beats[4].graphics = [graphic('overlay_media', 'top')];
        profile.beats[7].graphics = [graphic('overlay_media', 'bottom_right')];
        profile.beats[8].graphics = [graphic('overlay_media', 'top')];
    };

    it('draws each demo screen as a split on the side the reference showed it, and leaves an overlay on a beat that does not show the product', () => {
        const document = compile(shown), native = input(document);
        const windows = native.layout_windows as Window[], overlays = native.overlays as { id: string; asset_id: string }[];
        expect(windows.map(({ id, layout, media_side, media_share, asset_id }) => ({ id, layout, media_side, media_share, asset_id }))).toEqual([
            { id: 'ref-5-overlay-media', layout: 'split', media_side: 'top', media_share: 0.5, asset_id: SCREENS[0]!.asset_id },
            { id: 'ref-8-overlay-media', layout: 'split', media_side: 'bottom', media_share: 0.5, asset_id: SCREENS[1]!.asset_id },
        ]);
        // Beat 9 is social proof: its picture stays an overlay.
        expect(overlays.map(item => item.id)).toEqual(['ref-9-overlay-media']);
        expect(overlays[0]!.asset_id).toBe(SCREENS[2]!.asset_id);
        const warnings = referenceProfileWarnings(document.brief.reference_profile!);
        expect(warnings).toContain('Reference beat 5 (demo): overlay_media at top is not reproduced; instead: a split: your screen fills the top half and the ' +
            'presenter the other, so the screen reads and the face stays clear.');
        expect(warnings.some(warning => warning.includes('Reference beat 5') && warning.includes('to keep the face clear'))).toBe(false);
    });

    it('takes the side from the measured box, over the position the analyser named', () => {
        const staging = JSON.parse(readFileSync(new URL('../__fixtures__/ganesh-staging.json', import.meta.url), 'utf8'));
        const { rect_hold_face: _face, ...element } = staging.elements[0];
        const document = compile(profile => {
            shown(profile);
            profile.staging = { ...staging, freezes: [], elements: [{ ...element, id: 'screen', beat_index: 4, graphic_index: 0, kind: 'overlay_media',
                rect_hold: { left: 0.1, top: 0.55, width: 0.8, height: 0.35 } }] };
        });
        expect((input(document).layout_windows as Window[])[0]).toMatchObject({ id: 'ref-5-overlay-media', media_side: 'bottom' });
        expect(referenceProfileWarnings(document.brief.reference_profile!).some(warning =>
            warning.startsWith('Reference beat 5 (demo): overlay_media in its measured box is not reproduced; instead: a split: your screen fills the bottom half'))).toBe(true);
    });

    it('falls back to an overlay once a run holds its most windows', () => {
        // #1192: fifteen windows a run, so the sixteenth screen falls back.
        const count = MAX_LAYOUT_WINDOWS + 1, names = ['logs the job', 'adds the hours', 'sets the rate', 'sends it out'];
        const sentences = Array.from({ length: count }, (_, at) => `Tap ${String.fromCharCode(97 + at)} ${names[at % 4]}.`);
        const assets = sentences.map((_, at) => ({ asset_id: `ast_${(at + 1).toString(16).repeat(32).slice(0, 32)}`, media_type: 'image' as const }));
        const document = compile(profile => {
            profile.beats = sentences.map((_, at) => ({ ...PROFILE.beats[4], graphics: [graphic('overlay_media', 'top')], sounds: [], camera: 'static',
                transition_in: 'none', presenter_behaviour: 'speaking', start_frac: at / count, end_frac: (at + 1) / count, start_s: at * 2, end_s: at * 2 + 2 }));
            profile.captions.present = false;
            profile.unmapped = [];
        }, { script: sentences.join(' '), assets });
        expect((input(document).layout_windows as Window[]).map(item => item.id))
            .toEqual(Array.from({ length: MAX_LAYOUT_WINDOWS }, (_, at) => `ref-${at + 1}-overlay-media`));
        expect((input(document).overlays as { id: string }[]).map(item => item.id)).toEqual([`ref-${count}-overlay-media`]);
    });

    it('keeps a framing off a beat whose screen splits the frame', () => {
        const framing = (input(compile(shown)).framing ?? []) as { anchor: { quote: string } }[];
        const windows = input(compile(shown)).layout_windows as (Window & { anchor: { quote: string } })[];
        for (const window of windows) expect(framing.map(item => item.anchor.quote)).not.toContain(window.anchor.quote);
    });
});

describe('a site puts an end card on the closing beat (#1161)', () => {
    const endCards = (document: WorkflowPlanDocument) => ((input(document).templates ?? []) as Template[]).filter(item => item.kind === 'end_card');

    it('adds one on a call to action the reference shows nothing on, its label stopping before the site', () => {
        const document = compile(profile => { profile.beats[9].graphics = []; }, { site: 'Ringly' });
        expect(endCards(document)).toEqual([expect.objectContaining({ id: 'ref-10-end-card', data: { site: 'Ringly', cta: expect.any(String) } })]);
        expect(endCards(document)[0]!.data.cta).not.toMatch(/ringly|\bon$/i);
        expect(SCRIPT.indexOf(endCards(document)[0]!.anchor.quote)).toBeGreaterThan(SCRIPT.indexOf('Not anymore.'));
    });

    it('falls back to the last beat with words when no call to action has words of its own', () => {
        const noCta = compile(profile => {
            profile.beats[8].graphics = [];
            profile.beats[9] = { ...profile.beats[9], role: 'social_proof', graphics: [] };
        }, { site: 'Ringly' });
        expect(endCards(noCta).map(item => item.id)).toEqual(['ref-10-end-card']);
        // The call to action's words join a neighbour: the card goes on the last beat that kept words.
        const wordless = compile(profile => { profile.beats[8].graphics = []; }, { site: 'Ringly' }, undefined,
            args => proportionalSpans(args).map((span, at) => (at === 9 ? undefined : span)) as ReturnType<ReferenceSpanPlanner>);
        expect(endCards(wordless).map(item => item.id)).toEqual(['ref-9-end-card']);
    });

    it('takes the place of the text card the reference shows there', () => {
        const templates = (input(compile(() => {}, { site: 'Ringly' })).templates ?? []) as Template[];
        expect(templates.filter(item => item.id.startsWith('ref-10-')).map(item => item.kind)).toEqual(['end_card']);
    });

    it('gives the beat back its captions once a full-frame text card makes way', () => {
        const full = (site?: string) => compile(profile => { profile.beats[9].graphics = [graphic('title_card', 'full_screen')]; }, site ? { site } : {});
        const covered = 'Reference beat 10 (cta): caption emphasis on this beat (a full-frame insert or template covers its words';
        expect(referenceProfileWarnings(full().brief.reference_profile!).some(warning => warning.startsWith(covered))).toBe(true);
        const document = full('Ringly');
        expect(endCards(document).map(item => item.id)).toEqual(['ref-10-end-card']);
        expect(referenceProfileWarnings(document.brief.reference_profile!).some(warning => warning.startsWith(covered))).toBe(false);
        const end = endCards(document)[0]!.anchor.quote;
        expect(((input(document).caption_emphasis ?? []) as (string | { quote: string })[]).length).toBeGreaterThan(0);
        expect(SCRIPT.indexOf(end)).toBeGreaterThan(0);
    });

    it('adds none without a site, and names the end card it cannot draw', () => {
        expect(endCards(compile(profile => { profile.beats[9].graphics = []; }))).toEqual([]);
        const off = compile(profile => { profile.beats[9].graphics = []; }, { site: 'Ringly' }, 'rejected');
        expect(endCards(off)).toEqual([]);
        expect(referenceProfileWarnings(off.brief.reference_profile!)).toContain('Reference beat 10 (cta): an end card for your site (templates are not ' +
            'available right now) is not reproduced; instead: the presenter speaks these words without it.');
    });
});
