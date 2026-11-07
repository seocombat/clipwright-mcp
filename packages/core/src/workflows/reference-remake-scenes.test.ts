import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeUgcInput } from '../skills.js';
import { compileReferenceRemake, referenceProfileWarnings, workflowPlanDocument, type CapabilityProfile, type WorkflowPlanDocument } from './index.js';
import { sceneBriefOf } from './reference-remake.js';

// A graphic no library kind draws becomes a scene made for the run (#1107): the plan asks for it, records it as a scene and drops its gap.

const PROFILE = JSON.parse(readFileSync(new URL('../fixtures/reference-profile-reel.json', import.meta.url), 'utf8'));
const SCRIPT = 'Every missed call is a lost deal. Your receptionist sleeps, takes breaks, and sometimes gets annoyed. This one doesn\'t. ' +
    'It answers calls all day, works around the clock, and never gets annoyed. Here\'s a real one: a customer calls at two in the morning to book ' +
    'a cleaning, and it handles everything, the time, the price, the confirmation text. Small businesses miss a third of their calls. Not anymore. ' +
    'Set it up in ten minutes and stop losing deals while you sleep.';
const STICKER = { kind: 'unmapped', source_kind: 'other', position: 'top_right', device: 'sticker', label_hint: 'Purple sticker \'VIRALEX\' with a rocket',
    state_changes: [{ at_frac: 0.1, change: 'appears' }, { at_frac: 0.6, change: 'highlighted' }] };
const capabilities = (scenes: 'implemented' | 'rejected'): CapabilityProfile => ({ v: 1, content_digest: 'c'.repeat(64), executors: [{ skill: 'make_ugc',
    configured: true, qualified: true, enabled: true, profiles: ['ugc-native-v1'], features: ['exact_script', 'actor', 'voice', 'long_form'],
    formats: [{ aspect_ratio: '9:16', resolution: '1080p' }], field_dispositions: { captions: 'implemented', caption_style: 'implemented', templates: 'implemented', scenes } }] });

function compile(scenes: 'implemented' | 'rejected', graphic: Record<string, unknown> = STICKER, site?: string): WorkflowPlanDocument {
    const profile = structuredClone(PROFILE);
    profile.beats[5].graphics = [graphic];
    profile.unmapped.push({ what: 'sticker', beat_index: 5, suggested_substitute: 'a title_card with its label, or leave it out' });
    const result = compileReferenceRemake({ reference_profile: profile, script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah', ...(site ? { site } : {}) },
        capabilities(scenes));
    if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
    return result.document;
}
const input = (document: WorkflowPlanDocument) => (document.brief.native as { input: Record<string, unknown> }).input;

describe('a remake draws a graphic no kind covers as a scene (#1107)', () => {
    it('asks for a scene on the beat, records the graphic as a scene and drops its gap, so no warning names it', () => {
        const document = compile('implemented');
        const scenes = input(document).scenes as { id: string; placement: string; brief: string; text?: string }[];
        expect(scenes).toHaveLength(1);
        expect(scenes[0]).toMatchObject({ id: 'ref-6-scene', placement: 'over' });
        expect(scenes[0]!.brief).toMatch(/^a sticker-style badge \(sticker with a rocket\), at the top right of the frame; it appears, then highlighted; for the demo beat$/);
        // The reference's words and colours stay out of the brief and the text; the text is the beat's own words.
        expect(JSON.stringify(scenes)).not.toMatch(/viralex|purple/i);
        expect(SCRIPT).toContain(scenes[0]!.text!);
        expect(makeUgcInput.safeParse(input(document)).success).toBe(true);
        expect(workflowPlanDocument.safeParse(document).success).toBe(true);
        const saved = document.brief.reference_profile!;
        expect(saved.beats[5]!.graphics[0]!.kind).toBe('scene');
        expect(saved.unmapped.filter(entry => entry.beat_index === 5 && entry.what === 'sticker')).toEqual([]);
        expect(referenceProfileWarnings(saved).some(line => line.includes('sticker'))).toBe(false);
        // The analyser's other gaps stay.
        expect(saved.unmapped.map(entry => entry.what)).toContain('particles');
    });

    it('without scenes on the server keeps the graphic a gap, and the plan asks for no scene', () => {
        const document = compile('rejected');
        expect(input(document)).not.toHaveProperty('scenes');
        expect(document.brief.reference_profile!.beats[5]!.graphics[0]!.kind).toBe('unmapped');
        expect(referenceProfileWarnings(document.brief.reference_profile).some(line => line.includes('sticker is not reproduced'))).toBe(true);
    });

    it('a device a scene cannot draw stays a gap', () => {
        const document = compile('implemented', { ...STICKER, device: 'footage' });
        expect(input(document)).not.toHaveProperty('scenes');
        expect(document.brief.reference_profile!.beats[5]!.graphics[0]!.kind).toBe('unmapped');
    });

    it('a site label shows the client\'s site, and a stroke marks it from under the words', () => {
        const pen = { ...STICKER, device: 'highlight', label_hint: 'Pen stroke under the site \'viralex.io\'' };
        expect(sceneBriefOf(pen as never, false, 'clipwright.io', 'Every missed call')).toEqual({
            brief: 'a pen stroke under the key words (Pen stroke under the site), at the top right of the frame; it appears, then highlighted', text: 'clipwright.io' });
        expect(sceneBriefOf({ ...STICKER, device: 'icon' } as never, false, undefined, 'Every missed call')).not.toHaveProperty('text');
        // Every quoting style leaves its words out, and an apostrophe inside a word keeps the word.
        for (const quoted of ['"VIRALEX"', '“VIRALEX”', '‘VIRALEX’', '«VIRALEX»', '„VIRALEX“', '\'VIRALEX\'']) {
            const made = sceneBriefOf({ ...STICKER, label_hint: `Sticker ${quoted} with the creator's rocket` } as never, false, undefined, 'w')!;
            expect(made.brief).toMatch(/^a sticker-style badge \(Sticker with the creator's rocket\),/);
        }
        expect(sceneBriefOf({ ...STICKER, device: 'other', label_hint: '' } as never, false, undefined, 'w')).toBeUndefined();
        // The beat's role closes the brief (#1121); a beat of no named role adds nothing.
        expect(sceneBriefOf({ ...STICKER, device: 'icon' } as never, false, undefined, 'w', 'before_after')!.brief).toMatch(/; for the before after beat$/);
        expect(sceneBriefOf({ ...STICKER, device: 'icon' } as never, false, undefined, 'w', 'other')!.brief).not.toMatch(/beat$/);
    });
});
