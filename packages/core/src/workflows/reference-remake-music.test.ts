import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MUSIC_BED_CREDITS } from '../music.js';
import { compileReferenceRemake, type CapabilityProfile } from './index.js';

/** #1063 S1: a reference with a music bed offers music with its price; asked and offered, the plan's video carries it and the gap is gone. */

const PROFILE = JSON.parse(readFileSync(new URL('../fixtures/reference-profile-reel.json', import.meta.url), 'utf8'));
const SCRIPT = 'Every missed call is a lost deal. Your receptionist sleeps, takes breaks, and sometimes gets annoyed. This one does not. ' +
    'It answers calls all day, works around the clock, and never gets annoyed.';
const capabilities = (music?: 'implemented' | 'rejected'): CapabilityProfile => ({ v: 1, content_digest: 'c'.repeat(64), executors: [{ skill: 'make_ugc',
    configured: true, qualified: true, enabled: true, profiles: ['ugc-native-v1'], features: ['exact_script', 'actor', 'voice'],
    formats: [{ aspect_ratio: '9:16', resolution: '1080p' }],
    field_dispositions: { captions: 'implemented', caption_style: 'implemented', templates: 'implemented', ...(music ? { music } : {}) } }] });
function plan(extra: Record<string, unknown>, music: 'implemented' | 'rejected' | undefined, withBed = true) {
    const profile = structuredClone(PROFILE);
    profile.beats[0].sounds = withBed ? [{ at_frac: 0, kind: 'music' }] : [];
    for (const beat of profile.beats.slice(1)) beat.sounds = beat.sounds.filter((sound: { kind: string }) => sound.kind !== 'music');
    const result = compileReferenceRemake({ reference_profile: profile, script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah', ...extra },
        capabilities(music));
    if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
    const brief = result.document.brief;
    if (brief.native?.skill !== 'make_ugc') throw new Error('not a make_ugc plan');
    return { input: brief.native.input as Record<string, unknown>, gaps: brief.reference_profile!.unmapped.filter(entry => entry.what.includes('music')),
        added: brief.added ?? [] };
}

describe('music in a reference remake', () => {
    // Mutant: the old "adds none yet" line, or an offer without the price.
    it('offers music with its price when the reference has a bed and the server offers it, and adds none unasked', () => {
        const { input, gaps } = plan({}, 'implemented');
        expect(input.music).toBeUndefined();
        expect(gaps).toHaveLength(1);
        expect(gaps[0]!.what).toBe('the music bed');
        expect(gaps[0]!.suggested_substitute).toContain(`${MUSIC_BED_CREDITS} credits`);
        expect(gaps[0]!.suggested_substitute).toContain('music: "auto"');
        expect(JSON.stringify(gaps)).not.toContain('adds none yet');
    });

    it('carries the asked music into the video and drops the gap', () => {
        const { input, gaps, added } = plan({ music: { mood: 'calm lo-fi' } }, 'implemented');
        expect(input.music).toEqual({ mood: 'calm lo-fi' });
        expect(gaps).toEqual([]);
        expect(added.join(' ')).toContain('music under the voice, as you asked; the reference has a music bed');
    });

    // Mutant: music passed to an executor that refuses it, whose quote would then 400.
    it('names music as unavailable on a server without it, asked or not, and never puts it in the video', () => {
        for (const music of ['rejected', undefined] as const) {
            const asked = plan({ music: 'auto' }, music), unasked = plan({}, music);
            expect(asked.input.music).toBeUndefined();
            // The bed keeps today's line word for word on such a server; asking where the reference has none names the server.
            expect(asked.gaps[0]!.suggested_substitute).toBe('no music; Clipwright adds none yet');
            expect(unasked.gaps[0]!.suggested_substitute).toBe('no music; Clipwright adds none yet');
            const bare = plan({ music: 'auto' }, music, false);
            expect(bare.input.music).toBeUndefined();
            expect(bare.gaps[0]!.suggested_substitute).toBe('no music: music is not available on this server');
        }
    });

    it('says nothing of music when the reference has none and none is asked', () => {
        expect(plan({}, 'implemented', false).gaps).toEqual([]);
        expect(plan({ music: 'auto' }, 'implemented', false).input.music).toBe('auto');
    });
});
