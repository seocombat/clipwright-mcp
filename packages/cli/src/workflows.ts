import { constants, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import type { Command } from 'commander';
import type { ClipwrightClient } from '@clipwright/sdk';
import { createWorkflowPlan, saveWorkflowPlan, approveWorkflowPlan, launchWorkflow, workflowPlanRead } from '@clipwright/core/workflows';

export class WorkflowFileError extends Error {
    constructor(message: string, cause?: unknown) { super(message, { cause }); this.name = 'WorkflowFileError'; }
}
const FILE_MAX_BYTES = 1_048_576;
function readFile(path: string): unknown {
    let fd: number | undefined;
    try {
        fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.size > FILE_MAX_BYTES) throw new Error(`expected a regular file of at most ${FILE_MAX_BYTES} bytes`);
        const buffer = Buffer.alloc(FILE_MAX_BYTES + 1); let used = 0;
        while (used < buffer.length) {
            const count = readSync(fd, buffer, used, buffer.length - used, null);
            if (count === 0) break;
            used += count;
        }
        if (used > FILE_MAX_BYTES) throw new Error(`file exceeds ${FILE_MAX_BYTES} bytes`);
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used))) as unknown;
    } catch (cause) {
        throw new WorkflowFileError(`${path}: cannot read workflow JSON. ${cause instanceof Error ? cause.message : String(cause)} Nothing was sent.`, cause);
    } finally { if (fd !== undefined) closeSync(fd); }
}
function saveInput(planId: string, raw: unknown) {
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && 'plan_id' in raw) {
        workflowPlanRead.parse(raw);
        const value = raw as Record<string, unknown>;
        if (value.plan_id !== planId) throw new WorkflowFileError('The file belongs to another plan. Nothing was sent.');
        return saveWorkflowPlan.parse({ base_version: value.revision, document: value.document });
    }
    return saveWorkflowPlan.parse(raw);
}
const print = (value: unknown): void => { console.log(JSON.stringify(value, null, 2)); };
export function registerWorkflowCommands(program: Command, client: () => ClipwrightClient): void {
    program.command('workflows').description('list workflow methods and current availability (free)')
        .action(async () => print(await client().listWorkflows()));
    program.command('workflow-show <method>').description('read one workflow method and its script rules (free)')
        .action(async (method: string) => print(await client().getWorkflow(method)));
    program.command('plan-create').description('create a workflow plan from a complete document (free; starts no run)')
        .requiredOption('--file <path>', 'JSON with document')
        .action(async (opts: { file: string }) => print(await client().createWorkflowPlan(createWorkflowPlan.parse(readFile(opts.file)))));
    program.command('plan-show <plan>').description('print the owned workflow plan and revision as JSON (free)')
        .action(async (plan: string) => print(await client().getWorkflowPlan(plan)));
    program.command('plan-save <plan>').description('save a workflow revision without approving or starting a run (free)')
        .requiredOption('--file <path>', 'JSON with base_version/document, or the complete plan-show output')
        .action(async (plan: string, opts: { file: string }) => print(await client().saveWorkflowPlan(plan, saveInput(plan, readFile(opts.file)))));
    program.command('plan-approve <plan>').description('explicitly approve the chosen workflow revision (free; starts no run)')
        .requiredOption('--file <path>', 'JSON with revision and content_digest')
        .action(async (plan: string, opts: { file: string }) => print(await client().approveWorkflowPlan(plan, approveWorkflowPlan.parse(readFile(opts.file)))));
    program.command('plan-quote <plan>').description('quote the approved workflow revision without spending credits')
        .action(async (plan: string) => print(await client().quoteWorkflowPlan(plan)));
    program.command('plan-run <plan>').description('start one paid workflow run with an explicit original idempotency key; returns immediately')
        .requiredOption('--file <path>', 'exact launch JSON: revision, content_digest, semantic_input_digest, quote_id, idempotency_key')
        .action(async (plan: string, opts: { file: string }) => print(await client().runWorkflowPlan(plan, launchWorkflow.parse(readFile(opts.file)))));
}
