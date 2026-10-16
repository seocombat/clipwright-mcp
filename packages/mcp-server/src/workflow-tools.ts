import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ClipwrightClient } from '@clipwright/sdk';
import { workflowToolInputs, WORKFLOW_TOOL_DESCRIPTIONS } from '@clipwright/core/workflows';
import { formatGetRun, withFailureReport, type McpToolResponse } from './format.js';

const json = (value: unknown): McpToolResponse => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const config = <Name extends keyof typeof workflowToolInputs>(name: Name, title: string, readOnlyHint: boolean) => ({
    title, description: WORKFLOW_TOOL_DESCRIPTIONS[name], inputSchema: workflowToolInputs[name],
    annotations: { readOnlyHint, destructiveHint: false },
});
export function registerWorkflowTools(server: McpServer, client: ClipwrightClient): void {
    server.registerTool('list_workflows', config('list_workflows', 'List workflow methods', true),
        async () => withFailureReport(async () => json(await client.listWorkflows())));
    server.registerTool('get_workflow', config('get_workflow', 'Read a workflow method', true),
        async ({ method_id }) => withFailureReport(async () => json(await client.getWorkflow(method_id))));
    server.registerTool('prepare_workflow_plan', config('prepare_workflow_plan', 'Create or save a workflow plan', false),
        async ({ document, plan_id, base_version }) => withFailureReport(async () => json(plan_id === undefined
            ? await client.createWorkflowPlan({ document })
            : await client.saveWorkflowPlan(plan_id, { document, base_version: base_version! }))));
    server.registerTool('get_workflow_plan', config('get_workflow_plan', 'Read a workflow plan', true),
        async ({ plan_id }) => withFailureReport(async () => json(await client.getWorkflowPlan(plan_id))));
    server.registerTool('approve_workflow_plan', config('approve_workflow_plan', 'Approve a workflow revision', false),
        async ({ plan_id, ...approval }) => withFailureReport(async () => json(await client.approveWorkflowPlan(plan_id, approval))));
    server.registerTool('quote_workflow_plan', config('quote_workflow_plan', 'Quote a workflow run', true),
        async ({ plan_id }) => withFailureReport(async () => json(await client.quoteWorkflowPlan(plan_id))));
    server.registerTool('run_workflow_plan', config('run_workflow_plan', 'Start a paid workflow run', false),
        async ({ plan_id, ...request }) => withFailureReport(async () => {
            const launched = await client.runWorkflowPlan(plan_id, request);
            return formatGetRun(launched.run, launched.receipt);
        }));
}
