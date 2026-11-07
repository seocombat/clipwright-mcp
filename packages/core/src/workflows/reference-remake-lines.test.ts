import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCENE_CREDITS } from '../parts-pricing.js';
import { lexicalTokens, quoteOccurrences } from '../semantic-inserts.js';
import { makeUgcInput } from '../skills.js';
import { videoHoldWarnings } from '../ugc-video-media.js';
import { compileReferenceRemake, referenceProfileWarnings, saveWorkflowPlan, type ReferenceAssetFacts, type WorkflowPlanDocument } from './index.js';

// A user's notes about shots reach the next revision through plan_reference_remake fields, and the first revision places pictures and graphics by
// the lines they belong on (#1172, #1170). The case is the live regulator remake: revision 2 carried six notes and kept its shots; revision 3
// applied them by hand through a saved document.

const CASE = JSON.parse(readFileSync(new URL('../fixtures/remake-regulator-case.json', import.meta.url), 'utf8'));
const SCRIPT: string = CASE.request.script;
const [PRODUCT, METER] = (CASE.request.assets as { asset_id: string }[]).map(asset => asset.asset_id) as [string, string];
type Item = { id: string; kind?: string; asset_id?: string; anchor: { quote: string }; cover_words?: number; data?: Record<string, unknown>; placement?: string };
/** The six notes of revision 2 as the fields that carry them: two pictures pinned to their words and five graphics on lines. */
const NOTES = {
    assets: [{ asset_id: PRODUCT, media_type: 'image', anchor: 'Ben tek bir tüm ev regülatörünü' },
        { asset_id: METER, media_type: 'image', anchor: 'sayacın yanına bağlıyorum' }],
    line_edits: (CASE.revision_3.templates as Item[]).map(item => ({ quote: {
        tag: item.data!.text === 'Kaç regülatör lazım?' ? 'Evinize kaç regülatör lazım' : 'yorumlara FİYAT yazın',
        title_card: 'Ben her evde aynı cevabı veriyorum: bir tane', checklist: 'Buzdolabına ayrı, kombiye ayrı, televizyona ayrı regülatör almayın',
        stat: 'Voltaj düşse de yükselse de bütün ev iki yüz yirmi voltta kalıyor' }[item.kind!]!,
    template: { kind: item.kind, data: item.data, ...(item.placement ? { placement: item.placement } : {}) } })),
};

function compile(extra: Record<string, unknown> = {}, facts?: ReferenceAssetFacts): WorkflowPlanDocument {
    const result = compileReferenceRemake({ ...CASE.request, ...extra }, CASE.capabilities, undefined, undefined, facts);
    if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
    return result.document;
}
const refused = (extra: Record<string, unknown>) => {
    const result = compileReferenceRemake({ ...CASE.request, ...extra }, CASE.capabilities);
    return result.kind === 'invalid' ? result.issues.map(issue => issue.path) : [];
};
const input = (document: WorkflowPlanDocument) => (document.brief.native as unknown as { input: Record<string, Item[] | undefined> }).input;
const warnings = (document: WorkflowPlanDocument) => referenceProfileWarnings(document.brief.reference_profile!);
const startOf = (quote: string, script = SCRIPT) => quoteOccurrences(lexicalTokens(script), quote)[0]!.startWord;
/** A shot by what it shows and the word it starts on: ids, cover lengths and the director's own moves are not the user's notes. */
const shot = (item: Item) => ({ kind: item.kind ?? 'insert', start: startOf(item.anchor.quote), ...(item.asset_id ? { asset_id: item.asset_id } : { data: item.data }) });

describe('a note about a shot changes that shot in the next revision (#1172 C2, C5)', () => {
    /** Mutant: the edits never reach the plan, and the revision keeps the reference's scenes and pictures as revision 2 did. */
    it('places the six notes of revision 2 where revision 3 placed them by hand, and draws no reference graphic under them', () => {
        const native = input(compile(NOTES));
        expect((native.templates ?? []).map(shot)).toEqual((CASE.revision_3.templates as Item[]).map(shot));
        expect((native.inserts ?? []).map(shot)).toEqual((CASE.revision_3.inserts as Item[]).map(shot));
        expect([native.scenes, native.overlays, native.layout_windows]).toEqual([undefined, undefined, undefined]);
        // The answer card keeps its full frame, the stat stays over the presenter.
        expect(native.templates!.map(item => item.placement)).toEqual([undefined, 'full', undefined, 'over', undefined]);
    });

    /** #1198: a line per replaced graphic repeated the user's own notes 15–20 times. Mutants: a line per entry, or the beats' graphics dropped. */
    it('names every reference graphic the line edits replaced, in one line', () => {
        const said = warnings(compile(NOTES)), replaced = said.filter(line => line.includes('not reproduced; instead: your line edit') ||
            line.startsWith('Your line edits'));
        expect(replaced).toHaveLength(1);
        expect(replaced[0]).toMatch(/^Your line edits replace what the reference draws on beats 1 \(hook\): [^;]*highlight[^;]*; .*6 \(proof\): title_card; 7 \(cta\): sticker\.$/);
        expect(new Set(said).size).toBe(said.length);
        // The analysis's advice on a graphic the user replaced goes with it; the presenter's line on beat 4 stays, it is still true.
        expect(said.filter(line => /^Reference beat (1|7) \(\w+\): (highlight|sticker) is not reproduced/.test(line))).toEqual([]);
    });

    it('takes a line edit with no template as "nothing from the reference here"', () => {
        const native = input(compile({ line_edits: [{ quote: 'yorumlara FİYAT yazın' }] }));
        expect((native.templates ?? []).filter(item => startOf(item.anchor.quote) >= startOf('Hangi gücün'))).toEqual([]);
        expect((native.scenes ?? []).map(item => item.id)).not.toContain('ref-7-scene');
    });

    /** Mutant: an edit clears only the beat its quote starts on, and the next beat it reaches keeps the reference's graphic. */
    it('clears every beat the quote reaches, not only the one it starts on', () => {
        const quote = 'iki yüz yirmi voltta kalıyor. Hangi gücün';
        const document = compile({ line_edits: [{ quote, template: { kind: 'tag', data: { text: 'Sabit voltaj' } } }] }), native = input(document);
        expect([...native.templates ?? [], ...native.scenes ?? [], ...native.overlays ?? []].map(item => item.id).filter(id => /^ref-[67]-/.test(id))).toEqual([]);
        expect(warnings(document).find(line => line.startsWith('Your line edits replace'))).toMatch(/\b7 \(cta\): [^;]*sticker/);
    });

    /** Mutant: a refused edit is dropped with a note, as a reference layer is, and the user's note silently misses the revision. */
    it('refuses the compile, never drops the edit, when the edit or its words are wrong', () => {
        expect(refused({ line_edits: [{ quote: 'yorumlara PRICE yazın', template: { kind: 'tag', data: { text: 'Price' } } }] })).toEqual(['line_edits.0.quote']);
        expect(refused({ line_edits: [{ quote: 'yorumlara FİYAT yazın', template: { kind: 'tag', data: {} } }] })).toEqual(['line_edits.0.template.data.text']);
        // The run checks a click's words against the script; the template alone cannot.
        const list = NOTES.line_edits[2]!;
        const lost = { ...list, template: { ...list.template, data: { ...list.template.data, clicks: [{ item: 0, quote: 'nowhere in the script' }] } } };
        expect(refused({ line_edits: [lost] })).toEqual(['line_edits.0']);
        expect(refused({ assets: [{ asset_id: METER, media_type: 'image', anchor: 'not these words' }] })).toEqual(['assets.0.anchor']);
    });
});

describe('the first revision does not copy reference graphics that do not fit our video (#1172 C3)', () => {
    /** Mutant: copy the circles around the reference's stabilizers as scenes, and the quote charges for drawings of things our shot lacks. */
    it('draws no mark around an object none of our shots or assets shows, names it, and prices only the drawn scene', () => {
        const document = compile(), native = input(document);
        expect((native.scenes ?? []).map(item => item.id)).toEqual(['ref-3-scene']);
        expect((native.scenes ?? []).length * SCENE_CREDITS).toBe(25);
        // Two such marks on the beat are said once (#1198).
        expect(warnings(document).filter(line => line.includes('marking'))).toEqual(['Reference beat 1 (hook): highlight marking the ' +
            'stabilizer in the reference\'s shot is not reproduced; instead: not drawn: none of your shots or assets shows it.']);
        expect(document.brief.reference_profile!.beats[0]!.graphics.map(graphic => graphic.kind)).toEqual(['title_card', 'unmapped', 'unmapped']);
    });

    it('draws the mark when an asset of ours shows the object', () => {
        const facts = new Map([[PRODUCT, { name: 'Two stabilizers on the line', role: 'prop' }]]);
        expect((input(compile({}, facts)).scenes ?? []).map(item => item.id)).toEqual(['ref-1-scene', 'ref-3-scene']);
    });

    /** Mutant: copy the reference's like and follow sticker onto a call that asks for a comment word. */
    it('turns the reference\'s like and follow sticker into a tag with our comment word', () => {
        const document = compile(), native = input(document);
        expect(native.templates!.find(item => item.id === 'ref-7-tag')).toMatchObject({ kind: 'tag', anchor: { quote: 'yorumlara FİYAT yazın' }, cover_words: 3,
            data: { text: 'Yorumlara FİYAT yazın' } });
        expect((native.scenes ?? []).map(item => item.id)).not.toContain('ref-7-scene');
        expect(warnings(document)).toContain('Reference beat 7 (cta): sticker asking for the reference\'s own likes or follows is not reproduced; ' +
            'instead: a tag with your comment word FİYAT.');
    });
});

describe('an asset goes on the line it shows (#1170 C1)', () => {
    /** Mutant: the pinned asset loses to the order, and the first image takes the first picture place. */
    it('puts a pinned asset on its words in the reference\'s picture place, ahead of the order, and names the one left to the order', () => {
        const document = compile({ assets: [{ asset_id: PRODUCT, media_type: 'image' }, { asset_id: METER, media_type: 'image', anchor: 'Voltaj düşse de' }] });
        const native = input(document);
        expect(native.overlays!.map(item => [item.asset_id, item.anchor.quote, item.cover_words])).toEqual([[METER, 'Voltaj düşse de', 3]]);
        expect(native.inserts!.map(item => item.asset_id)).toEqual([PRODUCT]);
        expect(warnings(document).filter(line => line.includes('order in assets'))).toEqual([`Reference beat 4 (demo): a line for your assets ${PRODUCT} is not ` +
            'reproduced; instead: placed in their order in assets, as no line names them: pass each one\'s anchor with the words it shows.']);
    });

    /** Mutant: hold a named asset back only from the beats before its line, and the logo place on beat 6, compiled before beat 4 the presenter leaves
     *  with nothing on it, takes the picture whose name says beat 4's words. */
    it('keeps a named asset for the line it names when the presenter leaves that line, ahead of a later logo place', () => {
        const document = compile({ assets: [{ asset_id: METER, media_type: 'image' }] }, new Map([[METER, { name: 'televizyona kombiye', role: 'prop' }]]));
        const native = input(document), said = warnings(document);
        expect(native.inserts!.map(item => [item.asset_id, startOf(item.anchor.quote)])).toEqual([[METER, startOf('televizyona ayrı regülatör almayın')]]);
        expect(native.overlays).toBeUndefined();
        expect(said).toContain(`Reference beat 4 (demo): an anchor for your image ${METER} ("televizyona kombiye") is not reproduced; instead: shown on ` +
            '"televizyona ayrı regülatör almayın", the line its name matches; pass its anchor to place it elsewhere.');
        expect(said).toContain('Reference beat 6 (proof): logo_card (the images left are named for other lines) is not reproduced; instead: a text card with its words.');
        expect(said.filter(line => line.includes('order in assets') || line.includes('presenter leaving'))).toEqual([]);
    });

    /** Mutant: a pin on the named line still holds the named asset back, and the logo place goes without a picture. */
    it('gives a named asset to another place when a pin fills its line, and says its line did not show it', () => {
        const document = compile({ assets: [{ asset_id: PRODUCT, media_type: 'image', anchor: 'televizyona ayrı regülatör almayın' },
            { asset_id: METER, media_type: 'image' }] }, new Map([[METER, { name: 'televizyona kombiye', role: 'prop' }]]));
        const native = input(document);
        expect(native.inserts!.map(item => item.asset_id)).toEqual([PRODUCT]);
        expect(native.overlays!.map(item => item.asset_id)).toEqual([METER]);
        expect(warnings(document).filter(line => line.includes('order in assets'))).toEqual([`Reference beat 6 (proof): a line for your assets ${METER} is not ` +
            'reproduced; instead: placed in their order in assets, as the line each one\'s name matches did not show it: pass each one\'s anchor with the words it shows.']);
    });

    /** Mutant: with every insert pinned, the presenter-appearance limit drops a pinned picture, or finds nothing to drop and throws. */
    it('refuses at the pin when pictures on lines alone leave no presenter appearance', () => {
        const script = 'Bu regülatör bütün evi korur ve her cihazı güvende tutar her gün.';
        const result = compileReferenceRemake({ ...CASE.request, script, assets: [{ asset_id: PRODUCT, media_type: 'image', anchor: script.replace('.', '') }] },
            CASE.capabilities);
        expect(result.kind === 'invalid' && result.issues.map(issue => [issue.path, issue.message])).toEqual([['assets.0.anchor',
            'the pictures on lines leave 0 presenter appearances; a run renders 1 to 16']]);
    });

    /** #1192: sixteen appearances a run, so five pinned pictures and the reference's own insert all fit, and none is dropped. */
    it('keeps every pinned picture and the reference\'s insert while the presenter appears at most sixteen times', () => {
        const words = ['lazım', 'kombiye', 'sayacın', 'Hangi', 'fiyatını'];
        const pinned = words.map((anchor, at) => ({ asset_id: `ast_${String(at + 1).repeat(32)}`, media_type: 'image', anchor }));
        // The logo place takes the meter photo by order; the product photo fills beat 4, which the reference presenter leaves.
        const document = compile({ assets: [...pinned, { asset_id: METER, media_type: 'image' }, { asset_id: PRODUCT, media_type: 'image' }] });
        const native = input(document);
        expect(native.overlays!.map(item => item.asset_id)).toEqual([METER]);
        expect(native.inserts!.map(item => item.asset_id)).toEqual(expect.arrayContaining([...pinned.map(pin => pin.asset_id), PRODUCT]));
        expect(native.inserts).toHaveLength(pinned.length + 1);
        expect(warnings(document).some(line => line.includes('actor appearances'))).toBe(false);
    });

    // The Tallyfold remake of #1170: six picture places, five named screens.
    const TALLY = 'So you just wrapped a job, and the client says: great, send the invoice whenever you are ready. Then forty minutes vanish into a ' +
        'spreadsheet. Here is what I do now. I type the client name in Tallyfold. It pulls my hours from the calendar and my rate from the last job. ' +
        'I tap send, and it is out in under a minute. When they pay, it ticks itself off. Your next invoice is free on Tallyfold.';
    const screens = ['Tallyfold desk-spreadsheet', 'Tallyfold invoice-draft v2', 'Tallyfold timesheet', 'Tallyfold invoice-draft', 'Tallyfold paid']
        .map((name, at) => ({ name, asset_id: `ast_${String(at + 1).repeat(32)}` }));
    const tallyfold = (facts?: ReferenceAssetFacts, assets = screens) => {
        const base = CASE.request.reference_profile.beats[4], length: number = CASE.request.reference_profile.source.duration_s;
        const cuts = [0, 0.18, 0.26, 0.42, 0.56, 0.78, 0.97, 1], roles = ['hook', 'demo', 'demo', 'demo', 'demo', 'solution', 'cta'];
        const profile = { ...CASE.request.reference_profile, beats: roles.map((role, at) => ({ ...base, role, start_frac: cuts[at], end_frac: cuts[at + 1],
            start_s: cuts[at]! * length, end_s: cuts[at + 1]! * length, gestures: [],
            graphics: at < 6 ? [{ kind: 'overlay_media', source_kind: 'product_ui', position: 'top', state_changes: [], label_hint: '' }] : [] })) };
        const result = compileReferenceRemake({ ...CASE.request, script: TALLY, voice: 'sarah', reference_profile: profile,
            assets: assets.map(({ asset_id }) => ({ asset_id, media_type: 'image' })) }, CASE.capabilities, undefined, undefined, facts);
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        const native = input(result.document);
        const placed = [...native.overlays ?? [], ...native.layout_windows ?? [], ...native.inserts ?? []];
        const sentence = (asset: number) => {
            const item = placed.find(entry => entry.asset_id === assets[asset]!.asset_id);
            const at = item && startOf(item.anchor.quote, TALLY);
            return at === undefined ? undefined : TALLY.split(/(?<=\.) /).find(line => {
                const from = startOf(line, TALLY);
                return at >= from && at < from + lexicalTokens(line).length;
            });
        };
        return { sentence, warnings: warnings(result.document) };
    };

    /** Mutant: drop the name match, and "paid" lands on a line before the payment while the spreadsheet misses the pain line. */
    it('maps "paid" to the pay line and the spreadsheet to the pain line by their names, and names each such place', () => {
        const facts = new Map(screens.map(({ asset_id, name }) => [asset_id, { name, role: 'prop' }]));
        const { sentence, warnings: said } = tallyfold(facts);
        expect([sentence(4), sentence(0)]).toEqual(['When they pay, it ticks itself off.', 'Then forty minutes vanish into a spreadsheet.']);
        expect(said).toContain(`Reference beat 6 (solution): an anchor for your image ${screens[4]!.asset_id} ("Tallyfold paid") is not reproduced; ` +
            'instead: shown on "When they pay, it", the line its name matches; pass its anchor to place it elsewhere.');
        // Without names the same request goes by order, and says so.
        const unnamed = tallyfold();
        expect(unnamed.sentence(4)).not.toBe('When they pay, it ticks itself off.');
        expect(unnamed.warnings.some(line => line.includes('placed in their order in assets'))).toBe(true);
    });

    /** Mutant: drop the role tie-break, and the first of two equally named pictures, a person, takes the line that shows the product. */
    it('gives a line two names match equally to the product picture on a beat that shows the product', () => {
        // A third name keeps "spreadsheet" from being a word every name holds, as a brand is.
        const pair = [{ name: 'Spreadsheet chaos', asset_id: `ast_${'7'.repeat(32)}`, role: 'character' },
            { name: 'Spreadsheet export', asset_id: `ast_${'8'.repeat(32)}`, role: 'prop' }, { name: 'Calendar', asset_id: `ast_${'9'.repeat(32)}`, role: 'prop' }];
        const { sentence } = tallyfold(new Map(pair.map(({ asset_id, name, role }) => [asset_id, { name, role }])), pair);
        expect([sentence(1), sentence(0)]).toEqual(['Then forty minutes vanish into a spreadsheet.', 'Here is what I do now.']);
    });
});

describe('a saved document takes an empty list of layers as none (#1172 C4)', () => {
    it('saves scenes: [] and overlays: [] without the keys, while the run still refuses an empty list', () => {
        const document = compile(NOTES), native = input(document);
        const saved = saveWorkflowPlan.safeParse({ base_version: 1, document: { ...document, brief: { ...document.brief,
            native: { skill: 'make_ugc', input: { ...native, scenes: [], overlays: [] } } } } });
        expect(saved.success).toBe(true);
        expect(JSON.parse(JSON.stringify(saved.data!.document.brief.native!.input))).not.toHaveProperty('scenes');
        expect(JSON.parse(JSON.stringify(saved.data!.document.brief.native!.input))).not.toHaveProperty('overlays');
        expect(makeUgcInput.safeParse({ ...native, scenes: [] }).success).toBe(false);
        // An empty list is no licence for a broken item.
        expect(saveWorkflowPlan.safeParse({ base_version: 1, document: { ...document, brief: { ...document.brief,
            native: { skill: 'make_ugc', input: { ...native, scenes: [{ id: 'x' }] } } } } }).success).toBe(false);
    });
});

describe('a clip shorter than the words it covers (#1198)', () => {
    /** Hvmlab v2: three 5 s clips each covered 11 words and the quote said their last frame would hold. Mutants: keep the line's words, cut */
    /** them without saying so, or cut a clip whose length is not known, and the run freezes, the plan hides it, or guesses. */
    it('covers only the words the clip outlasts at the slowest pace, says so, and leaves the quote nothing to warn of', () => {
        const CLIP = `ast_${'c'.repeat(32)}`, line = 'Voltaj düşse de yükselse de bütün ev iki yüz yirmi voltta kalıyor';
        const clipOf = (document: WorkflowPlanDocument) => input(document).inserts!.find(item => item.asset_id === CLIP)!;
        const asked = { assets: [{ asset_id: CLIP, media_type: 'video', anchor: line }] };
        const fitted = compile(asked, new Map([[CLIP, { name: 'clip', seconds: 3 }]])), clip = clipOf(fitted);
        expect([clip.anchor.quote, clip.cover_words]).toEqual(['Voltaj düşse de yükselse de bütün', 6]);
        expect(fitted.brief.added).toContainEqual(`the clip on "${line}" covers its first 6 words, as long as it runs, so it never freezes; the presenter says the rest`);
        const pinned = (item: Item) => [{ insert_id: item.id, asset_id: CLIP, key: 'k', sha256: 'a'.repeat(64), bytes: 1, kind: 'video' as const,
            media_type: 'video/mp4' as const, width: 1080, height: 1920, duration_frames: 75, fps: 25 }];
        expect(videoHoldWarnings(input(fitted) as never, pinned(clip))).toEqual([]);
        const unknown = compile(asked), whole = clipOf(unknown);
        expect(whole.cover_words).toBe(12);
        expect(videoHoldWarnings(input(unknown) as never, pinned(whole))).toHaveLength(1);
    });
});
