import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { run } from '../../runs.js';
import { workflowAssetPlacementRead, workflowRunRead } from './workflow-run-read.js';

const digest = 'a'.repeat(64), now = '2026-10-16T00:00:00.000Z';
function response() {
    const { document } = JSON.parse(readFileSync(new URL('../../fixtures/workflows/faceless-explainer.json', import.meta.url), 'utf8'));
    return { ...run.parse({ run_id: 'run_read', skill: 'make_faceless', state: 'queued', credits_reserved: 350,
        credits_charged: null, error: null, final_output: null, created_at: now, finished_at: null }),
        state: 'queued' as string,
        workflow: { receipt: { v: 1, account_id: 'acc_read', plan_id: 'wfp_read', revision: 1, content_digest: digest,
            method: document.method, semantic_input_digest: digest, transport_request_digest: digest,
            run_id: 'run_read', skill: 'make_faceless', admitted_at: now }, approved_plan: document,
            state: 'queued', warnings: [], actual_output: null, asset_placements: null, beat_dispositions: [],
            validation_issues: [], creative_acceptance: 'not_reviewed' } };
}
it('keeps future workflow/read fields and enums compatible while the captured relationship remains coherent', () => {
    const value = response();
    value.state = value.workflow.state = 'future_stage'; value.skill = value.workflow.receipt.skill = 'future_skill';
    value.workflow.approved_plan.v = 2; value.workflow.receipt.v = 2;
    value.workflow.approved_plan.method = { ...value.workflow.approved_plan.method, method_id: 'future_method', future: true };
    value.workflow.receipt.method = value.workflow.approved_plan.method;
    value.workflow.creative_acceptance = 'future_review';
    expect(workflowRunRead.parse({ ...value, future: true, workflow: { ...value.workflow, future: true,
        validation_issues: [{ kind: 'future_issue', path: '', message: 'Future reason', future: true }],
        beat_dispositions: [{ beat_id: 'future_beat', disposition: 'future_disposition', future: true }] } }))
        .toMatchObject({ state: 'future_stage', workflow: { creative_acceptance: 'future_review',
            receipt: { skill: 'future_skill', v: 2 }, approved_plan: { v: 2, method: { method_id: 'future_method' } } } });
});
it.each(['run_id', 'skill', 'state', 'method'] as const)('refuses mismatched %s in an otherwise readable native outcome', field => {
    const value = response();
    if (field === 'method') value.workflow.approved_plan.method = { ...value.workflow.approved_plan.method, version: 99 };
    else if (field === 'state') value.workflow.state = 'succeeded';
    else value.workflow.receipt[field] = field === 'skill' ? 'make_ugc' : 'run_other';
    expect(workflowRunRead.safeParse(value).success).toBe(false);
});
it('continues to accept a native-only run without workflow metadata', () => {
    const { workflow: _, ...native } = response();
    expect(workflowRunRead.parse(native)).toEqual(native);
});
it('rejects impossible word/frame placement intervals but accepts a nearest-frame zero-width word interval', () => {
    const placement = { instance_id: 'first', asset_id: 'upl_example', source_digest: digest,
        first_word: 20, end_word: 23, shot_id: 'shot', start_frame: 167, end_frame: 192, normalized_sha256: digest, width: 1080, height: 1920 };
    expect(workflowAssetPlacementRead.safeParse({ ...placement, end_word: 20 }).success).toBe(false);
    expect(workflowAssetPlacementRead.safeParse({ ...placement, end_frame: 166 }).success).toBe(false);
    expect(workflowAssetPlacementRead.parse({ ...placement, end_frame: 167 })).toMatchObject({ start_frame: 167, end_frame: 167 });
});
