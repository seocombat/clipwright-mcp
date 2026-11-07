import { describe, expect, it } from 'vitest';
import { planNext, quoteNext } from './workflow-next.js';

const digest = 'a'.repeat(64);
const plan = (status: string) => ({ plan_id: 'wfp_1', status, revision: 3, content_digest: digest });

describe('planNext', () => {
    it('hands a draft the approve call with its revision and digest', () => {
        expect(planNext(plan('draft'))).toEqual({ action: 'approve', method: 'POST', path: '/v1/workflow-plans/wfp_1/approve',
            body: { revision: 3, content_digest: digest } });
    });

    it('hands an approved plan the bodiless quote call', () => {
        expect(planNext(plan('approved'))).toEqual({ action: 'quote', method: 'POST', path: '/v1/workflow-plans/wfp_1/quote', body: null });
    });

    it('hands a plan needing revalidation no call', () => {
        expect(planNext(plan('needs_revalidation'))).toBeNull();
    });

    it('hands any other status no call', () => {
        expect(planNext(plan('archived'))).toBeNull();
    });
});

describe('quoteNext', () => {
    it('puts the launch key in the header and the launch in the body', () => {
        const launch = { quote_id: 'wfq_1', revision: 3, content_digest: digest, semantic_input_digest: digest, idempotency_key: 'k-1' };
        const next = quoteNext({ plan_id: 'wfp_1', launch: launch as Parameters<typeof quoteNext>[0]['launch'] }).next;
        expect(next).toEqual({ action: 'run', method: 'POST', path: '/v1/workflow-plans/wfp_1/run',
            headers: { 'Idempotency-Key': 'k-1' }, body: launch });
    });
});
