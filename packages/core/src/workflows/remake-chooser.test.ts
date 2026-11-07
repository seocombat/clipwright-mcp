import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeUgcInput } from '../skills.js';
import { compileReferenceRemake, type CapabilityProfile, type RemakeChoice, type RemakeChooser } from './index.js';
import { preferChosen } from './remake-chooser.js';
import { beatCue, REMAKE_SLOT_OF } from './remake-motion.js';

// The injected chooser (#1121): the server may pick among looks the remake adds of its own; silent, the compiler's own choices stand.

const PROFILE = JSON.parse(readFileSync(new URL('../fixtures/reference-profile-reel.json', import.meta.url), 'utf8'));
const SCRIPT = 'Every missed call is a lost deal. Your receptionist sleeps, takes breaks, and sometimes gets annoyed. This one doesn\'t. ' +
    'It answers calls all day, works around the clock, and never gets annoyed. Here\'s a real one: a customer calls at two in the morning to book ' +
    'a cleaning, and it handles everything, the time, the price, the confirmation text. Small businesses miss a third of their calls. Not anymore. ' +
    'Set it up in ten minutes and stop losing deals while you sleep.';
const DFFT_SCRIPT = 'I kept remaking the same kind of product video for every client. Building each one by hand meant hours in the editor, cut by cut. ' +
    'Then I tried Clipwright. You hand your agent a reel that works and a short script. It breaks the reel down into beats, inserts and timing. ' +
    'Then it renders a new presenter video in that same style. I still choose the presenter, the voice and the hook. One prompt replaced an afternoon of editing. ' +
    'Ask Claude for a video like this one, and try it free at clipwright.io.';
const SHOTS =['4a7cb993', 'd81a783f', 'e5017468', 'f7ebef77'].map(hex => ({ asset_id: `ast_${hex.repeat(4)}`, media_type: 'image' }));
const capabilities: CapabilityProfile = { v: 1, content_digest: 'c'.repeat(64), executors: [{ skill: 'make_ugc', configured: true, qualified: true,
    enabled: true, profiles: ['ugc-native-v1'], features: ['exact_script', 'actor', 'voice', 'long_form'], formats: [{ aspect_ratio: '9:16', resolution: '1080p' }],
    field_dispositions: { captions: 'implemented', caption_style: 'implemented', templates: 'implemented', shots: 'implemented', edit_sounds: 'implemented',
        presenter_framing: 'implemented', caption_position: 'implemented' } }] };

function compile(choose?: RemakeChooser, extra: Record<string, unknown> = {}, edit: (beats: { presenter_behaviour: string; graphics: unknown[] }[]) => void = () => {}) {
    const profile = structuredClone(PROFILE);
    edit(profile.beats);
    const result = compileReferenceRemake({ reference_profile: profile, script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah', assets: SHOTS, ...extra },
        capabilities, undefined, choose);
    if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
    return result.document;
}
const inputOf = (document: ReturnType<typeof compile>) => (document.brief.native as { input: Record<string, unknown> }).input;
const transitions = (document: ReturnType<typeof compile>) => (inputOf(document).inserts as { id: string; transition?: string }[]).map(item => [item.id, item.transition]);

describe('preferChosen', () => {
    it('puts the pick first, and leaves the options alone when the chooser is silent, names another look or has nothing to choose', () => {
        const at = { slot: 'insert_transition' as const, beat: 2 };
        expect(preferChosen(['wipe', 'light_leak', 'zoom'], at, () => 'zoom')).toEqual(['zoom', 'wipe', 'light_leak']);
        expect(preferChosen(['wipe', 'light_leak'], at, () => undefined)).toEqual(['wipe', 'light_leak']);
        expect(preferChosen(['wipe', 'light_leak'], at, () => 'glitch')).toEqual(['wipe', 'light_leak']);
        let asked = false;
        expect(preferChosen(['wipe'], at, () => { asked = true; return 'wipe'; })).toEqual(['wipe']);
        expect(asked).toBe(false);
    });
});

describe('a remake with an injected chooser (#1121)', () => {
    it('keeps the compiler\'s own plan without a chooser, or with a silent one or one naming a look it cannot draw', () => {
        const own = JSON.stringify(compile());
        expect(JSON.stringify(compile(() => undefined))).toBe(own);
        expect(JSON.stringify(compile(() => 'glitch'))).toBe(own);
    });

    it('draws the chooser\'s pick for the director\'s own transitions, and tells it the beat\'s role, cue and options', () => {
        const asked: RemakeChoice[] = [];
        // The second look offered: the compiler's own pick is the first, so the plan must change.
        const second: RemakeChooser = choice => { asked.push(choice); return choice.options[1]; };
        const own = transitions(compile()), chosen = compile(second);
        expect(asked.length).toBeGreaterThan(0);
        const first = asked[0]!;
        expect(first).toMatchObject({ slot: 'insert_transition', role: PROFILE.beats[first.beat].role });
        for (const choice of asked) expect(choice.cue).toBe(beatCue(PROFILE.beats[choice.beat]));
        // A beat whose reference names its transition passes that name on.
        const cued: RemakeChoice[] = [];
        compile(choice => { cued.push(choice); return undefined; }, {}, beats => { (beats[first.beat] as { transition_device?: string }).transition_device = 'whip'; });
        expect(cued.find(choice => choice.beat === first.beat)).toMatchObject({ cue: 'whip' });
        expect(own).toContainEqual([expect.any(String), first.options[0]]);
        expect(transitions(chosen)).not.toEqual(own);
        expect(transitions(chosen)).toContainEqual([expect.any(String), first.options[1]]);
        expect(makeUgcInput.safeParse(inputOf(chosen)).success).toBe(true);
    });

    it('names the surface that draws each beat: a picture asks for an insert cut, a full-frame card for a card cut', () => {
        const dfft = JSON.parse(readFileSync(new URL('../fixtures/reference-profile-dfft.json', import.meta.url), 'utf8'));
        const asked: RemakeChoice[] = [];
        const result = compileReferenceRemake({ reference_profile: dfft, script: DFFT_SCRIPT, actor_id: 'actor_marcus', voice: 'george', site: 'clipwright.io',
            assets: SHOTS }, capabilities, undefined, choice => { asked.push(choice); return undefined; });
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        const input = (result.document.brief.native as { input: { inserts: { id: string; transition?: string }[];
            templates: { id: string; placement?: string; transition?: string }[] } }).input;
        const surfaces = { insert_transition: input.inserts, full_frame_transition: input.templates.filter(item => item.placement === 'full') };
        expect(new Set(asked.map(choice => choice.slot))).toEqual(new Set(['insert_transition', 'full_frame_transition']));
        for (const choice of asked) {
            const drawn = surfaces[choice.slot as keyof typeof surfaces].filter(item => item.id.startsWith(`ref-${choice.beat + 1}-`));
            expect(drawn.some(item => item.transition !== undefined && choice.options.includes(item.transition)), JSON.stringify(choice)).toBe(true);
        }
    });

    it('asks for a presenter cut where the presenter fills the beat, and maps every owner to its own surface', () => {
        const asked: RemakeChoice[] = [];
        // Beat 6 of the reel has the presenter alone; a whip into it that nothing draws asks for a cut of ours there.
        compile(choice => { asked.push(choice); return undefined; }, { assets: [] }, beats => {
            Object.assign(beats[5]!, { transition_in: 'other', transition_device: 'whip' });
        });
        expect(asked.filter(choice => choice.beat === 5)).toEqual([{ slot: 'presenter_cut', beat: 5, role: 'demo', cue: 'whip', options: ['punch', 'light_leak'] }]);
        expect(REMAKE_SLOT_OF).toEqual({ picture: 'insert_transition', clip: 'insert_transition', card: 'full_frame_transition', presenter: 'presenter_cut' });
    });

    it('lets the chooser cut a live hook shot under a light leak instead of a flash, and names it', () => {
        const hooked = (beats: { presenter_behaviour: string; graphics: unknown[] }[]) => { beats[0]!.presenter_behaviour = 'speaking'; beats[0]!.graphics = []; };
        const asked: RemakeChoice[] = [];
        const leak: RemakeChooser = choice => { asked.push(choice); return choice.slot === 'live_shot_transition' ? 'light_leak' : undefined; };
        const document = compile(leak, { live_shots: true }, hooked);
        const shots = inputOf(document).shots as { id: string; transition?: string }[];
        expect(shots.find(shot => shot.id === 'ref-1-shot')).toMatchObject({ transition: 'light_leak' });
        expect((document.brief.added ?? []).join(' ')).toContain('a light leak on the cuts into and out of the hook\'s live shot (beat 1)');
        expect(asked.find(choice => choice.slot === 'live_shot_transition')).toMatchObject({ beat: 0, role: 'hook', options: ['flash', 'light_leak'] });
        const plain = inputOf(compile(undefined, { live_shots: true }, hooked)).shots as { id: string; transition?: string }[];
        expect(plain.find(shot => shot.id === 'ref-1-shot')).toMatchObject({ transition: 'flash' });
        expect(makeUgcInput.safeParse(inputOf(document)).success).toBe(true);
        // add_moves false: none of ours, whatever the chooser says.
        const off = inputOf(compile(leak, { live_shots: true, add_moves: false }, hooked)).shots as { id: string; transition?: string }[];
        expect(off.some(shot => 'transition' in shot)).toBe(false);
    });

    it('reads a beat\'s cue from its named device first, then its plain transition, then its camera', () => {
        const beat = { transition_in: 'none', camera: 'static' } as Parameters<typeof beatCue>[0];
        expect(beatCue(beat)).toBeUndefined();
        expect(beatCue({ ...beat, transition_in: 'other', camera: 'other' })).toBeUndefined();
        expect(beatCue({ ...beat, camera: 'punch_in' })).toBe('punch_in');
        expect(beatCue({ ...beat, camera: 'punch_in', camera_device: 'whip_pan' })).toBe('whip_pan');
        expect(beatCue({ ...beat, transition_in: 'wipe', camera_device: 'whip_pan' })).toBe('wipe');
        expect(beatCue({ ...beat, transition_in: 'wipe', transition_device: 'light_leak' })).toBe('light_leak');
    });
});
