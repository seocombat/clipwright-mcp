import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileReferenceRemake, planReferenceRemake, workflowPlanDocument, type CapabilityProfile } from './index.js';

/** The reference reel's fused profile with every word of its speech and labels replaced (C6). */
const PROFILE = JSON.parse(readFileSync(new URL('../fixtures/reference-profile-reel.json', import.meta.url), 'utf8'));
const SCRIPT = 'Every missed call is a lost deal. Your receptionist sleeps, takes breaks, and sometimes gets annoyed. This one does not. ' +
    'Set it up in ten minutes and stop losing deals while you sleep.';
const capabilities: CapabilityProfile = { v: 1, content_digest: 'c'.repeat(64), executors: [{ skill: 'make_ugc', configured: true, qualified: true, enabled: true,
    profiles: ['ugc-native-v1'], features: ['exact_script', 'actor', 'voice'], formats: [{ aspect_ratio: '9:16', resolution: '1080p' }],
    field_dispositions: { captions: 'implemented', caption_style: 'implemented', templates: 'implemented' } }] };
const base = { script: SCRIPT, actor_id: 'actor_marcus', voice: 'sarah' };
const paths = (input: unknown) => planReferenceRemake.safeParse(input).error?.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) ?? [];

describe('plan_reference_remake revises a plan (#921)', () => {
    /** Mutant: a revision recompiles from the plan's stored copy, stripped of words, and drifts from a fresh compile. */
    it('requires the reference profile on a revision too', () => {
        expect(paths({ ...base, plan_id: 'wfp_a', base_version: 1 }).map(line => line.split(':')[0])).toEqual(['reference_profile']);
        expect(paths({ ...base, reference_profile: PROFILE, plan_id: 'wfp_a', base_version: 1 })).toEqual([]);
    });
    it('takes plan_id and base_version only together', () => {
        expect(paths({ ...base, reference_profile: PROFILE, plan_id: 'wfp_a' })).toEqual(['plan_id: plan_id and base_version must be supplied together']);
        expect(paths({ ...base, reference_profile: PROFILE, base_version: 1 })).toEqual(['plan_id: plan_id and base_version must be supplied together']);
    });
    it('bounds the notes of one call', () => {
        expect(paths({ ...base, reference_profile: PROFILE, review_notes: Array.from({ length: 51 }, () => 'shorter') })).toHaveLength(1);
        expect(paths({ ...base, reference_profile: PROFILE, review_notes: ['x'.repeat(2001)] })).toHaveLength(1);
    });
    it('keeps the notes in the brief', () => {
        const result = compileReferenceRemake({ ...base, reference_profile: PROFILE, review_notes: ['Open on the price'] }, capabilities);
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        expect(result.document.brief.review_notes).toEqual(['Open on the price']);
    });
    it('refuses more than 50 notes in a brief', () => {
        const result = compileReferenceRemake({ ...base, reference_profile: PROFILE }, capabilities);
        if (result.kind !== 'compiled') throw new Error(JSON.stringify(result.issues));
        const notes = Array.from({ length: 51 }, (_, at) => `note ${at}`);
        expect(workflowPlanDocument.safeParse({ ...result.document, brief: { ...result.document.brief, review_notes: notes } }).success).toBe(false);
        expect(workflowPlanDocument.safeParse({ ...result.document, brief: { ...result.document.brief, review_notes: notes.slice(1) } }).success).toBe(true);
    });
});
