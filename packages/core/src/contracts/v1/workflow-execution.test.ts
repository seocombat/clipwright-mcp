import { describe, expect, it } from 'vitest';
import { run } from '../../runs.js';
import { WORKFLOW_METHODS } from '../../workflows/catalog.js';
import { workflowCommandError, workflowLaunchResponse, workflowLaunchResponseRead } from './workflow-execution.js';
const digest = 'a'.repeat(64), now = '2026-10-15T00:00:00Z';
function response() {
  const descriptor = WORKFLOW_METHODS.find(method => method.id === 'ugc-faq-answer')!;
  return { receipt: { v: 1, account_id: 'acc_test', plan_id: 'wfp_test', revision: 1, content_digest: digest,
    method: { method_id: descriptor.id, version: 1, content_digest: descriptor.content_digest, capability_digest: digest },
    semantic_input_digest: digest, transport_request_digest: digest, run_id: 'run_test', skill: 'make_ugc', admitted_at: now },
    run: run.parse({ run_id: 'run_test', skill: 'make_ugc', state: 'queued', credits_reserved: 400, credits_charged: null,
      final_output: null, error: null, created_at: now, finished_at: null }) };
}
describe('workflow HTTP response composition', () => {
  it('composes the receipt with the existing native Run and refuses a mismatched run ID', () => {
    const value = response();
    expect(workflowLaunchResponse.parse(value)).toEqual(value);
    expect(workflowLaunchResponse.safeParse({ ...value, injected: true }).success).toBe(false);
    expect(workflowLaunchResponse.safeParse({ ...value, run: { ...value.run, run_id: 'run_other' } }).success).toBe(false);
  });
  it('keeps the read projection compatible with additive fields and future receipt version/skill', () => {
    const value = response();
    expect(workflowLaunchResponseRead.parse({ ...value, future: true, receipt: { ...value.receipt, v: 2, skill: 'future_skill', future: true },
      run: { ...value.run, skill: 'future_skill', state: 'future_stage', future: true } }))
      .toMatchObject({ receipt: { v: 2, skill: 'future_skill' }, run: { run_id: 'run_test', skill: 'future_skill', state: 'future_stage' } });
  });
  it.each(['run_id', 'skill'] as const)('refuses a paid read response whose receipt identifies another native %s', field => {
    const value = response();
    const changed = { ...value, run: { ...value.run, [field]: field === 'run_id' ? 'run_other' : 'make_faceless' } };
    expect(workflowLaunchResponseRead.safeParse(changed).success).toBe(false);
  });
  it('carries structured readiness issues in the shared generic error envelope', () => {
    expect(workflowCommandError.parse({ error: { code: 'workflow_not_ready', message: 'Approval is required.',
      issues: [{ kind: 'approval_required', path: '', message: 'Approve the current revision first.' }], warnings: [] } }).error.code).toBe('workflow_not_ready');
  });
});
