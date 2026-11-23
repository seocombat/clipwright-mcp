import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type AnySchema, normalizeObjectSchema, safeParseAsync } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export const INVALID_ARGUMENTS_NEXT_ACTION = "Fix the named fields and call again; this call spent nothing.";
const ROOT_PATH = "input";

export interface ArgumentField { path: string; message: string }
export interface InvalidArgumentsReport {
  status: "FAILED"; code: "invalid_arguments"; retryable: false; message: string; fields: ArgumentField[]; next_action: string;
}

interface Issue { code?: string; path?: readonly PropertyKey[]; keys?: readonly string[]; errors?: readonly (readonly Issue[])[]; message: string }

function issueFields(issue: Issue, base: readonly string[]): ArgumentField[] {
  const at = [...base, ...(issue.path ?? []).map(String)];
  if (issue.code === "invalid_union") {
    const branches = (issue.errors ?? []).map(branch => branch.flatMap(inner => issueFields(inner, at))).filter(fields => fields.length > 0);
    const nearest = branches.reduce<ArgumentField[] | undefined>((best, fields) => (best === undefined || fields.length < best.length ? fields : best), undefined);
    if (nearest !== undefined) return nearest;
  }
  const paths = issue.code === "unrecognized_keys" && issue.keys?.length ? issue.keys.map(key => [...at, key]) : [at];
  return paths.map(path => ({ path: path.length > 0 ? path.join(".") : ROOT_PATH, message: issue.message }));
}

export function argumentFields(issues: readonly Issue[]): ArgumentField[] {
  return issues.flatMap(issue => issueFields(issue, []));
}

export function invalidArgumentsReport(toolName: string, fields: ArgumentField[]): InvalidArgumentsReport {
  return {
    status: "FAILED", code: "invalid_arguments", retryable: false,
    message: `Invalid arguments for ${toolName}: ${fields.map(field => `${field.path}: ${field.message}`).join("; ")}`,
    fields, next_action: INVALID_ARGUMENTS_NEXT_ACTION,
  };
}

type Validate = (tool: { inputSchema?: unknown }, args: unknown, toolName: string) => Promise<unknown>;

async function fieldsOf(tool: { inputSchema?: unknown }, args: unknown, error: McpError): Promise<ArgumentField[]> {
  if (tool.inputSchema !== undefined && error.message.includes("Input validation error")) {
    const schema = tool.inputSchema as AnySchema;
    const parsed = await safeParseAsync(normalizeObjectSchema(schema) ?? schema, args ?? {});
    const fields = parsed.success ? [] : argumentFields((parsed.error as { issues: Issue[] }).issues);
    if (fields.length > 0) return fields;
  }
  return [{ path: ROOT_PATH, message: error.message.replace(/^MCP error -?\d+: /, "") }];
}

type Execute = (tool: object, args: unknown, extra: unknown) => Promise<unknown>;

export function answerInvalidArguments(server: McpServer): void {
  const target = server as unknown as { validateToolInput?: Validate; executeToolHandler?: Execute; _registeredTools?: Record<string, object> };
  const validate = target.validateToolInput?.bind(server);
  if (validate === undefined) throw new Error("the MCP SDK no longer validates tool input in validateToolInput");
  const execute = target.executeToolHandler?.bind(server);
  if (execute === undefined || target._registeredTools === undefined) throw new Error("the MCP SDK no longer runs tool handlers in executeToolHandler");
  target.executeToolHandler = async (tool, args, extra) => {
    try {
      return await execute(tool, args, extra);
    } catch (error) {
      if (!(error instanceof z.core.$ZodError)) throw error;
      const name = Object.entries(target._registeredTools ?? {}).find(([, entry]) => entry === tool)?.[0] ?? "this tool";
      const fields = argumentFields(error.issues);
      throw new Error(JSON.stringify(invalidArgumentsReport(name, fields.length > 0 ? fields : [{ path: ROOT_PATH, message: error.message }])));
    }
  };
  target.validateToolInput = async (tool, args, toolName) => {
    try {
      return await validate(tool, args, toolName);
    } catch (error) {
      if (!(error instanceof McpError) || error.code !== ErrorCode.InvalidParams) throw error;
      throw new Error(JSON.stringify(invalidArgumentsReport(toolName, await fieldsOf(tool, args, error))));
    }
  };
}
