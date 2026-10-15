import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { expect, it } from 'vitest';

it('loads the actual browser bundle without Node globals or crypto polyfills', () => {
    const output = buildSync({
        stdin: { contents: 'export * from "./workflows/index.ts"; export { isActorGenerationEnabled, isLongFormQualificationEnabled, contractFlagsFromEnv, EFFECTIVE_DISPOSITIONS } from "./contract-dispositions.ts";',
            resolveDir: fileURLToPath(new URL('..', import.meta.url)) }, bundle: true, platform: 'browser',
        format: 'iife', globalName: 'Workflows', write: false,
    });
    const sandbox = { URL, TextEncoder, structuredClone, Workflows: undefined as undefined | {
        queryWorkflowCatalog: (snapshot: unknown) => { methods: { availability: { status: string } }[] };
        workflowBrief: { parse: (brief: unknown) => { script: string } };
        isActorGenerationEnabled: () => boolean;
        isLongFormQualificationEnabled: () => boolean;
        contractFlagsFromEnv: () => { remoteFetch: boolean; compose: boolean; longForm: boolean };
        EFFECTIVE_DISPOSITIONS: { actor_id: { kind: string }; inserts: { kind: string } };
    } };
    runInNewContext(output.outputFiles[0]!.text, sandbox);
    const catalog = sandbox.Workflows!.queryWorkflowCatalog({ v: 1, content_digest: 'a'.repeat(64), executors: [] });
    expect(catalog.methods).toHaveLength(6);
    expect(catalog.methods.every(method => method.availability.status === 'execution_blocked')).toBe(true);
    expect(sandbox.Workflows!.workflowBrief.parse({ audience: 'Users', message: 'Teach export', script: '  Export MP4.\n' }).script).toBe('  Export MP4.\n');
    expect(sandbox.Workflows!.isActorGenerationEnabled()).toBe(false);
    expect(sandbox.Workflows!.isLongFormQualificationEnabled()).toBe(false);
    expect(sandbox.Workflows!.contractFlagsFromEnv()).toEqual({ remoteFetch: false, compose: false, longForm: false });
    expect(sandbox.Workflows!.EFFECTIVE_DISPOSITIONS.actor_id.kind).toBe('rejected');
    expect(sandbox.Workflows!.EFFECTIVE_DISPOSITIONS.inserts.kind).toBe('rejected');
});
