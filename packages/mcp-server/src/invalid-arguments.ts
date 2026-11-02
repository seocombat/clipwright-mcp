import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type AnySchema, normalizeObjectSchema, safeParseAsync } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export const INVALID_ARGUMENTS_NEXT_ACTION = "Fix the named fields and call again; this call spent nothing.";
/** The path of a mistake in the arguments as a whole, as the API and the CLI name it. */
const ROOT_PATH = "input";

export interface ArgumentField { path: string; message: string }
export interface InvalidArgumentsReport {
  status: "FAILED"; code: "invalid_arguments"; retryable: false; message: string; fields: ArgumentField[]; next_action: string;
}

interface Issue { code?: string; path?: readonly PropertyKey[]; keys?: readonly string[]; errors?: readonly (readonly Issue[])[]; message: string }

function issueFields(issue: Issue, base: readonly string[]): ArgumentField[] {
  const at = [...base, ...(issue.path ?? []).map(String)];
  if (issue.code === "invalid_union") {
    // A failed union names the branch the call came nearest to: the one with the fewest fields to fix.
    const branches = (issue.errors ?? []).map(branch => branch.flatMap(inner => issueFields(inner, at))).filter(fields => fields.length > 0);
    const nearest = branches.reduce<ArgumentField[] | undefined>((best, fields) => (best === undefined || fields.length < best.length ? fields : best), undefined);
    if (nearest !== undefined) return nearest;
  }
  const paths = issue.code === "unrecognized_keys" && issue.keys?.length ? issue.keys.map(key => [...at, key]) : [at];
  return paths.map(path => ({ path: path.length > 0 ? path.join(".") : ROOT_PATH, message: issue.message }));
}

/** Every issue as a field; an unknown key is named by its own path, not by the object that holds it. */
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
  // Only a schema refusal is parsed again: the SDK refuses an oversized call before parsing it.
  if (tool.inputSchema !== undefined && error.message.includes("Input validation error")) {
    const schema = tool.inputSchema as AnySchema;
    const parsed = await safeParseAsync(normalizeObjectSchema(schema) ?? schema, args ?? {});
    const fields = parsed.success ? [] : argumentFields((parsed.error as { issues: Issue[] }).issues);
    if (fields.length > 0) return fields;
  }
  return [{ path: ROOT_PATH, message: error.message.replace(/^MCP error -?\d+: /, "") }];
}

type Execute = (tool: object, args: unknown, extra: unknown) => Promise<unknown>;

/** Every tool's argument refusal answers as a structured report; the SDK still parses with the full schemas. */
export function answerInvalidArguments(server: McpServer): void {
  // The SDK offers no hook into its refusal, so its own validation step is wrapped on this instance.
  const target = server as unknown as { validateToolInput?: Validate; executeToolHandler?: Execute; _registeredTools?: Record<string, object> };
  const validate = target.validateToolInput?.bind(server);
  if (validate === undefined) throw new Error("the MCP SDK no longer validates tool input in validateToolInput");
  const execute = target.executeToolHandler?.bind(server);
  if (execute === undefined || target._registeredTools === undefined) throw new Error("the MCP SDK no longer runs tool handlers in executeToolHandler");
  // A handler's own parse checks what spans fields, such as exactly one of two; the SDK parses requests before sending them.
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
      // A plain Error: the SDK answers its message as the text of an isError result, without the protocol prefix.
      throw new Error(JSON.stringify(invalidArgumentsReport(toolName, await fieldsOf(tool, args, error))));
    }
  };
}
