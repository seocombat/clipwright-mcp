import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estimateDurationSec } from '../pacing.js';
import { makeUgcInput } from '../skills.js';
import { resolveTtsModel } from '../voices.js';
import { compileReferenceRemake, referenceProfileWarnings, referenceScriptWords, type CapabilityProfile, type WorkflowPlanDocument } from './index.js';

// Full-frame elements on screen only as long as they earn (#1196), and a transition refusal that takes only the transition (#1198 item 7).

type Item = { id: string; asset_id?: string; anchor: { quote: string }; cover_words?: number; transition?: string; image_motion?: unknown };
const input = (document: WorkflowPlanDocument) => (document.brief.native as unknown as { input: Record<string, Item[] | undefined> }).input;
const warnings = (document: WorkflowPlanDocument) => referenceProfileWarnings(document.brief.reference_profile!);

describe('a transition refusal next to a full-frame card takes only the transition (#1198 item 7)', () => {
    const CASE = JSON.parse(readFileSync(new URL('../fixtures/remake-regulator-case.json', import.meta.url), 'utf8'));
    const [PRODUCT, METER] = (CASE.request.assets as { asset_id: string }[]).map(asset => asset.asset_id) as [string, string];
    /** The regulator remake with every reference beat cut in by a wipe and a full-frame card right before the pinned product picture. */
    const compile = (quote = 'Buzdolabına ayrı, kombiye ayrı, televizyona ayrı regülatör almayın') => {
        const profile = structuredClone(CASE.request.reference_profile);
        for (const beat of profile.beats as { transition_in: string }[]) beat.transition_in = 'wipe';
        const result = compileReferenceRemake({ ...CASE.request, reference_profile: profile,
            assets: [{ asset_id: PRODUCT, media_type: 'image', anchor: 'Ben tek bir tüm ev regülatörünü' }, { asset_id: METER, media_type: 'image', anchor: 'sayacın yanına bağlıyorum' }],
            line_edits: [{ quote, template: { kind: 'title_card', placement: 'full', data: { title: 'Tek regülatör' } } }] }, CASE.capabilities);
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        return result.document;
    };

    /** Mutant: drop every key a move set on the cited insert, and the picture next to the card stands still. */
    it('keeps the picture\'s slow zoom when its wipe gives way to a cut beside the card', () => {
        const document = compile(), product = input(document).inserts!.find(item => item.asset_id === PRODUCT)!;
        expect(product.transition).toBeUndefined();
        expect(product.image_motion).toEqual({ direction: 'in', amount: 0.25 });
        expect(warnings(document)).toContain('Reference beat 5 (solution): insert_media: its transition (template "edit-1-title-card" meets insert ' +
            '"asset-1-insert-media", whose wipe would show a hidden presenter frame: use cut or flash on one of them) is not reproduced; instead: a cut.');
        expect(warnings(document).some(line => line.includes('image motion'))).toBe(false);
        // The plan still lists the zoom it keeps, and says nothing of the wipe it gave up.
        expect(document.brief.added).toContain('beat 5: the picture zooms in slowly, unless its shape scrolls or pans it');
        expect(makeUgcInput.safeParse(input(document)).success).toBe(true);
    });

    /** Mutant: keep a patch's every line when only its transition goes, and the plan says the meter photo wipes in while it cuts. */
    it('drops the plan\'s line about the wipe it gave up and keeps the one about the zoom it kept', () => {
        const document = compile('Voltaj düşse de yükselse de bütün ev iki yüz yirmi voltta kalıyor');
        expect(input(document).inserts!.find(item => item.asset_id === METER)).toMatchObject({ image_motion: { direction: 'out' } });
        expect(input(document).inserts!.find(item => item.asset_id === METER)!.transition).toBeUndefined();
        expect(document.brief.added).toContain('beat 5: the picture zooms out slowly, unless its shape scrolls or pans it');
        expect(document.brief.added).not.toContain('beat 5: the picture also comes in with the wipe it leaves on');
    });

    /** Mutant: blame the insert the card's own wipe meets, and the insert loses a move the refusal never named. */
    it('takes a card\'s own wipe from the card, not from the picture it meets', () => {
        const document = compile(), card = input(document).templates!.find(item => item.id === 'edit-1-title-card')!;
        expect(card.transition).toBeUndefined();
        expect(input(document).inserts!.find(item => item.asset_id === METER)).toMatchObject({ transition: 'wipe', image_motion: { direction: 'out' } });
    });
});

describe('a full-frame picture the reference only flashed covers few words (#1196)', () => {
    const PROFILE = JSON.parse(readFileSync(new URL('../fixtures/reference-profile-reel.json', import.meta.url), 'utf8'));
    const capabilities: CapabilityProfile = { v: 1, content_digest: 'c'.repeat(64), executors: [{ skill: 'make_ugc', configured: true, qualified: true, enabled: true,
        profiles: ['ugc-native-v1'], features: ['exact_script', 'actor', 'voice', 'long_form'], formats: [{ aspect_ratio: '9:16', resolution: '1080p' }],
        field_dispositions: { captions: 'implemented', caption_style: 'implemented', templates: 'implemented' } }] };
    const images = ['a', 'b'].map(digit => ({ asset_id: `ast_${digit.repeat(32)}`, media_type: 'image' }));
    const SCRIPT = 'Every missed call is a lost deal. Here is the page that books it for you, the time, the price, the text. Set it up in ten minutes.';
    /** Three beats: the presenter, a screenshot (or a title card) over the whole frame shown from 6.2 s to `gone`, the presenter again. */
    const profile = (gone?: number, kind = 'insert_media') => {
        const base = { ...PROFILE.beats[0], sounds: [], camera: 'static', transition_in: 'none' };
        const graphic = { kind, source_kind: kind === 'insert_media' ? 'screenshot' : kind, position: 'full_screen', state_changes: [], label_hint: 'One sentence' };
        return { ...structuredClone(PROFILE), unmapped: [], source: { ...PROFILE.source, duration_s: 18, width: 720, height: 1280 },
            beats: [{ ...base, role: 'hook', start_frac: 0, end_frac: 1 / 3, start_s: 0, end_s: 6, presenter_behaviour: 'speaking', graphics: [] },
                { ...base, role: 'demo', start_frac: 1 / 3, end_frac: 2 / 3, start_s: 6, end_s: 12, presenter_behaviour: 'absent', graphics: [graphic] },
                { ...base, role: 'cta', start_frac: 2 / 3, end_frac: 1, start_s: 12, end_s: 18, presenter_behaviour: 'speaking', graphics: [] }],
            staging: { version: 'reference-staging-v1', analysis_width: 720, anchors: [], freezes: [], elements: [{ id: 'e3', beat_index: 1, graphic_index: 0,
                kind: 'screenshot', rect_hold: { left: 0, top: 0, width: 1, height: 1 }, rect_method: 'frames-box/v1',
                entry: { first_visible_s: 6.2 }, ...(gone === undefined ? {} : { exit: { last_visible_s: gone, style: 'cut' } }) }] } };
    };
    const screen = (gone?: number) => {
        const result = compileReferenceRemake({ reference_profile: profile(gone), script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah', assets: images }, capabilities);
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        return input(result.document).inserts![0]!;
    };

    /** Mutants: no flash rule, or a flash judged by its entry alone, and the screenshot holds its whole line as it did on Hvmlab. */
    it('gives a 0.7 s flash the words it takes at our pace, and a held screen its whole line', () => {
        const held = screen(11.5), flash = screen(6.9), unmeasured = screen();
        expect(held.cover_words).toBeGreaterThan(8);
        expect(unmeasured.cover_words).toBe(held.cover_words);
        expect(flash.cover_words).toBeLessThanOrEqual(3);
        expect(flash.cover_words).toBeGreaterThanOrEqual(1);
        expect(flash.anchor.quote.startsWith(held.anchor.quote.split(' ')[0]!)).toBe(true);
        // Codex r2, r3: the count is the flash's time over our script's own seconds per word, not a fixed word or the reference's pace.
        const perWord = estimateDurationSec(SCRIPT, resolveTtsModel({ voice: 'sarah', script: SCRIPT })) / referenceScriptWords(SCRIPT).length;
        for (const gone of [6.5, 6.9, 7.3]) expect(screen(gone).cover_words, String(gone)).toBe(Math.ceil((gone - 6.2) / perWord));
        expect(screen(7.3).cover_words).toBe(3);
    });

    /** Codex r1 (A2). Mutant: shorten flashed pictures only, and a full-frame card the reference flashed holds its whole line. */
    it('gives a flashed full-frame card the same few words, and a held one its whole line', () => {
        const card = (gone: number) => {
            const result = compileReferenceRemake({ reference_profile: profile(gone, 'title_card'), script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah',
                assets: images }, capabilities);
            if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
            return input(result.document).templates!.find(item => (item as { placement?: string }).placement === 'full')!;
        };
        expect(card(11.5).cover_words).toBeGreaterThan(8);
        expect(card(6.9).cover_words).toBeLessThanOrEqual(3);
    });
});
