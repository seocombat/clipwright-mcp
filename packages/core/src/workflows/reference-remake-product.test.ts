import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { negationIn, shotIssues } from '../generation-shot.js';
import { makeUgcInput, type UgcLiveShot } from '../skills.js';
import { compileReferenceRemake, demoShot, proportionalSpans, referenceScriptWords, type CapabilityProfile } from './index.js';

/** #1307/#1308 S2: the product in the actor's hand and the reference's demo as one live shot of using it (journey 09.11, steps 16–24). */

const PROFILE = JSON.parse(readFileSync(new URL('../fixtures/reference-profile-reel.json', import.meta.url), 'utf8'));
const SCRIPT = 'Every missed call is a lost deal. Your receptionist sleeps, takes breaks, and sometimes gets annoyed. This one doesn\'t. ' +
    'It answers calls all day, works around the clock, and never gets annoyed. Here\'s a real one: a customer calls at two in the morning to book ' +
    'a cleaning, and it handles everything, the time, the price, the confirmation text. Small businesses miss a third of their calls. Not anymore. ' +
    'Set it up in ten minutes and stop losing deals while you sleep.';
const JAR = `ast_${'8'.repeat(32)}`;
const capabilities: CapabilityProfile = { v: 1, content_digest: 'c'.repeat(64), executors: [{ skill: 'make_ugc', configured: true, qualified: true, enabled: true,
    profiles: ['ugc-native-v1'], features: ['exact_script', 'actor', 'voice', 'long_form'], formats: [{ aspect_ratio: '9:16', resolution: '1080p' }],
    field_dispositions: { captions: 'implemented', caption_style: 'implemented', templates: 'implemented', shots: 'implemented' } }] };
const DEMO = [{ action: 'Her fingertip dips into the jar once and lifts a dab of cream', end_state: 'A dab of cream sits on her fingertip' },
    { action: 'She presses the cream into her cheek in small circles until it sinks in', end_state: 'Her cheek has a soft sheen' }];
type Shot = UgcLiveShot & { anchor: { startWord: number; endWord: number } };
function compile(extra: Record<string, unknown>, edit: (beats: { gestures?: unknown[]; presenter_behaviour: string }[]) => void = () => {}) {
    const profile = structuredClone(PROFILE);
    edit(profile.beats);
    const result = compileReferenceRemake({ reference_profile: profile, script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah', ...extra }, capabilities);
    if (result.kind !== 'compiled') return { issues: result.issues };
    const native = result.document.brief.native;
    if (native?.skill !== 'make_ugc') throw new Error('not a make_ugc plan');
    return { input: native.input as Record<string, unknown> & { shots?: Shot[] }, notes: result.document.brief.reference_profile!.unmapped,
        added: result.document.brief.added ?? [], spans: proportionalSpans({ profile, words: referenceScriptWords(SCRIPT) }) };
}
const holding = (beats: { gestures?: unknown[] }[]) => { beats[1]!.gestures = [{ kind: 'hold_object', at_s: 5, label: 'holds a jar', frames_s: [5] }]; };

describe('the product in the actor\'s hand', () => {
    // Mutants: forget product_asset_id, leave an acting shot without the product, or keep "an object" on the hold gesture.
    it('puts the product image on the plan and in the hand of every acting live shot', () => {
        const { input } = compile({ live_shots: true, product: { asset_id: JAR, name: 'jar' } }, holding);
        expect(input!.product_asset_id).toBe(JAR);
        const acting = input!.shots!.filter(shot => shot.kind !== 'talking');
        expect(acting.length).toBeGreaterThan(0);
        for (const shot of acting) expect(shot.product).toEqual({ placement: 'hand' });
        expect(input!.shots!.find(shot => shot.id === 'ref-2-shot')).toMatchObject({ kind: 'talking_action',
            action: 'holds the jar up to the camera, its label toward the lens' });
        expect(makeUgcInput.safeParse(input).success).toBe(true);
    });

    // Codex r2. Mutant: every acting shot holds the product in hand whatever placement the request names.
    it('keeps the placement the request names, beside included, on every acting shot and in the demo clip', () => {
        const { input } = compile({ live_shots: true, product: { asset_id: JAR, name: 'jar', placement: 'beside', demo: DEMO } }, holding);
        const acting = input!.shots!.filter(shot => shot.kind !== 'talking');
        expect(acting.length).toBeGreaterThan(1);
        for (const shot of acting) expect(shot.product).toEqual({ placement: 'beside' });
        const demo = acting.find(shot => shot.shot)!.shot!;
        expect(demo.start_state).toBe('One jar stands beside the presenter within reach, its label to the camera');
        expect(demo.beats.at(-1)!.action).toBe('The presenter rests both hands beside the jar and smiles at the camera');
        expect(makeUgcInput.safeParse(input).success).toBe(true);
    });

    // Mutant: send product_asset_id with no shot showing it, which admission refuses.
    it('leaves product_asset_id out and says so when no live shot acts', () => {
        const { input, notes } = compile({ live_shots: false, product: { asset_id: JAR, name: 'jar', demo: DEMO } });
        expect(input!.product_asset_id).toBeUndefined();
        expect(input!.shots).toBeUndefined();
        expect(notes!.some(entry => entry.what.includes(JAR) && /no live shot/.test(entry.suggested_substitute))).toBe(true);
    });

    // Mutant: let a negation through to the clip model, which then draws the named thing.
    it('refuses demo words that describe what is absent', () => {
        const { issues } = compile({ product: { asset_id: JAR, name: 'jar', demo: [{ action: 'She does not drop the jar', end_state: 'The jar is in her hand' }] } });
        expect(issues).toEqual([expect.objectContaining({ path: 'product.demo.0.action', message: expect.stringContaining('"not"') })]);
        const cast = [{ asset_id: `ast_${'4'.repeat(32)}`, role: 'friend', action: 'She never looks at the camera' }];
        expect(compile({ cast, product: { asset_id: JAR, name: 'jar', demo: DEMO } }).issues)
            .toEqual([expect.objectContaining({ path: 'cast.0.action', message: expect.stringContaining('"never"') })]);
        const shot = { id: 'd', kind: 'action', action: 'uses the jar', anchor: { quote: 'Every' }, cast, shot: demoShot({ asset_id: JAR, placement: 'hand', name: 'jar', demo: DEMO }, 6) };
        expect(makeUgcInput.safeParse({ script: SCRIPT, shots: [shot] }).error?.issues.map(issue => issue.path.join('.'))).toEqual(['shots.0.cast.0.action']);
    });
});

describe('the reference\'s demo as one live shot', () => {
    // Mutants: two clips for two adjacent demo beats, a demo clip without the product or the shot, a shot whose beats leave seconds unowned.
    it('makes the adjacent demo beats one action shot that opens with the product in hand and ends on a hold', () => {
        const { input, spans, added } = compile({ product: { asset_id: JAR, name: 'jar', demo: DEMO } });
        const demo = input!.shots!.find(shot => shot.id === 'ref-5-shot')!;
        expect(input!.shots!.find(shot => shot.id === 'ref-6-shot')).toBeUndefined();
        expect(demo).toMatchObject({ kind: 'action', product: { placement: 'hand' }, anchor: { startWord: spans![4]!.start } });
        expect(demo.anchor.endWord).toBeGreaterThan(spans![5]!.start);
        const shot = demo.shot!;
        expect(shot.start_state).toBe('The presenter holds one jar in one hand at chest height, its label to the camera');
        expect(shot.subject.objects).toEqual([{ name: 'jar', count: 1, at_start: 'in one hand at chest height, its label to the camera' }]);
        expect(shot.beats.map(beat => beat.action)).toEqual([...DEMO.map(step => step.action),
            'The presenter holds the jar still at chest height, its label to the camera, and smiles']);
        expect(shot.continuity.end_state).toBe(shot.beats.at(-1)!.end_state);
        expect(shotIssues(shot, shot.beats.at(-1)!.to_s)).toEqual([]);
        expect(input!.product_asset_id).toBe(JAR);
        expect(added!.some(line => line.startsWith('the demo on beats 5–6'))).toBe(true);
        expect(makeUgcInput.safeParse(input).success).toBe(true);
    });

    // Codex r2. Mutant: size the clip at the fastest pace, so a demo of 46 words runs 23 s at the slowest and its last words go unnamed.
    it('covers only the words one clip holds at the slowest pace, cut at a sentence end, and names the rest', () => {
        const long = Array.from({ length: 15 }, (_, at) => `Line ${at + 1} puts one more short claim in here.`).join(' ');
        const profile = structuredClone(PROFILE);
        for (const at of [1, 2, 3, 4, 5]) { profile.beats[at].role = 'demo'; profile.beats[at].graphics = []; }
        const result = compileReferenceRemake({ reference_profile: profile, script: long, actor_id: 'actor_marcus', voice: 'sarah',
            product: { asset_id: JAR, name: 'jar', demo: DEMO } }, capabilities);
        if (result.kind !== 'compiled' || result.document.brief.native?.skill !== 'make_ugc') throw new Error(JSON.stringify(result));
        const spans = proportionalSpans({ profile, words: referenceScriptWords(long) });
        const demo = (result.document.brief.native.input.shots as Shot[]).find(shot => shot.shot)!;
        const group = spans[5]!.end - spans[1]!.start, covered = demo.anchor.endWord - demo.anchor.startWord;
        expect(demo.anchor.startWord).toBe(spans[1]!.start);
        expect(group).toBeGreaterThan(30);
        expect(group).toBeLessThanOrEqual(60);
        expect(covered).toBeLessThanOrEqual(30);
        expect(referenceScriptWords(long)[demo.anchor.endWord - 1]!.stop).toBe('sentence');
        expect(result.document.brief.reference_profile!.unmapped).toContainEqual(expect.objectContaining({ beat_index: 1,
            what: "the demo's words past one clip (15 s)", suggested_substitute: `the presenter's usual take on the last ${group - covered} words` }));
    });

    // Mutant: drop the demo silently when the product comes without its steps.
    it('names the demo it cannot show without the steps', () => {
        const { input, notes } = compile({ product: { asset_id: JAR, name: 'jar' } });
        expect(input!.shots?.some(shot => shot.kind === 'action' && shot.shot)).toBeFalsy();
        expect(notes!.some(entry => entry.beat_index === 4 && /product\.demo/.test(entry.suggested_substitute))).toBe(true);
    });
});

describe('demoShot', () => {
    const product = { asset_id: JAR, placement: 'hand' as const, name: 'jar', demo: DEMO };
    // Mutants: a beat over 5 s, a beat under 1 s, seconds left unowned, a negation in our own words.
    it.each([2, 3, 4, 7, 12, 15, 40])('owns every second of a %i s clip with beats of 1 to 5 s, in positive words', seconds => {
        const shot = demoShot(product, seconds);
        const length = shot.beats.at(-1)!.to_s;
        expect(shotIssues(shot, length)).toEqual([]);
        expect(length).toBe(Math.max(shot.beats.length, Math.min(seconds, shot.beats.length * 5)));
        const text = [shot.start_state, ...shot.subject.fixed, shot.continuity.end_state, ...shot.continuity.persistent, ...shot.beats.flatMap(beat => [beat.action, beat.end_state])];
        for (const line of text) expect(negationIn(line)).toBeNull();
    });

    const HOLD = 'The presenter holds the jar still at chest height, its label to the camera, and smiles';
    // Codex r1. Mutants: drop the hold of a one-step demo or of a short clip, or drop a step's action when merging.
    it('ends on the hold whenever the clip has a second for it, merging the steps when short', () => {
        expect(demoShot({ ...product, demo: [DEMO[0]!] }, 6).beats.map(beat => beat.action)).toEqual([DEMO[0]!.action, HOLD]);
        expect(demoShot(product, 2).beats.map(beat => beat.action)).toEqual([`${DEMO[0]!.action}, then ${DEMO[1]!.action}`, HOLD]);
        expect(demoShot({ ...product, demo: [...DEMO, { action: 'She smooths it up and out', end_state: 'Her face glows' }] }, 3).beats.map(beat => beat.action))
            .toEqual([`${DEMO[0]!.action}, then ${DEMO[1]!.action}, then She smooths it up and out`, HOLD]);
        expect(demoShot(product, 1).beats).toEqual([{ from_s: 0, to_s: 1, action: `${DEMO[0]!.action}, then ${DEMO[1]!.action}`, end_state: DEMO[1]!.end_state }]);
    });
});
