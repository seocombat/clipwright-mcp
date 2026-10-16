import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS, matchEndpoint } from './endpoints.js';

describe('workflow endpoint policy', () => {
  it('registers exactly eight workflow routes, with only native launch billed and private GET cabinet-readable', () => {
    const rows = API_ENDPOINTS.filter(row => row.path.includes('workflow'));
    expect(rows.map(row => [row.method, row.path, row.billed, row.jsonBody, row.cabinet])).toEqual([
      ['GET', '/v1/public/workflows', false, false, false],
      ['GET', '/v1/public/workflows/:id', false, false, false],
      ['POST', '/v1/workflow-plans', false, true, false],
      ['GET', '/v1/workflow-plans/:id', false, false, true],
      ['POST', '/v1/workflow-plans/:id/revisions', false, true, false],
      ['POST', '/v1/workflow-plans/:id/approve', false, true, false],
      ['POST', '/v1/workflow-plans/:id/quote', false, false, false],
      ['POST', '/v1/workflow-plans/:id/run', true, true, false],
    ]);
    expect(matchEndpoint('POST', '/v1/workflow-plans/wfp_test/run')?.billed).toBe(true);
    expect(rows.every(row => !row.onQuickstart)).toBe(true);
  });
});
