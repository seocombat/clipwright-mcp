import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeUgcInput } from '../skills.js';
import { compileReferenceRemake, type CapabilityProfile } from './index.js';

/** #1112: analyser devices a drawn kind covers compile into that kind, and the brief stops naming them undrawn. */

const PROFILE = JSON.parse(readFileSync(new URL('../fixtures/reference-profile-reel.json', import.meta.url), 'utf8'));
const SCRIPT = 'Every missed call is a lost deal. Your receptionist sleeps, takes breaks, and sometimes gets annoyed. This one doesn\'t. ' +
    'It answers calls all day, works around the clock, and never gets annoyed. Here\'s a real one: a customer calls at two in the morning to book ' +
    'a cleaning, and it handles everything, the time, the price, the confirmation text. Small businesses miss a third of their calls. Not anymore. ' +
    'Set it up in ten minutes and stop losing deals while you sleep.';
const CAPABILITIES: CapabilityProfile = { v: 1, content_digest: 'c'.repeat(64), executors: [{ skill: 'make_ugc', configured: true, qualified: true,
    enabled: true, profiles: ['ugc-native-v1'], features: ['exact_script', 'actor', 'voice', 'long_form'], formats: [{ aspect_ratio: '9:16', resolution: '1080p' }],
    field_dispositions: { captions: 'implemented', caption_style: 'implemented', templates: 'implemented' } }] };
const videos = (count: number) => Array.from({ length: count }, (_, at) => ({ asset_id: `ast_${String(at + 1).padStart(32, '0')}`, media_type: 'video' }));
type Graphic = { kind: string; source_kind: string; position: string; state_changes: unknown[]; label_hint: string; device?: string };
type Profile = { beats: { graphics: Graphic[] }[]; unmapped: { what: string; beat_index: number; suggested_substitute: string }[] };

function compile(edit: (profile: Profile) => void, extra: Record<string, unknown> = {}) {
    const profile = structuredClone(PROFILE) as Profile;
    edit(profile);
    const result = compileReferenceRemake({ reference_profile: profile, script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah', ...extra }, CAPABILITIES);
    if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
    const brief = result.document.brief;
    if (brief.native?.skill !== 'make_ugc') throw new Error('not a make_ugc plan');
    const input = brief.native.input as { templates?: { id: string; kind: string; data: Record<string, unknown> }[]; inserts?: { id: string }[];
        overlays?: { id: string }[] };
    expect(makeUgcInput.safeParse(input).success).toBe(true);
    return { input, notes: brief.reference_profile!.unmapped, beats: brief.reference_profile!.beats };
}
const on = (input: ReturnType<typeof compile>['input'], beat: number) => (input.templates ?? []).filter(item => item.id.startsWith(`ref-${beat + 1}-`));
/** An undrawn device on a beat, with the analyser's line for it, as the analysis writes them. */
const device = (profile: Profile, beat: number, name: string, position = 'full_screen') => {
    profile.beats[beat]!.graphics[0] = { kind: 'unmapped', source_kind: 'other', position, state_changes: [], label_hint: 'label', device: name };
    profile.unmapped = profile.unmapped.filter(entry => entry.beat_index !== beat)
        .concat({ what: name.replace(/_/g, ' '), beat_index: beat, suggested_substitute: 'a title_card with its label, or leave it out' });
};

describe('drawn kinds for the analyser\'s devices in a remake', () => {
    // Mutants: a chat screenshot left as an insert that needs an asset, or every screenshot drawn as a chat.
    it('draws a chat screenshot as a chat window and a terminal as a terminal; another screen stays media', () => {
        const { input } = compile(profile => {
            profile.beats[2]!.graphics[0]!.label_hint = 'ChatGPT conversation: a typed prompt and the assistant\'s answer';
            profile.beats[8]!.graphics[1]!.label_hint = 'a terminal window running a deploy command';
        });
        const chat = on(input, 2);
        expect(chat).toHaveLength(1);
        expect(chat[0]).toMatchObject({ kind: 'chat_window', placement: 'full', data: { prompt: expect.any(String), replies: expect.any(Array) } });
        expect((chat[0]!.data.replies as unknown[]).length).toBeGreaterThan(0);
        expect(on(input, 8).find(item => item.kind === 'terminal')).toMatchObject({ data: { command: expect.any(String), status: expect.any(String) } });
        expect(input.inserts ?? []).toEqual([]);

        const plain = compile(profile => { profile.beats[2]!.graphics[0]!.label_hint = 'a sales dashboard with a revenue chart'; });
        expect(on(plain.input, 2).some(item => item.kind === 'chat_window')).toBe(false);

        // Codex r2: a stored screenshot left unmapped, with no device, compiles too; its analyser line goes by the analyser's word.
        const stored = compile(profile => {
            profile.beats[2]!.graphics[0] = { kind: 'unmapped', source_kind: 'screenshot', position: 'full_screen', state_changes: [],
                label_hint: 'a chat with an AI assistant' };
            profile.unmapped = profile.unmapped.filter(entry => entry.beat_index !== 2)
                .concat({ what: 'screenshot', beat_index: 2, suggested_substitute: 'a title_card with its label, or leave it out' });
        });
        expect(on(stored.input, 2).map(item => item.kind)).toEqual(['chat_window']);
        expect(stored.notes.some(entry => entry.beat_index === 2 && entry.what === 'screenshot')).toBe(false);
        expect(stored.beats[2]!.graphics[0]!.kind).toBe('chat_window');
    });

    // Mutants: a collage left undrawn with three clips at hand, the analyser's "collage" line kept beside the grid, or a grid with one clip.
    it('draws a collage of clips as a video grid from the account\'s clips, and drops the line that called it undrawn', () => {
        const { input, notes, beats } = compile(profile => device(profile, 0, 'collage'), { assets: videos(4) });
        const grid = on(input, 0).find(item => item.kind === 'video_grid');
        expect(grid?.data).toMatchObject({ cell_1: { asset_id: videos(4)[0]!.asset_id }, cell_4: { asset_id: videos(4)[3]!.asset_id } });
        expect(notes.some(entry => entry.beat_index === 0 && entry.what === 'collage')).toBe(false);
        expect(beats[0]!.graphics[0]!.kind).toBe('video_grid');

        const short = compile(profile => device(profile, 0, 'collage'), { assets: videos(2) });
        expect(on(short.input, 0).some(item => item.kind === 'video_grid')).toBe(false);
        expect(short.notes.some(entry => entry.beat_index === 0 && entry.what === 'collage')).toBe(true);
        expect(short.notes.some(entry => entry.beat_index === 0 && entry.what.includes('needs three video clips'))).toBe(true);
    });

    // #1113. Mutants: a phone screenshot left as media or drawn as a chat, a clip at hand left off the phone, or states off the script's words.
    it('draws a phone screen recording as a phone screen with the account\'s clip on it, its phrases as states', () => {
        const phone = (profile: Profile) => {
            profile.beats[2]!.graphics[0] = { kind: 'unmapped', source_kind: 'screenshot', position: 'full_screen', state_changes: [],
                label_hint: 'an Instagram reel playing on a phone' };
            profile.unmapped = profile.unmapped.filter(entry => entry.beat_index !== 2)
                .concat({ what: 'screenshot', beat_index: 2, suggested_substitute: 'a title_card with its label, or leave it out' });
        };
        const { input, notes, beats } = compile(phone, { assets: videos(3) });
        const drawn = on(input, 2).find(item => item.kind === 'phone_screen');
        expect(drawn).toMatchObject({ placement: 'full' });
        expect(videos(3).map(clip => clip.asset_id)).toContain((drawn!.data.screen as { asset_id: string }).asset_id);
        // Beat 3 is one clause, "This one doesn't.": one state, not three single words.
        expect(drawn!.data.states).toEqual([{ state: 'play', text: 'This one doesn\'t' }]);
        expect(notes.some(entry => entry.beat_index === 2 && entry.what === 'screenshot')).toBe(false);
        expect(beats[2]!.graphics[0]!.kind).toBe('phone_screen');

        const bare = compile(phone);
        expect(on(bare.input, 2).find(item => item.kind === 'phone_screen')?.data).not.toHaveProperty('screen');
    });

    // #1113. Mutants: arrows left to a scene or undrawn, chips on the wrong side, or a chip whose words are not the script's.
    it('draws arrows as pointer chips on the arrow\'s side, each chip on its own words', () => {
        const { input, notes, beats } = compile(profile => device(profile, 4, 'arrow', 'bottom_left'));
        const chips = on(input, 4).find(item => item.kind === 'pointer_chips');
        expect(chips?.data.side).toBe('left');
        const items = chips!.data.items as { target: { x: number; y: number }; text: string; at: string }[];
        expect(items.length).toBeGreaterThan(0);
        expect(items.every(item => item.text.length <= 20 && SCRIPT.includes(item.at) && item.target.y >= 50)).toBe(true);
        expect(notes.some(entry => entry.beat_index === 4 && entry.what === 'arrow')).toBe(false);
        expect(beats[4]!.graphics[0]!.kind).toBe('pointer_chips');
        expect(on(compile(profile => device(profile, 4, 'arrow', 'top_right')).input, 4).find(item => item.kind === 'pointer_chips')?.data.side).toBe('right');
    });

    // Mutants: a corner text effect drawn full-frame, or a title whose words do not land in the script's order.
    it('draws a full-frame text effect as a word title on its own words, and leaves a corner one undrawn', () => {
        const { input, notes } = compile(profile => device(profile, 3, 'text_effect'));
        const title = on(input, 3).find(item => item.kind === 'word_title');
        const words = title?.data.words as { text: string; at: string }[];
        expect(words.length).toBeGreaterThan(2);
        expect(words.every(word => word.text.length <= 16 && SCRIPT.includes(word.at))).toBe(true);
        // Each entry's words come after the one before, as the run resolves them.
        const at = words.map(word => SCRIPT.indexOf(word.at, SCRIPT.indexOf(words[0]!.at)));
        expect(at).toEqual([...at].sort((left, right) => left - right));
        expect(notes.some(entry => entry.beat_index === 3 && entry.what === 'text effect')).toBe(false);

        // Codex r1: a title the run schema drops later leaves its device undrawn; the brief keeps the analyser's kind and line for it.
        const many = compile(profile => { for (const beat of [1, 3, 4, 5, 7, 9]) device(profile, beat, 'text_effect'); });
        for (const beat of [1, 3, 4, 5, 7, 9]) {
            const drawn = on(many.input, beat).some(item => item.kind === 'word_title');
            expect(many.beats[beat]!.graphics[0]!.kind).toBe(drawn ? 'word_title' : 'unmapped');
            expect(many.notes.some(entry => entry.beat_index === beat && entry.what === 'text effect')).toBe(!drawn);
        }
        expect([1, 3, 4, 5, 7, 9].filter(beat => !on(many.input, beat).some(item => item.kind === 'word_title')).length).toBeGreaterThan(0);

        // Codex r1: words too long for a title entry give a title card instead, and a title card does not draw the device.
        const long = Array.from({ length: 12 }, () => 'Supercalifragilisticexpialidocious, incomprehensibilities.').join(' ');
        const carded = compile(profile => device(profile, 3, 'text_effect'), { script: long });
        expect(on(carded.input, 3).map(item => item.kind)).toEqual(['title_card']);
        expect(carded.beats[3]!.graphics[0]!.kind).toBe('unmapped');
        expect(carded.notes.some(entry => entry.beat_index === 3 && entry.what === 'text effect')).toBe(true);

        const corner = compile(profile => device(profile, 3, 'text_effect', 'top_right'));
        expect(on(corner.input, 3).some(item => item.kind === 'word_title')).toBe(false);
        expect(corner.notes.some(entry => entry.beat_index === 3 && entry.what === 'text effect')).toBe(true);
    });
});
