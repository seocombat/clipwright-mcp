import { describe, expect, it } from 'vitest';
import {
    workflowBrief, workflowBriefRead, WorkflowBriefDto, workflowPlanDocument,
    saveWorkflowPlan, approveWorkflowPlan, launchWorkflow, workflowReceiptRead, workflowQuoteBinding, workflowQuoteBindingRead,
} from './index.js';

const digest = 'a'.repeat(64);
const pin = { method_id: 'ugc-faq-answer', version: 1, content_digest: digest, capability_digest: digest };
const brief = { audience: 'New users', message: 'Explain export', script: '  Export your MP4.\n', question: 'Can I export?',
    native: { skill: 'make_ugc', input: { script: '  Export your MP4.\n', actor_id: 'actor_male' } } };

describe('workflow write and read boundaries', () => {
    it('reads additive and future workflow quotes without accepting them as writes', () => {
        const quote = { v: 1, quote_id: 'wq_123', plan_id: 'wfp_123', revision: 1, content_digest: digest, method: { ...pin, method_id: 'future-method', future: true },
            semantic_input_digest: 'b'.repeat(64), expires_at: '2026-10-14T12:00:00Z', future: true,
            native_quote: { skill: 'future_executor', quote: { quoted_credits: 700 }, future: true } };
        expect(workflowQuoteBindingRead.parse(quote).native_quote.skill).toBe('future_executor');
        expect(workflowQuoteBinding.safeParse(quote).success).toBe(false);
        const known = { ...quote, native_quote: { skill: 'make_faceless', quote: { outputFrames: 750, baseCredits: 200, openerCredits: 150, totalCredits: 350, tariffId: 'future-tariff', captions: true, skill: 'make_faceless', warnings: [], contract_version: 'future', extra: true } } };
        expect(workflowQuoteBindingRead.parse(known).native_quote.skill).toBe('make_faceless');
        expect(workflowQuoteBindingRead.safeParse({ ...known, native_quote: { skill: 'make_faceless', quote: { ...known.native_quote.quote, totalCredits: -1 } } }).success).toBe(false);
    });
    it('preserves exact submitted script in schema and thin DTO', () => {
        expect(workflowBrief.parse(brief).script).toBe('  Export your MP4.\n');
        expect(WorkflowBriefDto.parse(brief).value.script).toBe('  Export your MP4.\n');
        expect(() => WorkflowBriefDto.parse({ ...brief, unknown: 1 })).toThrow();
    });
    it('refuses unknown writes at root and nested native boundaries', () => {
        expect(workflowBrief.safeParse({ ...brief, surprise: true }).success).toBe(false);
        expect(workflowBrief.safeParse({ ...brief, native: { ...brief.native, injected: true } }).success).toBe(false);
        expect(workflowBrief.safeParse({ ...brief, native: { skill: 'make_ugc', input: { script: 'hello', unknown: true } } }).success).toBe(false);
    });
    it('refuses unknown nested native segment and motion fields', () => {
        const segmented = { ...brief, native: { skill: 'make_ugc', input: { segments: [{ kind: 'actor', script: 'hello', injected: true }] } } };
        expect(workflowBrief.safeParse(segmented).success).toBe(false);
        const motion = { ...brief, native: { skill: 'make_ugc', input: { segments: [{ kind: 'actor', script: 'hello' },
            { kind: 'media', media_url: 'https://example.com/image.png', media_type: 'image', duration_seconds: 2, image_motion: { direction: 'in', amount: 0.1, injected: true } }] } } };
        expect(workflowBrief.safeParse(motion).success).toBe(false);
    });
    it('uses native actor and voice conflicts and faceless validation', () => {
        expect(workflowBrief.safeParse({ ...brief, native: { skill: 'make_ugc', input: { script: 'hello', actor_id: 'actor_male', image: 'https://example.com/actor.png' } } }).success).toBe(false);
        expect(workflowBrief.safeParse({ ...brief, native: { skill: 'make_ugc', input: { script: 'hello', voice: 'sarah', voice_id: 'abcdefghijklmnop' } } }).success).toBe(false);
        expect(workflowBrief.safeParse({ ...brief, native: { skill: 'make_faceless', input: { input_mode: 'script', script: 'hello', duration_seconds: 20 } } }).success).toBe(false);
    });
    it('permits brief-only planning but refuses empty scripts and oversized writes', () => {
        expect(workflowBrief.safeParse({ audience: 'Users', message: 'Teach export' }).success).toBe(true);
        expect(workflowBrief.safeParse({ ...brief, script: ' \n ' }).success).toBe(false);
        expect(workflowBrief.safeParse({ ...brief, required_terms: Array.from({ length: 101 }, () => 'term') }).success).toBe(false);
    });
    it('reads additive fields and a future executor without treating them as accepted writes', () => {
        const read = { ...brief, future: 1, native: { skill: 'future_executor', input: { future_param: 1 } } };
        expect(workflowBriefRead.parse(read).native?.skill).toBe('future_executor');
        expect(workflowBrief.safeParse(read).success).toBe(false);
    });
    it('binds save and approval to an exact revision and digest', () => {
        const document = { v: 1, method: pin, brief, beats: [{ id: 'answer', role: 'answer', anchor: { quote: 'Export your MP4' }, required: false }], claims: [], assets: [] };
        expect(workflowPlanDocument.safeParse(document).success).toBe(true);
        expect(saveWorkflowPlan.safeParse({ base_version: 0, document }).success).toBe(true);
        expect(saveWorkflowPlan.safeParse({ base_version: -1, document }).success).toBe(false);
        expect(approveWorkflowPlan.safeParse({ revision: 1, content_digest: digest }).success).toBe(true);
        expect(approveWorkflowPlan.safeParse({ revision: 0, content_digest: digest }).success).toBe(false);
        expect(approveWorkflowPlan.safeParse({ revision: 1, content_digest: 'label' }).success).toBe(false);
        expect(workflowPlanDocument.safeParse({ ...document, beats: [document.beats[0], document.beats[0]] }).success).toBe(false);
    });
    it('refuses a document whose individually bounded fields exceed the document byte cap', () => {
        const claims = Array.from({ length: 100 }, (_, i) => ({ id: `claim-${i}`, text: 'x'.repeat(4000), required: false, status: 'supplied', source: { kind: 'owner', reference: 'Owner facts' } }));
        expect(workflowPlanDocument.safeParse({ v: 1, method: pin, brief, beats: [], claims, assets: [] }).success).toBe(false);
    });
    it('keeps semantic input identity separate from transport request identity', () => {
        const launch = { revision: 1, content_digest: digest, semantic_input_digest: 'b'.repeat(64), quote_id: 'wq_123', idempotency_key: 'wf-start' };
        expect(launchWorkflow.safeParse(launch).success).toBe(true);
        expect(launchWorkflow.safeParse({ ...launch, transport_request_digest: digest }).success).toBe(false);
        expect(launchWorkflow.safeParse({ ...launch, idempotency_key: '' }).success).toBe(false);
        const receipt = { v: 1, account_id: 'account-a', plan_id: 'wfp_123', revision: 1, content_digest: digest, method: pin,
            semantic_input_digest: 'b'.repeat(64), transport_request_digest: 'c'.repeat(64), run_id: 'run_123', skill: 'future_executor', admitted_at: '2026-10-14T12:00:00Z', future: true };
        expect(workflowReceiptRead.parse(receipt).run_id).toBe('run_123');
        expect(workflowReceiptRead.parse(receipt).transport_request_digest).toBe('c'.repeat(64));
    });
});
