import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeUgcInput, MAX_LIVE_SHOTS, MAX_PRESENTER_TAKES, type UgcLiveShot } from '../skills.js';
import { ugcMarkedComponents, ugcMarkedComponentsRefusal } from '../presenter-takes.js';
import { compileReferenceRemake, proportionalSpans, referenceScriptWords, type CapabilityProfile } from './index.js';

/** #1103 D14: live_shots compiles the beats where the reference presenter is on screen into make_ugc live shots. */

const PROFILE = JSON.parse(readFileSync(new URL('../fixtures/reference-profile-reel.json', import.meta.url), 'utf8'));
const SCRIPT = 'Every missed call is a lost deal. Your receptionist sleeps, takes breaks, and sometimes gets annoyed. This one doesn\'t. ' +
    'It answers calls all day, works around the clock, and never gets annoyed. Here\'s a real one: a customer calls at two in the morning to book ' +
    'a cleaning, and it handles everything, the time, the price, the confirmation text. Small businesses miss a third of their calls. Not anymore. ' +
    'Set it up in ten minutes and stop losing deals while you sleep.';
const capabilities = (shots: 'implemented' | 'rejected' | null = 'implemented', longForm = true): CapabilityProfile => ({ v: 1,
    content_digest: 'c'.repeat(64), executors: [{ skill: 'make_ugc', configured: true, qualified: true, enabled: true, profiles: ['ugc-native-v1'],
        features: ['exact_script', 'actor', 'voice', ...longForm ? ['long_form'] : []], formats: [{ aspect_ratio: '9:16', resolution: '1080p' }],
        field_dispositions: { captions: 'implemented', caption_style: 'implemented', templates: 'implemented', ...shots ? { shots } : {} } }] });
type Beat = { presenter_behaviour: string; graphics: unknown[]; gestures?: unknown[]; camera: string; transition_in: string };
function compile(extra: Record<string, unknown>, edit: (beats: Beat[]) => void = () => {}, caps = capabilities()) {
    const profile = structuredClone(PROFILE);
    edit(profile.beats);
    const result = compileReferenceRemake({ reference_profile: profile, script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah', ...extra }, caps);
    if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
    const brief = result.document.brief;
    if (brief.native?.skill !== 'make_ugc') throw new Error('not a make_ugc plan');
    return { input: brief.native.input as Record<string, unknown> & { shots?: { id: string; kind: string; anchor: { startWord: number; endWord: number };
        action?: string }[] }, notes: brief.reference_profile!.unmapped, added: brief.added ?? [], profile };
}
const spansOf = (profile: unknown) => proportionalSpans({ profile: profile as never, words: referenceScriptWords(SCRIPT) });
const gesture = (kind: string, at_s: number) => ({ kind, at_s, label: 'a gesture', frames_s: [Math.floor(at_s)] });
const BUDGET_SCRIPT = Array.from({ length: 36 }, (_, at) => `Line ${at + 1} says one more short thing here.`).join(' ');
/** Each beat cut in three, every other one a live shot: the presenter's usual take runs between them, so each shot costs two takes. */
function alternating(beats: Beat[]) {
    type Timed = Beat & { start_frac: number; end_frac: number; start_s: number; end_s: number };
    const cut = (from: number, to: number, at: number) => at === 3 ? to : from + (to - from) * at / 3;
    beats.splice(0, beats.length, ...(beats as Timed[]).flatMap(beat => [0, 1, 2].map(part => ({ ...structuredClone(beat),
        start_frac: cut(beat.start_frac, beat.end_frac, part), end_frac: cut(beat.start_frac, beat.end_frac, part + 1),
        start_s: cut(beat.start_s, beat.end_s, part), end_s: cut(beat.start_s, beat.end_s, part + 1) }))));
    beats.forEach((beat, at) => { beat.presenter_behaviour = at % 2 ? 'absent' : 'speaking'; beat.graphics = []; beat.camera = 'static'; beat.transition_in = 'cut'; });
}

describe('live shots in a reference remake', () => {
    // Mutants: map speaking with gestures to talking, reacting to talking, or give absent/listening beats a shot; anchor off the beat's words.
    it('maps each on-screen beat to its shot kind on the beat\'s own words, and leaves absent and listening beats alone', () => {
        const { input, profile, notes } = compile({ live_shots: true }, beats => {
            beats[3]!.gestures = [gesture('open_palms', 9), gesture('point_at_viewer', 8.5), gesture('other', 9.2)];
            beats[8]!.presenter_behaviour = 'reacting';
            beats[9]!.presenter_behaviour = 'reacting';
            beats[9]!.gestures = [gesture('thumbs_up', 20)];
        });
        const spans = spansOf(profile), shots = input.shots!;
        const at = (beat: number) => shots.find(shot => shot.id === `ref-${beat + 1}-shot`);
        expect(at(3)).toEqual({ id: 'ref-4-shot', kind: 'talking_action', anchor: { startWord: spans[3]!.start, endWord: spans[3]!.end },
            action: 'points at the viewer, then opens both palms toward the viewer', framing: 'wide' });
        expect(at(1)).toEqual({ id: 'ref-2-shot', kind: 'talking', anchor: { startWord: spans[1]!.start, endWord: spans[1]!.end } });
        expect(at(8)).toMatchObject({ kind: 'action', action: 'reacts to the words with a warm smile and a nod' });
        expect(at(9)).toMatchObject({ kind: 'action', action: 'gives a thumbs up' });
        expect(at(0)).toBeUndefined();
        expect(at(2)).toBeUndefined();
        expect(at(6)).toBeUndefined();
        expect(makeUgcInput.safeParse(input).success).toBe(true);
        // The reference's framing cuts on shot words give way, each named (rule 3).
        expect(input.framing).toBeUndefined();
        const given = notes.filter(entry => entry.suggested_substitute === 'the live shot on these words').map(entry => entry.beat_index);
        expect(given.length).toBeGreaterThan(0);
        for (const beat of given) {
            expect(shots.some(shot => shot.anchor.startWord <= spans[beat]!.start && spans[beat]!.end <= shot.anchor.endWord)).toBe(true);
        }
    });

    // Mutant: a shot over words a full-frame insert covers, which bills presenter seconds no one sees.
    it('gives no shot to a beat under a full-frame insert', () => {
        const assets = ['1', '2'].map(digit => ({ asset_id: `ast_${digit.repeat(32)}`, media_type: 'image' }));
        const { input } = compile({ live_shots: true, assets }, beats => {
            beats[1]!.graphics = [];
            beats[4]!.graphics = [{ kind: 'insert_media', source_kind: 'insert_media', position: 'full_screen', state_changes: [], label_hint: '' }];
        });
        expect(input.inserts).toBeDefined();
        expect(input.shots!.map(shot => shot.id)).not.toContain('ref-5-shot');
        expect(input.shots!.map(shot => shot.id)).toContain('ref-2-shot');
        expect(makeUgcInput.safeParse(input).success).toBe(true);
    });

    // Mutants: drop the cap, keep the first six instead of the longest, or drop a beat without naming it.
    it('keeps the longest shots up to the cap and names every beat it drops', () => {
        // #1192: the cap is sixteen, so each beat is cut in three and the script has a sentence for each.
        const script = Array.from({ length: 36 }, (_, at) => `Line ${at + 1} says one more short thing here.`).join(' ');
        const { input, notes, profile } = compile({ live_shots: true, script }, beats => {
            type Timed = Beat & { start_frac: number; end_frac: number; start_s: number; end_s: number };
            const cut = (from: number, to: number, at: number) => at === 3 ? to : from + (to - from) * at / 3;
            const thirds = (beats as Timed[]).flatMap(beat => [0, 1, 2].map(part => ({ ...structuredClone(beat),
                start_frac: cut(beat.start_frac, beat.end_frac, part), end_frac: cut(beat.start_frac, beat.end_frac, part + 1),
                start_s: cut(beat.start_s, beat.end_s, part), end_s: cut(beat.start_s, beat.end_s, part + 1) })));
            beats.splice(0, beats.length, ...thirds);
            for (const beat of beats) { beat.presenter_behaviour = 'speaking'; beat.graphics = []; beat.camera = 'static'; beat.transition_in = 'cut'; }
        });
        const spans = proportionalSpans({ profile: profile as never, words: referenceScriptWords(script) });
        // Beats sharing a span take one shot, named by the first of them.
        const distinct = spans.flatMap((span, beat) => span && spans.findIndex(other => other?.start === span.start) === beat
            ? [{ beat, words: span.end - span.start }] : []);
        expect(distinct.length).toBeGreaterThan(MAX_LIVE_SHOTS);
        const longest = [...distinct].sort((a, b) => b.words - a.words || a.beat - b.beat).slice(0, MAX_LIVE_SHOTS).map(entry => entry.beat);
        // #1197: the take budget then drops more of them, so every kept shot is among the longest sixteen.
        const kept = input.shots!.map(shot => Number(shot.id.match(/^ref-(\d+)-shot$/)![1]) - 1);
        expect(kept.every(beat => longest.includes(beat))).toBe(true);
        const dropped = notes.filter(entry => entry.what.startsWith('a live shot on this beat')).map(entry => entry.beat_index);
        expect([...dropped].sort((a, b) => a - b)).toEqual(distinct.map(entry => entry.beat).filter(beat => !kept.includes(beat)));
        expect(makeUgcInput.safeParse(input).success).toBe(true);
        expect(ugcMarkedComponentsRefusal(makeUgcInput.parse(input), false)).toBeNull();
    });

    // #1197 item 2. Mutants: the budget left out, counted without marking, or dropping the longest shot first: the plan compiles, then its
    // quote refuses it for its takes, or for its takes beside the customer's pictures when the video is labelled.
    it('drops live shots, the fewest words first and each named, until the plan fits the quote\'s take budget', () => {
        const script = BUDGET_SCRIPT, speaking = alternating;
        const unbudgeted = compile({ live_shots: true, script }, speaking);
        expect(ugcMarkedComponents(makeUgcInput.parse(unbudgeted.input)).takes).toBeLessThanOrEqual(MAX_PRESENTER_TAKES);
        const budget = unbudgeted.notes.filter(entry => entry.what.includes('more presenter takes than the 16'));
        expect(budget.length).toBeGreaterThan(0);
        const words = (shot: { anchor: { startWord: number; endWord: number } }) => shot.anchor.endWord - shot.anchor.startWord;
        const fewestKept = Math.min(...unbudgeted.input.shots!.map(words));
        const spans = proportionalSpans({ profile: unbudgeted.profile as never, words: referenceScriptWords(script) });
        for (const entry of budget) expect(spans[entry.beat_index]!.end - spans[entry.beat_index]!.start).toBeLessThanOrEqual(fewestKept);
        // A labelled video also counts the customer's pictures: two assets on lines leave room for fewer takes.
        const caps = capabilities();
        caps.executors[0]!.field_dispositions.visible_ai_label = 'implemented';
        const assets = ['1', '2', '3', '4'].map(digit => ({ asset_id: `ast_${digit.repeat(32)}`, media_type: 'image' }));
        const marked = compile({ live_shots: true, script, assets }, speaking, caps);
        const input = makeUgcInput.parse(marked.input);
        expect(ugcMarkedComponentsRefusal(input, true)).toBeNull();
        expect(marked.input.shots!.length).toBeLessThan(unbudgeted.input.shots!.length);
    });

    // Codex r1 on 1192b-cast. Mutants: the last live shot kept, or the plan compiled once no shot is left to drop: the quote then refuses it.
    it('never compiles a labelled plan the quote refuses: shots go, then the pictures it placed, then it refuses with the quote\'s words', () => {
        const script = BUDGET_SCRIPT, speaking = alternating;
        const caps = capabilities();
        caps.executors[0]!.field_dispositions.visible_ai_label = 'implemented';
        const asset = (at: number) => ({ asset_id: `ast_${at.toString(16).padStart(32, '0')}`, media_type: 'image' });
        let sawLastShotGo = false, sawPictureGo = false;
        for (let count = 0; count <= 20; count += 1) {
            const profile = structuredClone(PROFILE);
            speaking(profile.beats);
            const result = compileReferenceRemake({ reference_profile: profile, script, actor_id: 'actor_marcus', voice: 'sarah', live_shots: true,
                assets: Array.from({ length: count }, (_, at) => asset(at + 1)) }, caps);
            if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
            const brief = result.document.brief, input = makeUgcInput.parse(brief.native!.input);
            expect(ugcMarkedComponentsRefusal(input, true), `${count} assets`).toBeNull();
            const notes = brief.reference_profile!.unmapped.map(entry => entry.what);
            if (!input.shots && notes.some(what => what.includes('more presenter takes than the 16'))) sawLastShotGo = true;
            // Codex r2: the pictures go by their words, fewest first, so none dropped covers more words than one kept.
            const dropped = brief.reference_profile!.unmapped.filter(entry => entry.what.includes('more than one video holds')).map(entry => entry.beat_index);
            if (dropped.length) {
                sawPictureGo = true;
                const spans = proportionalSpans({ profile: profile as never, words: referenceScriptWords(script) });
                const kept = Math.min(...(input.inserts ?? []).map(insert => insert.cover_words!));
                for (const beat of dropped) expect(spans[beat]!.end - spans[beat]!.start, `${count} assets, beat ${beat}`).toBeLessThanOrEqual(kept);
            }
        }
        expect([sawLastShotGo, sawPictureGo]).toEqual([true, true]);
        // Pictures the request pinned to its words stay: past the budget the compile is refused, not trimmed.
        const pinned = Array.from({ length: 12 }, (_, at) => ({ ...asset(at + 1), anchor: `Line ${at + 1} says` }));
        const profile = structuredClone(PROFILE);
        speaking(profile.beats);
        const refused = compileReferenceRemake({ reference_profile: profile, script, actor_id: 'actor_marcus', voice: 'sarah', live_shots: true,
            assets: pinned }, caps);
        expect(refused).toMatchObject({ kind: 'invalid', issues: [{ path: expect.stringMatching(/^assets\.\d+\.anchor$/),
            message: expect.stringContaining('more than one video holds') }] });
    });

    // #1192. Mutants: the cast on a talking shot (refused at quote), on no shot, or on only some acting shots of the one setup (refused at quote).
    it('gives the request\'s cast to every acting shot and names it when no acting shot is drawn', () => {
        const cast = [{ asset_id: `ast_${'5'.repeat(32)}`, role: 'the customer', action: 'listens and nods' }];
        const { input, notes } = compile({ live_shots: true, cast }, beats => {
            beats[3]!.gestures = [gesture('open_palms', 9)];
            beats[8]!.presenter_behaviour = 'reacting';
        });
        const shots = input.shots as UgcLiveShot[];
        expect(shots.filter(shot => shot.kind !== 'talking').length).toBeGreaterThan(1);
        for (const shot of shots) expect(shot.cast).toEqual(shot.kind === 'talking' ? undefined : cast);
        expect(makeUgcInput.safeParse(input).success).toBe(true);
        expect(notes.some(entry => entry.what.startsWith('your cast'))).toBe(false);
        const bare = compile({ live_shots: false, cast });
        expect(bare.input.shots).toBeUndefined();
        expect(bare.notes).toContainEqual(expect.objectContaining({ what: 'your cast (the customer)',
            suggested_substitute: expect.stringContaining('not drawn') }));
    });

    // Mutants: flash every shot, flash none, or flash the hook under add_moves false (#1129).
    it('cuts from a live hook shot to the presenter on a flash, ours and named, unless add_moves is false', () => {
        const hooked = (beats: Beat[]) => { beats[0]!.presenter_behaviour = 'speaking'; beats[0]!.graphics = []; };
        const { input, added } = compile({ live_shots: true }, hooked);
        expect(input.shots!.find(shot => shot.id === 'ref-1-shot')).toMatchObject({ transition: 'flash' });
        expect(input.shots!.filter(shot => 'transition' in shot).map(shot => shot.id)).toEqual(['ref-1-shot']);
        expect(added.join(' ')).toContain('a flash on the cuts into and out of the hook\'s live shot (beat 1)');
        expect(makeUgcInput.safeParse(input).success).toBe(true);
        const plain = compile({ live_shots: true, add_moves: false }, hooked).input.shots!;
        expect(plain.find(shot => shot.id === 'ref-1-shot')).toBeDefined();
        expect(plain.some(shot => 'transition' in shot)).toBe(false);
    });

    it('says the shots cost more in brief.added', () => {
        const { added } = compile({ live_shots: true });
        expect(added.join(' ')).toContain('each shot kind bills its own presenter-second price');
    });

    // Mutant: shots on a server that rejects them, whose quote would then 400; or silence about the asked shots (rule 3).
    it('names asked shots as unavailable where the server rejects them or long form is off', () => {
        for (const caps of [capabilities('rejected'), capabilities(null),capabilities('implemented', false)]) {
            const { input, notes } = compile({ live_shots: true }, undefined, caps);
            expect(input.shots).toBeUndefined();
            expect(notes.filter(entry => entry.what === 'live shots of the presenter')).toHaveLength(1);
        }
    });

    // Mutant: shots compiled without the opt-in; today's plans must stay byte for byte.
    /** #1175 S7 C5, C7. Mutants: live shots off unless asked (a remake of a moving presenter is a talking head again), on for every speaking beat */
    /** (shots where the reference presenter stands still), or live_shots false ignored. */
    it('plans live shots by default on the beats where the presenter gestures, and none with live_shots false', () => {
        const moving = (beats: Beat[]) => { beats[3]!.gestures = [gesture('open_palms', 9)]; beats[7]!.gestures = [gesture('count_on_fingers', 17)]; };
        const ids = (extra: Record<string, unknown>) => (compile(extra, moving).input.shots ?? []).map(shot => shot.id);
        expect(ids({})).toEqual(['ref-4-shot', 'ref-8-shot']);
        expect(ids({ live_shots: true }).length).toBeGreaterThan(2);
        expect(ids({ live_shots: false })).toEqual([]);
        // A reference whose presenter never gestures compiles as before: no shots, nothing about them.
        const still = JSON.stringify(compileReferenceRemake({ reference_profile: structuredClone(PROFILE), script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah' },
            capabilities()));
        expect(still).not.toContain('"shots"');
        expect(still).not.toContain('live shot');
    });

    /** #1175 S7 C4 (Codex r1). Mutants: full dropped from the profile's framing (a full-height reference planned close), personal actors held */
    /** close again, or an acting shot asked wider than a full take. */
    it('plans a full-height reference full for library and personal actors alike, and frames no shot past a full take', () => {
        const caps = capabilities();
        caps.executors[0]!.field_dispositions.presenter_framing = 'implemented';
        const plan = (actor_id: string, framing: string) => {
            const profile = structuredClone(PROFILE);
            profile.presenter_framing = framing;
            profile.beats[3].gestures = [gesture('open_palms', 9)];
            const result = compileReferenceRemake({ reference_profile: profile, script: SCRIPT, actor_id, voice: 'sarah' }, caps);
            if (result.kind !== 'compiled' || result.document.brief.native?.skill !== 'make_ugc') throw new Error('not compiled');
            return result.document.brief.native.input as { presenter_framing?: string; shots?: { id: string; framing?: string }[] };
        };
        for (const actor of ['actor_marcus', `actor_u_${'a'.repeat(26)}`]) {
            expect(plan(actor, 'full').presenter_framing).toBe('full');
            expect(plan(actor, 'wide').presenter_framing).toBe('wide');
            expect(plan(actor, 'close').presenter_framing).toBeUndefined();
        }
        expect(plan('actor_marcus', 'full').shots!.find(shot => shot.id === 'ref-4-shot')!.framing).toBeUndefined();
        expect(plan('actor_marcus', 'wide').shots!.find(shot => shot.id === 'ref-4-shot')!.framing).toBeUndefined();
        expect(plan('actor_marcus', 'close').shots!.find(shot => shot.id === 'ref-4-shot')!.framing).toBe('wide');
    });

    /** #1175 S7 C2, C5. Mutants: an acting shot framed as the chest-up take (hands out of frame), the beat's measured full height dropped, or */
    /** a wider frame asked of a talking shot (which draws from the photo itself). */
    it('frames an acting shot by the beat\'s measured size, wide when unmeasured on a close take, and leaves talking shots alone', () => {
        const sized = (size: string | undefined) => compile({ live_shots: true }, beats => {
            beats[3]!.gestures = [gesture('open_palms', 9)];
            if (size) (beats[3] as Beat & { shot_size?: string }).shot_size = size;
        }).input.shots!;
        const framingOf = (size: string | undefined) => (sized(size).find(shot => shot.id === 'ref-4-shot') as { framing?: string }).framing;
        expect([framingOf('full'), framingOf('medium'), framingOf('wide'), framingOf(undefined), framingOf('close')])
            .toEqual(['full', 'wide', 'wide', 'wide', undefined]);
        expect(sized(undefined).filter(shot => shot.kind === 'talking').every(shot => !('framing' in shot))).toBe(true);
        expect(makeUgcInput.safeParse(compile({}, beats => { beats[3]!.gestures = [gesture('open_palms', 9)]; }).input).success).toBe(true);
    });
});
