import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeUgcInput, MAX_INSERTS } from '../skills.js';
import { MAX_TEMPLATES, templateFaceWarnings } from '../templates/index.js';
import { MAX_FRAMING } from '../ugc-framing.js';
import { compileReferenceRemake, workflowPlanDocument, type CapabilityProfile } from './index.js';
import { coverWordOf, planSemanticInserts } from '../semantic-inserts.js';
import { proportionalSpans, referenceScriptWords } from './reference-remake.js';
import { PICTURE_ZOOM, planMotion, type MotionInput, type MotionLayer } from './remake-motion.js';

// #1051 S1: the reference's camera, transitions, flashes and edit sounds go to the layer that owns each beat; still pictures zoom unless asked not to.

type Beat = MotionInput['beats'][number];
const beat = (start_s: number, extra: Partial<Beat> = {}): Beat => ({ camera: 'static', transition_in: 'cut', sounds: [], presenter_behaviour: 'speaking', start_s, ...extra });
const anchor = (quote: string) => ({ quote });
const insert = (at: number, media_type = 'image'): MotionLayer => ({ field: 'inserts', beat: at, kind: 'insert_media', item: { id: `ref-${at + 1}-insert-media`, media_type } });
const card = (at: number): MotionLayer => ({ field: 'templates', beat: at, kind: 'title_card', item: { id: `ref-${at + 1}-title-card`, placement: 'full' } });
const plan = (beats: Beat[], layers: MotionLayer[], extra: Partial<MotionInput> = {}) => {
    const filled = new Set(layers.map(layer => layer.beat));
    return planMotion({ beats, flashes: [], worded: beats.map(() => true), layers, longForm: true, addMoves: true,
        onScreen: beats.flatMap((_, at) => filled.has(at) ? [] : [{ beat: at, anchor: anchor(`word ${at}`), cover_words: 3 }]), ...extra });
};
const set = (result: ReturnType<typeof planMotion>, layer: number) => result.patches.find(patch => patch.layer === layer)?.set;
const notes = (result: ReturnType<typeof planMotion>) => result.notes.map(entry => `${entry.what} → ${entry.substitute}`);

describe('camera by the beat\'s owner (#1051 S1)', () => {
    /** Mutants: route punch_in only to framing, or swap the zoom directions, and a picture beat's camera is a static frame again. */
    it('moves the picture on a picture beat, and frames the presenter on a presenter beat', () => {
        const result = plan([beat(0, { camera: 'punch_in' }), beat(3, { camera: 'punch_in' }), beat(6, { camera: 'zoom_out' }), beat(9)],
            [insert(1), insert(2)], { addMoves: false });
        expect(set(result, 0)).toEqual({ image_motion: { direction: 'in', amount: PICTURE_ZOOM } });
        expect(set(result, 1)).toEqual({ image_motion: { direction: 'out', amount: PICTURE_ZOOM } });
        expect(result.framing.map(layer => [layer.beat, (layer.item as { size: string }).size])).toEqual([[0, 'close'], [3, 'medium']]);
        expect(result.notes).toEqual([]);
    });
    /** Mutant: count a video insert as a picture, and the run is asked for image_motion on a clip and refuses it. */
    it('names a move it cannot draw: on a clip, or a camera with no named move', () => {
        const result = plan([beat(0, { camera: 'punch_in' }), beat(3, { camera: 'other' }), beat(6, { camera: 'other' })], [insert(0, 'video'), insert(1), insert(2, 'video')]);
        expect(set(result, 0)).toBeUndefined();
        expect(notes(result)).toEqual(['punch_in camera on beats 1 → a static frame', 'other camera on beats 2 → a slow zoom on the picture',
            'other camera on beats 3 → a static frame']);
    });
});

describe('transitions and flashes (#1051 S1)', () => {
    /** Mutants: keep the white flash on a picture, or drop the template route, and a light picture flashes white or a card cuts. */
    it('gives a beat\'s transition to the full frame that starts it, a flash as a light leak on a picture', () => {
        const result = plan([beat(0), beat(3, { transition_in: 'wipe' }), beat(6, { transition_in: 'flash' }), beat(9, { transition_in: 'zoom' }),
            beat(12, { transition_in: 'flash' })], [insert(1), insert(2), card(3), card(4)], { addMoves: false });
        expect([0, 1, 2, 3].map(layer => set(result, layer)?.transition)).toEqual(['wipe', 'light_leak', 'zoom', 'flash']);
        expect(result.notes).toEqual([]);
    });
    /** Codex r2. Mutant: map any entry of either table to another look, and a beat's transition turns into a different one with no note. */
    it.each([['inserts', 'wipe', 'wipe'], ['inserts', 'zoom', 'zoom'], ['inserts', 'flash', 'light_leak'], ['templates', 'wipe', 'wipe'],
        ['templates', 'zoom', 'zoom'], ['templates', 'flash', 'flash']] as const)('draws transition_in on %s %s as %s', (field, value, look) => {
        const result = plan([beat(0), beat(3, { transition_in: value })], [field === 'inserts' ? insert(1) : card(1)], { addMoves: false });
        expect(result.patches).toEqual([{ layer: 0, set: { transition: look }, added: [] }]);
        expect(result.notes).toEqual([]);
    });
    /** Mutant: drop the hand-back, and a wipe into the presenter after a picture is a cut; mark it reference, and the added entry vanishes. */
    it('hands a wipe into a presenter beat to the picture before it, and lists the picture\'s entry as added', () => {
        const result = plan([beat(0), beat(3), beat(6, { transition_in: 'wipe' })], [insert(1)], { addMoves: false });
        expect(result.patches).toEqual([{ layer: 0, set: { transition: 'wipe' }, added: [{ beat_index: 1, what: 'beat 2: the picture also comes in with the wipe it leaves on',
            key: 'transition' }] }]);
        expect(notes(plan([beat(0), beat(3, { transition_in: 'wipe' })], []))).toEqual(['wipe transitions into beats 2 → cuts']);
    });
    /** Mutants: widen or narrow the snap, or forget the framing flash, and a flash lands on the wrong beat or nowhere. */
    it('puts a flash on the cut it sits by, inside a picture on its cuts, and names one it cannot draw', () => {
        const beats = [beat(0), beat(3), beat(6), beat(9, { presenter_behaviour: 'absent' })];
        const result = plan(beats, [insert(1)], { flashes: [2.8, 4.5, 5.8, 8.75] });
        expect(result.framing.map(layer => [layer.beat, (layer.item as { transition?: string }).transition])).toEqual([[2, 'flash'], [3, undefined]]);
        expect(set(result, 0)?.transition).toBe('light_leak');
        expect(notes(result)).toEqual(['the flashes inside the shots on beats 2 → a light leak on each picture\'s cuts', 'the flashes on beats 4 → cuts']);
        const edge = plan(beats, [insert(1)], { flashes: [2.75] });
        expect(edge.notes).toEqual([]);
        expect(notes(plan(beats, [insert(1)], { flashes: [2.65] }))).toEqual(['the flashes on beats 1 → cuts']);
        // Codex r3. Mutant: snap only to the next beat's start, and a flash just after a cut is lost to a note.
        const after = plan([beat(0), beat(3), beat(6)], [], { flashes: [3.2] });
        expect(after.framing.map(layer => [layer.beat, (layer.item as { transition?: string }).transition])).toEqual([[1, 'flash'], [2, undefined]]);
        expect(after.notes).toEqual([]);
        expect(set(plan([beat(0), beat(3)], [insert(1)], { flashes: [3.2] }), 0)?.transition).toBe('light_leak');
        expect(plan([beat(0), beat(3)], [insert(1)], { flashes: [3.2] }).notes).toEqual([]);
    });
    it('keeps the reference\'s own transition where a flash meets it, and says so', () => {
        const result = plan([beat(0), beat(3, { transition_in: 'wipe' })], [insert(1)], { flashes: [4] });
        expect(set(result, 0)?.transition).toBe('wipe');
        expect(notes(result)).toEqual(['the flash on beat 2 → the wipe the reference uses there']);
    });
    /** Codex r1. Mutant: give a card's flash another look, and a flash on a full-frame template turns into a wipe with no note. */
    it('puts a flash on a full-frame card\'s cut as the card\'s white flash, and one inside it on its cuts with a note', () => {
        const edge = plan([beat(0), beat(3)], [card(1)], { flashes: [2.8] });
        expect(set(edge, 0)).toEqual({ transition: 'flash' });
        expect(edge.notes).toEqual([]);
        const inside = plan([beat(0), beat(3)], [card(1)], { flashes: [4.5] });
        expect(set(inside, 0)).toEqual({ transition: 'flash' });
        expect(notes(inside)).toEqual(['the flashes inside the cards on beats 2 → a flash on each card\'s cuts']);
    });
});

describe('a picture that cuts inside its beat (#1085)', () => {
    const shot = (at: number, asset: string, from_s?: number): MotionLayer => ({ field: 'inserts', beat: at, kind: 'insert_media',
        item: { id: `ref-${at + 1}-insert-media${from_s === undefined ? '' : '-2'}`, media_type: 'image', asset_id: asset }, ...(from_s === undefined ? {} : { from_s }) });
    /** Mutants: match the flash to the beat's first shot, or widen or narrow the match, and the light leak lands on the wrong cut or a note. */
    it('puts a flash on the cut it sits by inside the beat, and keeps one by no cut on the shot\'s cuts', () => {
        const beats = [beat(0), beat(3, { presenter_behaviour: 'absent' })];
        const result = plan(beats, [shot(1, 'a'), shot(1, 'a', 4.6)], { flashes: [4.3], addMoves: false });
        expect([set(result, 0)?.transition, set(result, 1)?.transition, result.notes]).toEqual([undefined, 'light_leak', []]);
        const away = plan(beats, [shot(1, 'a'), shot(1, 'a', 4.6)], { flashes: [4.25], addMoves: false });
        expect([set(away, 0)?.transition, set(away, 1)?.transition]).toEqual(['light_leak', undefined]);
        expect(notes(away)).toEqual(['the flashes inside the shots on beats 2 → a light leak on each picture\'s cuts']);
        // Codex r3. Mutant: match only flashes before the cut, and one 0.5 s after it lands there too.
        const later = plan(beats, [shot(1, 'a'), shot(1, 'a', 4.6)], { flashes: [5.1], addMoves: false });
        expect([set(later, 0)?.transition, set(later, 1)?.transition, notes(later)]).toEqual(['light_leak', undefined,
            ['the flashes inside the shots on beats 2 → a light leak on each picture\'s cuts']]);
        expect(set(plan(beats, [shot(1, 'a'), shot(1, 'a', 4.6)], { flashes: [4.85], addMoves: false }), 1)?.transition).toBe('light_leak');
    });
    /** Mutants: alternate the zoom on the same picture, or leave it still with add_moves false, and the cut shows the same frame on both sides. */
    it('restarts the zoom before a cut to the same picture, or comes in from closer, and moves a new picture only as its own', () => {
        const zoom = (result: ReturnType<typeof planMotion>, layer: number) => set(result, layer)?.image_motion?.direction;
        const beats = [beat(0), beat(3, { presenter_behaviour: 'absent', camera: 'punch_in' }), beat(6, { presenter_behaviour: 'absent' })];
        const same = plan(beats, [shot(1, 'a'), shot(1, 'a', 4.5), shot(2, 'b'), shot(2, 'b', 7.5)]);
        expect([0, 1, 2, 3].map(layer => zoom(same, layer))).toEqual(['in', 'in', 'out', 'out']);
        expect(same.patches.flatMap(patch => patch.added.map(entry => entry.what))).toEqual(['beat 3: the picture zooms out slowly, unless its shape scrolls or pans it']);
        const still = plan(beats, [shot(1, 'a'), shot(1, 'a', 4.5), shot(2, 'b'), shot(2, 'b', 7.5), shot(2, 'c', 8)], { addMoves: false });
        expect([0, 1, 2, 3, 4].map(layer => zoom(still, layer))).toEqual(['in', 'in', undefined, 'out', undefined]);
    });
    /** Mutant: hand a wipe back to the beat's first shot, and the picture leaves to the presenter with a cut. */
    it('hands a wipe into the presenter to the beat\'s last shot', () => {
        const result = plan([beat(0), beat(3), beat(6, { transition_in: 'wipe' })], [shot(1, 'a'), shot(1, 'a', 4.5)], { addMoves: false });
        expect([set(result, 0)?.transition, set(result, 1)?.transition]).toEqual([undefined, 'wipe']);
    });
});

describe('still pictures and edit sounds (#1051 S1)', () => {
    /** Mutants: zoom one way, restart the turn at a reference zoom, or zoom with addMoves off, and the pictures repeat a move or move unasked. */
    it('zooms every still picture in and out by turns from the reference\'s own zoom, and lists each as added', () => {
        const beats = [beat(0), beat(3, { camera: 'punch_in' }), beat(6), beat(9), beat(12)];
        const result = plan(beats, [insert(1), insert(2), insert(3, 'video'), insert(4)]);
        expect(result.patches.map(patch => [patch.layer, patch.set.image_motion?.direction])).toEqual([[0, 'in'], [1, 'out'], [3, 'in']]);
        expect(result.patches.flatMap(patch => patch.added.map(entry => entry.what))).toEqual(['beat 3: the picture zooms out slowly, unless its shape scrolls or pans it',
            'beat 5: the picture zooms in slowly, unless its shape scrolls or pans it']);
        expect(plan(beats, [insert(1), insert(2), insert(3, 'video'), insert(4)], { addMoves: false }).patches.map(patch => patch.layer)).toEqual([0]);
    });
    it('names the beats the reference sounds with a whoosh or a click', () => {
        const result = plan([beat(0, { sounds: [{ kind: 'music', at_frac: 0 }] }), beat(3, { sounds: [{ kind: 'whoosh', at_frac: 0 }] }), beat(6, { sounds: [{ kind: 'click', at_frac: 0.5 }] })], []);
        expect(result.sounded).toEqual([1, 2]);
    });
});

/** A reel shaped like DfFtkhuiPAd (#1051 S0), words left out: presenter, two picture beats with a punch and an unnamed move, a card, a CTA. */
const PROFILE = JSON.parse(readFileSync(new URL('../fixtures/reference-profile-reel.json', import.meta.url), 'utf8'));
const SCRIPT = 'I kept remaking the same kind of product video for every client. Building each one by hand meant hours in the editor. ' +
    'Then I tried a new tool. You hand your agent a reel that works and a short script. It breaks the reel down into beats and timing. ' +
    'I still choose the presenter and the voice. Ask for a video like this one and try it free today.';
const SHAPE: [string, number, string, string, string, string[], string | undefined][] = [
    ['hook', 4, 'speaking', 'static', 'none', ['music'], undefined], ['problem', 4.5, 'speaking', 'static', 'cut', ['click'], undefined],
    ['solution', 3, 'speaking', 'static', 'cut', ['whoosh'], undefined], ['demo', 5.2, 'absent', 'punch_in', 'cut', ['click', 'whoosh'], 'insert_media'],
    ['demo', 7, 'absent', 'other', 'cut', ['whoosh'], 'insert_media'], ['proof', 3.3, 'absent', 'static', 'cut', [], 'title_card'],
    ['cta', 4.2, 'speaking', 'static', 'cut', ['whoosh'], undefined]];
function reel(change: (profile: typeof PROFILE) => void = () => undefined) {
    const profile = structuredClone(PROFILE), total = SHAPE.reduce((sum, entry) => sum + entry[1], 0);
    let at = 0;
    profile.beats = SHAPE.map(([role, length, presenter, camera, transition, sounds, graphic]) => {
        const start = at;
        at += length;
        return { ...PROFILE.beats[0], role, start_s: start, end_s: at, start_frac: start / total, end_frac: at / total, presenter_behaviour: presenter, camera,
            transition_in: transition, sounds: sounds.map(kind => ({ kind, at_frac: 0 })),
            graphics: graphic ? [{ kind: graphic, source_kind: graphic, position: graphic === 'title_card' ? 'center' : 'full_screen', state_changes: [], label_hint: '' }] : [] };
    });
    profile.source = { ...profile.source, duration_s: total };
    profile.captions.present = false;
    profile.unmapped = [];
    profile.staging = { version: 'reference-staging-v1', analysis_width: 360, elements: [], freezes: [],
        anchors: [14.75, 18, 26.93].map((t_s, index) => ({ id: `flash#${index + 1}`, t_s })) };
    change(profile);
    return profile;
}
const capabilities = (dispositions: Record<string, string> = {}): CapabilityProfile => ({ v: 1, content_digest: 'c'.repeat(64), executors: [{ skill: 'make_ugc',
    configured: true, qualified: true, enabled: true, profiles: ['ugc-native-v1'], features: ['exact_script', 'actor', 'voice', 'long_form'],
    formats: [{ aspect_ratio: '9:16', resolution: '1080p' }], field_dispositions: { templates: 'implemented', ...dispositions } as never }] });
const pictures = ['1', '2'].map(digit => ({ asset_id: `ast_${digit.repeat(32)}`, media_type: 'image' }));
function remake(extra: Record<string, unknown> = {}, profile = reel(), dispositions: Record<string, string> = {}) {
    const result = compileReferenceRemake({ reference_profile: profile, script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah', assets: pictures, ...extra },
        capabilities(dispositions));
    if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
    const input = result.document.brief.native!.input as Record<string, unknown> & { inserts?: { transition?: string; image_motion?: unknown }[];
        framing?: { id: string; size: string; transition: string }[] };
    return { document: result.document, input, notes: result.document.brief.reference_profile!.unmapped.map(entry => `${entry.beat_index}: ${entry.what} → ${entry.suggested_substitute}`),
        added: result.document.brief.added };
}

/** What the director adds on this reel (#1051 S5): a cut in close on the problem, a flash on the card. */
const DIRECTED = ['beat 2: a new part (problem after hook), so the presenter cuts in close', 'beat 6: a new part (proof after demo), so the card comes in with a flash'];
/** Once the flash inside beat 4 lands on its own cut (#1085), the cut into beat 4 is plain and the director spends its light leak a beat earlier. */
const DIRECTED_LEAK = 'beat 3: a new part (solution after problem), so a light leak plays on the cut';

describe('the compiled remake of a DfFtkhuiPAd-shaped reel (#1051 S1)', () => {
    /** Mutants: skip the routing call, sound the cuts unasked, or keep the old camera note, and the plan draws a static video or sounds cuts no one asked for. */
    it('routes the punch and the flashes, names the sounds, zooms the other picture, and lists what it adds', () => {
        const { document, input, notes, added } = remake();
        expect(workflowPlanDocument.safeParse(document).success).toBe(true);
        expect(makeUgcInput.safeParse(input).success).toBe(true);
        // Since #1085 each picture cuts to a new crop of itself on the flash inside its beat, the light leak on that cut.
        expect(input.inserts!.map(item => [(item as { id: string }).id, item.transition, item.image_motion])).toEqual([
            ['ref-4-insert-media', undefined, { direction: 'in', amount: PICTURE_ZOOM }], ['ref-4-insert-media-2', 'light_leak', { direction: 'in', amount: PICTURE_ZOOM }],
            ['ref-5-insert-media', undefined, { direction: 'out', amount: PICTURE_ZOOM }], ['ref-5-insert-media-2', 'light_leak', { direction: 'out', amount: PICTURE_ZOOM }]]);
        expect(input.framing!.map(item => [item.id, item.size, item.transition])).toEqual([['ref-7-framing', 'close', 'flash'], ['ref-2-transition', 'close', 'cut'],
            ['ref-3-transition', 'medium', 'flash']]);
        expect(input.edit_sounds).toBeUndefined();
        expect(notes.filter(entry => /camera|transitions|sounds|flashes/.test(entry))).toEqual(['4: other camera on beats 5 → a slow zoom on the picture',
            '1: the whoosh and click sounds on beats 2, 3, 4, 5, 7 → none unless you ask: compile again with edit_sounds: true for a sound on every cut']);
        expect(added).toEqual([DIRECTED[0], DIRECTED_LEAK, 'beat 5: the picture zooms out slowly, unless its shape scrolls or pans it', DIRECTED[1]]);
    });
    /** Mutants (#1076): ignore the client's edit_sounds, or sound a plan with no cut, and the run plays nothing it was asked for or is refused. */
    it('sounds every cut when the client asks, and says so', () => {
        const { input, notes, added } = remake({ edit_sounds: true });
        expect(input.edit_sounds).toBe(true);
        expect(notes.filter(entry => /sounds/.test(entry))).toEqual([]);
        expect(added?.at(-1)).toBe('a sound on every cut, as you asked; the reference has a whoosh or a click on beats 2, 3, 4, 5, 7');
        expect(remake({ edit_sounds: false }).input.edit_sounds).toBeUndefined();
        // Codex r1: a reference without a whoosh or a click still gets the sounds the client asks for on the plan's cuts.
        const quiet = remake({ edit_sounds: true }, reel(value => { for (const beat of value.beats) beat.sounds = []; }));
        expect([quiet.input.edit_sounds, quiet.added?.at(-1)]).toEqual([true, 'a sound on every cut, as you asked']);
        // Codex r2: a layout window's cut, or a framing cut alone, is a cut to sound too; the presenter stays, or #1060 fills the frame there.
        const still = (split: boolean) => remake({ edit_sounds: true, add_moves: false }, reel(value => {
            for (const beat of value.beats) {
                beat.camera = 'static'; beat.transition_in = 'cut'; beat.presenter_behaviour = 'speaking';
                for (const graphic of beat.graphics) {
                    if (split && graphic.kind === 'insert_media') Object.assign(graphic, { kind: 'layout_split', source_kind: 'layout_split', position: 'bottom' });
                }
            }
            value.staging!.anchors = [];
        }));
        const framed = remake({ edit_sounds: true }, reel(value => { for (const beat of value.beats) { beat.graphics = []; beat.presenter_behaviour = 'speaking'; } }));
        expect([still(false), still(true), framed].map(({ input }) => [input.edit_sounds, 'inserts' in input, 'layout_windows' in input, (input.framing ?? [])
            .some(item => item.id !== 'ref-long-form')])).toEqual([[true, true, false, false], [true, false, true, false], [true, false, false, true]]);
        const plain = reel(value => { for (const beat of value.beats) { beat.graphics = []; beat.camera = 'static'; beat.sounds = []; beat.presenter_behaviour = 'speaking'; }
            value.staging!.anchors = []; });
        const bare = remake({ edit_sounds: true, add_moves: false }, plain);
        expect(bare.input.edit_sounds).toBeUndefined();
        expect(bare.notes).toContain('0: edit_sounds, a sound on every cut → none: the plan has no insert, window or framing cut to sound them on');
    });
    /** Mutant: apply the zoom turn with add_moves off, and the plan moves a picture the reference holds still. */
    it('draws the reference\'s moves alone with add_moves false', () => {
        const { input, notes, added } = remake({ add_moves: false });
        // A cut inside a beat to the same picture is the reference's own: it restarts the zoom before it, or comes in from closer (#1085).
        expect(input.inserts!.map(item => item.image_motion)).toEqual([{ direction: 'in', amount: PICTURE_ZOOM }, { direction: 'in', amount: PICTURE_ZOOM }, undefined,
            { direction: 'out', amount: PICTURE_ZOOM }]);
        expect(notes).toContain('4: other camera on beats 5 → a static frame');
        expect(added).toBeUndefined();
    });
    /** #1085 Codex r1. Mutant: place the cut by the beat's seconds, and a reference that speaks most words early cuts our picture too soon. */
    it('places a cut inside a beat by the reference\'s spoken words before it, not its seconds', () => {
        // Beat 4 runs 11.5–16.7 s; ten of its twelve words come before the flash at 14.75 s, so the cut sits at 9.5/12 of the words, not 3.25/5.2.
        const spoken = reel(value => { value.transcript = [...Array.from({ length: 10 }, (_, at) => 11.6 + at * 0.09), 15, 15.5].map(start_s => ({ text: 'word', start_s, end_s: start_s + 0.08 })); });
        const { input } = remake({}, spoken);
        const span = proportionalSpans({ profile: spoken, words: referenceScriptWords(SCRIPT) })[3]!, length = span.end - span.start;
        const inserts = input.inserts as unknown as { id: string; anchor: { quote: string; occurrence?: number }; cover_words: number }[];
        const cut = planSemanticInserts(SCRIPT, inserts.map(item => ({ insertId: item.id, mediaId: item.id, anchor: item.anchor, coverWords: item.cover_words })))
            .inserts.find(entry => entry.insertId === 'ref-4-insert-media-2')!.startWord;
        const [byWords, bySeconds] = [Math.round((9.5 / 12) * length), Math.round((3.25 / 5.2) * length)].map(at => span.start + at);
        expect([cut, bySeconds === cut]).toEqual([byWords, false]);
    });
    /** #1085. Mutant: take moments by a beat's edges as cuts inside it, and a flash on the picture's own cut splits it one word in or one word short. */
    it('leaves a moment by a beat\'s edge to that edge\'s cut', () => {
        // Beat 4 runs 11.5–16.7 s: these moments sit 0.2 s inside each edge.
        const edges = reel(value => { value.staging!.anchors = [{ id: 'flash#1', t_s: 11.7 }, { id: 'cut#1', t_s: 16.5 }]; });
        const { input, notes } = remake({}, edges);
        expect((input.inserts as unknown as { id: string; transition?: string }[]).map(item => [item.id, item.transition]))
            .toEqual([['ref-4-insert-media', 'light_leak'], ['ref-5-insert-media', undefined]]);
        expect(notes.filter(entry => /inside the shots?/.test(entry))).toEqual([]);
    });
    /** #1085 Codex r1. Mutant: let one more piece past the limit, and a reference with many cuts compiles to a plan the run refuses. */
    it('cuts inside its beats, every cut of a full staging record within the run\'s insert limit', () => {
        // #1192: a profile holds at most 80 staging anchors, under the 99 inserts a run shows, so every cut is kept now.
        const long = Array.from({ length: 40 }, (_, at) => `${['Every', 'Each', 'One', 'Some'][at % 4]} picture shows a new part of the story here.`).join(' ');
        const many = reel(value => {
            for (const beat of value.beats) { beat.start_s *= 3; beat.end_s *= 3; }
            value.source.duration_s *= 3;
            const inside = (from: number, to: number, count: number) => Array.from({ length: count }, (_, at) => from + 0.5 + at * ((to - from - 1) / (count - 1)));
            value.staging!.anchors = [...inside(34.5, 50.1, 40), ...inside(50.1, 71.1, 40)].map((t_s, at) => ({ id: `cut#${at + 1}`, t_s: Math.round(t_s * 1000) / 1000 }));
        });
        const { input, notes } = remake({ script: long }, many);
        expect(makeUgcInput.safeParse(input).success).toBe(true);
        expect((input.inserts as unknown[]).length).toBeGreaterThan(80);
        expect((input.inserts as unknown[]).length).toBeLessThanOrEqual(MAX_INSERTS);
        expect(notes.filter(entry => entry.includes('a run shows at most'))).toEqual([]);
    });
    it('compiles the same plan twice', () => {
        expect(JSON.stringify(remake().document)).toBe(JSON.stringify(remake().document));
    });
    /** Mutant: send edit_sounds past a deployment that does not take it, and the run ignores the sounds the plan promised (rule 3). */
    it.each(['rejected', 'warned', 'stored'])('names the sounds instead where edit sounds are %s', disposition => {
        const { input, notes, added } = remake({ edit_sounds: true }, reel(), { edit_sounds: disposition });
        expect(input.edit_sounds).toBeUndefined();
        expect(notes).toContain('1: the whoosh and click sounds on beats 2, 3, 4, 5, 7 → none: edit_sounds is not available on this server');
        expect(remake({}, reel(), { edit_sounds: disposition }).notes).toContain('1: the whoosh and click sounds on beats 2, 3, 4, 5, 7 → none');
        expect(added).toEqual([DIRECTED[0], DIRECTED_LEAK, 'beat 5: the picture zooms out slowly, unless its shape scrolls or pans it', DIRECTED[1]]);
    });
    it('takes edit sounds where the deployment implements them and the client asks', () => {
        expect(remake({ edit_sounds: true }, reel(), { edit_sounds: 'implemented' }).input.edit_sounds).toBe(true);
        expect(remake({}, reel(), { edit_sounds: 'implemented' }).input.edit_sounds).toBeUndefined();
    });
    /** Mutant: drop the layer as before, and a card the run refuses only for its wipe is lost with its words. */
    it('takes back a move the run refuses and keeps the layer', () => {
        const profile = reel(value => { value.beats[5].transition_in = 'wipe'; value.beats[5].graphics[0].position = 'full_screen'; });
        const { input, notes } = remake({}, profile);
        const cardItem = (input.templates as { id: string; transition?: string }[]).find(item => item.id === 'ref-6-title-card');
        expect(cardItem).toBeDefined();
        expect(cardItem!.transition).toBeUndefined();
        expect(notes.some(entry => entry.startsWith('5: title_card: its transition (') && entry.endsWith('→ a cut'))).toBe(true);
    });
});

/** Beats with their words: a script cut on spaces, each beat taking its count of words, quoted from its first word. */
function directed(beats: Beat[], layers: MotionLayer[], lines: string[], extra: Partial<MotionInput> = {}) {
    const tokens = lines.join(' ').split(' '), counts = lines.map(line => line.split(' ').length);
    const spans = counts.map((_, at) => ({ start: counts.slice(0, at).reduce((sum, value) => sum + value, 0), end: counts.slice(0, at + 1).reduce((sum, value) => sum + value, 0) }));
    const words = tokens.map(token => ({ token: token.replace(/[.,?]$/, ''), ...(/[.?]$/.test(token) ? { stop: 'sentence' as const } : /,$/.test(token) ? { stop: 'clause' as const } : {}),
        ...(token.endsWith('?') ? { question: true } : {}) }));
    const quote = (from: number, limit: number, end: number) => ({ anchor: anchor(tokens.slice(from, Math.min(end, from + limit)).join(' ')), start: from, end: Math.min(end, from + limit) });
    return plan(beats, layers, { script: { words, spans, word_s: 0.4, emphasis: [], quote, cards: true }, ...extra });
}
const window = (at: number): MotionLayer => ({ field: 'layout_windows', beat: at, kind: 'layout_split', item: { id: `ref-${at + 1}-layout-split`, media_type: 'image' } });
const LINES = ['This is a longer opening sentence about the product today.', 'Building each one by hand meant hours in the editor.', 'Then I tried Clipwright.',
    'I still choose the presenter and the voice.', 'It took me 30 hours every single week.'];
const ROLES = ['hook', 'problem', 'solution', 'proof', 'cta'] as const;
const roled = (extra: Partial<Beat>[] = []) => ROLES.map((role, at) => beat(at * 3, { role, ...extra[at] }));

describe('the director in the remake (#1051 S5)', () => {
    /** Mutants: drop the window enter, the card route, the stat card or the stand-in note, and a device of ours goes undrawn or unnamed. */
    it('slides a split in, marks a card, cuts a lost wipe with ours, counts a number up, and names each', () => {
        const result = directed(roled([{}, {}, { transition_in: 'wipe' }]), [window(1), card(3)], LINES);
        expect(result.patches.map(patch => [patch.layer, patch.set, patch.added.map(entry => entry.what)])).toEqual([
            [0, { enter: 'slide' }, ['beat 2: a new part (problem after hook), so the split slides in']],
            [1, { transition: 'wipe' }, ['beat 4: a new part (proof after solution), so the card comes in with a wipe']]]);
        expect(result.framed.map(entry => [entry.layers.map(layer => layer.item), entry.added.what])).toEqual([[[{ id: 'ref-3-transition',
            anchor: anchor('Then I tried Clipwright.'), cover_words: 4, size: 'medium', transition: 'flash' }],
            'beat 3: the reference\'s wipe into it, so a light leak plays on the cut']]);
        expect(result.cards).toEqual([{ beat: 4, word: 35, added: { beat_index: 4, what: 'beat 5: the number 30, so it counts up on a card below the face' } }]);
        expect(notes(result)).toEqual(['wipe transitions into beats 3 → ours instead: a light leak']);
        // A clip takes a new part's transition as a picture does, and no zoom.
        const clip = directed([beat(0, { role: 'hook' }), beat(3, { role: 'solution' })], [insert(1, 'video')], [LINES[0]!, LINES[1]!]);
        expect(clip.patches.map(patch => [patch.set, patch.added.map(entry => entry.what)])).toEqual([[{ transition: 'light_leak' },
            ['beat 2: a new part (solution after hook), so the picture comes in with a light leak']]]);
    });
    /** Mutant: run the director with add_moves off, and a plan asked for the reference's moves alone gets ours. */
    it('adds nothing with add_moves off, and nothing on a beat with a graphic over the presenter', () => {
        const off = directed(roled([{}, {}, { transition_in: 'wipe' }]), [window(1), card(3)], LINES, { addMoves: false });
        expect([off.patches, off.framed, off.cards]).toEqual([[], [], []]);
        expect(notes(off)).toEqual(['wipe transitions into beats 3 → cuts']);
        const overlay: MotionLayer = { field: 'overlays', beat: 2, kind: 'overlay_media', item: { id: 'ref-3-overlay-media', media_type: 'image' } };
        const covered = directed(roled([{}, {}, { transition_in: 'wipe' }]), [window(1), overlay, card(3)], LINES,
            { onScreen: [0, 2, 4].map(at => ({ beat: at, anchor: anchor(`word ${at}`), cover_words: 3 })) });
        expect(covered.framed).toEqual([]);
        expect(notes(covered)).toEqual(['wipe transitions into beats 3 → cuts']);
        const tag: MotionLayer = { field: 'templates', beat: 2, kind: 'tag', item: { id: 'ref-3-tag', placement: 'over' } };
        const tagged = directed(roled([{}, {}, { transition_in: 'wipe' }]), [window(1), tag, card(3)], LINES,
            { onScreen: [0, 2, 4].map(at => ({ beat: at, anchor: anchor(`word ${at}`), cover_words: 3 })) });
        expect(tagged.framed).toEqual([]);
    });
    /** Mutant: frame a list's items at medium, and the cuts the plan lists as close change nothing on screen. */
    it('cuts a list close on its first and third items', () => {
        const result = directed([beat(0, { role: 'hook' }), beat(3, { role: 'hook' })], [], [LINES[0]!, 'I still choose the presenter, the voice and the hook.']);
        expect(result.framed.map(entry => [entry.layers.map(layer => layer.item), entry.added.what])).toEqual([[[
            { id: 'ref-2-sequence-1', anchor: anchor('I still choose the presenter,'), cover_words: 5, size: 'close' },
            { id: 'ref-2-sequence-2', anchor: anchor('and the hook.'), cover_words: 3, size: 'close' }],
            'beat 2: a list of 3, so its items cut close and back in turn']]);
    });
    /** Mutants: skip the pull-back gate, or keep S1's zoom line, and a reference zoom is turned around or the plan names the old move. */
    it('zooms a closing picture out, unless the reference moves it', () => {
        const lines = [LINES[0]!, 'Want one like this?'];
        const ours = directed([beat(0, { role: 'hook' }), beat(3, { role: 'cta' })], [insert(1)], lines);
        expect(ours.patches.map(patch => [patch.set, patch.added.map(entry => entry.what)])).toEqual([[{ image_motion: { direction: 'out', amount: PICTURE_ZOOM } },
            ['beat 2: the closing question, so the picture zooms out as it is asked']]]);
        const theirs = directed([beat(0, { role: 'hook' }), beat(3, { role: 'cta', camera: 'punch_in' })], [insert(1)], lines);
        expect(theirs.patches.map(patch => patch.set)).toEqual([{ image_motion: { direction: 'in', amount: PICTURE_ZOOM } }]);
        const presenter = directed([beat(0, { role: 'hook' }), beat(3, { role: 'cta', camera: 'zoom_out' })], [], [LINES[0]!, 'So here it is. Want one like this?']);
        expect(presenter.framed.map(entry => entry.layers.map(layer => (layer.item as { size: string; cover_words: number })))).toEqual([[{ id: 'ref-2-pull-back',
            anchor: anchor('So here it is.'), cover_words: 4, size: 'close' }]]);
        expect(notes(presenter)).toEqual(['zoom_out camera on beats 2 → a pull-back']);
    });
});

/** A reel of `count` speaking beats, one sentence each, roles taking turns, and the extra graphics `graphic` gives a beat. */
function turns(count: number, sentence: (at: number) => string, graphic: (at: number) => unknown[] = () => []) {
    const profile = reel(value => {
        value.beats = Array.from({ length: count }, (_, at) => ({ ...value.beats[0], role: at % 2 ? 'solution' : 'problem', start_s: at * 2, end_s: at * 2 + 2,
            start_frac: at / count, end_frac: (at + 1) / count, presenter_behaviour: graphic(at).length ? 'absent' : 'speaking', camera: 'static', transition_in: 'cut',
            sounds: [], graphics: graphic(at) }));
        value.source = { ...value.source, duration_s: count * 2 };
        value.staging.anchors = [];
    });
    return remake({ script: Array.from({ length: count }, (_, at) => sentence(at)).join(' ') }, profile);
}

describe('the director within the run\'s limits (#1051 S5)', () => {
    /** Mutant: drop the framing count, and a long reel of new parts compiles to more framing than a run takes and fails to compile. */
    it('stops adding cuts at the run\'s framing limit and lists only the ones it keeps', () => {
        const { input, added } = turns(62, () => 'I tried it again today.');
        expect((input.framing as unknown[]).length).toBe(MAX_FRAMING);
        expect(added!.filter(line => line.includes('a new part'))).toHaveLength(MAX_FRAMING);
    });
    /** Mutant: drop the template count, and a number after twelve cards makes a thirteenth the run refuses. */
    it('adds no stat card past the run\'s template limit', () => {
        const card = (at: number) => at < MAX_TEMPLATES ? [{ kind: 'title_card', source_kind: 'title_card', position: 'full_screen', state_changes: [], label_hint: '' }] : [];
        const name = (at: number) => `${String.fromCharCode(97 + at % 26)}${String.fromCharCode(97 + Math.floor(at / 26))}`;
        const { input } = turns(MAX_TEMPLATES + 1, at => at < MAX_TEMPLATES ? `Card ${name(at)} is here.` : 'It took me 30 hours each week.', card);
        expect((input.templates as { kind: string }[]).map(item => item.kind)).toEqual(Array(MAX_TEMPLATES).fill('title_card'));
    });
    /** Mutant: treat a refused device of ours as the reference's, and the plan drops it with a "left out" note the client never asked about. */
    it('takes a refused device of ours back whole and silently', () => {
        const overlapping: Parameters<typeof compileReferenceRemake>[2] = input => {
            const spans = proportionalSpans(input);
            return spans.map((span, at) => at === 3 && span && spans[1] ? { start: spans[1].start, end: span.end } : span);
        };
        const result = compileReferenceRemake({ reference_profile: reel(), script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah', assets: pictures }, capabilities(), overlapping);
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        const framing = (result.document.brief.native!.input as { framing: { id: string }[] }).framing;
        expect(framing.map(item => item.id)).not.toContain('ref-2-transition');
        expect(result.document.brief.added).not.toContain(DIRECTED[0]);
        expect(result.document.brief.reference_profile!.unmapped.filter(entry => entry.what.startsWith('framing'))).toEqual([]);
        // A list's cuts go together: the insert reaches back over the list's last item only, and both cuts of the list go.
        const list = SCRIPT.replace('Building each one by hand meant hours in the editor.', 'I still choose the presenter, the voice and the hook.');
        const partly: Parameters<typeof compileReferenceRemake>[2] = input => {
            const spans = proportionalSpans(input);
            return spans.map((span, at) => at === 3 && span && spans[1] ? { start: spans[1].start + 7, end: span.end } : span);
        };
        const listed = compileReferenceRemake({ reference_profile: reel(), script: list, actor_id: 'actor_marcus', voice: 'sarah', assets: pictures }, capabilities(), partly);
        if (listed.kind !== 'compiled') throw new Error(JSON.stringify(listed.issues));
        expect((listed.document.brief.native!.input as { framing: { id: string }[] }).framing.map(item => item.id).filter(id => id.startsWith('ref-2-'))).toEqual([]);
        expect(listed.document.brief.added!.filter(line => line.startsWith('beat 2:'))).toEqual([]);
        // A stat card under an insert that reaches back over its words goes the same way.
        const counted = SCRIPT.replace('Then I tried a new tool.', 'It saved me 30 hours.');
        const over: Parameters<typeof compileReferenceRemake>[2] = input => {
            const spans = proportionalSpans(input);
            return spans.map((span, at) => at === 3 && span && spans[2] ? { start: spans[2].start, end: span.end } : span);
        };
        const carded = compileReferenceRemake({ reference_profile: reel(), script: counted, actor_id: 'actor_marcus', voice: 'sarah', assets: pictures }, capabilities(), over);
        if (carded.kind !== 'compiled') throw new Error(JSON.stringify(carded.issues));
        expect(((carded.document.brief.native!.input as { templates?: { kind: string }[] }).templates ?? []).filter(item => item.kind === 'stat')).toEqual([]);
        expect(carded.document.brief.reference_profile!.unmapped.filter(entry => entry.what.startsWith('stat'))).toEqual([]);
        expect(carded.document.brief.added!.filter(line => line.includes('number'))).toEqual([]);
    });
});

/** The real DfFtkhuiPAd profile, the reference's words left out, and the script and four screenshots of its remake (#1051 S0). */
const DFFT = JSON.parse(readFileSync(new URL('../fixtures/reference-profile-dfft.json', import.meta.url), 'utf8'));
const DFFT_SCRIPT = 'I kept remaking the same kind of product video for every client. Building each one by hand meant hours in the editor, cut by cut. ' +
    'Then I tried Clipwright. You hand your agent a reel that works and a short script. It breaks the reel down into beats, inserts and timing. ' +
    'Then it renders a new presenter video in that same style. I still choose the presenter, the voice and the hook. One prompt replaced an afternoon of editing. ' +
    'Ask Claude for a video like this one, and try it free at clipwright.io.';
const SHOTS = ['4a7cb993', 'd81a783f', 'e5017468', 'f7ebef77'].map(hex => ({ asset_id: `ast_${hex.repeat(4)}`, media_type: 'image' }));
const PROD = { templates: 'implemented', caption_position: 'implemented', presenter_framing: 'implemented', presenter_mic: 'implemented',
    presenter_place: 'implemented', edit_sounds: 'implemented' };

describe('the director on DfFtkhuiPAd (#1051 S5 golden)', () => {
    const dfft = (add_moves: boolean) => remake({ add_moves, script: DFFT_SCRIPT, voice: 'george', site: 'clipwright.io', assets: SHOTS }, DFFT, PROD);
    /** Mutants: move a beat the reference moves, or drop a device, and the diff against add_moves false changes. Since #1060 beats 2 and 3 are a
     *  full-frame picture and a card, so a light leak and a zoom replace the split's slide, and the wipe into the card is a cut in both plans. */
    it('adds a light leak, zooms and a wipe where the reference is plain, and the rest equals the reference\'s moves alone', () => {
        const on = dfft(true), off = dfft(false);
        expect(makeUgcInput.safeParse(on.input).success).toBe(true);
        type Native = { layout_windows: { id: string }[]; inserts: { id: string; transition?: string; image_motion?: unknown }[];
            templates: { id: string; placement?: string; transition?: string }[]; framing: { id: string }[] };
        const native = on.input as unknown as Native;
        expect([native.layout_windows.map(item => item.id), native.inserts.map(item => item.id), native.templates.map(item => [item.id, item.placement])]).toEqual([
            ['ref-1-layout-split'], ['ref-2-insert-media', 'ref-4-insert-media', 'ref-4-insert-media-2', 'ref-5-insert-media', 'ref-5-insert-media-2'],
            // #1161: the site's end card on the closing beat, which the reference leaves bare.
            [['ref-3-title-card', 'full'], ['ref-7-title-card', 'full'], ['ref-9-end-card', undefined]]]);
        expect([native.inserts[0]!.transition, native.inserts[0]!.image_motion, native.inserts[3]!.image_motion, native.templates[1]!.transition]).toEqual([
            'light_leak', { direction: 'in', amount: PICTURE_ZOOM }, { direction: 'out', amount: PICTURE_ZOOM }, 'wipe']);
        const back = structuredClone(native);
        delete back.inserts[0]!.transition; delete back.inserts[0]!.image_motion; delete back.inserts[3]!.image_motion; delete back.templates[1]!.transition;
        expect(back).toEqual(off.input);
        expect(on.added).toEqual(['beat 2: a new part (problem after hook), so the picture comes in with a light leak',
            'beat 2: the picture zooms in slowly, unless its shape scrolls or pans it', 'beat 5: the picture zooms out slowly, unless its shape scrolls or pans it',
            'beat 7: a new part (proof after solution), so the card comes in with a wipe']);
        // The owner's word on this remake (#1076): no cut sounds unless the client asks; the plan names the reference's.
        expect(on.input.edit_sounds).toBeUndefined();
        expect(on.notes).toContain('1: the whoosh and click sounds on beats 2, 3, 4, 5, 6, 9 → none unless you ask: compile again with edit_sounds: true for a sound on every cut');
        expect(on.notes.filter(entry => !off.notes.includes(entry))).toEqual(['4: other camera on beats 5 → a slow zoom on the picture']);
        // Only beat 8 keeps its presenter: no picture is left for it, and a demo takes no card of its words.
        expect(on.notes.filter(entry => entry.includes('the presenter leaving the frame'))).toEqual(['7: the presenter leaving the frame → the presenter stays on screen: ' +
            'pass one more ready ast_* image or video and compile again to show it full-frame here']);
        expect(on.notes.filter(entry => entry.startsWith('2: unmapped:'))).toEqual([]);
        expect(JSON.stringify(dfft(true).document)).toBe(JSON.stringify(on.document));
    });
    /** #1085: the reference's cuts and flashes inside beats 4 and 5 (16.47 and 16.73 s; 19.73, 19.8 and 20.07 s) are one cut each. Mutants: drop
     *  the split, cut at a fixed share, cut on every anchor, or leave the flash on the shot's first cut, and a picture cuts off the reference's time. */
    it('cuts each picture inside its beat where the reference cuts, its flash on that cut, with no presenter between', () => {
        const { input, notes } = dfft(true);
        type Insert = { id: string; anchor: { quote: string; occurrence?: number }; cover_words: number; transition?: string; asset_id: string; image_motion?: { direction: string } };
        const inserts = input.inserts as unknown as Insert[], spans = proportionalSpans({ profile: DFFT, words: referenceScriptWords(DFFT_SCRIPT) });
        const resolved = planSemanticInserts(DFFT_SCRIPT, inserts.map(item => ({ insertId: item.id, mediaId: item.id, anchor: item.anchor, coverWords: item.cover_words }))).inserts;
        const startOf = (id: string) => resolved.find(entry => entry.insertId === id)!;
        for (const [beat, cut, before, after] of [[3, 16.733, 'ref-4-insert-media', 'ref-4-insert-media-2'], [4, 19.8, 'ref-5-insert-media', 'ref-5-insert-media-2']] as const) {
            const source = DFFT.beats[beat], span = spans[beat]!, length = span.end - span.start;
            expect(Math.abs((startOf(after).startWord - span.start) / length - (cut - source.start_s) / (source.end_s - source.start_s))).toBeLessThanOrEqual(1 / length);
            expect([startOf(before).startWord, coverWordOf(startOf(before)), coverWordOf(startOf(after))]).toEqual([span.start, startOf(after).startWord, span.end]);
            const [first, second] = [inserts.find(item => item.id === before)!, inserts.find(item => item.id === after)!];
            expect([first.transition, second.transition, second.asset_id, second.image_motion?.direction]).toEqual([undefined, 'light_leak', first.asset_id, first.image_motion?.direction]);
        }
        expect(inserts.filter(item => item.id.endsWith('-2')).map(item => item.id)).toEqual(['ref-4-insert-media-2', 'ref-5-insert-media-2']);
        expect(notes.filter(entry => /inside the shots?/.test(entry))).toEqual([]);
    });
    /** #1085. Mutants: spend a spare picture on a cut before a beat with none, or ignore the spare, and the presenter shows or the picture repeats. */
    it('cuts to a spare picture once every beat without its presenter has one, and re-crops the rest', () => {
        const spare = (digit: string) => ({ asset_id: `ast_${digit.repeat(32)}`, media_type: 'image' });
        const { input, notes } = remake({ script: DFFT_SCRIPT, voice: 'george', site: 'clipwright.io', assets: [...SHOTS, ...['7', '8', '9'].map(spare)] }, DFFT, PROD);
        const inserts = input.inserts as unknown as { id: string; asset_id: string }[], asset = (id: string) => inserts.find(item => item.id === id)!.asset_id;
        expect(['ref-3-insert-media', 'ref-8-insert-media', 'ref-4-insert-media-2', 'ref-5-insert-media-2'].map(asset))
            .toEqual([...['8', '7', '9'].map(digit => spare(digit).asset_id), asset('ref-5-insert-media')]);
        expect(notes.filter(entry => entry.includes('the presenter leaving the frame'))).toEqual([]);
    });
    /** #1085. Mutant: re-cut a clip to itself, and it restarts mid-beat; drop the note, and the reference's cut goes unsaid. */
    it('cuts a clip only to a spare clip, and names the cuts it leaves out', () => {
        const clips = ['5', '6'].map(digit => ({ asset_id: `ast_${digit.repeat(32)}`, media_type: 'video' }));
        const { input, notes } = remake({ assets: clips });
        expect((input.inserts as unknown as { id: string }[]).map(item => item.id)).toEqual(['ref-4-insert-media', 'ref-5-insert-media']);
        expect(notes).toContain('3: the cuts inside the shots on beats 4, 5 → one shot there: pass one more ready ast_* media of its kind and compile again to cut to it');
        expect(notes).toContain('3: the flashes inside the shots on beats 4, 5 → a light leak on each picture\'s cuts');
        const spared = remake({ assets: [...clips, { asset_id: `ast_${'7'.repeat(32)}`, media_type: 'video' }] });
        expect((spared.input.inserts as unknown as { id: string }[]).map(item => item.id)).toEqual(['ref-4-insert-media', 'ref-4-insert-media-2', 'ref-5-insert-media']);
        // Codex r2. Mutant: take any spare asset, and a clip cuts to a picture, or a picture's piece points at a clip while it says image.
        const other = (media_type: string) => ({ asset_id: `ast_${'4'.repeat(32)}`, media_type });
        const mixed = [remake({ assets: [...clips, other('image')] }), remake({ assets: [...pictures, other('video')] })]
            .map(({ input }) => (input.inserts as unknown as { id: string; asset_id: string; media_type: string }[]).map(item => [item.id, item.asset_id, item.media_type]));
        expect(mixed).toEqual([clips.map((clip, at) => [`ref-${at + 4}-insert-media`, clip.asset_id, 'video']),
            pictures.flatMap((picture, at) => [[`ref-${at + 4}-insert-media`, picture.asset_id, 'image'], [`ref-${at + 4}-insert-media-2`, picture.asset_id, 'image']])]);
    });
    /** Mutant: keep the caption emphasis from the director, and the hook's stressed words get no cut of their own. */
    it('cuts in close on the words the captions stress', () => {
        const { input, added } = remake({}, reel(profile => { profile.captions.present = true; profile.captions.emphasis_style = 'punch'; }));
        expect(input.framing!.find(item => item.id === 'ref-1-punch'))
            .toMatchObject({ anchor: { quote: 'for every client' }, cover_words: 3, size: 'close' });
        expect(added).toContain('beat 1: its stressed words, so the presenter cuts in close on it');
    });
    /** Mutant: read a question mark as a full stop, and the closing question gets no pull-back. */
    it('pulls back on the script\'s closing question', () => {
        const { input } = turns(3, at => ['This is a longer opening sentence about the product today.', 'Here is what it does for you every day.',
            'So here it is. Want one like this?'][at]!);
        expect((input.framing as { id: string }[]).map(item => item.id)).toContain('ref-3-pull-back');
    });
    /** Mutant: drop the template check on a stat, and a script's number puts a card on the face or past the run's limits. */
    it('counts a spoken number up on a card clear of the face', () => {
        const { input, added } = remake({ script: SCRIPT.replace('Then I tried a new tool.', 'It saved me 30 hours.') });
        const stat = (input.templates as { id: string; kind: string; data: unknown }[]).find(item => item.kind === 'stat');
        expect(stat).toMatchObject({ id: 'ref-3-stat', data: { value: 30, label: 'hours' } });
        expect(templateFaceWarnings({ templates: input.templates })).toEqual([]);
        expect(added).toContain('beat 3: the number 30, so it counts up on a card below the face');
        const off = remake({ script: SCRIPT.replace('Then I tried a new tool.', 'It saved me 30 hours.') }, reel(), { templates: 'rejected' });
        expect([off.input.templates, off.added!.filter(line => line.includes('number'))]).toEqual([undefined, []]);
    });
});
